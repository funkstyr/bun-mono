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

describe("WS upgrade — anonymous attach + promotion-on-intent", () => {
  it("anonymous attach receives a spectator snapshot; submitting a chat intent is rejected with spectator_cannot_act", async () => {
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
    await onRoomMessage(
      ctx,
      JSON.stringify({
        kind: "chat.send_message",
        payload: { text: "hi" },
        intentId: "i-1",
      }),
      caps.send,
      caps.close,
      { db: testDb },
    );

    const newEvents = caps.sent.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect((newEvents[0]!.payload as { reason: string }).reason).toBe("spectator_cannot_act");
  });

  it("promotes an anonymous spectator on sign-in: re-checks auth on the next intent, then processes it as a member", async () => {
    await seed();

    // First call (upgrade): no session — anonymous attach.
    sessionMock.mockResolvedValueOnce(null);
    // Second call (intent re-check): session now exists — promote.
    sessionMock.mockResolvedValueOnce({ user: { id: "alice" } });

    const upgrade = await authoriseRoomUpgrade(makeRequest(null), "abc", { db: testDb });
    if (!upgrade.ok) throw new Error("unexpected non-ok");
    const ctx = upgrade.ctx;

    const caps = makeCaptures();
    await onRoomOpen(ctx, caps.send, caps.close, { db: testDb });

    const before = caps.sent.length;
    await onRoomMessage(
      ctx,
      JSON.stringify({
        kind: "chat.send_message",
        payload: { text: "promoted!" },
        intentId: "i-promote",
      }),
      caps.send,
      caps.close,
      { db: testDb },
    );

    const newEvents = caps.sent.slice(before);
    const memberJoined = newEvents.find(
      (e) =>
        e.kind === "room.member_joined" && (e.payload as { userId: string }).userId === "alice",
    );
    const chat = newEvents.find((e) => e.kind === "chat.message_sent");

    expect(memberJoined).toBeDefined();
    expect(chat).toBeDefined();
    expect(chat?.from).toBe("alice");
  });

  it("does not promote when sign-in completes but the Room is full — next intent is rejected with room_full", async () => {
    await seed();
    await seedUser(testDb, "carol", "Carol");
    await seedUser(testDb, "dave", "Dave");
    await seedUser(testDb, "eve", "Eve");

    // Fill the room with four members first by walking four separate
    // upgrades. Each upgrade resolves the session to the matching user.
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

    // Eve attaches anonymously, then "signs in" before her intent. Auth
    // mock returns Eve's session on the re-check.
    sessionMock.mockResolvedValueOnce(null);
    sessionMock.mockResolvedValueOnce({ user: { id: "eve" } });

    const upgrade = await authoriseRoomUpgrade(makeRequest(null), "abc", { db: testDb });
    if (!upgrade.ok) throw new Error("unexpected non-ok");
    const ctx = upgrade.ctx;
    const caps = makeCaptures();
    await onRoomOpen(ctx, caps.send, caps.close, { db: testDb });

    const before = caps.sent.length;
    await onRoomMessage(
      ctx,
      JSON.stringify({
        kind: "chat.send_message",
        payload: { text: "no room :(" },
        intentId: "i-full",
      }),
      caps.send,
      caps.close,
      { db: testDb },
    );

    const newEvents = caps.sent.slice(before);
    expect(newEvents.map((e) => e.kind)).toEqual(["room.intent_rejected"]);
    expect((newEvents[0]!.payload as { reason: string }).reason).toBe("room_full");
  });
});
