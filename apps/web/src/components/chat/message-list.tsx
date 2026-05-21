import { useEffect, useRef } from "react";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: { text: string };
};

type Props = { messages: ChatMessageEvent[] };

export function MessageList({ messages }: Props): React.ReactElement {
  const ref = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <ul ref={ref} className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
      {messages.map((m) => (
        <li key={m.id} className="flex gap-2 text-sm">
          <span className="text-muted-foreground font-mono text-xs">
            {new Date(m.ts).toLocaleTimeString()}
          </span>
          <span className="text-foreground font-medium">{m.from?.slice(0, 8) ?? "system"}</span>
          <span>{m.payload.text}</span>
        </li>
      ))}
    </ul>
  );
}
