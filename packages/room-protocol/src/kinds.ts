import { type } from "arktype";

import { sendMessagePayload, messageSentPayload } from "./chat";
import { eventEnvelope, intentEnvelope, type EventEnvelope, type IntentEnvelope } from "./envelope";
import {
  memberJoinedPayload,
  memberLeftPayload,
  memberOfflinePayload,
  memberOnlinePayload,
} from "./member-events";
import { intentRejectedPayload, roomSnapshotPayload } from "./system";

export type IntentKind = "chat.send_message";

export type EventKind =
  | "chat.message_sent"
  | "room.snapshot"
  | "room.intent_rejected"
  | "room.member_joined"
  | "room.member_left"
  | "room.member_online"
  | "room.member_offline";

type PayloadValidator = (input: unknown) => unknown;

const intentRegistry: Record<IntentKind, PayloadValidator> = {
  "chat.send_message": sendMessagePayload as PayloadValidator,
};

const eventRegistry: Record<EventKind, PayloadValidator> = {
  "chat.message_sent": messageSentPayload as PayloadValidator,
  "room.snapshot": roomSnapshotPayload as PayloadValidator,
  "room.intent_rejected": intentRejectedPayload as PayloadValidator,
  "room.member_joined": memberJoinedPayload as PayloadValidator,
  "room.member_left": memberLeftPayload as PayloadValidator,
  "room.member_online": memberOnlinePayload as PayloadValidator,
  "room.member_offline": memberOfflinePayload as PayloadValidator,
};

export const durable: Record<EventKind, boolean> = {
  "chat.message_sent": true,
  "room.snapshot": false,
  "room.intent_rejected": false,
  "room.member_joined": true,
  "room.member_left": true,
  "room.member_online": false,
  "room.member_offline": false,
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isKnownIntentKind(kind: string): kind is IntentKind {
  return Object.hasOwn(intentRegistry, kind);
}

function isKnownEventKind(kind: string): kind is EventKind {
  return Object.hasOwn(eventRegistry, kind);
}

export function parseIntent(input: unknown): ParseResult<IntentEnvelope> {
  const envelope = intentEnvelope(input);
  if (envelope instanceof type.errors) {
    return { ok: false, error: envelope.summary };
  }

  if (!isKnownIntentKind(envelope.kind)) {
    return { ok: false, error: `unknown_intent_kind:${envelope.kind}` };
  }

  const payloadSchema = intentRegistry[envelope.kind];
  const payload = payloadSchema(envelope.payload);
  if (payload instanceof type.errors) {
    return { ok: false, error: payload.summary };
  }

  return { ok: true, value: envelope };
}

export function parseEvent(input: unknown): ParseResult<EventEnvelope> {
  const envelope = eventEnvelope(input);
  if (envelope instanceof type.errors) {
    return { ok: false, error: envelope.summary };
  }

  if (!isKnownEventKind(envelope.kind)) {
    return { ok: false, error: `unknown_event_kind:${envelope.kind}` };
  }

  const payloadSchema = eventRegistry[envelope.kind];
  const payload = payloadSchema(envelope.payload);
  if (payload instanceof type.errors) {
    return { ok: false, error: payload.summary };
  }

  return { ok: true, value: envelope };
}
