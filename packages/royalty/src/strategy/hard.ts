import {
  enumerateLegalPlays,
  rankIndex,
  RANK_ORDER,
  SUIT_ORDER,
  type Card,
  type GameState,
  type Hand,
  type HandType,
  type Rank,
  type Seat,
  type TributeState,
} from "../engine";
import { cardKey, computeCardsOut } from "./cards-out";
import { PASS_THRESHOLD, scorePlay, scoreReturnCard } from "./scoring";
import type { BotAction, Strategy } from "./types";

export const HIGH_SINGLE_PASS_THRESHOLD: Rank = "K";
export const STRATEGIC_PASS_MIN_HAND_SIZE: number = 8;
export const ENDGAME_HAND_SIZE: number = 1;
export const MID_RANK_RETURN_BAND: readonly [Rank, Rank] = [8, "J"];

export const COMBO_BREAK_COST: Record<HandType, number> = {
  single: 0,
  pair: 30,
  triple: 100,
  bomb: 1_000_000,
  straight: 50,
  "doubles-straight": 80,
};

export const LOW_PAIR_BREAK_FACTOR: number = 0.2;
export const HIGH_PAIR_BREAK_FACTOR: number = 3.0;

export function decidePlay(state: GameState, seat: Seat): BotAction {
  const ownHand = state.players[seat].hand;
  const top = state.trick.top;
  const candidates = enumerateLegalPlays(ownHand, top);

  if (candidates.length === 0) return { kind: "pass" };

  const cardsOut = computeCardsOut(state, seat);

  let bestHand: Hand | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const c of candidates) {
    const s = scorePlay(c, state, ownHand, cardsOut, seat);
    if (s > bestScore) {
      bestScore = s;
      bestHand = c;
    }
  }

  if (bestHand === null) return { kind: "pass" };
  if (top !== null && bestScore <= PASS_THRESHOLD) return { kind: "pass" };

  return { kind: "play", hand: bestHand };
}

export function decideTributeAsk(state: TributeState, askerHand: readonly Card[]): BotAction {
  const known = new Set<string>();
  for (const c of askerHand) known.add(cardKey(c));
  for (const c of state.missed) known.add(cardKey(c));
  for (const c of state.received) known.add(cardKey(c));

  const bombAsk = bombCompletionAsk(askerHand, state.missed, known);
  if (bombAsk !== null) return { kind: "ask", card: bombAsk };

  const fallback = highestUnknown(known);
  return { kind: "ask", card: fallback };
}

export function decideTributeReturn(state: TributeState, giverHand: readonly Card[]): BotAction {
  const receivedKeys = new Set<string>();
  for (const c of state.received) receivedKeys.add(cardKey(c));

  const eligible = giverHand.filter((c) => !receivedKeys.has(cardKey(c)));
  const scored = eligible.map((c) => ({ card: c, cost: scoreReturnCard(c, giverHand) }));
  scored.sort((a, b) => a.cost - b.cost);

  const cards = scored.slice(0, state.returnsRemaining).map((s) => s.card);
  return { kind: "return", cards };
}

export const hard: Strategy = { decidePlay, decideTributeAsk, decideTributeReturn };

function bombCompletionAsk(
  askerHand: readonly Card[],
  missed: readonly Card[],
  known: ReadonlySet<string>,
): Card | null {
  const counts = new Map<Rank, Card[]>();
  for (const c of askerHand) {
    let arr = counts.get(c.rank);
    if (!arr) {
      arr = [];
      counts.set(c.rank, arr);
    }
    arr.push(c);
  }

  const triples: Rank[] = [];
  for (const [rank, group] of counts) {
    if (group.length !== 3) continue;
    if (missed.some((m) => m.rank === rank)) continue;
    triples.push(rank);
  }
  triples.sort((a, b) => rankIndex(b) - rankIndex(a));

  for (const rank of triples) {
    const suitsHeld = new Set(counts.get(rank)!.map((c) => c.suit));
    for (const suit of SUIT_ORDER) {
      if (suitsHeld.has(suit)) continue;
      const candidate: Card = { rank, suit };
      if (!known.has(cardKey(candidate))) return candidate;
    }
  }
  return null;
}

function highestUnknown(known: ReadonlySet<string>): Card {
  for (let r = RANK_ORDER.length - 1; r >= 0; r--) {
    for (let s = SUIT_ORDER.length - 1; s >= 0; s--) {
      const candidate: Card = { rank: RANK_ORDER[r]!, suit: SUIT_ORDER[s]! };
      if (!known.has(cardKey(candidate))) return candidate;
    }
  }
  return { rank: 3, suit: "C" };
}
