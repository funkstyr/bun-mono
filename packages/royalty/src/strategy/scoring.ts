import {
  ALL_SEATS,
  rankIndex,
  type Card,
  type GameState,
  type Hand,
  type HandType,
  type Rank,
  type Seat,
} from "../engine";
import { cardKey, type CardKey } from "./cards-out";
import {
  COMBO_BREAK_COST,
  ENDGAME_HAND_SIZE,
  HIGH_PAIR_BREAK_FACTOR,
  HIGH_SINGLE_PASS_THRESHOLD,
  LOW_PAIR_BREAK_FACTOR,
  MID_RANK_RETURN_BAND,
  STRATEGIC_PASS_MIN_HAND_SIZE,
} from "./hard";

export const PASS_THRESHOLD = 0;

const BOMB_FINISHER_SCORE = 1_000_000;
const BOMB_DEFENSIVE_SCORE = 50;
const BOMB_PRESERVE_SCORE = -10_000_000;
const NO_A2_LEAD_SCORE = -1_000_000;
const STRATEGIC_PASS_SCORE = -1;
const FINISHER_BONUS = 100_000;

const LEAD_BASE_DOUBLES_STRAIGHT = 5000;
const LEAD_BASE_STRAIGHT = 4000;
const LEAD_BASE_TRIPLE = 3000;
const LEAD_BASE_PAIR = 2000;
const LEAD_BASE_SINGLE = 1000;

const ENDGAME_SINGLE_BASE = 10_000;
const ENDGAME_NON_SINGLE_BASE = 500;

const RESPOND_BASE = 1000;

const COST_VERY_HIGH = 500;
const COST_HIGH = 300;
const COST_TRIPLE_MEMBER = 200;
const COST_HIGH_PAIR_MEMBER = 100;
const COST_MID_PAIR_MEMBER = 50;
const COST_LOW_PAIR_MEMBER = 30;
const COST_LOW_SINGLETON = 20;
const COST_MID_SINGLETON = 10;

export function scorePlay(
  candidate: Hand,
  state: GameState,
  ownHand: readonly Card[],
  _cardsOut: Set<CardKey>,
  ownSeat: Seat,
): number {
  const isFinisher = candidate.cards.length === ownHand.length;
  const opponentAtEndgame = hasOpponentAtEndgame(state, ownSeat);
  const isLead = state.trick.top === null;

  if (candidate.type === "bomb") {
    if (isFinisher) return BOMB_FINISHER_SCORE;
    if (!isLead && opponentAtEndgame) return BOMB_DEFENSIVE_SCORE;
    return BOMB_PRESERVE_SCORE;
  }

  const breakCost = comboBreakCost(candidate, ownHand);

  if (isLead) {
    if (opponentAtEndgame) {
      if (candidate.type === "single") {
        return ENDGAME_SINGLE_BASE + rankIndex(candidate.cards[0]!.rank);
      }
      return ENDGAME_NON_SINGLE_BASE - breakCost;
    }

    if (candidate.type === "single") {
      const r = candidate.cards[0]!.rank;
      if (r === "A" || r === "2") return NO_A2_LEAD_SCORE;
    }

    const typeScore = leadTypeScore(candidate.type);
    const rankAdj = -rankIndex(topCardOf(candidate).rank);
    return typeScore + rankAdj - breakCost;
  }

  if (
    candidate.type === "single" &&
    !isFinisher &&
    !opponentAtEndgame &&
    ownHand.length >= STRATEGIC_PASS_MIN_HAND_SIZE
  ) {
    const r = rankIndex(candidate.cards[0]!.rank);
    if (r >= rankIndex(HIGH_SINGLE_PASS_THRESHOLD)) return STRATEGIC_PASS_SCORE;
  }

  const rankAdj = -rankIndex(topCardOf(candidate).rank);
  const finisherBonus = isFinisher ? FINISHER_BONUS : 0;
  return RESPOND_BASE + rankAdj - breakCost + finisherBonus;
}

export function scoreReturnCard(card: Card, ownHand: readonly Card[]): number {
  const sameRankCount = ownHand.filter((c) => c.rank === card.rank).length;
  if (sameRankCount >= 4) return Number.POSITIVE_INFINITY;
  if (card.rank === "2" || card.rank === "A") return COST_VERY_HIGH;
  if (card.rank === "K") return COST_HIGH;
  if (sameRankCount >= 3) return COST_TRIPLE_MEMBER;
  if (sameRankCount >= 2) return pairMemberCost(card.rank);

  const r = rankIndex(card.rank);
  const bandLo = rankIndex(MID_RANK_RETURN_BAND[0]);
  const bandHi = rankIndex(MID_RANK_RETURN_BAND[1]);
  if (r >= bandLo && r <= bandHi) return COST_MID_SINGLETON;
  return COST_LOW_SINGLETON;
}

function pairMemberCost(rank: Rank): number {
  const r = rankIndex(rank);
  if (r <= rankIndex(5)) return COST_LOW_PAIR_MEMBER;
  if (r >= rankIndex("J")) return COST_HIGH_PAIR_MEMBER;
  return COST_MID_PAIR_MEMBER;
}

function hasOpponentAtEndgame(state: GameState, ownSeat: Seat): boolean {
  for (const seat of ALL_SEATS) {
    if (seat === ownSeat) continue;
    const p = state.players[seat];
    if (p.finishedAt !== null) continue;
    if (p.hand.length === ENDGAME_HAND_SIZE) return true;
  }
  return false;
}

function leadTypeScore(type: HandType): number {
  switch (type) {
    case "doubles-straight":
      return LEAD_BASE_DOUBLES_STRAIGHT;
    case "straight":
      return LEAD_BASE_STRAIGHT;
    case "triple":
      return LEAD_BASE_TRIPLE;
    case "pair":
      return LEAD_BASE_PAIR;
    case "single":
      return LEAD_BASE_SINGLE;
    case "bomb":
      return 0;
  }
}

function topCardOf(hand: Hand): Card {
  return hand.cards[hand.cards.length - 1]!;
}

function comboBreakCost(candidate: Hand, ownHand: readonly Card[]): number {
  const usedKeys = new Set<CardKey>();
  for (const c of candidate.cards) usedKeys.add(cardKey(c));

  const byRank = new Map<Rank, Card[]>();
  for (const c of ownHand) {
    let arr = byRank.get(c.rank);
    if (!arr) {
      arr = [];
      byRank.set(c.rank, arr);
    }
    arr.push(c);
  }

  let cost = 0;
  for (const [rank, group] of byRank) {
    const n = group.length;
    if (n < 2) continue;
    let used = 0;
    for (const c of group) {
      if (usedKeys.has(cardKey(c))) used++;
    }
    if (used === 0 || used === n) continue;
    cost += brokenRankCost(rank, n);
  }
  return cost;
}

function brokenRankCost(rank: Rank, groupSize: number): number {
  if (groupSize === 4) return COMBO_BREAK_COST.bomb;
  if (groupSize === 3) return COMBO_BREAK_COST.triple;
  const base = COMBO_BREAK_COST.pair;
  const r = rankIndex(rank);
  if (r <= rankIndex(5)) return base * LOW_PAIR_BREAK_FACTOR;
  if (r >= rankIndex("J")) return base * HIGH_PAIR_BREAK_FACTOR;
  return base;
}
