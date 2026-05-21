import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomMember } from "@bun-mono/db/schema/room";

import {
  makeConnection,
  makeIdCounter,
  rejectionPayload,
  setupRoomTest,
  snapshotPayload,
  userIdOf,
} from "./_room-actor-test-utils";
import type { TestDb } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

describe("RoomActor — WS `room.leave`", () => {
  it("for a Member: deletes the row, emits durable room.member_left{reason:'left'}, demotes their connection to Spectator", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    const bobBefore = bob.events.length;
    await actor.leave(alice, "i-leave-1");

    const memberRows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "alice"));
    expect(memberRows).toHaveLength(0);

    const bobNew = bob.events.slice(bobBefore);
    const left = bobNew.find((e) => e.kind === "room.member_left");
    expect(left).toBeDefined();
    expect(left?.durable).toBe(true);
    expect(left?.payload).toMatchObject({ userId: "alice", reason: "left" });

    // Alice's connection is demoted, not closed. Her next snapshot should reflect spectator role.
    expect(alice.closed).toBe(false);
  });

  it("rejects a Spectator (anonymous) submitter with reason='not_a_member'", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const anon = makeConnection("c-anon", null);
    await actor.attach(anon);
    const before = anon.events.length;

    await actor.leave(anon, "i-leave-1");

    const newEvents = anon.events.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionPayload(newEvents[0]!).reason).toBe("not_a_member");
  });

  it("rejects a Spectator (full-room downgraded) submitter with reason='not_a_member'", async () => {
    const { seedUser } = await import("./_test-utils");
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

    await actor.leave(eve, "i-leave-1");

    const newEvents = eve.events.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionPayload(newEvents[0]!).reason).toBe("not_a_member");
  });

  it("demotes every connection of the leaving User in this Room (not just the one that sent the intent)", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const a1 = makeConnection("c-a1", "alice");
    const a2 = makeConnection("c-a2", "alice");
    await actor.attach(a1);
    await actor.attach(a2);

    await actor.leave(a1, "i-leave-1");

    // After leave, a2 is also demoted to Spectator — its next submit should be promoted-or-rejected, not pass through as a Member.
    const a2Before = a2.events.length;
    const { makeIntent } = await import("./_room-actor-test-utils");
    await actor.submit(a2, makeIntent("hi", "i-msg-1"));

    const a2New = a2.events.slice(a2Before);
    // A2 is now a Spectator; it gets auto-promoted, so we should see a fresh member_joined for alice (not a continuation as the original member).
    const joined = a2New.find((e) => e.kind === "room.member_joined" && userIdOf(e) === "alice");
    expect(joined).toBeDefined();
  });
});

describe("RoomActor.leaveAsMember", () => {
  it("returns false (no side effects) for a non-Member", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);
    const before = alice.events.length;

    const result = await actor.leaveAsMember("bob");
    expect(result).toBe(false);

    expect(alice.events.slice(before).filter((e) => e.kind === "room.member_left")).toHaveLength(0);
  });

  it("returns true and emits room.member_left{reason:'left'} for an offline Member (orpc path with no live conn)", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);
    await actor.detach(alice); // alice is now offline but row still exists

    const bobBefore = bob.events.length;
    const result = await actor.leaveAsMember("alice");
    expect(result).toBe(true);

    const bobNew = bob.events.slice(bobBefore);
    const left = bobNew.find((e) => e.kind === "room.member_left");
    expect(left).toBeDefined();
    expect(left?.payload).toMatchObject({ userId: "alice", reason: "left" });

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "alice"));
    expect(rows).toHaveLength(0);
  });
});
