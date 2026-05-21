import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { durable, parseEvent } from "./kinds";
import {
  memberJoinedPayload,
  memberLeftPayload,
  memberOfflinePayload,
  memberOnlinePayload,
} from "./member-events";

describe("memberJoinedPayload", () => {
  it("accepts a valid payload", () => {
    const result = memberJoinedPayload({
      userId: "u-1",
      slot: 0 as const,
      displayName: "Alice",
    });
    expect(result instanceof type.errors).toBe(false);
  });

  it.each([0, 1, 2, 3] as const)("accepts slot %i", (slot) => {
    const result = memberJoinedPayload({ userId: "u", slot, displayName: "x" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects slot 4", () => {
    const result = memberJoinedPayload({ userId: "u", slot: 4, displayName: "x" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects an empty displayName", () => {
    const result = memberJoinedPayload({ userId: "u", slot: 0 as const, displayName: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = memberJoinedPayload({ slot: 0 as const, displayName: "x" });
    expect(result instanceof type.errors).toBe(true);
  });
});

describe("memberLeftPayload", () => {
  it("accepts reason 'left'", () => {
    const result = memberLeftPayload({ userId: "u", slot: 0 as const, reason: "left" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts reason 'ttl_expired'", () => {
    const result = memberLeftPayload({ userId: "u", slot: 0 as const, reason: "ttl_expired" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects an unknown reason", () => {
    const result = memberLeftPayload({
      userId: "u",
      slot: 0 as const,
      reason: "kicked" as never,
    });
    expect(result instanceof type.errors).toBe(true);
  });
});

describe("memberOnlinePayload / memberOfflinePayload", () => {
  it("accepts a valid online payload", () => {
    const result = memberOnlinePayload({ userId: "u", slot: 0 as const });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts a valid offline payload", () => {
    const result = memberOfflinePayload({ userId: "u", slot: 3 as const });
    expect(result instanceof type.errors).toBe(false);
  });
});

describe("durable map", () => {
  it("marks member_joined / member_left as durable", () => {
    expect(durable["room.member_joined"]).toBe(true);
    expect(durable["room.member_left"]).toBe(true);
  });

  it("marks member_online / member_offline as transient", () => {
    expect(durable["room.member_online"]).toBe(false);
    expect(durable["room.member_offline"]).toBe(false);
  });
});

describe("parseEvent — member events round-trip", () => {
  it("accepts a well-formed room.member_joined envelope", () => {
    const envelope = {
      kind: "room.member_joined",
      payload: { userId: "u-1", slot: 0, displayName: "Alice" },
      id: "e-1",
      ts: 1,
      position: 0,
      from: null,
      durable: true,
    };
    const result = parseEvent(envelope);
    expect(result.ok).toBe(true);
  });

  it("rejects a room.member_joined envelope with a bad slot", () => {
    const envelope = {
      kind: "room.member_joined",
      payload: { userId: "u-1", slot: 9, displayName: "Alice" },
      id: "e-1",
      ts: 1,
      position: 0,
      from: null,
      durable: true,
    };
    const result = parseEvent(envelope);
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed room.member_offline envelope", () => {
    const envelope = {
      kind: "room.member_offline",
      payload: { userId: "u-1", slot: 0 },
      id: "e-1",
      ts: 1,
      position: 0,
      from: null,
      durable: false,
    };
    const result = parseEvent(envelope);
    expect(result.ok).toBe(true);
  });
});
