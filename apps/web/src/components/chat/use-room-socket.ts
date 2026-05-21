import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-store";
import PartySocket from "partysocket";

import { env } from "@bun-mono/env/web";
import type { IntentEnvelope } from "@bun-mono/room-protocol/envelope";
import { parseEvent } from "@bun-mono/room-protocol/kinds";

import { isChatTyping, type MemberView, type RoomTimelineEntry } from "./room-events";
import {
  applyEvent,
  createRoomStore,
  removeTypingUser,
  resetStore,
  setStatus,
  type ConnectionStatus,
  type MyRole,
  type RoomState,
} from "./room-store";

export type { ConnectionStatus, MyRole };

// 3s window exceeds the server's 1.5s debounce so an actively-typing User
// keeps refreshing their own indicator instead of flickering off between
// pings.
const TYPING_EXPIRY_MS = 3000;
// Client-side mirror of the server's 1.5s typing debounce. Suppresses
// wasted intents during a flurry of input events; the server is still the
// authoritative debouncer.
const TYPING_PING_INTERVAL_MS = 1500;

type UseRoomSocket = {
  status: ConnectionStatus;
  myUserId: string | null;
  myRole: MyRole;
  spectatorCount: number;
  members: readonly MemberView[];
  timeline: readonly RoomTimelineEntry[];
  typingUserIds: readonly string[];
  send: (text: string) => void;
  sendTypingPing: () => void;
};

export function useRoomSocket(slug: string): UseRoomSocket {
  const [store] = useState(() => createRoomStore());

  const socketRef = useRef<PartySocket | null>(null);
  const lastPingAtRef = useRef<number>(0);

  useEffect(() => {
    resetStore(store);
    lastPingAtRef.current = 0;

    const url = new URL(env.VITE_SERVER_URL);
    const socket = new PartySocket({
      host: url.host,
      room: slug,
      basePath: `ws/room/${slug}`,
      protocol: url.protocol === "https:" ? "wss" : "ws",
    });
    socketRef.current = socket;

    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const clearTypingTimers = (): void => {
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
    };

    const onOpen = (): void => setStatus(store, "open");
    const onClose = (): void => setStatus(store, "closed");
    const onMessage = (ev: MessageEvent): void => {
      let json: unknown;
      try {
        json = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      const parsed = parseEvent(json);
      if (!parsed.ok) {
        console.warn("parseEvent failed:", parsed.error);
        return;
      }

      applyEvent(store, parsed.value);

      // A fresh typing event from the same User restarts the 3s expiry —
      // an actively-typing User keeps refreshing without flicker.
      if (isChatTyping(parsed.value)) {
        const { userId } = parsed.value.payload;
        const existing = typingTimers.get(userId);
        if (existing !== undefined) clearTimeout(existing);
        const timer = setTimeout(() => {
          typingTimers.delete(userId);
          removeTypingUser(store, userId);
        }, TYPING_EXPIRY_MS);
        typingTimers.set(userId, timer);
      }
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);

    return () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.close();
      clearTypingTimers();
      socketRef.current = null;
    };
  }, [slug, store]);

  const status = useSelector(store, (s: RoomState) => s.status);

  const myUserId = useSelector(store, (s: RoomState) => s.myUserId);

  const myRole = useSelector(store, (s: RoomState) => s.myRole);

  const spectatorCount = useSelector(store, (s: RoomState) => s.spectatorCount);

  const members = useSelector(store, (s: RoomState) => s.members);

  const timeline = useSelector(store, (s: RoomState) => s.timeline);

  const typingUserIds = useSelector(store, (s: RoomState) => s.typingUserIds);

  const send = useCallback((text: string): void => {
    const sock = socketRef.current;
    if (!sock) return;

    const intent: IntentEnvelope = {
      kind: "chat.send_message",
      payload: { text },
      intentId: crypto.randomUUID(),
    };

    sock.send(JSON.stringify(intent));
  }, []);

  const sendTypingPing = useCallback((): void => {
    const sock = socketRef.current;
    if (!sock) return;

    const now = Date.now();
    if (now - lastPingAtRef.current < TYPING_PING_INTERVAL_MS) return;
    lastPingAtRef.current = now;

    const intent: IntentEnvelope = {
      kind: "chat.typing_ping",
      payload: {},
      intentId: crypto.randomUUID(),
    };

    sock.send(JSON.stringify(intent));
  }, []);

  return {
    status,
    myUserId,
    myRole,
    spectatorCount,
    members,
    timeline,
    typingUserIds,
    send,
    sendTypingPing,
  };
}
