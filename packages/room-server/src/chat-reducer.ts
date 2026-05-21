import type { MessageSentPayload, SendMessagePayload } from "@bun-mono/room-protocol/chat";
import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";

import type { ReducerContext, ReducerResult, RoomReducer } from "./types";

export type ChatIntent = IntentEnvelope & {
  kind: "chat.send_message";
  payload: SendMessagePayload;
};

export type ChatEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: MessageSentPayload;
};

export type ChatState = { messages: ChatEvent[] };

const MAX_SNAPSHOT_MESSAGES = 100;

export const chatReducer: RoomReducer<ChatIntent, ChatEvent, ChatState> = {
  kind: "chat",

  initialState(): ChatState {
    return { messages: [] };
  },

  rehydrate(state: ChatState, durableEvents: ChatEvent[]): ChatState {
    return {
      ...state,
      messages: durableEvents.slice(-MAX_SNAPSHOT_MESSAGES),
    };
  },

  handle(
    state: ChatState,
    intent: ChatIntent,
    ctx: ReducerContext,
  ): ReducerResult<ChatState, ChatEvent> {
    if (intent.kind !== "chat.send_message") {
      return { ok: false, reason: "unsupported_intent" };
    }

    const text = intent.payload.text;
    if (text.length < 1 || text.length > 2000) {
      return { ok: false, reason: "invalid_payload" };
    }

    const event: ChatEvent = {
      kind: "chat.message_sent",
      payload: { text },
      id: ctx.nextEventId(),
      ts: ctx.now(),
      position: 0,
      from: ctx.fromUserId,
      durable: true,
      replyTo: intent.intentId,
    };

    const next: ChatState = {
      ...state,
      messages: [...state.messages, event].slice(-MAX_SNAPSHOT_MESSAGES),
    };

    return { ok: true, state: next, emit: [event] };
  },
};
