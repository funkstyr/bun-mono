import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { roomMember } from "@bun-mono/db/schema/room";

import {
  makeConnection,
  makeIdCounter,
  makeIntent,
  rejectionPayload,
  setupRoomTest,
  snapshotPayload,
  userIdOf,
} from "./_room-actor-test-utils";
import type { TestDb } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, AuthRevalidator, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

describe("RoomActor — session-loss demotion on intent", () => {
  it("calls the per-conn revalidator at most once per ~60s for repeated intents", async () => {
    let clock = 1_000;
    const revalidator = vi.fn<AuthRevalidator>(async () => ({ userId: "alice" }));
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice", revalidator);
    await actor.attach(alice);

    await actor.submit(alice, makeIntent("hi-1", "i-1"));
    clock += 30_000;
    await actor.submit(alice, makeIntent("hi-2", "i-2"));
    clock += 25_000;
    await actor.submit(alice, makeIntent("hi-3", "i-3"));

    expect(revalidator).toHaveBeenCalledTimes(1);

    // Crossing the 60s boundary triggers a fresh lookup.
    clock += 10_000;
    await actor.submit(alice, makeIntent("hi-4", "i-4"));
    expect(revalidator).toHaveBeenCalledTimes(2);
  });

  it("demotes the conn and rejects with auth_lost when the revalidator returns null", async () => {
    let sessionValid = true;
    const revalidator = vi.fn<AuthRevalidator>(async () =>
      sessionValid ? { userId: "alice" } : null,
    );
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice", revalidator);
    await actor.attach(alice);

    sessionValid = false;
    const before = alice.events.length;
    await actor.submit(alice, makeIntent("hi", "i-1"));
    const newEvents = alice.events.slice(before);

    const rejection = newEvents.find((e) => e.kind === "room.intent_rejected");
    expect(rejection).toBeDefined();
    expect(rejectionPayload(rejection!).reason).toBe("auth_lost");
    // Connection stays open; only the role flips.
    expect(alice.closed).toBe(false);
    expect(alice.userId).toBeNull();
  });

  it("emits member_offline on the demotion when the conn was the User's only one", async () => {
    let sessionValid = true;
    const revalidator: AuthRevalidator = async () => (sessionValid ? { userId: "alice" } : null);
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice", revalidator);
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);
    const bobBefore = bob.events.length;

    sessionValid = false;
    await actor.submit(alice, makeIntent("hi", "i-1"));

    const bobNew = bob.events.slice(bobBefore);
    const offline = bobNew.find((e) => e.kind === "room.member_offline" && userIdOf(e) === "alice");
    expect(offline).toBeDefined();
  });

  it("leaves the User's room_member row intact after session-loss demotion", async () => {
    let sessionValid = true;
    const revalidator: AuthRevalidator = async () => (sessionValid ? { userId: "alice" } : null);
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice", revalidator);
    await actor.attach(alice);

    sessionValid = false;
    await actor.submit(alice, makeIntent("hi", "i-1"));

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "alice"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slotIndex).toBe(0);
  });

  it("rejects subsequent intents from a demoted conn with spectator_cannot_act", async () => {
    let sessionValid = true;
    const revalidator: AuthRevalidator = async () => (sessionValid ? { userId: "alice" } : null);
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice", revalidator);
    await actor.attach(alice);

    sessionValid = false;
    await actor.submit(alice, makeIntent("hi-1", "i-1"));
    const before = alice.events.length;
    await actor.submit(alice, makeIntent("hi-2", "i-2"));
    const newEvents = alice.events.slice(before);

    const rejection = newEvents.find((e) => e.kind === "room.intent_rejected");
    expect(rejection).toBeDefined();
    expect(rejectionPayload(rejection!).reason).toBe("spectator_cannot_act");
  });

  it("does not emit member_offline when another conn keeps the User online", async () => {
    let sessionValid = true;
    const revalidator: AuthRevalidator = async () => (sessionValid ? { userId: "alice" } : null);
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const aliceTabA = makeConnection("c-a1", "alice", revalidator);
    const aliceTabB = makeConnection("c-a2", "alice");
    const bob = makeConnection("c-b", "bob");

    await actor.attach(aliceTabA);
    await actor.attach(aliceTabB);
    await actor.attach(bob);
    const bobBefore = bob.events.length;

    sessionValid = false;
    await actor.submit(aliceTabA, makeIntent("hi", "i-1"));

    const bobNew = bob.events.slice(bobBefore);
    expect(bobNew.filter((e) => e.kind === "room.member_offline")).toHaveLength(0);
    // Tab A loses auth but Tab B keeps Alice as a Member.
    expect(aliceTabA.userId).toBeNull();
    expect(aliceTabB.userId).toBe("alice");
  });

  it("re-attaches a User on a fresh conn without emitting a duplicate member_joined", async () => {
    // Simulates the "User signed back in" path: the original WS closes after
    // session loss; a fresh WS handshake brings up a new conn with valid
    // auth. Slot 0 is still Alice's, so no new `member_joined` event is
    // emitted (her `room_member` row was never deleted).
    let sessionValid = true;
    const revalidator: AuthRevalidator = async () => (sessionValid ? { userId: "alice" } : null);
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const aliceOld = makeConnection("c-old", "alice", revalidator);
    const bob = makeConnection("c-b", "bob");
    await actor.attach(aliceOld);
    await actor.attach(bob);

    sessionValid = false;
    await actor.submit(aliceOld, makeIntent("hi", "i-1"));

    sessionValid = true;
    const bobBefore = bob.events.length;
    const aliceNew = makeConnection("c-new", "alice", revalidator);
    await actor.attach(aliceNew);

    // Alice's fresh conn lands as a Member (slot intact, room_member row intact).
    const snapshot = aliceNew.events.find((e) => e.kind === "room.snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshotPayload(snapshot!).yourRole).toBe("member");

    // No duplicate `member_joined` reaches the other Member — only a
    // `member_online` because Alice was offline-by-demotion.
    const bobNew = bob.events.slice(bobBefore);
    expect(
      bobNew.filter((e) => e.kind === "room.member_joined" && userIdOf(e) === "alice"),
    ).toHaveLength(0);
    expect(
      bobNew.filter((e) => e.kind === "room.member_online" && userIdOf(e) === "alice"),
    ).toHaveLength(1);
  });

  it("does not run the revalidator on Spectator intents", async () => {
    const revalidator = vi.fn<AuthRevalidator>(async () => ({ userId: "alice" }));
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1_000,
      nextEventId: makeIdCounter(),
    });

    const anon = makeConnection("c-anon", null, revalidator);
    await actor.attach(anon);
    await actor.submit(anon, makeIntent("hi", "i-1"));

    expect(revalidator).not.toHaveBeenCalled();
  });
});
