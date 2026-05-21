import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type { RoomMember } from "@bun-mono/room-protocol/system";

import { createTestDb, seedRoom, seedUser, type TestDb } from "./_test-utils";
import type { ChatIntent } from "./chat-reducer";
import type { Connection, RoomRow } from "./types";

export type CapturedConnection = Connection & { events: EventEnvelope[]; closed: boolean };

export function makeConnection(connectionId: string, userId: string | null): CapturedConnection {
  const events: EventEnvelope[] = [];
  const conn: CapturedConnection = {
    connectionId,
    userId,
    events,
    closed: false,
    send: (ev) => {
      events.push(ev);
    },
    close: () => {
      conn.closed = true;
    },
  };
  return conn;
}

export function makeRoom(): RoomRow {
  return {
    id: "room-1",
    slug: "slug-1",
    kind: "chat",
    name: null,
    createdBy: "alice",
    createdAt: 0,
  };
}

export function makeIntent(text: string, intentId: string): ChatIntent {
  return {
    kind: "chat.send_message",
    payload: { text },
    intentId,
  };
}

export function makeIdCounter(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

export function lastEvent(conn: CapturedConnection): EventEnvelope | undefined {
  return conn.events.at(-1);
}

export function eventsOfKind(conn: CapturedConnection, kind: string): EventEnvelope[] {
  return conn.events.filter((e) => e.kind === kind);
}

export type SnapshotPayload = {
  members: RoomMember[];
  recentEvents: EventEnvelope[];
  spectatorCount: number;
  yourRole: "member" | "spectator";
  yourSlot: 0 | 1 | 2 | 3 | null;
  yourUserId: string | null;
};

export function snapshotPayload(ev: EventEnvelope): SnapshotPayload {
  return ev.payload as SnapshotPayload;
}

export type RejectionPayload = { intentId: string; reason: string };

export function rejectionPayload(ev: EventEnvelope): RejectionPayload {
  return ev.payload as RejectionPayload;
}

export function userIdOf(ev: EventEnvelope): string {
  return (ev.payload as { userId: string }).userId;
}

export async function setupRoomTest(): Promise<{ testDb: TestDb; room: RoomRow }> {
  const testDb = await createTestDb();
  await seedUser(testDb, "alice", "Alice");
  await seedUser(testDb, "bob", "Bob");
  await seedUser(testDb, "carol", "Carol");
  const room = makeRoom();
  await seedRoom(testDb, room.id, room.slug, room.createdBy);
  return { testDb, room };
}
