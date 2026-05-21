import { beforeEach, describe, expect, it } from "vitest";

import {
  makeConnection,
  makeIdCounter,
  makeIntent,
  makeTypingIntent,
  rejectionPayload,
  setupRoomTest,
} from "./_room-actor-test-utils";
import { seedRoom, type TestDb } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

function countOfKind(events: { kind: string }[], kind: string): number {
  return events.filter((e) => e.kind === kind).length;
}

describe("RoomActor — chat.send_message rate limit (5 per rolling 10s)", () => {
  it("admits the first five sends and rejects the sixth with rate_limit_send_message", async () => {
    let clock = 1_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);
    const before = alice.events.length;

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts simulate a runaway client
      await actor.submit(alice, makeIntent(`hi-${i}`, `i-${i}`));
      clock += 100;
    }

    let newEvents = alice.events.slice(before);
    expect(countOfKind(newEvents, "chat.message_sent")).toBe(5);
    expect(countOfKind(newEvents, "room.intent_rejected")).toBe(0);

    const beforeSixth = alice.events.length;
    await actor.submit(alice, makeIntent("hi-6", "i-6"));
    newEvents = alice.events.slice(beforeSixth);
    expect(countOfKind(newEvents, "chat.message_sent")).toBe(0);
    const rejection = newEvents.find((e) => e.kind === "room.intent_rejected");
    expect(rejection).toBeDefined();
    expect(rejectionPayload(rejection!).reason).toBe("rate_limit_send_message");
    expect(rejectionPayload(rejection!).intentId).toBe("i-6");
  });

  it("admits a fresh send once the oldest stamp ages out past the 10s window", async () => {
    let clock = 1_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actor.submit(alice, makeIntent(`hi-${i}`, `i-${i}`));
      clock += 100;
    }

    // The first stamp sits at 1000; advance past 1000 + 10_000.
    clock = 12_000;
    const before = alice.events.length;
    await actor.submit(alice, makeIntent("post-window", "i-recover"));
    const newEvents = alice.events.slice(before);
    expect(countOfKind(newEvents, "chat.message_sent")).toBe(1);
    expect(countOfKind(newEvents, "room.intent_rejected")).toBe(0);
  });

  it("keeps separate budgets per Member in the same Room", async () => {
    let clock = 1_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    const bob = makeConnection("c-b", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actor.submit(alice, makeIntent(`alice-${i}`, `a-${i}`));
      clock += 100;
    }

    // Alice is now at her cap. Bob's first five should still all pass.
    const bobBefore = bob.events.length;
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actor.submit(bob, makeIntent(`bob-${i}`, `b-${i}`));
      clock += 100;
    }
    const bobNew = bob.events.slice(bobBefore);
    expect(countOfKind(bobNew, "chat.message_sent")).toBe(5);
    expect(countOfKind(bobNew, "room.intent_rejected")).toBe(0);

    // And Alice's 6th still rejects.
    const aliceBefore = alice.events.length;
    await actor.submit(alice, makeIntent("alice-6", "a-6"));
    const aliceNew = alice.events.slice(aliceBefore);
    expect(countOfKind(aliceNew, "room.intent_rejected")).toBe(1);
    expect(rejectionPayload(aliceNew[0]!).reason).toBe("rate_limit_send_message");
  });

  it("keeps separate budgets per Room for the same Member (in-memory state is per actor)", async () => {
    let clock = 1_000;
    const actorA = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const roomB: RoomRow = {
      id: "room-2",
      slug: "slug-2",
      kind: "chat",
      name: null,
      createdBy: "alice",
      createdAt: 0,
    };
    await seedRoom(testDb, roomB.id, roomB.slug, roomB.createdBy);
    const actorB = new RoomActor(roomB, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const aliceA = makeConnection("c-a1", "alice");
    const aliceB = makeConnection("c-a2", "alice");
    await actorA.attach(aliceA);
    await actorB.attach(aliceB);

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actorA.submit(aliceA, makeIntent(`a-${i}`, `ia-${i}`));
      clock += 100;
    }

    const bBefore = aliceB.events.length;
    await actorB.submit(aliceB, makeIntent("b-1", "ib-1"));
    const bNew = aliceB.events.slice(bBefore);
    expect(countOfKind(bNew, "chat.message_sent")).toBe(1);
    expect(countOfKind(bNew, "room.intent_rejected")).toBe(0);
  });

  it("does not rate-limit chat.typing_ping", async () => {
    let clock = 1_000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);
    const before = alice.events.length;

    // Fire ten typing pings well past the chat budget; none should reject.
    // (The 1.5s server-side debounce squelches the broadcast, but the
    // important assertion is *no* `rate_limit_send_message` rejection.)
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actor.submit(alice, makeTypingIntent(`t-${i}`));
      clock += 1_600;
    }

    const newEvents = alice.events.slice(before);
    const rateLimited = newEvents.filter(
      (e) =>
        e.kind === "room.intent_rejected" &&
        rejectionPayload(e).reason === "rate_limit_send_message",
    );
    expect(rateLimited).toHaveLength(0);
  });
});

describe("RoomActor — rate-limit state is in-memory only", () => {
  it("resets the budget on a fresh actor instance (hibernation rehydrate)", async () => {
    let clock = 1_000;
    const actorOne = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const aliceOne = makeConnection("c-a1", "alice");
    await actorOne.attach(aliceOne);
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential bursts
      await actorOne.submit(aliceOne, makeIntent(`hi-${i}`, `i-${i}`));
      clock += 100;
    }

    // New actor over the same room (simulating wake-up after hibernation).
    const actorTwo = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });
    const aliceTwo = makeConnection("c-a2", "alice");
    await actorTwo.attach(aliceTwo);
    const before = aliceTwo.events.length;
    await actorTwo.submit(aliceTwo, makeIntent("post-rehydrate", "i-recover"));
    const newEvents = aliceTwo.events.slice(before);
    expect(countOfKind(newEvents, "chat.message_sent")).toBe(1);
    expect(countOfKind(newEvents, "room.intent_rejected")).toBe(0);
  });
});
