import { describe, expect, it } from "vitest";

import {
  broadcastToSpectators,
  durable,
  parseEvent,
  parseIntent,
  type EventKind,
  type ParseResult,
} from "./kinds";

function validSendMessageIntent(): unknown {
  return {
    kind: "chat.send_message",
    payload: { text: "hello" },
    intentId: "i-1",
  };
}

function validMessageSentEvent(): unknown {
  return {
    kind: "chat.message_sent",
    payload: { text: "hello" },
    id: "e-1",
    ts: 1_700_000_000_000,
    position: 0,
    from: "user-1",
    durable: true,
  };
}

function validIntentRejectedEvent(): unknown {
  return {
    kind: "room.intent_rejected",
    payload: { intentId: "i-1", reason: "rate_limit_send_message" },
    id: "e-2",
    ts: 1_700_000_000_001,
    position: 1,
    from: null,
    durable: false,
    replyTo: "i-1",
  };
}

function validRoomSnapshotEvent(): unknown {
  return {
    kind: "room.snapshot",
    payload: {
      members: [
        {
          userId: "user-1",
          slot: 0,
          displayName: "Alice",
          online: true,
          lastSeenAt: null,
        },
      ],
      recentEvents: [validMessageSentEvent()],
      spectatorCount: 0,
      yourRole: "member",
      yourSlot: 0,
      yourUserId: "user-1",
    },
    id: "e-3",
    ts: 1_700_000_000_002,
    position: 2,
    from: null,
    durable: false,
  };
}

function errorOf<T>(result: ParseResult<T>): string {
  return result.ok ? "" : result.error;
}

function valueOf<T>(result: ParseResult<T>): T | null {
  return result.ok ? result.value : null;
}

describe("parseIntent — happy path", () => {
  it("accepts a well-formed chat.send_message intent", () => {
    const result = parseIntent(validSendMessageIntent());
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("chat.send_message");
    expect(valueOf(result)?.intentId).toBe("i-1");
  });

  it("accepts a chat.typing_ping intent with an empty payload", () => {
    const result = parseIntent({
      kind: "chat.typing_ping",
      payload: {},
      intentId: "i-typing",
    });
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("chat.typing_ping");
  });

  it("accepts a room.leave intent with an empty payload", () => {
    const result = parseIntent({
      kind: "room.leave",
      payload: {},
      intentId: "i-leave",
    });
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("room.leave");
  });
});

describe("parseIntent — sad paths", () => {
  it("rejects an unknown kind with unknown_intent_kind:<kind>", () => {
    const result = parseIntent({
      kind: "chat.unknown_action",
      payload: {},
      intentId: "i-1",
    });
    expect(result).toEqual({
      ok: false,
      error: "unknown_intent_kind:chat.unknown_action",
    });
  });

  it("rejects a malformed envelope (missing intentId) with a non-empty error", () => {
    const result = parseIntent({ kind: "chat.send_message", payload: { text: "hi" } });
    expect(result.ok).toBe(false);
    expect(errorOf(result).length).toBeGreaterThan(0);
    expect(errorOf(result).startsWith("unknown_intent_kind:")).toBe(false);
  });

  it("rejects a malformed payload (empty text) with a non-empty error", () => {
    const result = parseIntent({
      kind: "chat.send_message",
      payload: { text: "" },
      intentId: "i-1",
    });
    expect(result.ok).toBe(false);
    expect(errorOf(result).length).toBeGreaterThan(0);
    expect(errorOf(result).startsWith("unknown_intent_kind:")).toBe(false);
  });

  it("rejects a malformed payload (text too long)", () => {
    const result = parseIntent({
      kind: "chat.send_message",
      payload: { text: "a".repeat(2001) },
      intentId: "i-1",
    });
    expect(result.ok).toBe(false);
  });

  for (const bad of [null, "foo", 42, true, undefined, []] as const) {
    it(`rejects non-object input (${String(bad)})`, () => {
      const result = parseIntent(bad);
      expect(result.ok).toBe(false);
      expect(errorOf(result).length).toBeGreaterThan(0);
    });
  }

  it("never throws on absurd input", () => {
    expect(() => parseIntent(Symbol("x"))).not.toThrow();
    expect(() => parseIntent(() => 0)).not.toThrow();
  });
});

