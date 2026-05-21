import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { messageSentPayload, sendMessagePayload } from "./chat";

describe("sendMessagePayload — text bounds", () => {
  it("accepts text of length 1", () => {
    const result = sendMessagePayload({ text: "x" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts text of length 2000", () => {
    const result = sendMessagePayload({ text: "a".repeat(2000) });
    expect(result instanceof type.errors).toBe(false);
  });

  it("accepts text with newlines (preserved verbatim)", () => {
    const result = sendMessagePayload({ text: "line1\nline2\nline3" });
    expect(result instanceof type.errors).toBe(false);
  });

  it("rejects empty text", () => {
    const result = sendMessagePayload({ text: "" });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects text of length 2001", () => {
    const result = sendMessagePayload({ text: "a".repeat(2001) });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when text is missing", () => {
    const result = sendMessagePayload({});
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when text is null", () => {
    const result = sendMessagePayload({ text: null });
    expect(result instanceof type.errors).toBe(true);
  });

  it("rejects when text is a number", () => {
    const result = sendMessagePayload({ text: 42 });
    expect(result instanceof type.errors).toBe(true);
  });
});

describe("messageSentPayload — text bounds (mirror of sendMessagePayload)", () => {
  it("accepts text of length 1", () => {
    expect(messageSentPayload({ text: "x" }) instanceof type.errors).toBe(false);
  });

  it("accepts text of length 2000", () => {
    expect(messageSentPayload({ text: "a".repeat(2000) }) instanceof type.errors).toBe(false);
  });

  it("rejects empty text", () => {
    expect(messageSentPayload({ text: "" }) instanceof type.errors).toBe(true);
  });

  it("rejects text of length 2001", () => {
    expect(messageSentPayload({ text: "a".repeat(2001) }) instanceof type.errors).toBe(true);
  });

  it("rejects when text is missing", () => {
    expect(messageSentPayload({}) instanceof type.errors).toBe(true);
  });

  it("rejects when text is null", () => {
    expect(messageSentPayload({ text: null }) instanceof type.errors).toBe(true);
  });
});
