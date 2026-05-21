import { customAlphabet } from "nanoid";

import { auth } from "@bun-mono/auth";
import { parseIntent } from "@bun-mono/room-protocol/kinds";

import type { ChatIntent } from "./chat-reducer";
import { getOrCreateActorBySlug, type RegistryDeps } from "./room-registry";
import type { Connection } from "./types";

const connectionIdAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const generateConnectionId = customAlphabet(connectionIdAlphabet, 16);

const eventIdAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const generateRejectionId = customAlphabet(eventIdAlphabet, 21);

// `userId` is the authenticated id at upgrade time, or `null` for a
// cookie-less anonymous Spectator. Promotion to a Member requires a fresh
// WS connection (i.e. the client must reconnect after sign-in) — the
// upgrade request's headers are not re-evaluated mid-connection.
export type RoomUpgradeContext = {
  userId: string | null;
  slug: string;
  roomId: string;
  connectionId: string;
};

export type AuthoriseSuccess = { ok: true; ctx: RoomUpgradeContext };
export type AuthoriseFailure = { ok: false; status: number; reason: string };
export type AuthoriseResult = AuthoriseSuccess | AuthoriseFailure;

export async function authoriseRoomUpgrade(
  req: Request,
  slug: string,
  deps: RegistryDeps = {},
): Promise<AuthoriseResult> {
  const session = await auth.api.getSession({ headers: req.headers });

  const found = await getOrCreateActorBySlug(slug, deps);
  if (!found) return { ok: false, status: 404, reason: "room_not_found" };

  return {
    ok: true,
    ctx: {
      userId: session?.user?.id ?? null,
      slug,
      roomId: found.row.id,
      connectionId: generateConnectionId(),
    },
  };
}

export type WsSend = (raw: string) => void;
export type WsClose = (code: number, reason: string) => void;

type ConnEntry = { conn: Connection; roomId: string };

const connByConnectionId = new Map<string, ConnEntry>();

export async function onRoomOpen(
  ctx: RoomUpgradeContext,
  send: WsSend,
  close: WsClose,
  deps: RegistryDeps = {},
): Promise<void> {
  const found = await getOrCreateActorBySlug(ctx.slug, deps);
  if (!found) {
    close(1008, "room_disappeared");
    return;
  }

  const conn: Connection = {
    connectionId: ctx.connectionId,
    userId: ctx.userId,
    send: (ev) => send(JSON.stringify(ev)),
    close,
  };
  connByConnectionId.set(ctx.connectionId, { conn, roomId: found.row.id });

  await found.actor.attach(conn);
}

export async function onRoomMessage(
  ctx: RoomUpgradeContext,
  raw: string,
  send: WsSend,
  close: WsClose,
  deps: RegistryDeps = {},
): Promise<void> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    sendRejection(send, "", "invalid_json");
    return;
  }

  const parsed = parseIntent(parsedJson);
  if (!parsed.ok) {
    const incomingIntentId =
      typeof (parsedJson as { intentId?: unknown }).intentId === "string"
        ? (parsedJson as { intentId: string }).intentId
        : "";
    sendRejection(send, incomingIntentId, parsed.error);
    return;
  }

  const kind = parsed.value.kind;
  if (kind !== "chat.send_message" && kind !== "chat.typing_ping" && kind !== "room.leave") {
    sendRejection(send, parsed.value.intentId, `unsupported_intent:${kind}`);
    return;
  }

  const found = await getOrCreateActorBySlug(ctx.slug, deps);
  if (!found) {
    close(1008, "room_disappeared");
    return;
  }

  // `onRoomOpen` runs before any `onRoomMessage`, so this entry is always
  // populated by the time a message arrives — close on the impossible.
  const entry = connByConnectionId.get(ctx.connectionId);
  if (!entry) {
    close(1011, "no_open_handshake");
    return;
  }

  if (kind === "room.leave") {
    await found.actor.leave(entry.conn, parsed.value.intentId);
    return;
  }

  await found.actor.submit(entry.conn, parsed.value as ChatIntent);
}

export function onRoomClose(ctx: RoomUpgradeContext, deps: RegistryDeps = {}): void {
  const entry = connByConnectionId.get(ctx.connectionId);
  if (!entry) return;

  connByConnectionId.delete(ctx.connectionId);

  // Best-effort detach; the registry holds the actor, so re-resolve lazily.
  // `detach` is async (it persists `lastSeenAt` and emits `member_offline`);
  // we `await` inside the `.then` so the `.catch` covers both registry-lookup
  // and detach failures. The cost on failure is a tiny memory leak in the
  // actor's `connections` map until the actor is GC'd, not a crash.
  void getOrCreateActorBySlug(ctx.slug, deps)
    .then(async (found) => {
      if (found) await found.actor.detach(entry.conn);
    })
    .catch((err: unknown) => {
      console.error("onRoomClose: detach failed:", err);
    });
}

function sendRejection(send: WsSend, intentId: string, reason: string): void {
  // Pre-actor rejection: the intent failed `parseIntent` or routing before
  // reaching a RoomActor, so we have no monotonic counter. `position` is
  // informational for transient events; `0` is a sentinel meaning
  // "not assigned by an actor".
  send(
    JSON.stringify({
      kind: "room.intent_rejected",
      payload: { intentId, reason },
      id: generateRejectionId(),
      ts: Date.now(),
      position: 0,
      from: null,
      durable: false,
    }),
  );
}
