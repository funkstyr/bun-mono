import { type } from "arktype";

export const intentEnvelope = type({
  kind: "string >= 1",
  payload: "unknown",
  intentId: "string >= 1",
});

export type IntentEnvelope = typeof intentEnvelope.infer;

export const eventEnvelope = type({
  kind: "string >= 1",
  payload: "unknown",
  id: "string >= 1",
  ts: "number.integer >= 0",
  position: "number.integer >= 0",
  from: "string | null",
  durable: "boolean",
  "replyTo?": "string >= 1",
});

export type EventEnvelope = typeof eventEnvelope.infer;
