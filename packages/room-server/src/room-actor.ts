import { customAlphabet } from "nanoid";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import { broadcastToSpectators, type EventKind } from "@bun-mono/room-protocol/kinds";
import { MEMBERSHIP_CAP } from "@bun-mono/room-protocol/limits";
import type {
  MemberJoinedPayload,
  MemberLeftPayload,
  MemberOfflinePayload,
  MemberOnlinePayload,
} from "@bun-mono/room-protocol/member-events";
import type { RoomMember, SpectatorReason } from "@bun-mono/room-protocol/system";

import { AuthRevalidationCache } from "./auth-revalidate";
import type { ChatEvent, ChatIntent, ChatState } from "./chat-reducer";
import {
  allocateSlot,
  countMembershipsForUser,
  deleteMemberRow,
  deleteStaleMember,
  insertMemberRow,
  loadDisplayName,
  loadStaleMembers,
  setMemberLastSeen,
  type MemberInfo,
} from "./member-presence";
import { persistAndPruneEvent, rehydrateRoom } from "./room-actor-persistence";
import {
  createSendRateLimitState,
  tryRecordSend,
  type SendRateLimitState,
} from "./send-rate-limit";
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

type PromoteResult = { ok: true } | { ok: false; reason: "room_full" | SpectatorReason };

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
  private readonly authCache: AuthRevalidationCache;
  // Rolling-window timestamps of `chat.send_message` intents per Member, for
  // the send-rate limit. Pruned in place on each check.
  private readonly sendRateLimit: SendRateLimitState = createSendRateLimitState();
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
    this.authCache = new AuthRevalidationCache(this.now);
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
      // Snapshot reason lets the client prompt "leave one first" instead of sitting silently as a read-only Spectator.
      const underCap = await this.isUnderMembershipCap(conn.userId);
      if (!underCap) {
        this.attachAsSpectator(conn, "membership_cap");
        return;
      }

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

  private attachAsSpectator(conn: Connection, reason?: SpectatorReason): void {
    this.connections.set(conn.connectionId, conn);
    this.spectators.add(conn.connectionId);
    conn.send(this.buildSnapshot(conn, reason));
  }

  async detach(conn: Connection): Promise<void> {
    this.connections.delete(conn.connectionId);
    this.authCache.evict(conn.connectionId);

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

  // WS path for `room.leave`. Routed from `ws-upgrade` since the chat reducer doesn't see room-namespace intents.
  async leave(conn: Connection, intentId: string): Promise<void> {
    if (conn.userId === null || this.spectators.has(conn.connectionId)) {
      this.sendRejection(conn, intentId, "not_a_member");
      return;
    }

    const ok = await this.leaveAsMember(conn.userId);
    if (!ok) this.sendRejection(conn, intentId, "not_a_member");
  }

  // Shared handler for WS `room.leave` and the orpc procedure. Returns false if `userId` isn't a Member; on success demotes the User's connections to Spectator (kept open for reading) and emits a durable member_left.
  async leaveAsMember(userId: string): Promise<boolean> {
    await this.ensureRehydrated();

    const info = this.members.get(userId);
    if (info === undefined) return false;

    const userConns = this.connectionsByUser.get(userId);
    if (userConns !== undefined) {
      for (const connId of userConns) this.spectators.add(connId);
      this.connectionsByUser.delete(userId);
    }

    this.members.delete(userId);
    await deleteMemberRow(this.db, this.room.id, userId);

    await this.emitDurableSystem<MemberLeftPayload>("room.member_left", {
      userId,
      slot: info.slot,
      reason: "left",
    });

    return true;
  }

  async submit(conn: Connection, intent: ChatIntent): Promise<void> {
    await this.ensureRehydrated();

    const stillAuthorised = await this.revalidateConnection(conn);
    if (!stillAuthorised) {
      this.sendRejection(conn, intent.intentId, "auth_lost");
      return;
    }

    const fromUserId = await this.resolveSubmittingMember(conn, intent);
    if (fromUserId === null) return;

    if (
      intent.kind === "chat.send_message" &&
      !tryRecordSend(this.sendRateLimit, fromUserId, this.now())
    ) {
      this.sendRejection(conn, intent.intentId, "rate_limit_send_message");
      return;
    }

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

  // Returns true if the connection should continue acting as a Member.
  // Returns false (after performing the demotion) when the handshake-time
  // cookie is no longer valid; the caller emits the `auth_lost` rejection.
  // The check is skipped for Spectator connections (no Member to demote)
  // and for connections without a `revalidateAuth` hook (tests).
  private async revalidateConnection(conn: Connection): Promise<boolean> {
    if (conn.revalidateAuth === undefined) return true;
    if (this.spectators.has(conn.connectionId)) return true;
    if (conn.userId === null) return true;

    if (this.authCache.isFresh(conn.connectionId)) return true;

    let result: { userId: string } | null;
    try {
      result = await conn.revalidateAuth();
    } catch (err) {
      // Fail-open: a transient auth-DB hiccup shouldn't demote every active
      // chatter. Skip the cache update so the next intent re-checks; a real
      // revocation surfaces promptly once the auth layer recovers.
      console.error("revalidateAuth threw; treating session as still valid", err);
      return true;
    }

    this.authCache.markValidated(conn.connectionId);

    // Either a revoked/expired session (`null`) or a different user behind
    // the same conn (defensive — shouldn't happen with better-auth tokens).
    if (result === null || result.userId !== conn.userId) {
      await this.demoteToSpectator(conn);
      return false;
    }

    return true;
  }

  // Demotes a Member connection in place to a Spectator. The `room_member`
  // row stays — the User keeps their slot and will re-promote on a future
  // intent if the cookie comes back valid. The conn keeps receiving
  // broadcasts; it just can't act until promotion.
  private async demoteToSpectator(conn: Connection): Promise<void> {
    const userId = conn.userId;
    if (userId === null) return;

    const userConns = this.connectionsByUser.get(userId);
    if (userConns !== undefined) {
      userConns.delete(conn.connectionId);
      if (userConns.size === 0) this.connectionsByUser.delete(userId);
    }
    this.spectators.add(conn.connectionId);
    conn.userId = null;
    this.authCache.evict(conn.connectionId);

    // Mirror the `detach` "last conn drops" path: the Member is now
    // effectively offline. Persist `lastSeenAt` so the TTL sweep can free
    // the slot if the User never reconnects, and emit `member_offline`.
    if (this.isUserOnline(userId)) return;
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

  // Short-circuits before the DB count: an existing Member of this Room isn't acquiring a new Membership.
  private async isUnderMembershipCap(userId: string): Promise<boolean> {
    if (this.members.has(userId)) return true;

    const count = await countMembershipsForUser(this.db, userId);
    return count < MEMBERSHIP_CAP;
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
      if (!promoted.ok) {
        this.sendRejection(conn, intent.intentId, promoted.reason);
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

  // Cap re-check matters: a cap-downgrade Spectator who left another Room in a different tab gets promoted here on their next action.
  private async tryPromoteSpectator(conn: Connection, userId: string): Promise<PromoteResult> {
    const underCap = await this.isUnderMembershipCap(userId);
    if (!underCap) return { ok: false, reason: "membership_cap" };

    const allocated = await this.ensureAdmitted(userId);
    if (allocated === null) return { ok: false, reason: "room_full" };

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

    return { ok: true };
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

  private buildSnapshot(conn: Connection, reason?: SpectatorReason): EventEnvelope {
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
        ...(reason === undefined ? {} : { reason }),
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
