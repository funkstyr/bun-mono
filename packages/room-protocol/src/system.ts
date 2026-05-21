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
