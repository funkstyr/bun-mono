import { useEffect, useRef } from "react";

import {
  isChatMessage,
  isMemberJoined,
  type MemberJoinedEvent,
  type MemberLeftEvent,
  type RoomTimelineEntry,
} from "./room-events";

type Props = { timeline: readonly RoomTimelineEntry[] };

function systemText(e: MemberJoinedEvent | MemberLeftEvent): string {
  if (isMemberJoined(e)) return `${e.payload.displayName} joined`;
  if (e.payload.reason === "ttl_expired") {
    return `slot ${e.payload.slot} reopened after 24h idle`;
  }
  return `slot ${e.payload.slot} left`;
}

export function MessageList({ timeline }: Props): React.ReactElement {
  const ref = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [timeline]);

  return (
    <ul ref={ref} className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
      {timeline.map((entry) => {
        if (isChatMessage(entry)) {
          return (
            <li key={entry.id} className="flex gap-2 text-sm">
              <span className="text-muted-foreground font-mono text-xs">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>

              <span className="text-foreground font-medium">
                {entry.from?.slice(0, 8) ?? "system"}
              </span>

              <span>{entry.payload.text}</span>
            </li>
          );
        }

        return (
          <li key={entry.id} className="text-muted-foreground flex gap-2 text-xs italic">
            <span className="font-mono">{new Date(entry.ts).toLocaleTimeString()}</span>

            <span>— {systemText(entry)}</span>
          </li>
        );
      })}
    </ul>
  );
}
