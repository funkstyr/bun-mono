// Integration test for the `/ws/room/:slug` route on the hono app.
//
// Runs under Bun's native test runner (`bun test`) because:
//   - `apps/server/src/index.ts` imports `hono/bun` which references `Bun` at
//     module load time;
//   - `Bun.serve` is the only HTTP server in this app's contract;
//   - Bun's `WebSocket` accepts custom request headers (the better-auth session
//     cookie), which Node's `ws`-free environment doesn't.
//
// Vitest is configured (in `vitest.config.ts`) to skip the `test-bun/` directory
// so this file does NOT run as part of `bun --filter server test`. Run with:
//
//   bun --filter server test:bun

import { createClient } from "@libsql/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import type { AppRouter } from "@bun-mono/api/routers/index";
import { applyMigrations } from "@bun-mono/db/test-migrate";

const TEST_PORT = 3987;

const here = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolvePath(here, "..", ".vitest-tmp");
const dbFile = resolvePath(tmpDir, "test.db");

// Set env BEFORE importing ../src/index — `@bun-mono/env/server` reads
// process.env at module init and `@bun-mono/db` opens libsql in the same tick.
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
  if (!mod.default.websocket) {
    throw new Error("apps/server default export missing `websocket`");
  }
  server = Bun.serve({
    port: TEST_PORT,
    fetch: mod.default.fetch,
    websocket: mod.default.websocket,
  });
}

beforeAll(async () => {
  // Fresh DB once per file. We can't reset between tests — the libsql client
  // inside `@bun-mono/db` caches its connection at module load, so moving the
  // backing file mid-run yields SQLITE_READONLY_DBMOVED. Each test uses a
  // distinct test user to avoid email-uniqueness collisions.
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

async function createRoom(cookie: string): Promise<string> {
  const client = rpcClient(cookie);
  const { slug } = await client.room.create({ kind: "chat" });
  return slug;
}

type Buffered = { ws: WebSocket; queue: unknown[]; waiters: ((m: unknown) => void)[] };

function openWs(slug: string, cookie: string | null): Promise<Buffered> {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${TEST_PORT}/ws/room/${slug}`;
    // Bun's WebSocket accepts a 2nd-arg `headers` option (not in browser spec).
    const ws = cookie
      ? new WebSocket(url, { headers: { Cookie: cookie } } as unknown as string)
      : new WebSocket(url);

    // Attach the message listener BEFORE `open` resolves so we don't miss the
    // first snapshot frame between the handshake and the listener.
    const queue: unknown[] = [];
    const waiters: ((m: unknown) => void)[] = [];
    ws.addEventListener("message", (ev) => {
      const msg: unknown = JSON.parse(ev.data as string);
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else queue.push(msg);
    });

    ws.addEventListener("open", () => resolve({ ws, queue, waiters }), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

function nextMessage<T = unknown>(b: Buffered, kind: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${kind}`)), timeoutMs);

    const tryConsume = (msg: unknown): boolean => {
      if ((msg as { kind?: string }).kind === kind) {
        clearTimeout(timer);
        resolve(msg as T);
        return true;
      }
      return false;
    };

    // Drain already-queued messages first.
    while (b.queue.length > 0) {
      const msg = b.queue.shift()!;
      if (tryConsume(msg)) return;
    }

    // Otherwise wait for the next arrival.
    const onArrival = (msg: unknown): void => {
      if (!tryConsume(msg)) b.waiters.push(onArrival);
    };
    b.waiters.push(onArrival);
  });
}

describe("ws integration", () => {
  it("two members exchange a chat message", async () => {
    const a = await signup("alice");
    const b = await signup("bob");
    const slug = await createRoom(a.cookie);

    const wsA = await openWs(slug, a.cookie);
    const wsB = await openWs(slug, b.cookie);

    await nextMessage(wsA, "room.snapshot");
    await nextMessage(wsB, "room.snapshot");

    const intent = {
      kind: "chat.send_message",
      payload: { text: "hello" },
      intentId: "i-1",
    };
    wsA.ws.send(JSON.stringify(intent));

    const ev = await nextMessage<{
      payload: { text: string };
      from: string;
    }>(wsB, "chat.message_sent");
    expect(ev.payload.text).toBe("hello");
    expect(ev.from).toBe(a.userId);

    wsA.ws.close();
    wsB.ws.close();
  });

  it("rejects WS connection without a session cookie", async () => {
    const c = await signup("carol");
    const slug = await createRoom(c.cookie);

    const url = `ws://localhost:${TEST_PORT}/ws/room/${slug}`;
    const ws = new WebSocket(url);
    const result = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.addEventListener("close", (ev) => resolve({ code: ev.code, reason: ev.reason }), {
        once: true,
      });
    });
    expect(result.code).toBe(4401);
  });

  it("rejects empty text with intent_rejected, no broadcast", async () => {
    const d = await signup("dan");
    const slug = await createRoom(d.cookie);
    const buf = await openWs(slug, d.cookie);
    await nextMessage(buf, "room.snapshot");

    buf.ws.send(
      JSON.stringify({
        kind: "chat.send_message",
        payload: { text: "" },
        intentId: "i-bad",
      }),
    );
    const rejected = await nextMessage<{ payload: { intentId: string } }>(
      buf,
      "room.intent_rejected",
    );
    expect(rejected.payload.intentId).toBe("i-bad");
    buf.ws.close();
  });
});
