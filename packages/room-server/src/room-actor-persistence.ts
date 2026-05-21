import { eq, sql } from "drizzle-orm";

import { roomEvent } from "@bun-mono/db/schema/room";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import { durable, type EventKind } from "@bun-mono/room-protocol/kinds";

import { loadMembers, type MemberInfo } from "./member-presence";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

const EVENT_LOG_CAP = 500;

type RoomEventRow = {
  roomId: string;
  position: number;
  id: string;
  kind: string;
  fromUserId: string | null;
  payload: string;
  ts: number;
};

export type RehydratedRoom = {
  durableEvents: readonly EventEnvelope[];
  nextPosition: number;
  members: ReadonlyMap<string, MemberInfo>;
};

// Loads every durable event for the room plus the current member set.
// Returns *all* durable events; the caller (RoomActor) slices the tail it
// wants for its snapshot cache.
export async function rehydrateRoom(db: AnyLibSQLDatabase, room: RoomRow): Promise<RehydratedRoom> {
  const rows = (await db
    .select()
    .from(roomEvent)
    .where(eq(roomEvent.roomId, room.id))
    .orderBy(roomEvent.position)) as RoomEventRow[];

  const durableEvents: EventEnvelope[] = [];
  for (const row of rows) {
    const event = rowToDurableEvent(row);
    if (event === null) continue;
    durableEvents.push(event);
  }

  const lastRow = rows.at(-1);
  const nextPosition = lastRow === undefined ? 0 : lastRow.position + 1;

  const members = await loadMembers(db, room.id);

  return { durableEvents, nextPosition, members };
}

// Append a durable event and prune the room's log to EVENT_LOG_CAP rows
// in one transaction.
export async function persistAndPruneEvent(
  db: AnyLibSQLDatabase,
  roomId: string,
  ev: EventEnvelope,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(roomEvent).values({
      roomId,
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
      .where(eq(roomEvent.roomId, roomId));
    const count = Number(countRow[0]?.count ?? 0);

    if (count > EVENT_LOG_CAP) {
      const toDelete = count - EVENT_LOG_CAP;
      await tx.run(sql`
        delete from room_event
        where room_id = ${roomId}
          and position in (
            select position from room_event
            where room_id = ${roomId}
            order by position asc
            limit ${toDelete}
          )
      `);
    }
  });
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
