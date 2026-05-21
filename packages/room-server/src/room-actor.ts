import { customAlphabet } from "nanoid";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type {
  MemberJoinedPayload,
  MemberLeftPayload,
  MemberOfflinePayload,
  MemberOnlinePayload,
} from "@bun-mono/room-protocol/member-events";
import type { RoomMember } from "@bun-mono/room-protocol/system";

import type { ChatEvent, ChatIntent, ChatState } from "./chat-reducer";
import {
  allocateSlot,
  deleteStaleMember,
  insertMemberRow,
  loadDisplayName,
  loadStaleMembers,
  setMemberLastSeen,
  type MemberInfo,
} from "./member-presence";
import { persistAndPruneEvent, rehydrateRoom } from "./room-actor-persistence";
import { TTL_MS } from "./ttl";
import type { AnyLibSQLDatabase, Connection, ReducerContext, RoomReducer, RoomRow } from "./types";

const SNAPSHOT_EVENT_COUNT = 100;

const idAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const generateEventId = customAlphabet(idAlphabet, 21);

export type RoomActorDeps = {
  db: AnyLibSQLDatabase;
  now?: () => number;
  nextEventId?: () => string;
};

export class RoomActor {
  private readonly room: RoomRow;
  private readonly reducer: RoomReducer<ChatIntent, ChatEvent, ChatState>;
  private readonly db: AnyLibSQLDatabase;
  private readonly now: () => number;
  private readonly nextEventId: () => string;
  private readonly connections = new Map<string, Connection>();
  private readonly connectionsByUser = new Map<string, Set<string>>();
  private readonly members = new Map<string, MemberInfo>();
  // Connection ids currently attached without a slot — covers both
  // cookie-less anonymous Spectators (`conn.userId === null`) and
  // authenticated would-be Members whose attach found the Room full.
  private readonly spectators = new Set<string>();
  private admissionChain: Promise<unknown> = Promise.resolve();
  private state: ChatState;
  private recentDurableEvents: EventEnvelope[] = [];
  private nextPosition = 0;
  private rehydrated = false;
  private rehydratePromise: Promise<void> | null = null;

  constructor(
    room: RoomRow,
    reducer: RoomReducer<ChatIntent, ChatEvent, ChatState>,
    deps: RoomActorDeps,
  ) {
    this.room = room;
    this.reducer = reducer;
    this.db = deps.db;
    this.now = deps.now ?? (() => Date.now());
    this.nextEventId = deps.nextEventId ?? generateEventId;
    this.state = reducer.initialState(room);
  }

  get nextPositionForTests(): number {
    return this.nextPosition;
  }

  async attach(conn: Connection): Promise<void> {
    await this.ensureRehydrated();

    // Lazy-on-connect sweep. Runs before the admission check so a returning
    // User whose own row has expired re-joins as a new Member (with
    // whatever slot is now free), not as their stale ghost. Cheap when
    // there are no stale rows: a single indexed query that returns nothing.
    await this.sweepStaleMembers();

    if (conn.userId === null) {
      this.attachAsSpectator(conn);
      return;
    }

    let existing = this.members.get(conn.userId);

    if (existing === undefined) {
      const allocated = await this.ensureAdmitted(conn.userId);
      if (allocated === null) {
        // Room is full. Don't close — downgrade to Spectator so the client
        // sees the conversation and can wait for a slot or sign out. The
        // snapshot's `yourRole`/`yourUserId` tells them what happened.
        this.attachAsSpectator(conn);
        return;
      }
      existing = allocated;
    }

    const wasOnline = this.isUserOnline(conn.userId);

    this.connections.set(conn.connectionId, conn);
    this.trackConnectionForUser(conn, conn.userId);

    if (!wasOnline) {
      this.members.set(conn.userId, { ...existing, lastSeenAt: null });
      // Persist lastSeenAt=null so a future cold-start reads "currently
      // online" correctly until the next detach overwrites it.
      await setMemberLastSeen(this.db, this.room.id, conn.userId, null);
      this.emitTransient<MemberOnlinePayload>("room.member_online", {
        userId: conn.userId,
        slot: existing.slot,
      });
    }

    conn.send(this.buildSnapshot(conn));
  }

  private attachAsSpectator(conn: Connection): void {
    this.connections.set(conn.connectionId, conn);
    this.spectators.add(conn.connectionId);
    conn.send(this.buildSnapshot(conn));
  }

  async detach(conn: Connection): Promise<void> {
    this.connections.delete(conn.connectionId);

    // Spectators have no slot, no row, and no presence — clean up the
    // tracking set and we're done. The `spectatorCount` shift is observed
    // only on the next snapshot (not broadcast as its own event).
    if (this.spectators.delete(conn.connectionId)) return;

    const userId = conn.userId;
    if (userId === null) return;

    const userConns = this.connectionsByUser.get(userId);
    if (userConns === undefined) return;
    userConns.delete(conn.connectionId);
    if (userConns.size > 0) return;

    this.connectionsByUser.delete(userId);

    const info = this.members.get(userId);
    if (info === undefined) return;

    const lastSeenAt = this.now();
    this.members.set(userId, { ...info, lastSeenAt });

    await setMemberLastSeen(this.db, this.room.id, userId, lastSeenAt);

    this.emitTransient<MemberOfflinePayload>("room.member_offline", {
      userId,
      slot: info.slot,
    });
  }

