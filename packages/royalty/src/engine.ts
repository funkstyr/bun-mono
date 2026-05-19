export const BOT_PASS_MS = 250;
export const BOT_PLAY_MS = 500;

export type Suit = "C" | "S" | "D" | "H";
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "J" | "Q" | "K" | "A" | "2";
export type Card = { rank: Rank; suit: Suit };

export type HandType = "single" | "pair" | "triple" | "bomb" | "straight" | "doubles-straight";
export type Hand = { type: HandType; cards: readonly Card[] };

export const MIN_STRAIGHT_LENGTH = 3;
export const MIN_DOUBLES_STRAIGHT_PAIRS = 3;

export type Seat = 0 | 1 | 2 | 3;
export type PlayerState = { hand: readonly Card[]; finishedAt: number | null };
export type TrickState = {
  top: Hand | null;
  lastPlayer: Seat | null;
  passedThisTrick: ReadonlySet<Seat>;
};
export type GameState = {
  players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
  turn: Seat;
  trick: TrickState;
  finishingOrder: readonly Seat[];
};

export type Title = "king" | "queen" | "third" | "joker";
export const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3];

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
    trick: { top: null, lastPlayer: null, passedThisTrick: new Set() },
    finishingOrder: [],
  };
}

export function classifyHand(cards: readonly Card[]): Hand | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) {
    return { type: "single", cards: [cards[0]!] };
  }

  const sameRank = classifySameRank(cards);
  if (sameRank !== null) return sameRank;

  const straight = classifyStraight(cards);
  if (straight !== null) return straight;

  return classifyDoublesStraight(cards);
}

function classifySameRank(cards: readonly Card[]): Hand | null {
  if (cards.length < 2 || cards.length > 4) return null;
  const rank = cards[0]!.rank;
  if (!cards.every((c) => c.rank === rank)) return null;
  const suits = new Set(cards.map((c) => c.suit));
  if (suits.size !== cards.length) return null;
  const sorted = cards.toSorted(compareCards);
  if (cards.length === 2) return { type: "pair", cards: sorted };
  if (cards.length === 3) return { type: "triple", cards: sorted };
  return { type: "bomb", cards: sorted };
}

function classifyStraight(cards: readonly Card[]): Hand | null {
  if (cards.length < MIN_STRAIGHT_LENGTH) return null;
  if (cards.some((c) => c.rank === "2")) return null;
  const sorted = cards.toSorted(compareCards);
  const startIdx = rankIndex(sorted[0]!.rank);
  for (let i = 1; i < sorted.length; i++) {
    if (rankIndex(sorted[i]!.rank) !== startIdx + i) return null;
  }
  return { type: "straight", cards: sorted };
}

function classifyDoublesStraight(cards: readonly Card[]): Hand | null {
  const minCards = MIN_DOUBLES_STRAIGHT_PAIRS * 2;
  if (cards.length < minCards || cards.length % 2 !== 0) return null;
  if (cards.some((c) => c.rank === "2")) return null;
  const sorted = cards.toSorted(compareCards);
  const pairs = sorted.length / 2;
  for (let p = 0; p < pairs; p++) {
    const a = sorted[p * 2]!;
    const b = sorted[p * 2 + 1]!;
    if (a.rank !== b.rank) return null;
    if (a.suit === b.suit) return null;
  }
  const firstRankIdx = rankIndex(sorted[0]!.rank);
  for (let p = 1; p < pairs; p++) {
    if (rankIndex(sorted[p * 2]!.rank) !== firstRankIdx + p) return null;
  }
  return { type: "doubles-straight", cards: sorted };
}

function topCard(hand: Hand): Card {
  return hand.cards[hand.cards.length - 1]!;
}

