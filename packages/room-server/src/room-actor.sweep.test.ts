import { and, eq } from "drizzle-orm";
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
import { chatReducer } from "./chat-reducer";
import { RoomActor } from "./room-actor";
import { TTL_MS } from "./ttl";
import type { AnyLibSQLDatabase, RoomRow } from "./types";

let testDb: TestDb;
let room: RoomRow;

beforeEach(async () => {
  ({ testDb, room } = await setupRoomTest());
});

async function backdateLastSeen(db: TestDb, roomId: string, userId: string, ts: number) {
  await db
    .update(roomMember)
    .set({ lastSeenAt: new Date(ts) })
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, userId)));
}

describe("RoomActor.sweepStaleMembers — stale row past TTL", () => {
  it("deletes the row, writes a durable room.member_left{reason: ttl_expired}, and broadcasts to attached connections", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-alice", "alice");
    const bob = makeConnection("c-bob", "bob");
    await actor.attach(alice);
    await actor.attach(bob);

    clock = 5000;
    await actor.detach(alice);

    await backdateLastSeen(testDb, room.id, "alice", clock - TTL_MS - 1);

    clock = 10_000_000;
    const bobEventsBefore = bob.events.length;
    await actor.sweepStaleMembers();

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows.map((r) => r.userId)).toEqual(["bob"]);

    const events = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    const left = events.filter((e) => e.kind === "room.member_left");
    expect(left).toHaveLength(1);
    const payload = JSON.parse(left[0]!.payload) as {
      userId: string;
      slot: number;
      reason: string;
    };
    expect(payload).toEqual({ userId: "alice", slot: 0, reason: "ttl_expired" });

    const bobNew = bob.events.slice(bobEventsBefore);
    const memberLeft = bobNew.filter((e) => e.kind === "room.member_left");
    expect(memberLeft).toHaveLength(1);
    expect(memberLeft[0]!.payload).toMatchObject({
      userId: "alice",
      slot: 0,
      reason: "ttl_expired",
    });
  });

  it("does not delete a row whose lastSeenAt is younger than TTL", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice = makeConnection("c-alice", "alice");
    await actor.attach(alice);
    clock = 5000;
    await actor.detach(alice);

    await backdateLastSeen(testDb, room.id, "alice", clock - 60_000);

    clock = 6000;
    await actor.sweepStaleMembers();

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("alice");

    const events = await testDb
      .select()
      .from(roomEvent)
      .where(eq(roomEvent.roomId, room.id))
      .orderBy(roomEvent.position);
    expect(events.filter((e) => e.kind === "room.member_left")).toHaveLength(0);
  });
});

describe("RoomActor.attach — lazy sweep on connect", () => {
  it("sweeps a stale Member before computing the snapshot, so the snapshot has no ghost row", async () => {
    let clock = 1000;
    const first = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice1 = makeConnection("c-a1", "alice");
    await first.attach(alice1);
    clock = 5000;
    await first.detach(alice1);

    await backdateLastSeen(testDb, room.id, "alice", clock - TTL_MS - 1);

    clock = 10_000_000;
    const second = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });
    const bob = makeConnection("c-bob", "bob");
    await second.attach(bob);

    const snap = bob.events.find((e) => e.kind === "room.snapshot")!;
    const payload = snapshotPayload(snap);
    const userIds = payload.members.map((m) => m.userId);
    expect(userIds).toEqual(["bob"]);
    expect(payload.yourSlot).toBe(0);

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows.map((r) => r.userId)).toEqual(["bob"]);
  });

  it("a returning User whose own row expired re-joins as a fresh Member (member_joined broadcast to others, slot may differ)", async () => {
    let clock = 1000;
    const first = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });
    await first.attach(makeConnection("c-b", "bob"));
    const alice1 = makeConnection("c-a1", "alice");
    await first.attach(alice1);
    // Slots: bob=0, alice=1
    clock = 5000;
    await first.detach(alice1);

    await backdateLastSeen(testDb, room.id, "alice", clock - TTL_MS - 1);

    clock = 10_000_000;
    const second = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });
    const bobNew = makeConnection("c-bnew", "bob");
    await second.attach(bobNew);

    const bobEventsBeforeAlice = bobNew.events.length;
    const aliceAgain = makeConnection("c-a2", "alice");
    await second.attach(aliceAgain);

    // Alice's stale row was swept on the second actor's first attach (bob).
    // Now alice reconnects: she has no row, so she's admitted as a new
    // Member. The joiner's own events are [member_online, snapshot]; the
    // durable member_joined is broadcast to other connections.
    const aliceSnap = aliceAgain.events.find((e) => e.kind === "room.snapshot")!;
    const payload = snapshotPayload(aliceSnap);
    expect(payload.yourSlot).toBe(1);

    const bobNewEvents = bobNew.events.slice(bobEventsBeforeAlice);
    const memberJoinedForAlice = bobNewEvents.filter(
      (e) =>
        e.kind === "room.member_joined" && (e.payload as { userId: string }).userId === "alice",
    );
    expect(memberJoinedForAlice).toHaveLength(1);
  });
});

describe("RoomActor.attach — reconnect within TTL keeps the same slot", () => {
  it("re-attaches the same slot_index, clears lastSeenAt, and does not emit member_joined", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const alice1 = makeConnection("c-a1", "alice");
    await actor.attach(alice1);
    clock = 5000;
    await actor.detach(alice1);

    clock = 6000;
    const alice2 = makeConnection("c-a2", "alice");
    await actor.attach(alice2);

    expect(eventsOfKind(alice2, "room.member_joined")).toHaveLength(0);
    expect(eventsOfKind(alice2, "room.snapshot")).toHaveLength(1);

    const snap = alice2.events.find((e) => e.kind === "room.snapshot")!;
    const payload = snapshotPayload(snap);
    expect(payload.yourSlot).toBe(0);

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    expect(rows[0]?.lastSeenAt).toBeNull();
  });
});