  // Periodic sweeper entrypoint. Also runs lazily on attach. Queries the DB
  // for rows whose `last_seen_at` is past TTL, then for each one does a
  // conditional DELETE — a User who reconnects between the SELECT and the
  // DELETE keeps their slot, and the corresponding `member_left` event is
  // suppressed.
  async sweepStaleMembers(): Promise<void> {
    await this.ensureRehydrated();

    const threshold = this.now() - TTL_MS;
    const stale = await loadStaleMembers(this.db, this.room.id, threshold);
    if (stale.length === 0) return;

    for (const { userId, slot } of stale) {
      // eslint-disable-next-line no-await-in-loop -- monotonic position assignment requires sequential emission
      const deleted = await deleteStaleMember(this.db, this.room.id, userId, threshold);
      if (!deleted) continue;

      this.members.delete(userId);

      // eslint-disable-next-line no-await-in-loop -- monotonic position assignment requires sequential emission
      await this.emitDurableSystem<MemberLeftPayload>("room.member_left", {
        userId,
        slot,
        reason: "ttl_expired",
      });
    }
  }

  async submit(conn: Connection, intent: ChatIntent): Promise<void> {
    await this.ensureRehydrated();

    // Spectator-path admission. A Spectator submitting any intent is either
    // an anonymous client (no `userId`) trying to act — reject — or an
    // authenticated client that attached during a full Room — try to claim
    // a slot now that one may have opened up.
    if (this.spectators.has(conn.connectionId)) {
      if (conn.userId === null) {
        this.sendRejection(conn, intent.intentId, "spectator_cannot_act");
        return;
      }

      const promoted = await this.tryPromoteSpectator(conn, conn.userId);
      if (!promoted) {
        this.sendRejection(conn, intent.intentId, "room_full");
        return;
      }
    }

    // Past this point the connection is a Member. The reducer needs a
    // concrete `fromUserId` — Spectators were filtered out above.
    if (conn.userId === null) {
      this.sendRejection(conn, intent.intentId, "spectator_cannot_act");
      return;
    }

    const ctx: ReducerContext = {
      now: this.now,
      nextEventId: this.nextEventId,
      fromUserId: conn.userId,
    };

    const result = this.reducer.handle(this.state, intent, ctx);
    if (!result.ok) {
      this.sendRejection(conn, intent.intentId, result.reason);
      return;
    }

    for (const ev of result.emit) {
      const positioned: ChatEvent = { ...ev, position: this.nextPosition };
      this.nextPosition += 1;

      if (positioned.durable) {
        // eslint-disable-next-line no-await-in-loop -- monotonic position assignment requires sequential persistence
        await this.persistAndPrune(positioned);
        this.pushRecentDurable(positioned);
      }

      this.broadcast(positioned);
    }

    this.state = result.state;
  }

  private ensureAdmitted(userId: string): Promise<MemberInfo | null> {
    // Serialize admissions across all users. Two concurrent first-attaches
    // (same or different users) would otherwise both read an empty / stale
    // `members.values()` between awaits — same user races into a PK
    // violation on (roomId, userId); different users race into a unique
    // violation on (roomId, slotIndex). The chain lets each admission run
    // to completion before the next reads taken slots. Same-user races also
    // fold in: the second caller re-checks `members` after the chain
    // resolves and finds the row the first admission inserted.
    const next = this.admissionChain.then(() => {
      const existing = this.members.get(userId);
      if (existing !== undefined) return existing;
      return this.admitNewMember(userId);
    });
    this.admissionChain = next.catch(() => undefined);
    return next;
  }

  private async admitNewMember(userId: string): Promise<MemberInfo | null> {
    const takenSlots = new Set<number>();
    for (const info of this.members.values()) takenSlots.add(info.slot);

    const slot = allocateSlot(takenSlots);
    if (slot === null) return null;

    const displayName = (await loadDisplayName(this.db, userId)) ?? userId;
    const joinedAt = this.now();

    await insertMemberRow(this.db, this.room.id, userId, slot, joinedAt);

    const info: MemberInfo = { slot, displayName, lastSeenAt: null };
    this.members.set(userId, info);

    await this.emitDurableSystem<MemberJoinedPayload>("room.member_joined", {
      userId,
      slot,
      displayName,
    });

    return info;
  }

  private isUserOnline(userId: string): boolean {
    const set = this.connectionsByUser.get(userId);
    return set !== undefined && set.size > 0;
  }