export function beats(challenger: Hand, top: Hand): boolean {
  if (challenger.type === "bomb" && top.type !== "bomb") return true;
  if (challenger.type !== "bomb" && top.type === "bomb") return false;
  if (challenger.type !== top.type) return false;

  switch (challenger.type) {
    case "single":
      return compareCards(challenger.cards[0]!, top.cards[0]!) > 0;
    case "pair": {
      const rankDiff = rankIndex(challenger.cards[0]!.rank) - rankIndex(top.cards[0]!.rank);
      if (rankDiff !== 0) return rankDiff > 0;
      return compareCards(topCard(challenger), topCard(top)) > 0;
    }
    case "triple":
    case "bomb":
      return rankIndex(challenger.cards[0]!.rank) - rankIndex(top.cards[0]!.rank) > 0;
    case "straight":
    case "doubles-straight": {
      if (challenger.cards.length !== top.cards.length) return false;
      return compareCards(topCard(challenger), topCard(top)) > 0;
    }
  }
}

export function enumerateLegalPlays(holding: readonly Card[], top: Hand | null): Hand[] {
  const out: Hand[] = [];
  const consider = (hand: Hand) => {
    if (top === null || beats(hand, top)) out.push(hand);
  };

  for (const c of holding) {
    consider({ type: "single", cards: [c] });
  }

  const byRank = new Map<Rank, Card[]>();
  for (const c of holding) {
    let arr = byRank.get(c.rank);
    if (!arr) {
      arr = [];
      byRank.set(c.rank, arr);
    }
    arr.push(c);
  }

  for (const group of byRank.values()) {
    const sorted = group.toSorted(compareCards);
    if (sorted.length >= 2) {
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          consider({ type: "pair", cards: [sorted[i]!, sorted[j]!] });
        }
      }
    }
    if (sorted.length >= 3) {
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          for (let k = j + 1; k < sorted.length; k++) {
            consider({ type: "triple", cards: [sorted[i]!, sorted[j]!, sorted[k]!] });
          }
        }
      }
    }
    if (sorted.length === 4) {
      consider({ type: "bomb", cards: sorted });
    }
  }

  const byRankIdx: Card[][] = Array.from({ length: 12 }, () => []);
  for (const c of holding) {
    const idx = rankIndex(c.rank);
    if (idx < 12) byRankIdx[idx]!.push(c);
  }
  for (const group of byRankIdx) group.sort(compareCards);

  for (let start = 0; start <= 12 - MIN_STRAIGHT_LENGTH; start++) {
    let maxLen = 0;
    for (let i = start; i < 12; i++) {
      if (byRankIdx[i]!.length === 0) break;
      maxLen++;
    }
    if (maxLen < MIN_STRAIGHT_LENGTH) continue;
    for (let len = MIN_STRAIGHT_LENGTH; len <= maxLen; len++) {
      const groups = byRankIdx.slice(start, start + len);
      for (const combo of enumerateStraightCombinations(groups)) {
        consider({ type: "straight", cards: combo });
      }
    }
  }

  for (let start = 0; start <= 12 - MIN_DOUBLES_STRAIGHT_PAIRS; start++) {
    let maxPairs = 0;
    for (let i = start; i < 12; i++) {
      if (byRankIdx[i]!.length < 2) break;
      maxPairs++;
    }
    if (maxPairs < MIN_DOUBLES_STRAIGHT_PAIRS) continue;
    for (let pairs = MIN_DOUBLES_STRAIGHT_PAIRS; pairs <= maxPairs; pairs++) {
      const groups = byRankIdx.slice(start, start + pairs);
      for (const combo of enumerateDoublesStraightCombinations(groups)) {
        consider({ type: "doubles-straight", cards: combo });
      }
    }
  }

  return out;
}

function enumerateStraightCombinations(rankGroups: readonly Card[][]): Card[][] {
  if (rankGroups.length === 0) return [[]];
  const first = rankGroups[0]!;
  const subs = enumerateStraightCombinations(rankGroups.slice(1));
  const out: Card[][] = [];
  for (const c of first) {
    for (const sub of subs) {
      out.push([c, ...sub]);
    }
  }
  return out;
}

