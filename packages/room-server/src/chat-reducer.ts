import type {
  MessageSentPayload,
  SendMessagePayload,
  TypingPayload,
  TypingPingPayload,
} from "@bun-mono/room-protocol/chat";
import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";

import type { ReducerContext, ReducerResult, RoomReducer } from "./types";

export type ChatSendMessageIntent = IntentEnvelope & {
  kind: "chat.send_message";
  payload: SendMessagePayload;
};

export type ChatTypingPingIntent = IntentEnvelope & {
  kind: "chat.typing_ping";
  payload: TypingPingPayload;
};

export type ChatIntent = ChatSendMessageIntent | ChatTypingPingIntent;

export type ChatMessageSentEvent = EventEnvelope & {
  kind: "chat.message_sent";
  payload: MessageSentPayload;
};

export type ChatTypingEvent = EventEnvelope & {
  kind: "chat.typing";
  payload: TypingPayload;
};

export type ChatEvent = ChatMessageSentEvent | ChatTypingEvent;

export type ChatState = { messages: ChatMessageSentEvent[] };

const MAX_SNAPSHOT_MESSAGES = 100;

export const chatReducer: RoomReducer<ChatIntent, ChatEvent, ChatState> = {
  kind: "chat",

  initialState(): ChatState {
    return { messages: [] };
  },

  rehydrate(state: ChatState, durableEvents: ChatEvent[]): ChatState {
    const messageEvents = durableEvents.filter(
      (e): e is ChatMessageSentEvent => e.kind === "chat.message_sent",
    );
    return {
      ...state,
      messages: messageEvents.slice(-MAX_SNAPSHOT_MESSAGES),
    };
  },

  handle(
    state: ChatState,
    intent: ChatIntent,
    ctx: ReducerContext,
  ): ReducerResult<ChatState, ChatEvent> {
    if (intent.kind === "chat.send_message") {
      return handleSendMessage(state, intent, ctx);
    }
    if (intent.kind === "chat.typing_ping") {
      return handleTypingPing(state, ctx);
    }
    return { ok: false, reason: "unsupported_intent" };
  },
};

function handleSendMessage(
  state: ChatState,
  intent: ChatSendMessageIntent,
  ctx: ReducerContext,
): ReducerResult<ChatState, ChatEvent> {
  const text = intent.payload.text;
  if (text.length < 1 || text.length > 2000) {
    return { ok: false, reason: "invalid_payload" };
  }

  const event: ChatMessageSentEvent = {
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
}

function handleTypingPing(
  state: ChatState,
  ctx: ReducerContext,
): ReducerResult<ChatState, ChatEvent> {
  const event: ChatTypingEvent = {
    kind: "chat.typing",
    payload: { userId: ctx.fromUserId },
    id: ctx.nextEventId(),
    ts: ctx.now(),
    position: 0,
    from: ctx.fromUserId,
    durable: false,
  };

  return { ok: true, state, emit: [event] };
}
