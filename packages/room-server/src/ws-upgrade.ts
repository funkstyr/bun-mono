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

export type RoomUpgradeContext = {
  userId: string;
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
  if (!session?.user) return { ok: false, status: 401, reason: "unauthenticated" };

  const found = await getOrCreateActorBySlug(slug, deps);
  if (!found) return { ok: false, status: 404, reason: "room_not_found" };

  return {
    ok: true,
    ctx: {
      userId: session.user.id,
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

  if (parsed.value.kind !== "chat.send_message") {
    sendRejection(send, parsed.value.intentId, `unsupported_intent:${parsed.value.kind}`);
    return;
  }

  const found = await getOrCreateActorBySlug(ctx.slug, deps);
  if (!found) {
    close(1008, "room_disappeared");
    return;
  }

  const entry = connByConnectionId.get(ctx.connectionId);
  const conn: Connection = entry?.conn ?? {
    connectionId: ctx.connectionId,
    userId: ctx.userId,
    send: (ev) => send(JSON.stringify(ev)),
    close,
  };

  await found.actor.submit(conn, parsed.value as ChatIntent);
}

export function onRoomClose(ctx: RoomUpgradeContext, deps: RegistryDeps = {}): void {
  const entry = connByConnectionId.get(ctx.connectionId);
  if (!entry) return;

  connByConnectionId.delete(ctx.connectionId);

  // Best-effort detach; the registry holds the actor, so re-resolve lazily.
  void getOrCreateActorBySlug(ctx.slug, deps).then((found) => {
    if (found) found.actor.detach(entry.conn);
  });
}

function sendRejection(send: WsSend, intentId: string, reason: string): void {
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
