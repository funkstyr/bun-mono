import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

type Slot = 0 | 1 | 2 | 3;

export type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: { text: string };
};

export type MemberJoinedEvent = EventEnvelope & {
  kind: "room.member_joined";
  payload: { userId: string; slot: Slot; displayName: string };
};

export type MemberLeftEvent = EventEnvelope & {
  kind: "room.member_left";
  payload: { userId: string; slot: Slot; reason: "left" | "ttl_expired" };
};

export type RoomTimelineEntry = ChatMessageEvent | MemberJoinedEvent | MemberLeftEvent;

export type RoomEvent = RoomTimelineEntry;

export type MemberView = {
  userId: string;
  slot: Slot;
  displayName: string;
  online: boolean;
  lastSeenAt: number | null;
};
