import type { Card, Hand, HandType, Rank, Suit } from "../engine";

export const SUIT_LABEL: Record<Suit, string> = {
  C: "♣",
  S: "♠",
  D: "♦",
  H: "♥",
};

export const HAND_TYPE_LABEL: Record<HandType, string> = {
  single: "Single",
  pair: "Doubles",
  triple: "Triples",
  bomb: "Quads",
  straight: "Run",
  "doubles-straight": "Doubles run",
};

export function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "D" || suit === "H";
}

export function rankLabel(rank: Rank): string {
  return String(rank);
}

export function handLabel(hand: Hand): string {
  if (hand.type === "straight") return `Run of ${hand.cards.length}`;
  if (hand.type === "doubles-straight") return `Doubles run (${hand.cards.length / 2} pairs)`;
  return HAND_TYPE_LABEL[hand.type];
}
