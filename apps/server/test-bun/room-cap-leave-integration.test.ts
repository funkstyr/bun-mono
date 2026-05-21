// Integration test for the 10-Membership soft cap on `room.create` and the
// orpc `room.leave` procedure. Runs under Bun's native test runner
// alongside `ws-integration.test.ts` — same reasons (Bun.serve contract,
// better-auth cookie session lookup).
//
// Run with: bun --filter server test:bun

import { createClient } from "@libsql/client";
import { createORPCClient } from "@orpc/client";
import { isDefinedError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import type { AppRouter } from "@bun-mono/api/routers/index";
import { applyMigrations } from "@bun-mono/db/test-migrate";

const TEST_PORT = 3988;

const here = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolvePath(here, "..", ".vitest-tmp-cap");
const dbFile = resolvePath(tmpDir, "test.db");

// Env BEFORE importing ../src/index — see ws-integration.test.ts for context.
process.env["DATABASE_URL"] = `file:${dbFile}`;
process.env["BETTER_AUTH_SECRET"] = "test-secret-32-chars-long-1234567";
process.env["BETTER_AUTH_URL"] = `http://localhost:${TEST_PORT}`;
process.env["CORS_ORIGIN"] = `http://localhost:${TEST_PORT}`;
process.env["NODE_ENV"] = "test";

type AppExport = {
  fetch: (req: Request) => Response | Promise<Response>;
  websocket: Bun.WebSocketHandler<unknown>;
};

let server: ReturnType<typeof Bun.serve> | null = null;

async function resetDb(): Promise<void> {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const client = createClient({ url: `file:${dbFile}` });
  await applyMigrations(client);
  client.close();
}

async function startServer(): Promise<void> {
  const mod = (await import("../src/index")) as { default: AppExport };
  server = Bun.serve({
    port: TEST_PORT,
    fetch: mod.default.fetch,
    websocket: mod.default.websocket,
  });
}

beforeAll(async () => {
  await resetDb();
  await startServer();
});

afterAll(() => {
  server?.stop(true);
});

async function signup(name: string): Promise<{ userId: string; cookie: string }> {
  const email = `${name}@test.local`;
  const res = await fetch(`http://localhost:${TEST_PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name }),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no cookie set");
  const cookie = setCookie.split(";")[0]!;
  const body = (await res.json()) as { user: { id: string } };
  return { userId: body.user.id, cookie };
}

function rpcClient(cookie: string): RouterClient<AppRouter> {
  const link = new RPCLink({
    url: `http://localhost:${TEST_PORT}/rpc`,
    fetch: (url, options) => {
      const headers = new Headers((options as RequestInit | undefined)?.headers);
      headers.set("Cookie", cookie);
      return fetch(url, { ...options, headers });
    },
  });
  return createORPCClient(link) as RouterClient<AppRouter>;
}

describe("room.create — 10-Membership soft cap + room.leave", () => {
  it("blocks the 11th create with MEMBERSHIP_CAP_EXCEEDED, then unblocks after leaving one", async () => {
    const a = await signup("alice-cap");
    const client = rpcClient(a.cookie);

    // Create 10 Rooms — should all succeed, putting alice exactly at the cap.
    const slugs: string[] = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop -- one-at-a-time is fine for a fixture loop
      const { slug } = await client.room.create({ kind: "chat" });
      slugs.push(slug);
    }
    expect(slugs).toHaveLength(10);

    // The 11th must be rejected with the typed cap error.
    let capError: unknown = null;
    try {
      await client.room.create({ kind: "chat" });
    } catch (err) {
      capError = err;
    }
    expect(capError).not.toBeNull();
    expect(isDefinedError(capError)).toBe(true);
    const typed = capError as { code: string; data: { memberships: unknown[]; cap: number } };
    expect(typed.code).toBe("MEMBERSHIP_CAP_EXCEEDED");
    expect(typed.data.cap).toBe(10);
    expect(typed.data.memberships).toHaveLength(10);

    // Leave one Room — slot is released, count drops to 9.
    const leaveSlug = slugs[0]!;
    const leaveResult = await client.room.leave({ slug: leaveSlug });
    expect(leaveResult).toEqual({ ok: true });

    // Retry create — succeeds now that we're below the cap.
    const { slug: newSlug } = await client.room.create({ kind: "chat" });
    expect(newSlug).toBeTruthy();
    expect(newSlug).not.toBe(leaveSlug);
  });

  it("room.leave rejects callers who are not a Member of the Room", async () => {
    const owner = await signup("owner");
    const intruder = await signup("intruder");
    const ownerClient = rpcClient(owner.cookie);
    const intruderClient = rpcClient(intruder.cookie);

    const { slug } = await ownerClient.room.create({ kind: "chat" });

    let err: unknown = null;
    try {
      await intruderClient.room.leave({ slug });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as { code?: string }).code).toBe("NOT_FOUND");
  });
});
