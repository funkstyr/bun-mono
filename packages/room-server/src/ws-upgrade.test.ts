import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Import after mocks so the registry and ws-upgrade see the stubs.
const { authoriseRoomUpgrade } = await import("./ws-upgrade");

let testDb: TestDb;

beforeEach(async () => {
  testDb = await createTestDb();
  resetRegistryForTests();
  sessionMock.mockReset();
});

afterEach(() => {
  resetRegistryForTests();
});

function makeRequest(): Request {
  return new Request("http://localhost/ws/room/abc", {
    headers: { cookie: "session=test" },
  });
}

describe("authoriseRoomUpgrade", () => {
  it("returns 401 unauthenticated when there is no session", async () => {
    sessionMock.mockResolvedValueOnce(null);

    const result = await authoriseRoomUpgrade(makeRequest(), "abc");

    expect(result).toEqual({ ok: false, status: 401, reason: "unauthenticated" });
  });

  it("returns 404 room_not_found for a valid session but missing slug", async () => {
    sessionMock.mockResolvedValueOnce({ user: { id: "alice" } });

    const result = await authoriseRoomUpgrade(makeRequest(), "no-such-room", {
      db: testDb,
    });

    expect(result).toEqual({ ok: false, status: 404, reason: "room_not_found" });
  });

  it("returns ok with a fresh upgrade context for a valid session + existing room", async () => {
    await seedUser(testDb, "alice");
    await seedRoom(testDb, "room-1", "abc", "alice");
    sessionMock.mockResolvedValueOnce({ user: { id: "alice" } });

    const result = await authoriseRoomUpgrade(makeRequest(), "abc", { db: testDb });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.userId).toBe("alice");
    expect(result.ctx.slug).toBe("abc");
    expect(result.ctx.roomId).toBe("room-1");
    expect(result.ctx.connectionId).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});
