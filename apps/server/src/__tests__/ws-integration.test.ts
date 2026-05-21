// Integration test for the `/ws/room/:slug` route on the hono app.
//
// All three cases below are `it.skip` because the suite needs a runtime that
// can both (a) execute Bun-only imports (`Bun.serve`, `hono/bun`'s
// `createBunWebSocket`) and (b) open a WebSocket client with a custom `Cookie`
// header (the better-auth session). Vitest in this repo runs under Node — Bun
// APIs are absent, and Node's built-in `WebSocket` constructor follows the
// browser spec and does not accept arbitrary request headers.
//
// The chat reducer + room-actor + ws-upgrade lifecycle are already covered by
// unit tests in `@bun-mono/room-server` (see `chat-reducer.test.ts`,
// `room-actor.test.ts`, `ws-upgrade.test.ts`). The cases below are kept as
// executable documentation of the contract the hono route must honour, ready
// to be flipped on once a Bun-native test entry exists (`bun test`, or vitest
// configured with a Bun pool).
//
// TODO #4-followup: replace `it.skip` with `it` once the test entry runs under
// Bun. The happy path has been verified manually against `bun run dev`.

import { describe, expect, it } from "vitest";

const TEST_PORT = 3987;

type AppExport = {
  fetch: (req: Request) => Response | Promise<Response>;
  websocket: unknown;
};

type ServerHandle = { stop: (closeActive?: boolean) => void };

async function startServer(): Promise<ServerHandle> {
  // Lazy import: `../index` pulls `hono/bun`, which references `Bun` at module
  // load time. Importing it eagerly here would break the file under Node.
  const mod = (await import("../index")) as { default: AppExport };
  const app = mod.default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serve = (globalThis as { Bun?: { serve: any } }).Bun?.serve;
  if (typeof serve !== "function") {
    throw new Error("Bun.serve unavailable — these tests need the Bun runtime");
  }
  return serve({ port: TEST_PORT, fetch: app.fetch, websocket: app.websocket });
}

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

async function createRoom(cookie: string): Promise<string> {
  const res = await fetch(`http://localhost:${TEST_PORT}/rpc/room/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ kind: "chat" }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { slug: string };
  return body.slug;
}

function openWs(slug: string, cookie: string | null): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${TEST_PORT}/ws/room/${slug}`;
    const ws = cookie
      ? new WebSocket(url, { headers: { Cookie: cookie } } as unknown as string)
      : new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

function nextMessage(ws: WebSocket, kind: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${kind}`)), timeoutMs);
    const handler = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string) as { kind: string };
      if (data.kind === kind) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(data);
      }
    };
    ws.addEventListener("message", handler);
  });
}

describe("ws integration", () => {
  // oxlint-disable-next-line vitest/no-disabled-tests -- TODO #4-followup: enable once suite runs under Bun
  it.skip("two members exchange a chat message", async () => {
    const server = await startServer();
    try {
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
      wsA.send(JSON.stringify(intent));

      const ev = (await nextMessage(wsB, "chat.message_sent")) as {
        payload: { text: string };
        from: string;
      };
      expect(ev.payload.text).toBe("hello");
      expect(ev.from).toBe(a.userId);

      wsA.close();
      wsB.close();
    } finally {
      server.stop(true);
    }
  });

  // oxlint-disable-next-line vitest/no-disabled-tests -- TODO #4-followup: enable once suite runs under Bun
  it.skip("rejects WS connection without a session cookie", async () => {
    const server = await startServer();
    try {
      const c = await signup("carol");
      const slug = await createRoom(c.cookie);

      const url = `ws://localhost:${TEST_PORT}/ws/room/${slug}`;
      const ws = new WebSocket(url);
      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.addEventListener("close", (ev) => resolve({ code: ev.code, reason: ev.reason }), {
          once: true,
        });
      });
      const result = await closePromise;
      expect(result.code).toBe(4401);
    } finally {
      server.stop(true);
    }
  });

  // oxlint-disable-next-line vitest/no-disabled-tests -- TODO #4-followup: enable once suite runs under Bun
  it.skip("rejects empty text with intent_rejected, no broadcast", async () => {
    const server = await startServer();
    try {
      const d = await signup("dan");
      const slug = await createRoom(d.cookie);
      const ws = await openWs(slug, d.cookie);
      await nextMessage(ws, "room.snapshot");

      ws.send(
        JSON.stringify({
          kind: "chat.send_message",
          payload: { text: "" },
          intentId: "i-bad",
        }),
      );
      const rejected = (await nextMessage(ws, "room.intent_rejected")) as {
        payload: { intentId: string };
      };
      expect(rejected.payload.intentId).toBe("i-bad");
      ws.close();
    } finally {
      server.stop(true);
    }
  });
});
