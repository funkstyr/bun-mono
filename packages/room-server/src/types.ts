import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";

export type AnyLibSQLDatabase = LibSQLDatabase<Record<string, unknown>>;

export type RoomKind = "chat";

export type RoomRow = {
  id: string;
  slug: string;
  kind: RoomKind;
  name: string | null;
  createdBy: string;
  createdAt: number;
};

// `userId: null` is a cookie-less Spectator. Slot ownership is decided by
// the actor (presence of a `room_member` row), not by this shape. `userId`
// is mutable so the actor can demote a Member whose session is lost mid-
// connection (set it to `null`) without closing the WS — the connection
// keeps reading messages as a Spectator until the User re-authenticates on
// a fresh WS handshake.
export type AuthRevalidator = () => Promise<{ userId: string } | null>;

export type Connection = {
  readonly connectionId: string;
  userId: string | null;
  readonly send: (event: EventEnvelope) => void;
  readonly close: (code: number, reason: string) => void;
  // Re-checks the original handshake cookie against better-auth on every
  // intent (cached ~60s per conn). Returns the live `userId` if the session
  // is still valid, `null` if it was revoked/expired. Omitted in tests that
  // do not exercise the demotion path; the actor treats an undefined
  // revalidator as "auth never expires on this conn".
  readonly revalidateAuth?: AuthRevalidator;
};

export type ReducerContext = {
  now: () => number;
  nextEventId: () => string;
  fromUserId: string;
};

export type ReducerResult<TState, TEvent> =
  | { ok: true; state: TState; emit: TEvent[] }
  | { ok: false; reason: string };

export interface RoomReducer<TIntent extends IntentEnvelope, TEvent extends EventEnvelope, TState> {
  readonly kind: RoomKind;
  initialState(room: RoomRow): TState;
  rehydrate(state: TState, durableEvents: TEvent[]): TState;
  handle(state: TState, intent: TIntent, ctx: ReducerContext): ReducerResult<TState, TEvent>;
}
