import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent, roomMember } from "@bun-mono/db/schema/room";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type { RoomMember } from "@bun-mono/room-protocol/system";

import { createTestDb, seedRoom, seedUser, type TestDb } from "./_test-utils";
import { chatReducer, type ChatIntent } from "./chat-reducer";
import { RoomActor, type AnyLibSQLDatabase } from "./room-actor";
import type { Connection, RoomRow } from "./types";

type CapturedConnection = Connection & { events: EventEnvelope[]; closed: boolean };

function makeConnection(connectionId: string, userId: string): CapturedConnection {
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

function lastEvent(conn: CapturedConnection): EventEnvelope | undefined {
  return conn.events.at(-1);
}

function eventsOfKind(conn: CapturedConnection, kind: string): EventEnvelope[] {
  return conn.events.filter((e) => e.kind === kind);
}

function snapshotPayload(ev: EventEnvelope): {
  members: RoomMember[];
  recentEvents: EventEnvelope[];
  yourRole: string;
  yourSlot: 0 | 1 | 2 | 3 | null;
  yourUserId: string | null;
} {
  return ev.payload as {
    members: RoomMember[];
    recentEvents: EventEnvelope[];
    yourRole: string;
    yourSlot: 0 | 1 | 2 | 3 | null;
    yourUserId: string | null;
  };
}

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb, "alice", "Alice");
  await seedUser(testDb, "bob", "Bob");
  await seedUser(testDb, "carol", "Carol");
  room = makeRoom();
  await seedRoom(testDb, room.id, room.slug, room.createdBy);
});

describe("RoomActor.attach — first connection", () => {
  it("emits a durable room.member_joined and a transient room.member_online, then sends the snapshot to the joining conn", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const conn = makeConnection("c-1", "alice");

    await actor.attach(conn);

    expect(conn.events.map((e) => e.kind)).toEqual(["room.member_online", "room.snapshot"]);

    const snap = conn.events.find((e) => e.kind === "room.snapshot");
    expect(snap).toBeDefined();
    const payload = snapshotPayload(snap!);
    expect(payload.yourUserId).toBe("alice");
    expect(payload.yourSlot).toBe(0);
    expect(payload.yourRole).toBe("member");
    expect(payload.members).toHaveLength(1);
    expect(payload.members[0]).toMatchObject({
      userId: "alice",
      slot: 0,
      displayName: "Alice",
      online: true,
      lastSeenAt: null,
    });
  });

  it("inserts a room_member row with slot 0 for the very first joiner", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    await actor.attach(makeConnection("c-1", "alice"));

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("alice");
    expect(rows[0]?.slotIndex).toBe(0);
    expect(rows[0]?.lastSeenAt).toBeNull();
  });

  it("persists the room.member_joined as a durable event in room_event", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    await actor.attach(makeConnection("c-1", "alice"));

    const rows = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("room.member_joined");
    const payload = JSON.parse(rows[0]!.payload) as {
      userId: string;
      slot: number;
      displayName: string;
    };
    expect(payload).toEqual({ userId: "alice", slot: 0, displayName: "Alice" });
  });
});

describe("RoomActor.attach — second User joining", () => {
  it("broadcasts member_joined + member_online to the already-attached connection and includes both in the joiner's snapshot", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    const aEventsBeforeBJoin = a.events.length;
    await actor.attach(b);

    const aNewEvents = a.events.slice(aEventsBeforeBJoin);
    expect(aNewEvents.map((e) => e.kind)).toEqual(["room.member_joined", "room.member_online"]);
    const joinPayload = aNewEvents[0]!.payload as { userId: string; slot: number };
    expect(joinPayload.userId).toBe("bob");
    expect(joinPayload.slot).toBe(1);

    const bSnap = b.events.find((e) => e.kind === "room.snapshot")!;
    const bSnapPayload = snapshotPayload(bSnap);
    expect(bSnapPayload.members).toHaveLength(2);
    const aliceMember = bSnapPayload.members.find((m) => m.userId === "alice");
    const bobMember = bSnapPayload.members.find((m) => m.userId === "bob");
    expect(aliceMember?.online).toBe(true);
    expect(bobMember?.online).toBe(true);
    expect(bSnapPayload.yourSlot).toBe(1);
  });

  it("allocates the lowest free slot when an earlier slot is vacated mid-session", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    await actor.attach(makeConnection("c-a", "alice"));
    await actor.attach(makeConnection("c-b", "bob"));
    // Slot 0 = alice, slot 1 = bob. Carol should land on slot 2.

    const c = makeConnection("c-c", "carol");
    await actor.attach(c);

    const cSnap = c.events.find((e) => e.kind === "room.snapshot")!;
    expect(snapshotPayload(cSnap).yourSlot).toBe(2);
  });

  it("closes the connection with room_full when all four slots are taken", async () => {
    await seedUser(testDb, "dave", "Dave");
    await seedUser(testDb, "eve", "Eve");
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    await actor.attach(makeConnection("c-a", "alice"));
    await actor.attach(makeConnection("c-b", "bob"));
    await actor.attach(makeConnection("c-c", "carol"));
    await actor.attach(makeConnection("c-d", "dave"));

    const e = makeConnection("c-e", "eve");
    await actor.attach(e);

    expect(e.closed).toBe(true);
    expect(e.events).toEqual([]);
  });
});

