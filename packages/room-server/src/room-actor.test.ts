import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent } from "@bun-mono/db/schema/room";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import { createTestDb, seedRoom, seedUser, type TestDb } from "./_test-utils";
import { chatReducer, type ChatIntent } from "./chat-reducer";
import { RoomActor, type AnyLibSQLDatabase } from "./room-actor";
import type { Connection, RoomRow } from "./types";

type CapturedConnection = Connection & { events: EventEnvelope[] };

function makeConnection(connectionId: string, userId: string): CapturedConnection {
  const events: EventEnvelope[] = [];
  return {
    connectionId,
    userId,
    events,
    send: (ev) => {
      events.push(ev);
    },
    close: () => {},
  };
}

function makeRoom(): RoomRow {
  return {
    id: "room-1",
    slug: "slug-1",
    kind: "chat",
    name: null,
    createdBy: "alice",
    createdAt: 0,
  };
}

function makeIntent(text: string, intentId: string): ChatIntent {
  return {
    kind: "chat.send_message",
    payload: { text },
    intentId,
  };
}

function makeIdCounter(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb, "alice");
  await seedUser(testDb, "bob");
  room = makeRoom();
  await seedRoom(testDb, room.id, room.slug, room.createdBy);
});

describe("RoomActor.attach", () => {
  it("sends exactly one room.snapshot event to a fresh connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const conn = makeConnection("c-1", "alice");

    await actor.attach(conn);

    expect(conn.events).toHaveLength(1);
    expect(conn.events[0]?.kind).toBe("room.snapshot");
    expect(conn.events[0]?.position).toBe(0);
  });

  it("populates the snapshot payload with empty members + connection identity", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const conn = makeConnection("c-1", "alice");

    await actor.attach(conn);

    const snapshot = conn.events[0]!;
    expect(snapshot.kind).toBe("room.snapshot");
    expect(snapshot.durable).toBe(false);
    const payload = snapshot.payload as {
      members: unknown[];
      recentEvents: unknown[];
      yourRole: string;
      yourUserId: string;
    };
    expect(payload.members).toEqual([]);
    expect(payload.recentEvents).toEqual([]);
    expect(payload.yourRole).toBe("member");
    expect(payload.yourUserId).toBe("alice");
  });
});

describe("RoomActor.submit — broadcast", () => {
  it("broadcasts a valid chat.message_sent to every attached connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 2000,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    await actor.attach(b);

    await actor.submit(a, makeIntent("hello", "i-1"));

    const lastA = a.events.at(-1);
    const lastB = b.events.at(-1);
    expect(lastA?.kind).toBe("chat.message_sent");
    expect(lastB?.kind).toBe("chat.message_sent");
    expect(lastA?.id).toBe(lastB?.id);
    expect(lastA?.position).toBe(0);
    expect(lastA?.from).toBe("alice");
    expect(lastA?.durable).toBe(true);
    expect(lastA?.replyTo).toBe("i-1");
  });
});

describe("RoomActor.submit — rejection", () => {
  it("sends room.intent_rejected only to the sender for empty text", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 3000,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    await actor.attach(b);

    await actor.submit(a, makeIntent("", "i-empty"));

    const lastA = a.events.at(-1);
    const lastB = b.events.at(-1);
    expect(lastA?.kind).toBe("room.intent_rejected");
    expect((lastA!.payload as { intentId: string }).intentId).toBe("i-empty");
    expect(lastB?.kind).toBe("room.snapshot");
  });
});

describe("RoomActor.submit — event-log cap of 500", () => {
  it("prunes the oldest row past the 500-event cap and keeps positions monotonic", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1,
      nextEventId: makeIdCounter(),
    });
    const conn = makeConnection("c-1", "alice");
    await actor.attach(conn);

    for (let i = 0; i < 501; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ordered persistence requires sequential awaits
      await actor.submit(conn, makeIntent("m", `i-${i}`));
    }

    const rows = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    expect(rows).toHaveLength(500);
    expect(rows[0]?.position).toBe(1);
    expect(rows.at(-1)?.position).toBe(500);
    expect(actor.nextPositionForTests).toBe(501);
  });

  it("continues to advance positions past the cap", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1,
      nextEventId: makeIdCounter(),
    });
    const conn = makeConnection("c-1", "alice");
    await actor.attach(conn);

    for (let i = 0; i < 505; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ordered persistence requires sequential awaits
      await actor.submit(conn, makeIntent("m", `i-${i}`));
    }

    const rows = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    expect(rows).toHaveLength(500);
    expect(rows[0]?.position).toBe(5);
    expect(rows.at(-1)?.position).toBe(504);
    expect(actor.nextPositionForTests).toBe(505);
  });
});

describe("RoomActor.attach — rehydration", () => {
  it("a fresh actor on the same DB replays prior events in its first snapshot", async () => {
    const first = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 100,
      nextEventId: makeIdCounter(),
    });
    const c1 = makeConnection("c-1", "alice");
    await first.attach(c1);
    await first.submit(c1, makeIntent("one", "i-1"));
    await first.submit(c1, makeIntent("two", "i-2"));

    const second = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 200,
      nextEventId: makeIdCounter(),
    });
    const c2 = makeConnection("c-2", "bob");
    await second.attach(c2);

    const snapshot = c2.events[0];
    expect(snapshot?.kind).toBe("room.snapshot");
    const payload = snapshot?.payload as { recentEvents: EventEnvelope[] };
    expect(payload.recentEvents).toHaveLength(2);
    expect(payload.recentEvents[0]?.kind).toBe("chat.message_sent");
    expect((payload.recentEvents[0]!.payload as { text: string }).text).toBe("one");
    expect((payload.recentEvents[1]!.payload as { text: string }).text).toBe("two");
    expect(snapshot?.position).toBe(2);
  });
});

describe("RoomActor.detach", () => {
  it("stops broadcasting to a detached connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    await actor.attach(b);
    actor.detach(b);

    await actor.submit(a, makeIntent("hi", "i-1"));

    expect(a.events.at(-1)?.kind).toBe("chat.message_sent");
    expect(b.events.at(-1)?.kind).toBe("room.snapshot");
  });
});
