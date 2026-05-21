import { eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import { roomEvent } from "@bun-mono/db/schema/room";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import { durable, type EventKind } from "@bun-mono/room-protocol/kinds";
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
  loadMembers,
  loadStaleMembers,
  setMemberLastSeen,
  type MemberInfo,
} from "./member-presence";
import { TTL_MS } from "./ttl";
import type { AnyLibSQLDatabase, Connection, ReducerContext, RoomReducer, RoomRow } from "./types";

const EVENT_LOG_CAP = 500;
const SNAPSHOT_EVENT_COUNT = 100;

const idAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const generateEventId = customAlphabet(idAlphabet, 21);

export type RoomActorDeps = {
  db: AnyLibSQLDatabase;
  now?: () => number;
  nextEventId?: () => string;
};

type RoomEventRow = {
  roomId: string;
  position: number;
  id: string;
  kind: string;
  fromUserId: string | null;
  payload: string;
  ts: number;
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

    let existing = this.members.get(conn.userId);

    if (existing === undefined) {
      const allocated = await this.ensureAdmitted(conn.userId);
      if (allocated === null) {
        conn.close(1008, "room_full");
        return;
      }
      existing = allocated;
    }

    const wasOnline = this.isUserOnline(conn.userId);

    this.connections.set(conn.connectionId, conn);
    this.trackConnectionForUser(conn);

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

  async detach(conn: Connection): Promise<void> {
    this.connections.delete(conn.connectionId);

    const userConns = this.connectionsByUser.get(conn.userId);
    if (userConns === undefined) return;
    userConns.delete(conn.connectionId);
    if (userConns.size > 0) return;

    this.connectionsByUser.delete(conn.userId);

    const info = this.members.get(conn.userId);
    if (info === undefined) return;

    const lastSeenAt = this.now();
    this.members.set(conn.userId, { ...info, lastSeenAt });

    await setMemberLastSeen(this.db, this.room.id, conn.userId, lastSeenAt);

    this.emitTransient<MemberOfflinePayload>("room.member_offline", {
      userId: conn.userId,
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

      // eslint-disable-next-line no-await-in-loop -- see above
      await this.emitDurableSystem<MemberLeftPayload>("room.member_left", {
        userId,
        slot,
        reason: "ttl_expired",
      });
    }
  }

  async submit(conn: Connection, intent: ChatIntent): Promise<void> {
    await this.ensureRehydrated();

    const ctx: ReducerContext = {
      now: this.now,
      nextEventId: this.nextEventId,
      fromUserId: conn.userId,
    };

    const result = this.reducer.handle(this.state, intent, ctx);
    if (!result.ok) {
      const rejection: EventEnvelope = {
        kind: "room.intent_rejected",
        payload: { intentId: intent.intentId, reason: result.reason },
        id: this.nextEventId(),
        ts: this.now(),
        position: this.nextPosition,
        from: null,
        durable: false,
      };
      conn.send(rejection);
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

  private trackConnectionForUser(conn: Connection): void {
    let set = this.connectionsByUser.get(conn.userId);
    if (set === undefined) {
      set = new Set();
      this.connectionsByUser.set(conn.userId, set);
    }
    set.add(conn.connectionId);
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

    const own = this.members.get(conn.userId);

    return {
      kind: "room.snapshot",
      payload: {
        members,
        recentEvents: this.recentDurableEvents.slice(-SNAPSHOT_EVENT_COUNT),
        spectatorCount: 0,
        yourRole: "member",
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
    const rows = (await this.db
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, this.room.id))
      .orderBy(roomEvent.position)) as RoomEventRow[];

    const chatEvents: ChatEvent[] = [];
    const durableEvents: EventEnvelope[] = [];
    for (const row of rows) {
      const event = rowToDurableEvent(row);
      if (event === null) continue;
      durableEvents.push(event);
      if (event.kind === "chat.message_sent") chatEvents.push(event as ChatEvent);
    }

    this.state = this.reducer.rehydrate(this.state, chatEvents);
    this.recentDurableEvents = durableEvents.slice(-SNAPSHOT_EVENT_COUNT);

    const lastRow = rows.at(-1);
    this.nextPosition = lastRow === undefined ? 0 : lastRow.position + 1;

    const members = await loadMembers(this.db, this.room.id);
    this.members.clear();
    for (const [userId, info] of members) this.members.set(userId, info);

    this.rehydrated = true;
  }

  private async persistAndPrune(ev: EventEnvelope): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(roomEvent).values({
        roomId: this.room.id,
        position: ev.position,
        id: ev.id,
        kind: ev.kind,
        fromUserId: ev.from,
        payload: JSON.stringify(ev.payload),
        ts: ev.ts,
      });

      const countRow = await tx
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(roomEvent)
        .where(eq(roomEvent.roomId, this.room.id));
      const count = Number(countRow[0]?.count ?? 0);

      if (count > EVENT_LOG_CAP) {
        const toDelete = count - EVENT_LOG_CAP;
        await tx.run(sql`
          delete from room_event
          where room_id = ${this.room.id}
            and position in (
              select position from room_event
              where room_id = ${this.room.id}
              order by position asc
              limit ${toDelete}
            )
        `);
      }
    });
  }

  private broadcast(ev: EventEnvelope): void {
    for (const conn of this.connections.values()) conn.send(ev);
  }
}

function rowToDurableEvent(row: RoomEventRow): EventEnvelope | null {
  // Source of truth for "is this kind durable" lives in
  // `@bun-mono/room-protocol/kinds`. A row whose kind isn't in the registry
  // (legacy data) or is registered as transient (shouldn't be in the log,
  // but defensive) is dropped from rehydration.
  if (!Object.hasOwn(durable, row.kind)) return null;
  const kind = row.kind as EventKind;
  if (!durable[kind]) return null;
  return {
    kind,
    payload: JSON.parse(row.payload),
    id: row.id,
    ts: row.ts,
    position: row.position,
    from: row.fromUserId,
    durable: true,
  };
}