describe("RoomActor.attach — concurrent first-join from same User", () => {
  it("admits only once across two concurrent first-attaches, no PK violation", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const a1 = makeConnection("c-a1", "alice");
    const a2 = makeConnection("c-a2", "alice");

    await Promise.all([actor.attach(a1), actor.attach(a2)]);

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("alice");

    const eventRows = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    const joinedEvents = eventRows.filter((r) => r.kind === "room.member_joined");
    expect(joinedEvents).toHaveLength(1);

    expect(a1.closed).toBe(false);
    expect(a2.closed).toBe(false);
  });
});

describe("RoomActor.attach — reconnect", () => {
  it("does not re-emit member_joined for a reconnect (existing room_member row)", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice1 = makeConnection("c-a1", "alice");
    await actor.attach(alice1);
    await actor.detach(alice1);

    const bob = makeConnection("c-b", "bob");
    await actor.attach(bob);
    const bobEventsBefore = bob.events.length;

    const alice2 = makeConnection("c-a2", "alice");
    await actor.attach(alice2);

    const bobNewEvents = bob.events.slice(bobEventsBefore);
    const memberJoinedForAlice = bobNewEvents.filter(
      (e) =>
        e.kind === "room.member_joined" && (e.payload as { userId: string }).userId === "alice",
    );
    expect(memberJoinedForAlice).toHaveLength(0);

    const memberOnlineForAlice = bobNewEvents.filter(
      (e) =>
        e.kind === "room.member_online" && (e.payload as { userId: string }).userId === "alice",
    );
    expect(memberOnlineForAlice).toHaveLength(1);
  });

  it("does not emit a second member_online when the same user opens a second concurrent connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice1 = makeConnection("c-a1", "alice");
    await actor.attach(alice1);
    const eventsBefore = alice1.events.length;

    const alice2 = makeConnection("c-a2", "alice");
    await actor.attach(alice2);

    const newOnAlice1 = alice1.events.slice(eventsBefore);
    expect(newOnAlice1.filter((e) => e.kind === "room.member_online")).toHaveLength(0);
    expect(newOnAlice1.filter((e) => e.kind === "room.member_joined")).toHaveLength(0);

    expect(eventsOfKind(alice2, "room.snapshot")).toHaveLength(1);
    expect(eventsOfKind(alice2, "room.member_online")).toHaveLength(0);
  });

  it("clears lastSeenAt on the row and reports online: true in the snapshot after reconnect", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice1 = makeConnection("c-a1", "alice");
    await actor.attach(alice1);
    clock = 2000;
    await actor.detach(alice1);

    const rowsAfterDetach = await testDb
      .select()
      .from(roomMember)
      .where(eq(roomMember.roomId, room.id));
    expect(rowsAfterDetach[0]?.lastSeenAt).toBeInstanceOf(Date);

    clock = 3000;
    const alice2 = makeConnection("c-a2", "alice");
    await actor.attach(alice2);

    const rowsAfterReattach = await testDb
      .select()
      .from(roomMember)
      .where(eq(roomMember.roomId, room.id));
    expect(rowsAfterReattach[0]?.lastSeenAt).toBeNull();

    const snap = alice2.events.find((e) => e.kind === "room.snapshot")!;
    const me = snapshotPayload(snap).members.find((m) => m.userId === "alice");
    expect(me?.online).toBe(true);
    expect(me?.lastSeenAt).toBeNull();
  });
});

