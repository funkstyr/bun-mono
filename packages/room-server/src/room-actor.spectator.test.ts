import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent, roomMember } from "@bun-mono/db/schema/room";

import {
  makeConnection,
  makeIdCounter,
  makeIntent,
  rejectionPayload,
  setupRoomTest,
  snapshotPayload,
  userIdOf,
} from "./_room-actor-test-utils";
import { seedUser, type TestDb } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

describe("RoomActor — spectator attach", () => {
  it("attaches an anonymous (userId=null) connection without consuming a slot, emitting only a spectator snapshot", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const anon = makeConnection("c-anon", null);
    await actor.attach(anon);

    expect(anon.closed).toBe(false);
    expect(anon.events.map((e) => e.kind)).toEqual(["room.snapshot"]);

    const snap = anon.events[0]!;
    const payload = snapshotPayload(snap);
    expect(payload.yourRole).toBe("spectator");
    expect(payload.yourSlot).toBeNull();
    expect(payload.yourUserId).toBeNull();
    expect(payload.spectatorCount).toBe(1);

    const memberRows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(memberRows).toHaveLength(0);
  });

  it("snapshot.spectatorCount reflects every currently attached spectator", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    await actor.attach(makeConnection("c-anon-1", null));
    await actor.attach(makeConnection("c-anon-2", null));

    const third = makeConnection("c-anon-3", null);
    await actor.attach(third);

    expect(snapshotPayload(third.events[0]!).spectatorCount).toBe(3);
  });

  it("broadcasts chat.message_sent to attached spectators (they read along with members)", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const anon = makeConnection("c-anon", null);

    await actor.attach(alice);
    await actor.attach(anon);

    const anonBefore = anon.events.length;
    await actor.submit(alice, makeIntent("hi", "i-1"));

    const anonNew = anon.events.slice(anonBefore);
    const chatEvents = anonNew.filter((e) => e.kind === "chat.message_sent");
    expect(chatEvents).toHaveLength(1);
  });
});

describe("RoomActor — spectator submit", () => {
  it("rejects an anonymous spectator intent with reason=spectator_cannot_act and no reducer state change", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const anon = makeConnection("c-anon", null);
    await actor.attach(anon);
    const before = anon.events.length;

    await actor.submit(anon, makeIntent("hi", "i-1"));

    const newEvents = anon.events.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    const payload = rejectionPayload(newEvents[0]!);
    expect(payload.reason).toBe("spectator_cannot_act");
    expect(payload.intentId).toBe("i-1");

    const events = await testDb.select().from(roomEvent).where(eq(roomEvent.roomId, room.id));
    expect(events.filter((e) => e.kind === "chat.message_sent")).toHaveLength(0);
  });

  it("rejects a full-room downgraded spectator with reason=room_full when no slot frees up", async () => {
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

    const eve = makeConnection("c-e", "eve");
    await actor.attach(eve);
    expect(snapshotPayload(eve.events[0]!).yourRole).toBe("spectator");

    const before = eve.events.length;
    await actor.submit(eve, makeIntent("hi", "i-1"));

    const newEvents = eve.events.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionPayload(newEvents[0]!).reason).toBe("room_full");
  });

  it("promotes a downgraded spectator when a slot frees up: emits member_joined + member_online and processes the intent", async () => {
    await seedUser(testDb, "dave", "Dave");
    await seedUser(testDb, "eve", "Eve");

    // Controllable clock so we can detach Alice, advance past the TTL, and let the sweep free her slot.
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);
    await actor.attach(makeConnection("c-b", "bob"));
    await actor.attach(makeConnection("c-c", "carol"));
    await actor.attach(makeConnection("c-d", "dave"));

    const eve = makeConnection("c-e", "eve");
    await actor.attach(eve);
    expect(snapshotPayload(eve.events[0]!).yourRole).toBe("spectator");

    // Alice's last connection detaches; slot 0 is held until TTL expiry.
    clock = 2000;
    await actor.detach(alice);

    // Advance past the 24h TTL and sweep — slot 0 is now free.
    clock = 2000 + 25 * 60 * 60 * 1000;
    await actor.sweepStaleMembers();

    // Eve submits an intent — promotion fires implicitly.
    const eveBefore = eve.events.length;
    await actor.submit(eve, makeIntent("hi from eve", "i-eve-1"));
    const eveNew = eve.events.slice(eveBefore);

    const memberJoined = eveNew.find(
      (e) => e.kind === "room.member_joined" && userIdOf(e) === "eve",
    );
    const memberOnline = eveNew.find(
      (e) => e.kind === "room.member_online" && userIdOf(e) === "eve",
    );
    const chat = eveNew.find((e) => e.kind === "chat.message_sent");

    expect(memberJoined).toBeDefined();
    expect(memberOnline).toBeDefined();
    expect(chat).toBeDefined();
    expect(chat?.from).toBe("eve");

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "eve"));
    expect(rows).toHaveLength(1);
  });
});

describe("RoomActor — spectator detach", () => {
  it("removes a spectator from the tracking set without emitting member_left or member_offline", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const anon = makeConnection("c-anon", null);

    await actor.attach(alice);
    await actor.attach(anon);

    const aliceBefore = alice.events.length;
    await actor.detach(anon);
    const aliceNew = alice.events.slice(aliceBefore);

    expect(aliceNew.filter((e) => e.kind === "room.member_left")).toHaveLength(0);
    expect(aliceNew.filter((e) => e.kind === "room.member_offline")).toHaveLength(0);

    // A fresh spectator should see spectatorCount = 1 (just itself) after the previous one detached.
    const anon2 = makeConnection("c-anon-2", null);
    await actor.attach(anon2);
    expect(snapshotPayload(anon2.events[0]!).spectatorCount).toBe(1);
  });
});
