import { beforeEach, describe, expect, it } from "vitest";

import {
  makeConnection,
  makeIdCounter,
  makeIntent,
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
