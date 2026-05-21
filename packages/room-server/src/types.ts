import type { EventEnvelope, IntentEnvelope } from "@bun-mono/room-protocol/envelope";

export type RoomKind = "chat";

export type RoomRow = {
  id: string;
  slug: string;
  kind: RoomKind;
  name: string | null;
  createdBy: string;
  createdAt: number;
};

export type Connection = {
  connectionId: string;
  userId: string;
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