describe("RoomActor.detach", () => {
  it("emits room.member_offline and writes lastSeenAt when the user's last connection closes", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");
    await actor.attach(a);
    await actor.attach(b);

    clock = 5000;
    const bEventsBefore = b.events.length;
    await actor.detach(a);

    const bNew = b.events.slice(bEventsBefore);
    expect(bNew.map((e) => e.kind)).toEqual(["room.member_offline"]);
    expect((bNew[0]!.payload as { userId: string }).userId).toBe("alice");

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    const aliceRow = rows.find((r) => r.userId === "alice");
    expect(aliceRow?.lastSeenAt).toBeInstanceOf(Date);
    const ts = aliceRow!.lastSeenAt as Date;
    expect(ts.getTime()).toBe(5000);
  });

  it("does not emit member_offline when the user still has other live connections", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const a1 = makeConnection("c-a1", "alice");
    const a2 = makeConnection("c-a2", "alice");
    const b = makeConnection("c-b", "bob");
    await actor.attach(a1);
    await actor.attach(a2);
    await actor.attach(b);

    const bEventsBefore = b.events.length;
    await actor.detach(a1);

    const bNew = b.events.slice(bEventsBefore);
    expect(bNew.filter((e) => e.kind === "room.member_offline")).toHaveLength(0);
  });

  it("stops broadcasting subsequent events to a detached connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    await actor.attach(b);
    const bBefore = b.events.length;
    await actor.detach(b);

    await actor.submit(a, makeIntent("hi", "i-1"));

    expect(lastEvent(a)?.kind).toBe("chat.message_sent");
    // b's connection was removed before it could receive its own offline
    // broadcast or any subsequent chat events.
    expect(b.events.length).toBe(bBefore);
    expect(eventsOfKind(b, "chat.message_sent")).toHaveLength(0);
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

    expect(lastEvent(a)?.kind).toBe("chat.message_sent");
    expect(lastEvent(b)?.kind).toBe("chat.message_sent");
    expect(lastEvent(a)?.id).toBe(lastEvent(b)?.id);
    expect(lastEvent(a)?.from).toBe("alice");
    expect(lastEvent(a)?.durable).toBe(true);
    expect(lastEvent(a)?.replyTo).toBe("i-1");
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

    const aBefore = a.events.length;
    const bBefore = b.events.length;
    await actor.submit(a, makeIntent("", "i-empty"));

    const aNew = a.events.slice(aBefore);
    const bNew = b.events.slice(bBefore);
    expect(aNew.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(bNew).toEqual([]);
    expect((aNew[0]!.payload as { intentId: string }).intentId).toBe("i-empty");
  });
});

describe("RoomActor — rehydration", () => {
  it("a fresh actor on the same DB replays prior chat events and reconstructs members", async () => {
    const first = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 100,
      nextEventId: makeIdCounter(),
    });
    const c1 = makeConnection("c-1", "alice");
    await first.attach(c1);
    await first.submit(c1, makeIntent("one", "i-1"));
    await first.submit(c1, makeIntent("two", "i-2"));
    await first.detach(c1);

    const second = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 200,
      nextEventId: makeIdCounter(),
    });
    const c2 = makeConnection("c-2", "bob");
    await second.attach(c2);

    const snap = c2.events.find((e) => e.kind === "room.snapshot")!;
    const payload = snapshotPayload(snap);
    // Members rehydrated: alice (offline, lastSeenAt set) and bob (online, just joined).
    expect(payload.members).toHaveLength(2);
    const alice = payload.members.find((m) => m.userId === "alice");
    const bob = payload.members.find((m) => m.userId === "bob");
    expect(alice?.online).toBe(false);
    expect(alice?.lastSeenAt).toBeTypeOf("number");
    expect(bob?.online).toBe(true);

    // Recent events include the two chat messages and the two member_joined
    // events from before — but not the transient member_online/offline.
    const chatMessages = payload.recentEvents.filter((e) => e.kind === "chat.message_sent");
    expect(chatMessages).toHaveLength(2);
    expect((chatMessages[0]!.payload as { text: string }).text).toBe("one");
    expect((chatMessages[1]!.payload as { text: string }).text).toBe("two");
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
    // attach emitted 1 durable event (member_joined), so we need 500 more chat
    // messages to overflow the 500-row cap.

    for (let i = 0; i < 500; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ordered persistence requires sequential awaits
      await actor.submit(conn, makeIntent("m", `i-${i}`));
    }

    const rows = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    expect(rows).toHaveLength(500);
    // First row is position 1 because position 0 (member_joined) was pruned.
    expect(rows[0]?.position).toBe(1);
    expect(rows.at(-1)?.position).toBe(500);
    expect(actor.nextPositionForTests).toBe(501);
  });
});