describe("parseEvent — happy paths for each event kind", () => {
  it("accepts chat.message_sent", () => {
    const result = parseEvent(validMessageSentEvent());
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("chat.message_sent");
  });

  it("accepts chat.typing", () => {
    const result = parseEvent({
      kind: "chat.typing",
      payload: { userId: "user-1" },
      id: "e-typing",
      ts: 1_700_000_000_010,
      position: 5,
      from: "user-1",
      durable: false,
    });
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("chat.typing");
  });

  it("accepts room.intent_rejected with a replyTo", () => {
    const result = parseEvent(validIntentRejectedEvent());
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("room.intent_rejected");
    expect(valueOf(result)?.replyTo).toBe("i-1");
  });

  it("accepts room.snapshot, including nested recentEvents", () => {
    const result = parseEvent(validRoomSnapshotEvent());
    expect(result.ok).toBe(true);
    expect(valueOf(result)?.kind).toBe("room.snapshot");
  });

  it("accepts room.snapshot with yourUserId: null (Spectator connection)", () => {
    const base = validRoomSnapshotEvent() as { payload: Record<string, unknown> };
    const result = parseEvent({
      ...base,
      payload: { ...base.payload, yourRole: "spectator", yourSlot: null, yourUserId: null },
    });
    expect(result.ok).toBe(true);
  });
});

describe("parseEvent — sad paths", () => {
  it("rejects an unknown kind with unknown_event_kind:<kind>", () => {
    const result = parseEvent({
      kind: "chat.something_else",
      payload: {},
      id: "e-1",
      ts: 0,
      position: 0,
      from: null,
      durable: false,
    });
    expect(result).toEqual({
      ok: false,
      error: "unknown_event_kind:chat.something_else",
    });
  });

  it("rejects a malformed envelope (missing durable)", () => {
    const { durable: _durable, ...without } = validMessageSentEvent() as Record<string, unknown>;
    const result = parseEvent(without);
    expect(result.ok).toBe(false);
    expect(errorOf(result).length).toBeGreaterThan(0);
    expect(errorOf(result).startsWith("unknown_event_kind:")).toBe(false);
  });

  it("rejects a malformed envelope (negative position)", () => {
    const result = parseEvent({ ...(validMessageSentEvent() as object), position: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed chat.message_sent payload (empty text)", () => {
    const result = parseEvent({
      ...(validMessageSentEvent() as object),
      payload: { text: "" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed room.snapshot payload (recentEvents > 100)", () => {
    const base = validRoomSnapshotEvent() as { payload: Record<string, unknown> };
    const oversized = Array.from({ length: 101 }, () => validMessageSentEvent());
    const result = parseEvent({
      ...base,
      payload: { ...base.payload, recentEvents: oversized },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed room.snapshot payload (bad yourRole)", () => {
    const base = validRoomSnapshotEvent() as { payload: Record<string, unknown> };
    const result = parseEvent({
      ...base,
      payload: { ...base.payload, yourRole: "guest" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed room.intent_rejected payload (missing reason)", () => {
    const base = validIntentRejectedEvent() as { payload: Record<string, unknown> };
    const result = parseEvent({
      ...base,
      payload: { intentId: "i-1" },
    });
    expect(result.ok).toBe(false);
  });

  for (const bad of [null, "foo", 42, true, undefined, []] as const) {
    it(`rejects non-object input (${String(bad)})`, () => {
      const result = parseEvent(bad);
      expect(result.ok).toBe(false);
      expect(errorOf(result).length).toBeGreaterThan(0);
    });
  }

  it("never throws on absurd input", () => {
    expect(() => parseEvent(Symbol("x"))).not.toThrow();
    expect(() => parseEvent(() => 0)).not.toThrow();
  });
});

describe("durable registry", () => {
  const cases: Array<[EventKind, boolean]> = [
    ["chat.message_sent", true],
    ["chat.typing", false],
    ["room.snapshot", false],
    ["room.intent_rejected", false],
    ["room.member_joined", true],
    ["room.member_left", true],
    ["room.member_online", false],
    ["room.member_offline", false],
  ];

  for (const [kind, expected] of cases) {
    it(`durable[${kind}] === ${expected}`, () => {
      expect(durable[kind]).toBe(expected);
    });
  }

  it("contains exactly the event kinds defined so far", () => {
    expect(Object.keys(durable).toSorted()).toEqual(
      [
        "chat.message_sent",
        "chat.typing",
        "room.intent_rejected",
        "room.snapshot",
        "room.member_joined",
        "room.member_left",
        "room.member_online",
        "room.member_offline",
      ].toSorted(),
    );
  });
});

describe("broadcastToSpectators registry", () => {
  const cases: Array<[EventKind, boolean]> = [
    ["chat.message_sent", true],
    ["chat.typing", false],
    ["room.snapshot", true],
    ["room.intent_rejected", true],
    ["room.member_joined", true],
    ["room.member_left", true],
    ["room.member_online", true],
    ["room.member_offline", true],
  ];

  for (const [kind, expected] of cases) {
    it(`broadcastToSpectators[${kind}] === ${expected}`, () => {
      expect(broadcastToSpectators[kind]).toBe(expected);
    });
  }

  it("has an entry for every event kind in the durable registry", () => {
    expect(Object.keys(broadcastToSpectators).toSorted()).toEqual(Object.keys(durable).toSorted());
  });
});
