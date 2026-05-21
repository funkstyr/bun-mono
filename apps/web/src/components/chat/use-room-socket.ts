import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

import { env } from "@bun-mono/env/web";
import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";
import { parseEvent } from "@bun-mono/room-protocol/kinds";

import type { ChatMessageEvent, MemberView, RoomEvent, RoomTimelineEntry } from "./room-events";

export type ConnectionStatus = "connecting" | "open" | "closed";

type Slot = 0 | 1 | 2 | 3;

type Snapshot = {
  members: ReadonlyArray<{
    userId: string;
    slot: Slot;
    displayName: string;
    online: boolean;
    lastSeenAt: number | null;
  }>;
  recentEvents: EventEnvelope[];
  yourUserId: string | null;
};

type UseRoomSocket = {
  status: ConnectionStatus;
  myUserId: string | null;
  members: MemberView[];
  timeline: RoomTimelineEntry[];
  send: (text: string) => void;
};

function isSnapshot(ev: EventEnvelope): ev is EventEnvelope & {
  kind: "room.snapshot";
  payload: Snapshot;
} {
  return ev.kind === "room.snapshot";
}

function isChatMessage(ev: EventEnvelope): ev is ChatMessageEvent {
  return ev.kind === "chat.message_sent";
}

function isDurableSystemEvent(ev: EventEnvelope): boolean {
  return ev.kind === "room.member_joined" || ev.kind === "room.member_left";
}

function isMemberJoined(ev: EventEnvelope): ev is EventEnvelope & {
  kind: "room.member_joined";
  payload: { userId: string; slot: Slot; displayName: string };
} {
  return ev.kind === "room.member_joined";
}

function isMemberLeft(ev: EventEnvelope): ev is EventEnvelope & {
  kind: "room.member_left";
  payload: { userId: string; slot: Slot; reason: "left" | "ttl_expired" };
} {
  return ev.kind === "room.member_left";
}

function isMemberOnline(ev: EventEnvelope): ev is EventEnvelope & {
  kind: "room.member_online";
  payload: { userId: string; slot: Slot };
} {
  return ev.kind === "room.member_online";
}

function isMemberOffline(ev: EventEnvelope): ev is EventEnvelope & {
  kind: "room.member_offline";
  payload: { userId: string; slot: Slot };
} {
  return ev.kind === "room.member_offline";
}

function membersFromSnapshot(snap: Snapshot): Map<string, MemberView> {
  const out = new Map<string, MemberView>();
  for (const m of snap.members) {
    out.set(m.userId, { ...m });
  }
  return out;
}

function timelineFromSnapshot(snap: Snapshot): RoomTimelineEntry[] {
  return snap.recentEvents.filter(
    (e): e is RoomEvent => isChatMessage(e) || isDurableSystemEvent(e),
  );
}

function sortedMembers(map: Map<string, MemberView>): MemberView[] {
  return [...map.values()].toSorted((a, b) => a.slot - b.slot);
}

export function useRoomSocket(slug: string): UseRoomSocket {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [timeline, setTimeline] = useState<RoomTimelineEntry[]>([]);
  const socketRef = useRef<PartySocket | null>(null);
  const membersRef = useRef<Map<string, MemberView>>(new Map());

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
    setMyUserId(null);
    setMembers([]);
    setTimeline([]);
    membersRef.current = new Map();

    const setMember = (userId: string, patch: Partial<MemberView>): void => {
      const existing = membersRef.current.get(userId);
      if (existing === undefined) return;
      membersRef.current.set(userId, { ...existing, ...patch });
      setMembers(sortedMembers(membersRef.current));
    };

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

      if (isSnapshot(event)) {
        const snap = event.payload;
        setMyUserId(snap.yourUserId);
        membersRef.current = membersFromSnapshot(snap);
        setMembers(sortedMembers(membersRef.current));
        setTimeline(timelineFromSnapshot(snap));
        return;
      }

      if (isChatMessage(event)) {
        setTimeline((prev) => [...prev, event]);
        return;
      }

      if (isMemberJoined(event)) {
        const { userId, slot, displayName } = event.payload;
        membersRef.current.set(userId, {
          userId,
          slot,
          displayName,
          online: false,
          lastSeenAt: null,
        });
        setMembers(sortedMembers(membersRef.current));
        setTimeline((prev) => [...prev, event]);
        return;
      }

      if (isMemberLeft(event)) {
        membersRef.current.delete(event.payload.userId);
        setMembers(sortedMembers(membersRef.current));
        setTimeline((prev) => [...prev, event]);
        return;
      }

      if (isMemberOnline(event)) {
        setMember(event.payload.userId, { online: true, lastSeenAt: null });
        return;
      }

      if (isMemberOffline(event)) {
        setMember(event.payload.userId, { online: false, lastSeenAt: event.ts });
        return;
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

  return { status, myUserId, members, timeline, send };
}
