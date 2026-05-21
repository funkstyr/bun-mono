// Per-User soft cap on `room_member` rows. A pre-existing User over the
// cap is grandfathered in; they just can't join or create more.
export const MEMBERSHIP_CAP = 10;

// Per-Member-per-Room send-message rate limit. Five sends in any rolling
// 10s window pass; a sixth in the same window is rejected with
// `rate_limit_send_message`. Exported here so the web client can quote
// the same numbers in its rate-limit toast copy.
export const SEND_RATE_LIMIT_COUNT = 5;
export const SEND_RATE_LIMIT_WINDOW_MS = 10_000;
