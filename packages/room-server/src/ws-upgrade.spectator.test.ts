import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import { createTestDb, seedRoom, seedUser, type TestDb } from "./_test-utils";
import { resetRegistryForTests } from "./room-registry";

type SessionResult = { user: { id: string } } | null;
const sessionMock = vi.fn<(args: { headers: Headers }) => Promise<SessionResult>>();

vi.mock("@bun-mono/auth", () => ({
  auth: {
    api: {
      getSession: sessionMock,
    },
  },
}));

vi.mock("@bun-mono/db", () => ({
  db: {},
}));

const { authoriseRoomUpgrade, onRoomOpen, onRoomMessage } = await import("./ws-upgrade");

let testDb: TestDb;

beforeEach(async () => {
  testDb = await createTestDb();
  resetRegistryForTests();
  sessionMock.mockReset();
});

afterEach(() => {
  resetRegistryForTests();
});

type Captured = { sent: EventEnvelope[]; closed: { code: number; reason: string } | null };

function makeCaptures(): Captured & {
  send: (raw: string) => void;
  close: (code: number, reason: string) => void;
} {
  const captured: Captured = { sent: [], closed: null };
  return {
    ...captured,
    send: (raw: string) => {
      captured.sent.push(JSON.parse(raw) as EventEnvelope);
    },
    close: (code: number, reason: string) => {
      captured.closed = { code, reason };
    },
    get sent() {
      return captured.sent;
    },
    get closed() {
      return captured.closed;
    },
  };
}

function makeRequest(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request("http://localhost/ws/room/abc", { headers });
}

async function seed(): Promise<void> {
  await seedUser(testDb, "alice", "Alice");
  await seedUser(testDb, "bob", "Bob");
  await seedRoom(testDb, "room-1", "abc", "alice");
}

const chatIntent = (text: string, intentId: string): string =>
  JSON.stringify({ kind: "chat.send_message", payload: { text }, intentId });

const rejectionReason = (ev: EventEnvelope): string => (ev.payload as { reason: string }).reason;

describe("WS upgrade — spectator paths", () => {
  it("anonymous attach receives a spectator snapshot; submitting any intent is rejected with spectator_cannot_act", async () => {
    await seed();
    sessionMock.mockResolvedValue(null);

    const upgrade = await authoriseRoomUpgrade(makeRequest(null), "abc", { db: testDb });
    expect(upgrade.ok).toBe(true);
    if (!upgrade.ok) return;
    const ctx = upgrade.ctx;

    const caps = makeCaptures();
    await onRoomOpen(ctx, caps.send, caps.close, { db: testDb });

    const snap = caps.sent.find((e) => e.kind === "room.snapshot");
    expect(snap).toBeDefined();
    const snapPayload = snap!.payload as { yourRole: string; yourUserId: string | null };
    expect(snapPayload.yourRole).toBe("spectator");
    expect(snapPayload.yourUserId).toBeNull();

    const before = caps.sent.length;
    await onRoomMessage(ctx, chatIntent("hi", "i-1"), caps.send, caps.close, { db: testDb });

    const newEvents = caps.sent.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionReason(newEvents[0]!)).toBe("spectator_cannot_act");
  });

  it("authenticated joiner attaching to a full Room downgrades to spectator; submitting an intent is rejected with room_full while every slot is taken", async () => {
    await seed();
    await seedUser(testDb, "carol", "Carol");
    await seedUser(testDb, "dave", "Dave");
    await seedUser(testDb, "eve", "Eve");

    // Fill the room with four authenticated members.
    for (const userId of ["alice", "bob", "carol", "dave"]) {
      sessionMock.mockResolvedValueOnce({ user: { id: userId } });
      // eslint-disable-next-line no-await-in-loop -- sequential upgrades required to deterministically allocate slots 0..3
      const upgrade = await authoriseRoomUpgrade(makeRequest("session=" + userId), "abc", {
        db: testDb,
      });
      if (!upgrade.ok) throw new Error("unexpected non-ok");
      const caps = makeCaptures();
      // eslint-disable-next-line no-await-in-loop -- onRoomOpen completes the attach for the next iteration's slot
      await onRoomOpen(upgrade.ctx, caps.send, caps.close, { db: testDb });
    }

    // Eve is the 5th joiner. She has a session, so attach downgrades to Spectator (snapshot says so), and her submit attempt re-tries admission and fails room_full.
    sessionMock.mockResolvedValueOnce({ user: { id: "eve" } });

    const upgrade = await authoriseRoomUpgrade(makeRequest("session=eve"), "abc", { db: testDb });
    if (!upgrade.ok) throw new Error("unexpected non-ok");
    const ctx = upgrade.ctx;

    const caps = makeCaptures();
    await onRoomOpen(ctx, caps.send, caps.close, { db: testDb });

    const snap = caps.sent.find((e) => e.kind === "room.snapshot");
    expect((snap!.payload as { yourRole: string }).yourRole).toBe("spectator");

    const before = caps.sent.length;
    await onRoomMessage(ctx, chatIntent("hi", "i-full"), caps.send, caps.close, { db: testDb });

    const newEvents = caps.sent.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect(rejectionReason(newEvents[0]!)).toBe("room_full");
  });
});
