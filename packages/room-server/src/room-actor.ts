import { customAlphabet } from "nanoid";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import { broadcastToSpectators, type EventKind } from "@bun-mono/room-protocol/kinds";
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

// Per-Member-per-Room rate limit on chat.typing broadcasts. A typing_ping
// received within this window of the previous broadcast for the same Member
// is accepted silently — no broadcast, no rejection. The client mirrors this
// to avoid wasted intents, but the server is authoritative.
const TYPING_DEBOUNCE_MS = 1500;

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
  // Connection ids attached without a slot — anonymous Spectators and authenticated joiners who found the Room full.
  private readonly spectators = new Set<string>();
  // Last `chat.typing` broadcast timestamp per Member, for server-side debounce.
  private readonly lastTypingAt = new Map<string, number>();
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
        // Full Room: downgrade to Spectator rather than close so the client can read along and wait for a slot.
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

    // Spectators have no slot, row, or presence — the count shift is observed on the next snapshot, not broadcast.
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

    const fromUserId = await this.resolveSubmittingMember(conn, intent);
    if (fromUserId === null) return;

    const ctx: ReducerContext = {
      now: this.now,
      nextEventId: this.nextEventId,
      fromUserId,
    };

    const result = this.reducer.handle(this.state, intent, ctx);
    if (!result.ok) {
      this.sendRejection(conn, intent.intentId, result.reason);
      return;
    }

    for (const ev of result.emit) {
      // Server-side debounce for typing broadcasts. The reducer is pure; the
      // debounce map lives on the actor and is consulted before broadcast
      // so a swallowed ping consumes nothing — no event id pressure, no
      // position increment, no listener wakeup.
      if (ev.kind === "chat.typing" && !this.shouldEmitTyping(fromUserId)) continue;

      const positioned: ChatEvent = { ...ev, position: this.nextPosition };

      // Transient events from the reducer use `nextPosition` as a marker for
      // "the state up to here" but do not claim a slot — matches the
      // `emitTransient` shape for `room.member_online` / `room.member_offline`.
      if (positioned.durable) {
        this.nextPosition += 1;
        // eslint-disable-next-line no-await-in-loop -- monotonic position assignment requires sequential persistence
        await this.persistAndPrune(positioned);
        this.pushRecentDurable(positioned);
      }

      this.broadcast(positioned);
    }

    this.state = result.state;
  }

  private shouldEmitTyping(fromUserId: string): boolean {
    const now = this.now();
    const last = this.lastTypingAt.get(fromUserId);
    if (last !== undefined && now - last < TYPING_DEBOUNCE_MS) return false;
    this.lastTypingAt.set(fromUserId, now);
    return true;
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

  // Returns the userId to forward into the reducer, or `null` after sending a rejection. Anonymous Spectator → reject `spectator_cannot_act`; authenticated Spectator → try to promote; Member → pass-through.
  private async resolveSubmittingMember(
    conn: Connection,
    intent: ChatIntent,
  ): Promise<string | null> {
    if (this.spectators.has(conn.connectionId)) {
      if (conn.userId === null) {
        this.sendRejection(conn, intent.intentId, "spectator_cannot_act");
        return null;
      }

      const promoted = await this.tryPromoteSpectator(conn, conn.userId);
      if (!promoted) {
        this.sendRejection(conn, intent.intentId, "room_full");
        return null;
      }

      return conn.userId;
    }

    // Non-Spectator connection: attach() only tracks Members with a concrete userId. The null check is defensive; if it ever fires, the actor is in an inconsistent state.
    if (conn.userId === null) {
      this.sendRejection(conn, intent.intentId, "spectator_cannot_act");
      return null;
    }
    return conn.userId;
  }

  // Promotes a Spectator connection to a Member when a slot is available. Returns true on success, false when the Room is still full.
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
    // Per-kind toggle: some transient broadcasts (e.g. `chat.typing`) are
    // not meaningful to Spectators and the protocol opts them out.
    const allowSpectators =
      ev.kind in broadcastToSpectators ? broadcastToSpectators[ev.kind as EventKind] : true;
    for (const [connId, conn] of this.connections) {
      if (!allowSpectators && this.spectators.has(connId)) continue;
      conn.send(ev);
    }
  }
}
