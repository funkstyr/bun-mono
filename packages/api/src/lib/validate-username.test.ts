import { reservedUsernames } from "@bun-mono/auth/reserved-usernames";
import { describe, expect, it } from "vitest";

import { validateUsername } from "./validate-username";

describe("validateUsername", () => {
  it("accepts a representative valid handle", () => {
    expect(validateUsername("alice_42")).toEqual({ ok: true });
  });

  it("accepts at length boundary 3", () => {
    expect(validateUsername("abc")).toEqual({ ok: true });
  });

  it("accepts at length boundary 30", () => {
    expect(validateUsername("a".repeat(30))).toEqual({ ok: true });
  });

  it.each([0, 1, 2])("rejects length %i as too_short", (n) => {
    expect(validateUsername("a".repeat(n))).toEqual({ ok: false, reason: "too_short" });
  });

  it.each([31, 32, 100])("rejects length %i as too_long", (n) => {
    expect(validateUsername("a".repeat(n))).toEqual({ ok: false, reason: "too_long" });
  });

  it.each(["with space", "has-hyphen", "has.dot", "naïve", "emoji😀x", "tab\there", "comma,sep"])(
    "rejects %s as invalid_chars",
    (value) => {
      expect(validateUsername(value)).toEqual({ ok: false, reason: "invalid_chars" });
    },
  );

  const reservedWithinLength = reservedUsernames.filter((w) => w.length >= 3 && w.length <= 30);

  it.each(reservedWithinLength)("rejects reserved word %s (lowercase)", (word) => {
    expect(validateUsername(word)).toEqual({ ok: false, reason: "reserved" });
  });

  it.each(reservedWithinLength)("rejects reserved word %s (uppercase)", (word) => {
    expect(validateUsername(word.toUpperCase())).toEqual({ ok: false, reason: "reserved" });
  });

  it.each(reservedWithinLength)("rejects reserved word %s (mixed case)", (word) => {
    const mixed = word.charAt(0).toUpperCase() + word.slice(1);
    expect(validateUsername(mixed)).toEqual({ ok: false, reason: "reserved" });
  });
});
