import { SEND_RATE_LIMIT_COUNT, SEND_RATE_LIMIT_WINDOW_MS } from "@bun-mono/room-protocol/limits";

export type SendRateLimitState = Map<string, number[]>;

export function createSendRateLimitState(): SendRateLimitState {
  return new Map();
}

// Returns true and records the timestamp if the User is under the per-10s
// send budget; returns false otherwise. The 6th send in a window is
// rejected — the existing timestamps stay so the budget continues to tick
// over without the rejected attempt counting against it.
export function tryRecordSend(state: SendRateLimitState, userId: string, now: number): boolean {
  const cutoff = now - SEND_RATE_LIMIT_WINDOW_MS;
  const existing = state.get(userId) ?? [];
  const fresh = existing.filter((t) => t > cutoff);

  if (fresh.length >= SEND_RATE_LIMIT_COUNT) {
    state.set(userId, fresh);
    return false;
  }

  fresh.push(now);
  state.set(userId, fresh);
  return true;
}
