import { reservedUsernames } from "@bun-mono/auth/reserved-usernames";

const reservedSet = new Set(reservedUsernames.map((w) => w.toLowerCase()));

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

export type ValidateUsernameResult =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long" | "invalid_chars" | "reserved" };

export function validateUsername(value: string): ValidateUsernameResult {
  if (value.length < MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (value.length > MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (!USERNAME_PATTERN.test(value)) return { ok: false, reason: "invalid_chars" };
  if (reservedSet.has(value.toLowerCase())) return { ok: false, reason: "reserved" };
  return { ok: true };
}
