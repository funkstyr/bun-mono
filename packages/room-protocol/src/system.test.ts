import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { intentRejectedPayload, roomMember, roomSnapshotPayload } from "./system";

const validMember = {
  userId: "u-1",
  slot: 0 as const,
  displayName: "Alice",
  online: true,
  lastSeenAt: null,
};

function validSnapshot() {
  return {
    members: [validMember],
    recentEvents: [],
    spectatorCount: 0,
    yourRole: "member" as const,
    yourSlot: 0 as const,
    yourUserId: "u-1",
  };
}

describe("roomMember", () => {
  it("accepts a complete member row", () => {
    const result = roomMember(validMember);
    expect(result instanceof type.errors).toBe(false);
  });

  it.each([0, 1, 2, 3] as const)("accepts slot %i", (slot) => {
    const result = roomMember({ ...validMember, slot });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects slot 4", () => {
    const result = roomMember({ ...validMember, slot: 4 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects slot -1", () => {
    const result = roomMember({ ...validMember, slot: -1 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects empty userId", () => {
    const result = roomMember({ ...validMember, userId: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("accepts numeric lastSeenAt", () => {
    const result = roomMember({ ...validMember, lastSeenAt: 1_700_000_000_000 });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects boolean online as string", () => {
    const result = roomMember({ ...validMember, online: "yes" });
    expect(result instanceof type.errors).toBe(true);
  });
});

describe("roomSnapshotPayload", () => {
  it("accepts the full PRD shape", () => {
    const result = roomSnapshotPayload(validSnapshot());
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts an empty members array (room with no joiners yet)", () => {
    const result = roomSnapshotPayload({ ...validSnapshot(), members: [] });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts yourSlot: null (spectator path)", () => {
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      yourRole: "spectator",
      yourSlot: null,
      yourUserId: null,
    });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts yourUserId: null (anonymous spectator)", () => {
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      yourUserId: null,
    });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects yourRole outside the literal union", () => {
    const result = roomSnapshotPayload({ ...validSnapshot(), yourRole: "owner" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects negative spectatorCount", () => {
    const result = roomSnapshotPayload({ ...validSnapshot(), spectatorCount: -1 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects non-integer spectatorCount", () => {
    const result = roomSnapshotPayload({ ...validSnapshot(), spectatorCount: 1.5 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("accepts recentEvents up to 100 items", () => {
    const ev = {
      kind: "chat.message_sent",
      payload: { text: "x" },
      id: "e",
      ts: 1,
      position: 0,
      from: "u",
      durable: true,
    };
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      recentEvents: Array.from({ length: 100 }, () => ev),
    });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects recentEvents over 100 items (atMostLength bound)", () => {
    const ev = {
      kind: "chat.message_sent",
      payload: { text: "x" },
      id: "e",
      ts: 1,
      position: 0,
      from: "u",
      durable: true,
    };
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      recentEvents: Array.from({ length: 101 }, () => ev),
    });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects missing yourRole", () => {
    const snap = validSnapshot() as Partial<ReturnType<typeof validSnapshot>>;
    delete snap.yourRole;
    const result = roomSnapshotPayload(snap);
    expect(result instanceof type.errors).toBe(true);
  });

  it("accepts an optional reason: 'membership_cap' (cap-downgrade Spectator)", () => {
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      yourRole: "spectator",
      yourSlot: null,
      reason: "membership_cap",
    });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects an unknown reason literal", () => {
    const result = roomSnapshotPayload({
      ...validSnapshot(),
      yourRole: "spectator",
      reason: "room_full",
    });
    expect(result instanceof type.errors).toBe(true);
  });
});

describe("intentRejectedPayload", () => {
  it("accepts a valid rejection", () => {
    const result = intentRejectedPayload({ intentId: "i-1", reason: "rate_limit" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects empty intentId", () => {
    const result = intentRejectedPayload({ intentId: "", reason: "x" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects empty reason", () => {
    const result = intentRejectedPayload({ intentId: "i", reason: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects missing intentId", () => {
    const result = intentRejectedPayload({ reason: "x" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects missing reason", () => {
    const result = intentRejectedPayload({ intentId: "i" });
    expect(result instanceof type.errors).toBe(true);
  });
});
