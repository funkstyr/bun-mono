import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  makeConnection,
  makeIdCounter,
  makeIntent,
  rejectionPayload,
  setupRoomTest,
  snapshotPayload,
} from "./_room-actor-test-utils";
import { seedRoom, seedUser, type TestDb } from "./_test-utils";
import { chatReducer } from "./chat-reducer";
import { MEMBERSHIP_CAP, countMembershipsForUser } from "./member-presence";
import { RoomActor } from "./room-actor";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

// Pre-populates `MEMBERSHIP_CAP` rows for `alice` across fresh Rooms so she
// hits the cap when she next attempts to join one. The Rooms themselves
// are unrelated to the per-test target `room` — `alice` is *not* yet a
// Member of `room.id`.
async function fillCapForAlice(): Promise<void> {
  for (let i = 0; i < MEMBERSHIP_CAP; i++) {
    const roomId = `room-cap-${i}`;
    const slug = `cap-${i}`;
    // eslint-disable-next-line no-await-in-loop -- ordering of fixture inserts is fine
    await seedRoom(testDb, roomId, slug, "alice");
    // eslint-disable-next-line no-await-in-loop -- ordering of fixture inserts is fine
    await testDb.run(sql`
      INSERT INTO room_member (room_id, user_id, slot_index, joined_at, last_seen_at)
      VALUES (${roomId}, 'alice', 0, ${Date.now()}, NULL)
    `);
  }
}

describe("RoomActor — 10-Membership soft cap on WS attach", () => {
  it("downgrades a User already at the cap to Spectator with reason='membership_cap' on a new Room", async () => {
    await fillCapForAlice();

    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);

    expect(alice.events.map((e) => e.kind)).toEqual(["room.snapshot"]);
    const snap = snapshotPayload(alice.events[0]!);
    expect(snap.yourRole).toBe("spectator");
    expect(snap.yourSlot).toBeNull();
    expect((alice.events[0]!.payload as { reason?: string }).reason).toBe("membership_cap");
  });

  it("does NOT downgrade a User who is already a Member of THIS Room, even if other rooms put them at the cap", async () => {
    // Alice is already a Member of `room` (the test fixture inserts no row;
    // seed one manually) and at the cap globally. Re-attaching should
    // keep her Membership, not flip to Spectator.
    await testDb.run(sql`
      INSERT INTO room_member (room_id, user_id, slot_index, joined_at, last_seen_at)
      VALUES (${room.id}, 'alice', 0, ${Date.now()}, NULL)
    `);
    // Add another 9 rooms to push her to 10 total.
    for (let i = 0; i < MEMBERSHIP_CAP - 1; i++) {
      const roomId = `room-cap-${i}`;
      const slug = `cap-${i}`;
      // eslint-disable-next-line no-await-in-loop -- ordering of fixture inserts is fine
      await seedRoom(testDb, roomId, slug, "alice");
      // eslint-disable-next-line no-await-in-loop -- ordering of fixture inserts is fine
      await testDb.run(sql`
        INSERT INTO room_member (room_id, user_id, slot_index, joined_at, last_seen_at)
        VALUES (${roomId}, 'alice', 0, ${Date.now()}, NULL)
      `);
    }

    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);

    const snapEvent = alice.events.find((e) => e.kind === "room.snapshot");
    expect(snapEvent).toBeDefined();
    const snap = snapshotPayload(snapEvent!);
    expect(snap.yourRole).toBe("member");
    expect(snap.yourSlot).toBe(0);
  });

  it("rejects a chat.send_message from a cap-downgraded Spectator with reason='membership_cap'", async () => {
    await fillCapForAlice();

    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-a", "alice");
    await actor.attach(alice);
    const before = alice.events.length;

    await actor.submit(alice, makeIntent("hi", "i-1"));

    const newEvents = alice.events.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionPayload(newEvents[0]!).reason).toBe("membership_cap");
  });
});

describe("countMembershipsForUser", () => {
  it("counts only this User's rows across all Rooms (does not bleed across users)", async () => {
    // Seed extra users used only for cross-user isolation.
    await seedUser(testDb, "dave", "Dave");

    await testDb.run(sql`
      INSERT INTO room_member (room_id, user_id, slot_index, joined_at, last_seen_at)
      VALUES (${room.id}, 'alice', 0, ${Date.now()}, NULL)
    `);
    await testDb.run(sql`
      INSERT INTO room_member (room_id, user_id, slot_index, joined_at, last_seen_at)
      VALUES (${room.id}, 'bob', 1, ${Date.now()}, NULL)
    `);

    const aliceCount = await countMembershipsForUser(testDb as AnyLibSQLDatabase, "alice");
    const bobCount = await countMembershipsForUser(testDb as AnyLibSQLDatabase, "bob");
    const daveCount = await countMembershipsForUser(testDb as AnyLibSQLDatabase, "dave");

    expect(aliceCount).toBe(1);
    expect(bobCount).toBe(1);
    expect(daveCount).toBe(0);
  });
});
