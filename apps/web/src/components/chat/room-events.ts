import type { MessageSentPayload, TypingPayload } from "@bun-mono/room-protocol/chat";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type {
  MemberJoinedPayload,
  MemberLeftPayload,
  MemberOfflinePayload,
  MemberOnlinePayload,
} from "@bun-mono/room-protocol/member-events";
import type { IntentRejectedPayload, RoomSnapshotPayload } from "@bun-mono/room-protocol/system";

export type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: MessageSentPayload;
};

export type ChatTypingEvent = EventEnvelope & {
  kind: "chat.typing";
  payload: TypingPayload;
};

export type MemberJoinedEvent = EventEnvelope & {
  kind: "room.member_joined";
  payload: MemberJoinedPayload;
};

export type MemberLeftEvent = EventEnvelope & {
  kind: "room.member_left";
  payload: MemberLeftPayload;
};

export type MemberOnlineEvent = EventEnvelope & {
  kind: "room.member_online";
  payload: MemberOnlinePayload;
};

export type MemberOfflineEvent = EventEnvelope & {
  kind: "room.member_offline";
  payload: MemberOfflinePayload;
};

export type RoomSnapshotEvent = EventEnvelope & {
  kind: "room.snapshot";
  payload: RoomSnapshotPayload;
};

export type IntentRejectedEvent = EventEnvelope & {
  kind: "room.intent_rejected";
  payload: IntentRejectedPayload;
};

export type RoomTimelineEntry = ChatMessageEvent | MemberJoinedEvent | MemberLeftEvent;

export type MemberView = RoomSnapshotPayload["members"][number];

export function isChatMessage(ev: EventEnvelope): ev is ChatMessageEvent {
  return ev.kind === "chat.message_sent";
}

export function isChatTyping(ev: EventEnvelope): ev is ChatTypingEvent {
  return ev.kind === "chat.typing";
}

export function isMemberJoined(ev: EventEnvelope): ev is MemberJoinedEvent {
  return ev.kind === "room.member_joined";
}

export function isMemberLeft(ev: EventEnvelope): ev is MemberLeftEvent {
  return ev.kind === "room.member_left";
}

export function isMemberOnline(ev: EventEnvelope): ev is MemberOnlineEvent {
  return ev.kind === "room.member_online";
}

export function isMemberOffline(ev: EventEnvelope): ev is MemberOfflineEvent {
  return ev.kind === "room.member_offline";
}

export function isRoomSnapshot(ev: EventEnvelope): ev is RoomSnapshotEvent {
  return ev.kind === "room.snapshot";
}

export function isIntentRejected(ev: EventEnvelope): ev is IntentRejectedEvent {
  return ev.kind === "room.intent_rejected";
}

export function isTimelineEntry(ev: EventEnvelope): ev is RoomTimelineEntry {
  return isChatMessage(ev) || isMemberJoined(ev) || isMemberLeft(ev);
}