  private trackConnectionForUser(conn: Connection, userId: string): void {
    let set = this.connectionsByUser.get(userId);
    if (set === undefined) {
      set = new Set();
      this.connectionsByUser.set(userId, set);
    }
    set.add(conn.connectionId);
  }

  // Promotes a Spectator connection to a Member when a slot is available.
  // Returns true on success (slot allocated, row inserted, member_joined
  // emitted, member_online emitted, connection moved out of the Spectator
  // bucket). Returns false when the Room is still full.
  private async tryPromoteSpectator(conn: Connection, userId: string): Promise<boolean> {
    const allocated = await this.ensureAdmitted(userId);
    if (allocated === null) return false;

    this.spectators.delete(conn.connectionId);

    const wasOnline = this.isUserOnline(userId);
    this.trackConnectionForUser(conn, userId);

    if (!wasOnline) {
      this.members.set(userId, { ...allocated, lastSeenAt: null });
      await setMemberLastSeen(this.db, this.room.id, userId, null);
      this.emitTransient<MemberOnlinePayload>("room.member_online", {
        userId,
        slot: allocated.slot,
      });
    }

    return true;
  }

  private sendRejection(conn: Connection, intentId: string, reason: string): void {
    const rejection: EventEnvelope = {
      kind: "room.intent_rejected",
      payload: { intentId, reason },
      id: this.nextEventId(),
      ts: this.now(),
      position: this.nextPosition,
      from: null,
      durable: false,
    };
    conn.send(rejection);
  }

  private buildSnapshot(conn: Connection): EventEnvelope {
    const members: RoomMember[] = [];
    for (const [userId, info] of this.members) {
      members.push({
        userId,
        slot: info.slot,
        displayName: info.displayName,
        online: this.isUserOnline(userId),
        lastSeenAt: info.lastSeenAt,
      });
    }

    const own = conn.userId === null ? undefined : this.members.get(conn.userId);
    const isMember = own !== undefined;

    return {
      kind: "room.snapshot",
      payload: {
        members,
        recentEvents: this.recentDurableEvents.slice(-SNAPSHOT_EVENT_COUNT),
        spectatorCount: this.spectators.size,
        yourRole: isMember ? "member" : "spectator",
        yourSlot: own?.slot ?? null,
        yourUserId: conn.userId,
      },
      id: this.nextEventId(),
      ts: this.now(),
      position: this.nextPosition,
      from: null,
      durable: false,
    };
  }

  private async emitDurableSystem<TPayload>(
    kind: "room.member_joined" | "room.member_left",
    payload: TPayload,
  ): Promise<void> {
    const event: EventEnvelope = {
      kind,
      payload,
      id: this.nextEventId(),
      ts: this.now(),
      position: this.nextPosition,
      from: null,
      durable: true,
    };
    this.nextPosition += 1;

    await this.persistAndPrune(event);
    this.pushRecentDurable(event);
    this.broadcast(event);
  }

  private emitTransient<TPayload>(
    kind: "room.member_online" | "room.member_offline",
    payload: TPayload,
  ): void {
    // Transient events use `nextPosition` as a marker for "the state up to
    // here"; they do not consume a durable slot. This matches the slice-01
    // `room.intent_rejected` and `room.snapshot` patterns.
    const event: EventEnvelope = {
      kind,
      payload,
      id: this.nextEventId(),
      ts: this.now(),
      position: this.nextPosition,
      from: null,
      durable: false,
    };

    this.broadcast(event);
  }

  private pushRecentDurable(ev: EventEnvelope): void {
    this.recentDurableEvents.push(ev);
    if (this.recentDurableEvents.length > SNAPSHOT_EVENT_COUNT) {
      this.recentDurableEvents = this.recentDurableEvents.slice(-SNAPSHOT_EVENT_COUNT);
    }
  }

  private async ensureRehydrated(): Promise<void> {
    if (this.rehydrated) return;
    if (this.rehydratePromise) return this.rehydratePromise;

    this.rehydratePromise = this.runRehydrate();
    try {
      await this.rehydratePromise;
    } finally {
      this.rehydratePromise = null;
    }
  }

  private async runRehydrate(): Promise<void> {
    const { durableEvents, nextPosition, members } = await rehydrateRoom(this.db, this.room);

    const chatEvents: ChatEvent[] = [];
    for (const event of durableEvents) {
      if (event.kind === "chat.message_sent") chatEvents.push(event as ChatEvent);
    }

    this.state = this.reducer.rehydrate(this.state, chatEvents);
    this.recentDurableEvents = durableEvents.slice(-SNAPSHOT_EVENT_COUNT);
    this.nextPosition = nextPosition;

    this.members.clear();
    for (const [userId, info] of members) this.members.set(userId, info);

    this.rehydrated = true;
  }

  private persistAndPrune(ev: EventEnvelope): Promise<void> {
    return persistAndPruneEvent(this.db, this.room.id, ev);
  }

  private broadcast(ev: EventEnvelope): void {
    for (const conn of this.connections.values()) conn.send(ev);
  }
}
