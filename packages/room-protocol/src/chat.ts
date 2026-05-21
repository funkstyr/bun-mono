import { type } from "arktype";

export const sendMessagePayload = type({
  text: "1 <= string <= 2000",
});

export type SendMessagePayload = typeof sendMessagePayload.infer;

export const messageSentPayload = type({
  text: "1 <= string <= 2000",
});

export type MessageSentPayload = typeof messageSentPayload.infer;
