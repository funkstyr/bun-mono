import type { Card, GameState, Seat, TributeState } from "./engine";
import { STRATEGIES, type BotAction, type StrategyName } from "./strategy";

export type { BotAction } from "./strategy";

export type BotContext =
  | { phase: "play"; strategy: StrategyName; state: GameState; seat: Seat }
  | {
      phase: "tribute-ask";
      strategy: StrategyName;
      state: TributeState;
      askerHand: readonly Card[];
    }
  | {
      phase: "tribute-return";
      strategy: StrategyName;
      state: TributeState;
      giverHand: readonly Card[];
    };

export function decide(context: BotContext): BotAction {
  const strategy = STRATEGIES[context.strategy];
  if (context.phase === "play") return strategy.decidePlay(context.state, context.seat);
  if (context.phase === "tribute-ask")
    return strategy.decideTributeAsk(context.state, context.askerHand);
  return strategy.decideTributeReturn(context.state, context.giverHand);
}
