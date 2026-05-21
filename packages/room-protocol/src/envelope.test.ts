import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { eventEnvelope, intentEnvelope } from "./envelope";

function validIntent(): unknown {
  return {
    kind: "chat.send_message",
    payload: { text: "hi" },
    intentId: "i-1",
  };
}

function validEvent(): unknown {
  return {
    kind: "chat.message_sent",
    payload: { text: "hi" },
    id: "e-1",
    ts: 1_700_000_000_000,
    position: 0,
    from: "user-1",
    durable: true,
  };
}

describe("intentEnvelope — happy path", () => {
  it("accepts a well-formed intent envelope", () => {
    const result = intentEnvelope(validIntent());
    expect(result instanceof type.errors).toBe(false);
  });

  it("treats payload as opaque (any shape passes envelope-level validation)", () => {
    const result = intentEnvelope({
      kind: "anything",
      payload: { whatever: 42, nested: { deep: [1, 2, 3] } },
      intentId: "i-1",
    });
    expect(result instanceof type.errors).toBe(false);
  });
});

describe("intentEnvelope — sad paths", () => {
  it("rejects when intentId is missing", () => {
    const { intentId: _intentId, ...without } = validIntent() as Record<string, unknown>;
    const result = intentEnvelope(without);
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when intentId is an empty string", () => {
    const result = intentEnvelope({ ...(validIntent() as object), intentId: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when kind is missing", () => {
    const { kind: _kind, ...without } = validIntent() as Record<string, unknown>;
    const result = intentEnvelope(without);
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when kind is an empty string", () => {
    const result = intentEnvelope({ ...(validIntent() as object), kind: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(intentEnvelope(null) instanceof type.errors).toBe(true);
    expect(intentEnvelope("nope") instanceof type.errors).toBe(true);
    expect(intentEnvelope(42) instanceof type.errors).toBe(true);
  });
});

describe("eventEnvelope — happy path", () => {
  it("accepts a well-formed event envelope", () => {
    const result = eventEnvelope(validEvent());
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts from: null (system-emitted event)", () => {
    const result = eventEnvelope({ ...(validEvent() as object), from: null });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts position: 0", () => {
    const result = eventEnvelope({ ...(validEvent() as object), position: 0 });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts optional replyTo when present", () => {
    const result = eventEnvelope({ ...(validEvent() as object), replyTo: "i-42" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts absence of replyTo", () => {
    const event = validEvent() as Record<string, unknown>;
    expect("replyTo" in event).toBe(false);
    const result = eventEnvelope(event);
    expect(result instanceof type.errors).toBe(false);
  });
});

describe("eventEnvelope — sad paths", () => {
  it("rejects when durable is missing", () => {
    const { durable: _durable, ...without } = validEvent() as Record<string, unknown>;
    const result = eventEnvelope(without);
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when durable is not a boolean", () => {
    const result = eventEnvelope({ ...(validEvent() as object), durable: "yes" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects negative position", () => {
    const result = eventEnvelope({ ...(validEvent() as object), position: -1 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects non-integer position", () => {
    const result = eventEnvelope({ ...(validEvent() as object), position: 1.5 });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when id is missing", () => {
    const { id: _id, ...without } = validEvent() as Record<string, unknown>;
    const result = eventEnvelope(without);
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when from is undefined (must be string or null)", () => {
    const { from: _from, ...without } = validEvent() as Record<string, unknown>;
    const result = eventEnvelope(without);
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects empty-string replyTo when present", () => {
    const result = eventEnvelope({ ...(validEvent() as object), replyTo: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(eventEnvelope(null) instanceof type.errors).toBe(true);
    expect(eventEnvelope("nope") instanceof type.errors).toBe(true);
    expect(eventEnvelope(42) instanceof type.errors).toBe(true);
  });
});
