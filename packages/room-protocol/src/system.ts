import { type } from "arktype";

import { eventEnvelope } from "./envelope";

export const roomMember = type({
  userId: "string >= 1",
  slot: "0 | 1 | 2 | 3",
  displayName: "string",
  online: "boolean",
  lastSeenAt: "number.integer | null",
});

export type RoomMember = typeof roomMember.infer;

// Only emitted when `yourRole === "spectator"` was forced; absent on
// anonymous-spectator and full-room-spectator attaches.
export type SpectatorReason = "membership_cap";

// Canonical reasons emitted in `room.intent_rejected.payload.reason`. Kept as
// a string union so the client can switch exhaustively on it; the wire schema
// itself is `string >= 1` (kinds like `unsupported_intent:<kind>` carry the
// offending kind suffix and would not survive a tightened enum).
export type IntentRejectedReason =
  | "spectator_cannot_act"
  | "not_a_member"
  | "membership_cap"
  | "room_full"
  | "invalid_payload"
  | "auth_lost"
  | "rate_limit_send_message";

export const roomSnapshotPayload = type({
  members: roomMember.array(),
  recentEvents: eventEnvelope.array().atMostLength(100),
  spectatorCount: "number.integer >= 0",
  yourRole: "'member' | 'spectator'",
  yourSlot: "0 | 1 | 2 | 3 | null",
  yourUserId: "string | null",
  "reason?": "'membership_cap'",
});

export type RoomSnapshotPayload = typeof roomSnapshotPayload.infer;

export const intentRejectedPayload = type({
  intentId: "string >= 1",
  reason: "string >= 1",
});

export type IntentRejectedPayload = typeof intentRejectedPayload.infer;