function enumerateDoublesStraightCombinations(rankGroups: readonly Card[][]): Card[][] {
  if (rankGroups.length === 0) return [[]];
  const first = rankGroups[0]!;
  const subs = enumerateDoublesStraightCombinations(rankGroups.slice(1));
  const out: Card[][] = [];
  for (let i = 0; i < first.length; i++) {
    for (let j = i + 1; j < first.length; j++) {
      const pair = [first[i]!, first[j]!];
      for (const sub of subs) {
        out.push([...pair, ...sub]);
      }
    }
  }
  return out;
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

function nextActiveSeat(state: GameState, from: Seat): Seat {
  let s = from;
  for (let i = 0; i < 4; i++) {
    s = nextSeat(s);
    if (state.players[s].finishedAt === null) return s;
  }
  return from;
}

export function gameIsOver(state: GameState): boolean {
  return state.finishingOrder.length >= 3;
}

export function finalTitles(state: GameState): Record<Seat, Title> | null {
  if (!gameIsOver(state)) return null;
  const titles = {} as Record<Seat, Title>;
  titles[state.finishingOrder[0]!] = "king";
  titles[state.finishingOrder[1]!] = "queen";
  titles[state.finishingOrder[2]!] = "third";
  for (const seat of ALL_SEATS) {
    if (titles[seat] === undefined) titles[seat] = "joker";
  }
  return titles;
}

export type PlayAction = { kind: "play"; hand: Hand };
export type PassAction = { kind: "pass" };
export type Action = PlayAction | PassAction;

export function applyPlay(state: GameState, seat: Seat, action: Action): GameState {
  if (gameIsOver(state)) return state;
  if (seat !== state.turn) return state;
  if (state.players[seat].finishedAt !== null) return state;
  if (state.trick.passedThisTrick.has(seat)) return state;

  if (action.kind === "pass") {
    if (state.trick.top === null) return state;

    const newPassed = new Set(state.trick.passedThisTrick);
    newPassed.add(seat);

    const nextActor = findNextResponder(state, seat, newPassed, state.trick.lastPlayer);
    if (nextActor === null) {
      return closeTrick(state, state.trick.lastPlayer ?? seat);
    }

    return {
      ...state,
      turn: nextActor,
      trick: { ...state.trick, passedThisTrick: newPassed },
    };
  }

  const player = state.players[seat];
  const playedCards = action.hand.cards;

  for (const card of playedCards) {
    if (!player.hand.some((c) => sameCard(c, card))) return state;
  }

  if (state.trick.top !== null && !beats(action.hand, state.trick.top)) {
    return state;
  }

  const remaining = player.hand.filter((c) => !playedCards.some((p) => sameCard(p, c)));
  const wentOut = remaining.length === 0;

  const players = state.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[seat] = {
    hand: remaining,
    finishedAt: wentOut ? state.finishingOrder.length : player.finishedAt,
  };

  const finishingOrder = wentOut ? [...state.finishingOrder, seat] : state.finishingOrder;

  const afterPlay: GameState = {
    players,
    turn: seat,
    trick: {
      top: action.hand,
      lastPlayer: seat,
      passedThisTrick: state.trick.passedThisTrick,
    },
    finishingOrder,
  };

  const nextActor = findNextResponder(afterPlay, seat, afterPlay.trick.passedThisTrick, seat);
  if (nextActor === null) {
    return closeTrick(afterPlay, seat);
  }

  return { ...afterPlay, turn: nextActor };
}

function findNextResponder(
  state: GameState,
  fromSeat: Seat,
  passed: ReadonlySet<Seat>,
  excludeSeat: Seat | null,
): Seat | null {
  let s = fromSeat;
  for (let i = 0; i < 4; i++) {
    s = nextSeat(s);
    if (s === excludeSeat) continue;
    if (state.players[s].finishedAt !== null) continue;
    if (passed.has(s)) continue;
    return s;
  }
  return null;
}

function closeTrick(state: GameState, leadFallback: Seat): GameState {
  const lastPlayer = state.trick.lastPlayer;
  const lead =
    lastPlayer !== null && state.players[lastPlayer].finishedAt === null
      ? lastPlayer
      : nextActiveSeat(state, lastPlayer ?? leadFallback);
  return {
    ...state,
    turn: lead,
    trick: { top: null, lastPlayer: null, passedThisTrick: new Set() },
  };
}
