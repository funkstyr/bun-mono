import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { roomMember } from "@bun-mono/db/schema/room";

import {
  eventsOfKind,
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

describe("RoomActor.detach", () => {
  it("emits room.member_offline and writes lastSeenAt when the user's last connection closes", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");
    await actor.attach(a);
    await actor.attach(b);

    clock = 5000;
    const bEventsBefore = b.events.length;
    await actor.detach(a);

    const bNew = b.events.slice(bEventsBefore);
    expect(bNew.map((e) => e.kind)).toEqual(["room.member_offline"]);
    expect((bNew[0]!.payload as { userId: string }).userId).toBe("alice");

    const rows = await testDb.select().from(roomMember).where(eq(roomMember.roomId, room.id));
    const aliceRow = rows.find((r) => r.userId === "alice");
    expect(aliceRow?.lastSeenAt).toBeInstanceOf(Date);
    const ts = aliceRow!.lastSeenAt as Date;
    expect(ts.getTime()).toBe(5000);
  });

  it("does not emit member_offline when the user still has other live connections", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1000,
      nextEventId: makeIdCounter(),
    });

    const a1 = makeConnection("c-a1", "alice");
    const a2 = makeConnection("c-a2", "alice");
    const b = makeConnection("c-b", "bob");
    await actor.attach(a1);
    await actor.attach(a2);
    await actor.attach(b);

    const bEventsBefore = b.events.length;
    await actor.detach(a1);

    const bNew = b.events.slice(bEventsBefore);
    expect(bNew.filter((e) => e.kind === "room.member_offline")).toHaveLength(0);
  });

  it("keeps lastSeenAt null across partial disconnects, then sets it on the last detach", async () => {
    let clock = 1000;
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => clock,
      nextEventId: makeIdCounter(),
    });

    const a1 = makeConnection("c-a1", "alice");
    const a2 = makeConnection("c-a2", "alice");
    await actor.attach(a1);
    await actor.attach(a2);

    clock = 2000;
    await actor.detach(a1);

    let rows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "alice"));
    expect(rows[0]?.lastSeenAt).toBeNull();

    clock = 3000;
    await actor.detach(a2);

    rows = await testDb.select().from(roomMember).where(eq(roomMember.userId, "alice"));
    const ts = rows[0]?.lastSeenAt;
    expect(ts).toBeInstanceOf(Date);
    expect((ts as Date).getTime()).toBe(3000);
  });

  it("stops broadcasting subsequent events to a detached connection", async () => {
    const actor = new RoomActor(room, chatReducer, {
      db: testDb as AnyLibSQLDatabase,
      now: () => 1,
      nextEventId: makeIdCounter(),
    });
    const a = makeConnection("c-a", "alice");
    const b = makeConnection("c-b", "bob");

    await actor.attach(a);
    await actor.attach(b);
    const bBefore = b.events.length;
    await actor.detach(b);

    await actor.submit(a, makeIntent("hi", "i-1"));

    expect(lastEvent(a)?.kind).toBe("chat.message_sent");
    // b's connection was removed before it could receive its own offline
    // broadcast or any subsequent chat events.
    expect(b.events.length).toBe(bBefore);
    expect(eventsOfKind(b, "chat.message_sent")).toHaveLength(0);
  });
});
