import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

import { env } from "@bun-mono/env/web";
import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";
import { parseEvent } from "@bun-mono/room-protocol/kinds";

type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: { text: string };
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
      if (event.kind === "room.snapshot") {
        const payload = event.payload as { recentEvents: EventEnvelope[] };
        setMessages(payload.recentEvents.filter(isChatMessageSent));
        return;
      }
      if (event.kind === "chat.message_sent" && isChatMessageSent(event)) {
        setMessages((prev) => [...prev, event]);
        return;
      }
      if (event.kind === "room.intent_rejected") {
        const payload = event.payload as { reason: string };
        console.warn("intent rejected:", payload.reason);
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
