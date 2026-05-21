import type { MessageSentPayload } from "@bun-mono/room-protocol/chat";
import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type {
  MemberJoinedPayload,
  MemberLeftPayload,
  MemberOfflinePayload,
  MemberOnlinePayload,
} from "@bun-mono/room-protocol/room-events";
import type { RoomSnapshotPayload } from "@bun-mono/room-protocol/system";

export type ChatMessageEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: MessageSentPayload;
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

export type RoomTimelineEntry = ChatMessageEvent | MemberJoinedEvent | MemberLeftEvent;

export type MemberView = RoomSnapshotPayload["members"][number];
