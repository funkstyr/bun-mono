import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent } from "@bun-mono/db/schema/room";

import {
  eventsOfKind,
  makeConnection,
  makeIdCounter,
  makeIntent,
  makeTypingIntent,
  setupRoomTest,
  snapshotPayload,
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

describe("RoomActor — chat.typing broadcast lane", () => {
  it("writes no row to room_event when a chat.typing is broadcast", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    const rowsBefore = await testDb.select().from(roomEvent).where(eq(roomEvent.roomId, room.id));
    await actor.submit(alice, makeTypingIntent("i-typing"));
    const rowsAfter = await testDb.select().from(roomEvent).where(eq(roomEvent.roomId, room.id));

    expect(rowsAfter.length).toBe(rowsBefore.length);
    expect(eventsOfKind(bob, "chat.typing")).toHaveLength(1);
  });

  it("broadcasts chat.typing { userId: sender } to every Member connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    await actor.submit(alice, makeTypingIntent("i-1"));

    const aliceTyping = eventsOfKind(alice, "chat.typing");
    const bobTyping = eventsOfKind(bob, "chat.typing");
    expect(aliceTyping).toHaveLength(1);
    expect(bobTyping).toHaveLength(1);
    expect((bobTyping[0]!.payload as { userId: string }).userId).toBe("alice");
    expect(bobTyping[0]!.durable).toBe(false);
    expect(bobTyping[0]!.from).toBe("alice");
  });

  it("debounces a second typing_ping from the same Member within 1.5s (no extra broadcast)", async () => {
    let nowMs = 10_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => nowMs,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    await actor.submit(alice, makeTypingIntent("i-1"));
    nowMs += 500;
    await actor.submit(alice, makeTypingIntent("i-2"));
    nowMs += 999;
    await actor.submit(alice, makeTypingIntent("i-3"));

    expect(eventsOfKind(bob, "chat.typing")).toHaveLength(1);
    // The swallowed pings produced no rejection either.
    expect(eventsOfKind(alice, "room.intent_rejected")).toHaveLength(0);
  });

  it("re-broadcasts chat.typing after the 1.5s window elapses", async () => {
    let nowMs = 10_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => nowMs,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    await actor.submit(alice, makeTypingIntent("i-1"));
    nowMs += 1500;
    await actor.submit(alice, makeTypingIntent("i-2"));

    expect(eventsOfKind(bob, "chat.typing")).toHaveLength(2);
  });

  it("debounce is per Member — Bob's typing is not throttled by Alice's", async () => {
    let nowMs = 10_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => nowMs,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    await actor.submit(alice, makeTypingIntent("i-a"));
    nowMs += 100;
    await actor.submit(bob, makeTypingIntent("i-b"));

    expect(eventsOfKind(alice, "chat.typing")).toHaveLength(2);
    expect(eventsOfKind(bob, "chat.typing")).toHaveLength(2);
  });

  it("does not deliver chat.typing to Spectator connections", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    const anon = makeConnection("c-anon", null);

    await actor.attach(alice);
    await actor.attach(bob);
    await actor.attach(anon);

    await actor.submit(alice, makeTypingIntent("i-1"));

    expect(eventsOfKind(alice, "chat.typing")).toHaveLength(1);
    expect(eventsOfKind(bob, "chat.typing")).toHaveLength(1);
    expect(eventsOfKind(anon, "chat.typing")).toHaveLength(0);
  });

  it("integration: 2 Members + 1 Spectator — Spectator never sees a typing event", async () => {
    let nowMs = 10_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => nowMs,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    const anon = makeConnection("c-anon", null);

    await actor.attach(alice);
    await actor.attach(bob);
    await actor.attach(anon);

    await actor.submit(alice, makeTypingIntent("i-a-1"));
    nowMs += 1600;
    await actor.submit(bob, makeTypingIntent("i-b-1"));

    const aliceTyping = eventsOfKind(alice, "chat.typing");
    const bobTyping = eventsOfKind(bob, "chat.typing");
    const anonTyping = eventsOfKind(anon, "chat.typing");

    expect(aliceTyping).toHaveLength(2);
    expect(bobTyping).toHaveLength(2);
    expect(anonTyping).toHaveLength(0);

    expect((aliceTyping[0]!.payload as { userId: string }).userId).toBe("alice");
    expect((aliceTyping[1]!.payload as { userId: string }).userId).toBe("bob");
  });

  it("room.snapshot does not include any typing state and recentEvents excludes chat.typing", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);

    await actor.submit(alice, makeIntent("hi", "i-msg"));
    await actor.submit(alice, makeTypingIntent("i-typing"));

    const carol = makeConnection("c-c", "carol");
    await actor.attach(carol);

    const snapEvent = carol.events.find((e) => e.kind === "room.snapshot");
    expect(snapEvent).toBeDefined();
    if (!snapEvent) return;

    const snap = snapshotPayload(snapEvent);
    // Payload shape: members + recentEvents + spectatorCount + yourRole/Slot/UserId — no typing key.
    expect(Object.keys(snap).toSorted()).toEqual(
      [
        "members",
        "recentEvents",
        "spectatorCount",
        "yourRole",
        "yourSlot",
        "yourUserId",
      ].toSorted(),
    );
    expect(snap.recentEvents.some((e) => e.kind === "chat.typing")).toBe(false);
  });
});
