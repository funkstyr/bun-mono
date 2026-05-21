import { type } from "arktype";

export const sendMessagePayload = type({
  text: "1 <= string <= 2000",
});

export type SendMessagePayload = typeof sendMessagePayload.infer;

export const messageSentPayload = type({
  text: "1 <= string <= 2000",
});

export type MessageSentPayload = typeof messageSentPayload.infer;

export const typingPingPayload = type({});

export type TypingPingPayload = typeof typingPingPayload.infer;

export const typingPayload = type({
  userId: "string",
});

export type TypingPayload = typeof typingPayload.infer;
