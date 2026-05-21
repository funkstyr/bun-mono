import { type } from "arktype";

const slot = "0 | 1 | 2 | 3";

export const memberJoinedPayload = type({
  userId: "string >= 1",
  slot,
  displayName: "string >= 1",
});

export type MemberJoinedPayload = typeof memberJoinedPayload.infer;

export const memberLeftPayload = type({
  userId: "string >= 1",
  slot,
  reason: "'left' | 'ttl_expired'",
});

export type MemberLeftPayload = typeof memberLeftPayload.infer;

export const memberOnlinePayload = type({
  userId: "string >= 1",
  slot,
});

export type MemberOnlinePayload = typeof memberOnlinePayload.infer;

export const memberOfflinePayload = type({
  userId: "string >= 1",
  slot,
});

export type MemberOfflinePayload = typeof memberOfflinePayload.infer;
