import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent, roomMember } from "@bun-mono/db/schema/room";

import {
  eventsOfKind,
  makeConnection,
  makeIdCounter,
  setupRoomTest,
  snapshotPayload,
} from "./_room-actor-test-utils";
import type { TestDb } from "./_test-utils";
import { seedUser } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
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

describe("RoomActor.attach — concurrent first-join", () => {
  it("admits only once across two concurrent first-attaches from the same user, no PK violation", async () => {
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

  it("admits two concurrent first-attaches from different users into different slots", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await Promise.all([actor.attach(a), actor.attach(b)]);

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows).toHaveLength(2);
    const slots = rows.map((r) => r.slotIndex).toSorted();
    expect(slots).toEqual([0, 1]);

    expect(a.closed).toBe(false);
    expect(b.closed).toBe(false);
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
