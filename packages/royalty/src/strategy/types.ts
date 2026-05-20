import type { Card, GameState, Hand, Seat, TributeState } from "../engine";

export type StrategyName = "easy" | "hard";

export type BotAction =
  | { kind: "play"; hand: Hand }
  | { kind: "pass" }
  | { kind: "ask"; card: Card }
  | { kind: "return"; cards: readonly Card[] };

export type Strategy = {
  decidePlay: (state: GameState, seat: Seat) => BotAction;
  decideTributeAsk: (state: TributeState, askerHand: readonly Card[]) => BotAction;
  decideTributeReturn: (state: TributeState, giverHand: readonly Card[]) => BotAction;
};
