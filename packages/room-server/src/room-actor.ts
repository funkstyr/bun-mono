import { eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { customAlphabet } from "nanoid";

import { roomEvent } from "@bun-mono/db/schema/room";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import type { ChatEvent, ChatIntent, ChatState } from "./chat-reducer";
import type { Connection, ReducerContext, RoomReducer, RoomRow } from "./types";

const EVENT_LOG_CAP = 500;
const SNAPSHOT_EVENT_COUNT = 100;

const idAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const generateEventId = customAlphabet(idAlphabet, 21);

export type AnyLibSQLDatabase = LibSQLDatabase<Record<string, unknown>>;

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
  private state: ChatState;
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

    this.connections.set(conn.connectionId, conn);

    const snapshotEvents = this.state.messages.slice(-SNAPSHOT_EVENT_COUNT);
    const snapshot: EventEnvelope = {
      kind: "room.snapshot",
      payload: {
        members: [],
        recentEvents: snapshotEvents,
        spectatorCount: 0,
        yourRole: "member",
        yourSlot: null,
        yourUserId: conn.userId,
      },
      id: this.nextEventId(),
      ts: this.now(),
      position: this.nextPosition,
      from: null,
      durable: false,
    };

    conn.send(snapshot);
  }

  detach(conn: Connection): void {
    this.connections.delete(conn.connectionId);
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
      }

      this.broadcast(positioned);
    }

    this.state = result.state;
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
    const rows = await this.db
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, this.room.id))
      .orderBy(roomEvent.position);

    const events = rows
      .map((r) => rowToChatEvent(r as RoomEventRow))
      .filter((e): e is ChatEvent => e !== null);
    this.state = this.reducer.rehydrate(this.state, events);

    const last = rows.at(-1) as RoomEventRow | undefined;
    this.nextPosition = last === undefined ? 0 : last.position + 1;
    this.rehydrated = true;
  }

  private async persistAndPrune(ev: ChatEvent): Promise<void> {
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

  private broadcast(ev: ChatEvent): void {
    for (const conn of this.connections.values()) conn.send(ev);
  }
}

function rowToChatEvent(row: RoomEventRow): ChatEvent | null {
  // Future room-kinds may persist other durable events into the same log; the
  // chat actor's reducer only understands `chat.message_sent`, so anything else
  // is filtered out at rehydrate time rather than miscast.
  if (row.kind !== "chat.message_sent") return null;
  return {
    kind: "chat.message_sent",
    payload: JSON.parse(row.payload) as ChatEvent["payload"],
    id: row.id,
    ts: row.ts,
    position: row.position,
    from: row.fromUserId,
    durable: true,
  };
}
