export type Suit = "C" | "S" | "D" | "H";
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "J" | "Q" | "K" | "A" | "2";
export type Card = { rank: Rank; suit: Suit };

export type HandType = "single" | "pair" | "triple" | "bomb" | "straight";
export type Hand = { type: HandType; cards: readonly Card[] };

export type Seat = 0 | 1 | 2 | 3;
export type PlayerState = { hand: readonly Card[]; finishedAt: number | null };
export type TrickState = {
  top: Hand | null;
  lastPlayer: Seat | null;
  consecutivePasses: number;
};
export type GameState = {
  players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
  turn: Seat;
  trick: TrickState;
  finishingOrder: readonly Seat[];
};

export const RANK_ORDER: readonly Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A", "2"];
export const SUIT_ORDER: readonly Suit[] = ["C", "S", "D", "H"];

const RANK_INDEX: ReadonlyMap<Rank, number> = new Map(RANK_ORDER.map((r, i) => [r, i]));
const SUIT_INDEX: ReadonlyMap<Suit, number> = new Map(SUIT_ORDER.map((s, i) => [s, i]));

export function rankIndex(rank: Rank): number {
  return RANK_INDEX.get(rank)!;
}

export function suitIndex(suit: Suit): number {
  return SUIT_INDEX.get(suit)!;
}

export function compareCards(a: Card, b: Card): number {
  const r = rankIndex(a.rank) - rankIndex(b.rank);
  if (r !== 0) return r;
  return suitIndex(a.suit) - suitIndex(b.suit);
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANK_ORDER) {
    for (const suit of SUIT_ORDER) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function shuffle(deck: readonly Card[], seed: number): Card[] {
  const rand = mulberry32(seed);
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function findThreeOfClubsHolder(hands: readonly [Card[], Card[], Card[], Card[]]): Seat {
  for (let seat = 0; seat < 4; seat++) {
    const hand = hands[seat as Seat];
    if (hand.some((c) => c.rank === 3 && c.suit === "C")) {
      return seat as Seat;
    }
  }
  throw new Error("3 of clubs not found in dealt hands");
}

export function dealGame(seed: number, opener: Seat | "three-of-clubs-holder"): GameState {
  const deck = shuffle(freshDeck(), seed);
  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[(i % 4) as Seat].push(deck[i]!);
  }
  for (const hand of hands) hand.sort(compareCards);

  const turn: Seat = opener === "three-of-clubs-holder" ? findThreeOfClubsHolder(hands) : opener;

  return {
    players: [
      { hand: hands[0], finishedAt: null },
      { hand: hands[1], finishedAt: null },
      { hand: hands[2], finishedAt: null },
      { hand: hands[3], finishedAt: null },
    ],
    turn,
    trick: { top: null, lastPlayer: null, consecutivePasses: 0 },
    finishingOrder: [],
  };
}

export function classifyHand(cards: readonly Card[]): Hand | null {
  if (cards.length === 1) {
    return { type: "single", cards: [cards[0]!] };
  }
  return null;
}

function compareSingles(a: Card, b: Card): number {
  return compareCards(a, b);
}

export function beats(challenger: Hand, top: Hand): boolean {
  if (challenger.type === "single" && top.type === "single") {
    return compareSingles(challenger.cards[0]!, top.cards[0]!) > 0;
  }
  return false;
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export type PlayAction = { kind: "play"; hand: Hand };

export function applyPlay(state: GameState, seat: Seat, action: PlayAction): GameState {
  if (seat !== state.turn) return state;
  if (action.kind !== "play") return state;

  const player = state.players[seat];
  const playedCards = action.hand.cards;

  for (const card of playedCards) {
    if (!player.hand.some((c) => sameCard(c, card))) return state;
  }

  if (state.trick.top !== null && !beats(action.hand, state.trick.top)) {
    return state;
  }

  const remaining = player.hand.filter((c) => !playedCards.some((p) => sameCard(p, c)));

  const players = state.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[seat] = { ...player, hand: remaining };

  return {
    players,
    turn: nextSeat(seat),
    trick: {
      top: action.hand,
      lastPlayer: seat,
      consecutivePasses: 0,
    },
    finishingOrder: state.finishingOrder,
  };
}
