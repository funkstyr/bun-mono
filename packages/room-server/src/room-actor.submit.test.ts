import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomEvent } from "@bun-mono/db/schema/room";

import {
  lastEvent,
  makeConnection,
  makeIdCounter,
  makeIntent,
  setupRoomTest,
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
