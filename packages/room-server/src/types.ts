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

// `userId` is the authenticated user id (from better-auth); a `null` userId
// means the client has no session and is attached as a Spectator. Whether
// an authenticated connection holds a slot is decided by the actor
// (presence of a `room_member` row), not by this shape — an authenticated
// user attached to a full Room sits here with `userId: <id>` but no slot.
export type Connection = {
  connectionId: string;
  userId: string | null;
  send: (event: EventEnvelope) => void;
  close: (code: number, reason: string) => void;
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
