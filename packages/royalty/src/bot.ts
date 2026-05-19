import {
  compareCards,
  enumerateLegalPlays,
  type Card,
  type GameState,
  type Hand,
  type Seat,
} from "./engine";

export type BotAction = { kind: "play"; hand: Hand } | { kind: "pass" };

export type BotContext = { phase: "play"; state: GameState; seat: Seat };

// TODO: real heuristics — see royalty bot grilling session
export function decide(context: BotContext): BotAction {
  const { state, seat } = context;
  const holding = state.players[seat].hand;
  const top = state.trick.top;

  if (top === null) {
    const lowestSingle = lowestCard(holding);
    if (lowestSingle === null) return { kind: "pass" };
    return { kind: "play", hand: { type: "single", cards: [lowestSingle] } };
  }

  const legal = enumerateLegalPlays(holding, top);
  if (legal.length === 0) return { kind: "pass" };

  let best = legal[0]!;
  for (let i = 1; i < legal.length; i++) {
    if (compareHands(legal[i]!, best) < 0) best = legal[i]!;
  }
  return { kind: "play", hand: best };
}

function lowestCard(cards: readonly Card[]): Card | null {
  if (cards.length === 0) return null;
  let lo = cards[0]!;
  for (let i = 1; i < cards.length; i++) {
    if (compareCards(cards[i]!, lo) < 0) lo = cards[i]!;
  }
  return lo;
}

function compareHands(a: Hand, b: Hand): number {
  const aTop = a.cards[a.cards.length - 1]!;
  const bTop = b.cards[b.cards.length - 1]!;
  return compareCards(aTop, bTop);
}
