import { describe, expect, it } from "vitest";

import { chatReducer, type ChatIntent, type ChatState } from "./chat-reducer";
import type { ReducerContext } from "./types";

function makeCtx(overrides: Partial<ReducerContext> = {}): ReducerContext {
  let i = 0;
  return {
    now: () => 1000,
    nextEventId: () => `id-${++i}`,
    fromUserId: "user-1",
    ...overrides,
  };
}

function makeIntent(text: string, intentId = "intent-1"): ChatIntent {
  return {
    kind: "chat.send_message",
    payload: { text },
    intentId,
  };
}

function makeTypingIntent(intentId = "intent-typing"): ChatIntent {
  return {
    kind: "chat.typing_ping",
    payload: {},
    intentId,
  };
}

describe("chatReducer.initialState", () => {
  it("returns an empty messages array", () => {
    const room = {
      id: "r-1",
      slug: "slug-1",
      kind: "chat" as const,
      name: null,
      createdBy: "u-1",
      createdAt: 0,
    };
    expect(chatReducer.initialState(room)).toEqual({ messages: [] });
  });
});

describe("chatReducer.rehydrate", () => {
  it("caps replayed messages at 100 (keeps the most recent)", () => {
    const events = Array.from({ length: 150 }, (_, i) => ({
      kind: "chat.message_sent" as const,
      payload: { text: `m${i}` },
      id: `e-${i}`,
      ts: i,
      position: i,
      from: "u-1",
      durable: true,
    }));
    const out = chatReducer.rehydrate({ messages: [] }, events);
    expect(out.messages).toHaveLength(100);
    expect(out.messages[0]?.payload.text).toBe("m50");
    expect(out.messages.at(-1)?.payload.text).toBe("m149");
  });

  it("returns an empty messages array when given no events", () => {
    expect(chatReducer.rehydrate({ messages: [] }, [])).toEqual({ messages: [] });
  });
});

describe("chatReducer.handle — happy paths", () => {
  it("accepts text of length 1", () => {
    const ctx = makeCtx();
    const result = chatReducer.handle({ messages: [] }, makeIntent("x"), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emit).toHaveLength(1);
    expect(result.emit[0]?.payload.text).toBe("x");
  });

  it("accepts text of length 2000", () => {
    const ctx = makeCtx();
    const text = "a".repeat(2000);
    const result = chatReducer.handle({ messages: [] }, makeIntent(text), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emit[0]?.payload.text.length).toBe(2000);
  });

  it("emits a chat.message_sent event with server-assigned envelope fields", () => {
    const ctx = makeCtx({ now: () => 1234, fromUserId: "alice" });
    const result = chatReducer.handle({ messages: [] }, makeIntent("hi", "i-42"), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const event = result.emit[0];
    expect(event?.kind).toBe("chat.message_sent");
    expect(event?.from).toBe("alice");
    expect(event?.durable).toBe(true);
    expect(event?.replyTo).toBe("i-42");
    expect(event?.ts).toBe(1234);
    expect(typeof event?.id).toBe("string");
  });

  it("appends the new event to state.messages", () => {
    const ctx = makeCtx();
    const result = chatReducer.handle({ messages: [] }, makeIntent("hello"), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.messages).toHaveLength(1);
    expect(result.state.messages[0]?.payload.text).toBe("hello");
  });
});

describe("chatReducer.handle — typing_ping", () => {
  it("emits a chat.typing event with userId taken from ctx.fromUserId", () => {
    const ctx = makeCtx({ fromUserId: "alice", now: () => 5000 });
    const result = chatReducer.handle({ messages: [] }, makeTypingIntent(), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emit).toHaveLength(1);
    const ev = result.emit[0]!;
    expect(ev.kind).toBe("chat.typing");
    expect(ev.durable).toBe(false);
    expect(ev.from).toBe("alice");
    expect((ev.payload as { userId: string }).userId).toBe("alice");
    expect(ev.ts).toBe(5000);
  });

  it("does not mutate state.messages on typing_ping", () => {
    const ctx = makeCtx();
    const before: ChatState = { messages: [] };
    const result = chatReducer.handle(before, makeTypingIntent(), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.messages).toEqual(before.messages);
  });
});

describe("chatReducer.handle — sad paths", () => {
  it("rejects empty text with reason: invalid_payload", () => {
    const result = chatReducer.handle({ messages: [] }, makeIntent(""), makeCtx());
    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("rejects text longer than 2000 with reason: invalid_payload", () => {
    const text = "a".repeat(2001);
    const result = chatReducer.handle({ messages: [] }, makeIntent(text), makeCtx());
    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("rejects an unsupported intent kind", () => {
    const bogus = {
      kind: "chat.other",
      payload: { text: "hi" },
      intentId: "i",
    } as unknown as ChatIntent;
    const result = chatReducer.handle({ messages: [] }, bogus, makeCtx());
    expect(result).toEqual({ ok: false, reason: "unsupported_intent" });
  });
});

describe("chatReducer.handle — state.messages cap", () => {
  it("never grows past 100 entries", () => {
    let state: ChatState = { messages: [] };
    let i = 0;
    const ctx: ReducerContext = {
      now: () => 1,
      nextEventId: () => `id-${++i}`,
      fromUserId: "u-1",
    };
    for (let n = 0; n < 150; n += 1) {
      const result = chatReducer.handle(state, makeIntent("hi", `i-${n}`), ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
    expect(state.messages).toHaveLength(100);
    expect(state.messages[0]?.replyTo).toBe("i-50");
    expect(state.messages.at(-1)?.replyTo).toBe("i-149");
  });
});
