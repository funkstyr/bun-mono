import {
  compareCards,
  enumerateLegalPlays,
  RANK_ORDER,
  SUIT_ORDER,
  type Card,
  type GameState,
  type Hand,
  type Seat,
  type TributeState,
} from "./engine";

export type BotAction =
  | { kind: "play"; hand: Hand }
  | { kind: "pass" }
  | { kind: "ask"; card: Card }
  | { kind: "return"; cards: readonly Card[] };

export type BotContext =
  | { phase: "play"; state: GameState; seat: Seat }
  | { phase: "tribute-ask"; state: TributeState; askerHand: readonly Card[] }
  | { phase: "tribute-return"; state: TributeState; giverHand: readonly Card[] };

// TODO: real heuristics — see royalty bot grilling session
export function decide(context: BotContext): BotAction {
  if (context.phase === "play") return decidePlay(context.state, context.seat);
  if (context.phase === "tribute-ask") return decideTributeAsk(context.state, context.askerHand);
  return decideTributeReturn(context.state, context.giverHand);
}

function decidePlay(state: GameState, seat: Seat): BotAction {
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

function decideTributeAsk(state: TributeState, askerHand: readonly Card[]): BotAction {
  const known = new Set<string>();
  for (const c of askerHand) known.add(cardKey(c));
  for (const c of state.missed) known.add(cardKey(c));
  for (const c of state.received) known.add(cardKey(c));

  for (let r = RANK_ORDER.length - 1; r >= 0; r--) {
    for (let s = SUIT_ORDER.length - 1; s >= 0; s--) {
      const candidate: Card = { rank: RANK_ORDER[r]!, suit: SUIT_ORDER[s]! };
      if (!known.has(cardKey(candidate))) {
        return { kind: "ask", card: candidate };
      }
    }
  }
  return { kind: "ask", card: { rank: 3, suit: "C" } };
}

function decideTributeReturn(state: TributeState, giverHand: readonly Card[]): BotAction {
  const sorted = giverHand.toSorted(compareCards);
  const cards = sorted.slice(0, state.returnsRemaining);
  return { kind: "return", cards };
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
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
