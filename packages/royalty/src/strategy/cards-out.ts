import { freshDeck, type Card, type GameState, type Seat } from "../engine";

export type CardKey = string;

export function cardKey(c: Card): CardKey {
  return `${c.rank}${c.suit}`;
}

export function computeCardsOut(state: GameState, mySeat: Seat): Set<CardKey> {
  const seen = new Set<CardKey>();

  for (const entry of state.log) {
    if (entry.action !== "play") continue;
    for (const c of entry.hand.cards) seen.add(cardKey(c));
  }

  for (const c of state.players[mySeat].hand) seen.add(cardKey(c));

  const out = new Set<CardKey>();
  for (const c of freshDeck()) {
    const k = cardKey(c);
    if (!seen.has(k)) out.add(k);
  }
  return out;
}
