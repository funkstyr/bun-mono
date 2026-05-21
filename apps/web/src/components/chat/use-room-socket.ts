import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

import { env } from "@bun-mono/env/web";
import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";
import { parseEvent } from "@bun-mono/room-protocol/kinds";

type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: { text: string };
};

type RoomSnapshotEvent = EventEnvelope & {
  kind: "room.snapshot";
  payload: { recentEvents: EventEnvelope[] };
};

type RoomIntentRejectedEvent = EventEnvelope & {
  kind: "room.intent_rejected";
  payload: { reason: string };
};

export type ConnectionStatus = "connecting" | "open" | "closed";

type UseRoomSocket = {
  status: ConnectionStatus;
  messages: ChatMessageEvent[];
  send: (text: string) => void;
};

function isChatMessageSent(ev: EventEnvelope): ev is ChatMessageEvent {
  return ev.kind === "chat.message_sent";
}

function isRoomSnapshot(ev: EventEnvelope): ev is RoomSnapshotEvent {
  return ev.kind === "room.snapshot";
}

function isIntentRejected(ev: EventEnvelope): ev is RoomIntentRejectedEvent {
  return ev.kind === "room.intent_rejected";
}

export function useRoomSocket(slug: string): UseRoomSocket {
  const [messages, setMessages] = useState<ChatMessageEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const url = new URL(env.VITE_SERVER_URL);

    const socket = new PartySocket({
      host: url.host,
      room: slug,
      basePath: `ws/room/${slug}`,
      protocol: url.protocol === "https:" ? "wss" : "ws",
    });

    socketRef.current = socket;
    setStatus("connecting");
    setMessages([]);

    const onOpen = (): void => setStatus("open");
    const onClose = (): void => setStatus("closed");
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

      const event = parsed.value;
      if (isRoomSnapshot(event)) {
        setMessages(event.payload.recentEvents.filter(isChatMessageSent));
        return;
      }
      if (isChatMessageSent(event)) {
        setMessages((prev) => [...prev, event]);
        return;
      }
      if (isIntentRejected(event)) {
        console.warn("intent rejected:", event.payload.reason);
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
      socketRef.current = null;
    };
  }, [slug]);

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

  return { status, messages, send };
}
