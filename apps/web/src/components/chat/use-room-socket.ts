import { useEffect, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-store";
import PartySocket from "partysocket";

import { env } from "@bun-mono/env/web";
import type { IntentEnvelope } from "@bun-mono/room-protocol/envelope";
import { parseEvent } from "@bun-mono/room-protocol/kinds";

import type { MemberView, RoomTimelineEntry } from "./room-events";
import {
  applyEvent,
  createRoomStore,
  resetStore,
  setStatus,
  type ConnectionStatus,
  type RoomState,
} from "./room-store";

export type { ConnectionStatus };

type UseRoomSocket = {
  status: ConnectionStatus;
  myUserId: string | null;
  members: readonly MemberView[];
  timeline: readonly RoomTimelineEntry[];
  send: (text: string) => void;
};

export function useRoomSocket(slug: string): UseRoomSocket {
  const [store] = useState(() => createRoomStore());

  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    resetStore(store);

    const url = new URL(env.VITE_SERVER_URL);
    const socket = new PartySocket({
      host: url.host,
      room: slug,
      basePath: `ws/room/${slug}`,
      protocol: url.protocol === "https:" ? "wss" : "ws",
    });
    socketRef.current = socket;

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
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);

    return () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [slug, store]);

  const status = useSelector(store, (s: RoomState) => s.status);

  const myUserId = useSelector(store, (s: RoomState) => s.myUserId);

  const members = useSelector(store, (s: RoomState) => s.members);

  const timeline = useSelector(store, (s: RoomState) => s.timeline);

  const send = (text: string): void => {
    const sock = socketRef.current;
    if (!sock) return;

    const intent: IntentEnvelope = {
      kind: "chat.send_message",
      payload: { text },
      intentId: crypto.randomUUID(),
    };

    sock.send(JSON.stringify(intent));
  };

  return { status, myUserId, members, timeline, send };
}
