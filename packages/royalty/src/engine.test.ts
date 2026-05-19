import { describe, expect, it } from "vitest";

import {
  applyPlay,
  askCard,
  beats,
  classifyHand,
  compareCards,
  dealGame,
  enumerateLegalPlays,
  finalTitles,
  finalizeTribute,
  freshDeck,
  gameIsOver,
  KING_ASK_CAP,
  QUEEN_ASK_CAP,
  returnCards,
  shuffle,
  startKingTribute,
  startQueenTribute,
  tributeComplete,
  type Card,
  type GameState,
  type Hand,
  type PlayerState,
  type Rank,
  type Seat,
  type Suit,
  type TributeState,
} from "./engine";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function single(c: Card): Hand {
  return { type: "single", cards: [c] };
}

function pair(a: Card, b: Card): Hand {
  return { type: "pair", cards: [a, b].toSorted(compareCards) };
}

function triple(a: Card, b: Card, c: Card): Hand {
  return { type: "triple", cards: [a, b, c].toSorted(compareCards) };
}

function bomb(a: Card, b: Card, c: Card, d: Card): Hand {
  return { type: "bomb", cards: [a, b, c, d].toSorted(compareCards) };
}

function straight(...cards: Card[]): Hand {
  return { type: "straight", cards: cards.toSorted(compareCards) };
}

function seatedGame(hand: Card[]): GameState {
  const base = dealGame(7, 0);
  const players = base.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[0] = { ...players[0], hand };
  return { ...base, players };
}

describe("freshDeck", () => {
  it("returns 52 cards", () => {
    expect(freshDeck()).toHaveLength(52);
  });

  it("returns 52 unique cards", () => {
    const deck = freshDeck();
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

describe("shuffle", () => {
  it("is deterministic for a fixed seed", () => {
    const a = shuffle(freshDeck(), 12345);
    const b = shuffle(freshDeck(), 12345);
    expect(a).toEqual(b);
  });

  it("produces different orderings for different seeds", () => {
    const a = shuffle(freshDeck(), 1);
    const b = shuffle(freshDeck(), 2);
    expect(a).not.toEqual(b);
  });

  it("preserves the 52 cards", () => {
    const shuffled = shuffle(freshDeck(), 99);
    expect(shuffled).toHaveLength(52);
    const keys = new Set(shuffled.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

describe("dealGame", () => {
  it("gives each of the 4 seats 13 cards", () => {
    const state = dealGame(7, "three-of-clubs-holder");
    for (let seat = 0; seat < 4; seat++) {
      expect(state.players[seat as Seat].hand).toHaveLength(13);
    }
  });

  it("distributes all 52 cards across seats", () => {
    const state = dealGame(7, "three-of-clubs-holder");
    const all = state.players.flatMap((p) => p.hand);
    const keys = new Set(all.map((c) => `${c.rank}${c.suit}`));
    expect(all).toHaveLength(52);
    expect(keys.size).toBe(52);
  });

  it("sets turn to the 3♣ holder when opener is 'three-of-clubs-holder'", () => {
    const state = dealGame(7, "three-of-clubs-holder");
    const holder = state.players[state.turn].hand;
    expect(holder.some((c) => c.rank === 3 && c.suit === "C")).toBe(true);
  });

  it("respects an explicit opener seat", () => {
    const state = dealGame(7, 2);
    expect(state.turn).toBe(2);
  });

  it("starts with an empty trick and empty finishing order", () => {
    const state = dealGame(7, 0);
    expect(state.trick.top).toBeNull();
    expect(state.trick.lastPlayer).toBeNull();
    expect(state.trick.passedThisTrick).toEqual(new Set());
    expect(state.finishingOrder).toEqual([]);
  });
});

describe("classifyHand", () => {
  it("classifies a single card as a single", () => {
    const c = card(7, "D");
    expect(classifyHand([c])).toEqual({ type: "single", cards: [c] });
  });

  it("returns null for empty input", () => {
    expect(classifyHand([])).toBeNull();
  });

  it("classifies a same-rank pair", () => {
    const result = classifyHand([card(5, "S"), card(5, "C")]);
    expect(result?.type).toBe("pair");
    expect(result?.cards).toEqual([card(5, "C"), card(5, "S")]);
  });

  it("classifies a same-rank triple", () => {
    const result = classifyHand([card("K", "H"), card("K", "C"), card("K", "D")]);
    expect(result?.type).toBe("triple");
    expect(result?.cards).toEqual([card("K", "C"), card("K", "D"), card("K", "H")]);
  });

  it("classifies four same-rank cards as a bomb", () => {
    const result = classifyHand([card(8, "H"), card(8, "C"), card(8, "D"), card(8, "S")]);
    expect(result?.type).toBe("bomb");
    expect(result?.cards).toEqual([card(8, "C"), card(8, "S"), card(8, "D"), card(8, "H")]);
  });

  it("returns null for mismatched-rank multi-card inputs", () => {
    expect(classifyHand([card(5, "C"), card(6, "S")])).toBeNull();
    expect(classifyHand([card(5, "C"), card(5, "S"), card(6, "D")])).toBeNull();
    expect(classifyHand([card(8, "C"), card(8, "S"), card(8, "D"), card(9, "H")])).toBeNull();
  });

  it("classifies a 5-card straight", () => {
    const result = classifyHand([
      card(3, "C"),
      card(4, "D"),
      card(5, "S"),
      card(6, "H"),
      card(7, "C"),
    ]);
    expect(result?.type).toBe("straight");
    expect(result?.cards).toEqual([
      card(3, "C"),
      card(4, "D"),
      card(5, "S"),
      card(6, "H"),
      card(7, "C"),
    ]);
  });

  it("classifies a 5-card straight ending at Ace", () => {
    const result = classifyHand([
      card(10, "C"),
      card("J", "D"),
      card("Q", "S"),
      card("K", "H"),
      card("A", "C"),
    ]);
    expect(result?.type).toBe("straight");
    expect(result?.cards[result.cards.length - 1]).toEqual(card("A", "C"));
  });

  it("classifies a 7-card straight", () => {
    const result = classifyHand([
      card(3, "C"),
      card(4, "D"),
      card(5, "S"),
      card(6, "H"),
      card(7, "C"),
      card(8, "D"),
      card(9, "S"),
    ]);
    expect(result?.type).toBe("straight");
    expect(result?.cards).toHaveLength(7);
  });

  it("returns null for a straight that wraps through 2 (J-Q-K-A-2)", () => {
    expect(
      classifyHand([
        card("J", "C"),
        card("Q", "D"),
        card("K", "S"),
        card("A", "H"),
        card("2", "C"),
      ]),
    ).toBeNull();
  });

  it("classifies a 3-card run as a straight", () => {
    const result = classifyHand([card(3, "C"), card(4, "D"), card(5, "S")]);
    expect(result?.type).toBe("straight");
    expect(result?.cards).toHaveLength(3);
  });

  it("classifies a 4-card run as a straight (not a bomb when ranks differ)", () => {
    const result = classifyHand([card(3, "C"), card(4, "D"), card(5, "S"), card(6, "H")]);
    expect(result?.type).toBe("straight");
    expect(result?.cards).toHaveLength(4);
  });

  it("returns null for a 2-card sequence (no 2-length run)", () => {
    expect(classifyHand([card(3, "C"), card(4, "D")])).toBeNull();
  });

  it("returns null for a 5-card sequence with a duplicate rank", () => {
    expect(
      classifyHand([card(3, "C"), card(3, "D"), card(4, "S"), card(5, "H"), card(6, "C")]),
    ).toBeNull();
  });

  it("returns null for a 5-card sequence with a gap", () => {
    expect(
      classifyHand([card(3, "C"), card(5, "D"), card(6, "S"), card(7, "H"), card(8, "C")]),
    ).toBeNull();
  });
});

describe("beats — singles rank-then-suit", () => {
  it("a higher rank beats a lower rank regardless of suit", () => {
    expect(beats(single(card(4, "C")), single(card(3, "H")))).toBe(true);
    expect(beats(single(card(3, "H")), single(card(4, "C")))).toBe(false);
  });

  it("2 is the highest rank, beating Ace", () => {
    expect(beats(single(card("2", "C")), single(card("A", "H")))).toBe(true);
  });

  it("among same rank, higher suit wins (♣ < ♠ < ♦ < ♥)", () => {
    expect(beats(single(card(5, "S")), single(card(5, "C")))).toBe(true);
    expect(beats(single(card(5, "D")), single(card(5, "S")))).toBe(true);
    expect(beats(single(card(5, "H")), single(card(5, "D")))).toBe(true);
    expect(beats(single(card(5, "C")), single(card(5, "H")))).toBe(false);
  });

  it("identical cards do not beat one another", () => {
    expect(beats(single(card(8, "D")), single(card(8, "D")))).toBe(false);
  });
});

describe("beats — pairs, triples, bombs", () => {
  it("a higher-rank pair beats a lower-rank pair", () => {
    expect(beats(pair(card(7, "C"), card(7, "S")), pair(card(5, "C"), card(5, "S")))).toBe(true);
    expect(beats(pair(card(5, "C"), card(5, "S")), pair(card(7, "C"), card(7, "S")))).toBe(false);
  });

  it("same-rank pair: the pair with the higher-suit card wins", () => {
    expect(beats(pair(card(5, "D"), card(5, "H")), pair(card(5, "C"), card(5, "S")))).toBe(true);
    expect(beats(pair(card(5, "C"), card(5, "S")), pair(card(5, "D"), card(5, "H")))).toBe(false);
  });

  it("a higher-rank triple beats a lower-rank triple", () => {
    expect(
      beats(
        triple(card("Q", "C"), card("Q", "S"), card("Q", "D")),
        triple(card(9, "C"), card(9, "S"), card(9, "D")),
      ),
    ).toBe(true);
  });

  it("a single does not beat a pair", () => {
    expect(beats(single(card("2", "H")), pair(card(3, "C"), card(3, "S")))).toBe(false);
  });

  it("a pair does not beat a single", () => {
    expect(beats(pair(card(3, "C"), card(3, "S")), single(card("2", "H")))).toBe(false);
  });

  it("a bomb beats a single, pair, or triple", () => {
    const aBomb = bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"));
    expect(beats(aBomb, single(card("2", "H")))).toBe(true);
    expect(beats(aBomb, pair(card("A", "D"), card("A", "H")))).toBe(true);
    expect(beats(aBomb, triple(card("K", "C"), card("K", "S"), card("K", "D")))).toBe(true);
  });

  it("a single, pair, or triple does not beat a bomb", () => {
    const aBomb = bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"));
    expect(beats(single(card("2", "H")), aBomb)).toBe(false);
    expect(beats(pair(card("A", "D"), card("A", "H")), aBomb)).toBe(false);
    expect(beats(triple(card("K", "C"), card("K", "S"), card("K", "D")), aBomb)).toBe(false);
  });

  it("bomb vs bomb is decided by rank", () => {
    const low = bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"));
    const high = bomb(card(9, "C"), card(9, "S"), card(9, "D"), card(9, "H"));
    expect(beats(high, low)).toBe(true);
    expect(beats(low, high)).toBe(false);
  });
});

describe("beats — straights", () => {
  it("a same-length straight with a higher top-card rank wins", () => {
    const lower = straight(card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C"));
    const higher = straight(card(4, "S"), card(5, "S"), card(6, "S"), card(7, "S"), card(8, "S"));
    expect(beats(higher, lower)).toBe(true);
    expect(beats(lower, higher)).toBe(false);
  });

  it("same top-card rank: the straight with the higher-suit top wins", () => {
    const heartsTop = straight(
      card(4, "C"),
      card(5, "C"),
      card(6, "C"),
      card(7, "C"),
      card(8, "H"),
    );
    const clubsTop = straight(card(4, "S"), card(5, "S"), card(6, "S"), card(7, "S"), card(8, "C"));
    expect(beats(heartsTop, clubsTop)).toBe(true);
    expect(beats(clubsTop, heartsTop)).toBe(false);
  });

  it("different-length straights never beat one another", () => {
    const five = straight(card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C"));
    const six = straight(
      card(3, "S"),
      card(4, "S"),
      card(5, "S"),
      card(6, "S"),
      card(7, "S"),
      card(8, "S"),
    );
    expect(beats(six, five)).toBe(false);
    expect(beats(five, six)).toBe(false);
  });

  it("a bomb beats any straight regardless of length", () => {
    const five = straight(card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C"));
    const aBomb = bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"));
    expect(beats(aBomb, five)).toBe(true);
  });

  it("a straight does not beat a bomb", () => {
    const five = straight(card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C"));
    const aBomb = bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"));
    expect(beats(five, aBomb)).toBe(false);
  });

  it("a straight does not beat a non-straight non-bomb of a different type", () => {
    const five = straight(card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C"));
    expect(beats(five, single(card("2", "H")))).toBe(false);
  });
});

function doublesStraight(...cards: Card[]): Hand {
  return { type: "doubles-straight", cards: cards.toSorted(compareCards) };
}

describe("doubles-straight (consecutive pairs)", () => {
  it("classifies six cards as three consecutive pairs", () => {
    const result = classifyHand([
      card(3, "C"),
      card(3, "S"),
      card(4, "C"),
      card(4, "S"),
      card(5, "C"),
      card(5, "S"),
    ]);
    expect(result?.type).toBe("doubles-straight");
    expect(result?.cards).toHaveLength(6);
  });

  it("returns null when one of the pairs is broken", () => {
    expect(
      classifyHand([
        card(3, "C"),
        card(3, "S"),
        card(4, "C"),
        card(5, "S"),
        card(5, "C"),
        card(6, "S"),
      ]),
    ).toBeNull();
  });

  it("returns null for two consecutive pairs (below minimum of three)", () => {
    expect(classifyHand([card(3, "C"), card(3, "S"), card(4, "C"), card(4, "S")])).toBeNull();
  });

  it("returns null when the pairs skip a rank", () => {
    expect(
      classifyHand([
        card(3, "C"),
        card(3, "S"),
        card(5, "C"),
        card(5, "S"),
        card(7, "C"),
        card(7, "S"),
      ]),
    ).toBeNull();
  });

  it("returns null when a pair includes a 2", () => {
    expect(
      classifyHand([
        card("K", "C"),
        card("K", "S"),
        card("A", "C"),
        card("A", "S"),
        card("2", "C"),
        card("2", "S"),
      ]),
    ).toBeNull();
  });

  it("a higher-top-rank doubles-straight beats a lower one of the same length", () => {
    const lower = doublesStraight(
      card(3, "C"),
      card(3, "S"),
      card(4, "C"),
      card(4, "S"),
      card(5, "C"),
      card(5, "S"),
    );
    const higher = doublesStraight(
      card(4, "D"),
      card(4, "H"),
      card(5, "D"),
      card(5, "H"),
      card(6, "D"),
      card(6, "H"),
    );
    expect(beats(higher, lower)).toBe(true);
    expect(beats(lower, higher)).toBe(false);
  });

  it("different-length doubles-straights never beat one another", () => {
    const three = doublesStraight(
      card(3, "C"),
      card(3, "S"),
      card(4, "C"),
      card(4, "S"),
      card(5, "C"),
      card(5, "S"),
    );
    const four = doublesStraight(
      card(3, "D"),
      card(3, "H"),
      card(4, "D"),
      card(4, "H"),
      card(5, "D"),
      card(5, "H"),
      card(6, "C"),
      card(6, "S"),
    );
    expect(beats(four, three)).toBe(false);
    expect(beats(three, four)).toBe(false);
  });

  it("a bomb beats a doubles-straight", () => {
    const ds = doublesStraight(
      card(3, "C"),
      card(3, "S"),
      card(4, "C"),
      card(4, "S"),
      card(5, "C"),
      card(5, "S"),
    );
    const aBomb = bomb(card(7, "C"), card(7, "S"), card(7, "D"), card(7, "H"));
    expect(beats(aBomb, ds)).toBe(true);
    expect(beats(ds, aBomb)).toBe(false);
  });

  it("enumerates doubles-straights when leading", () => {
    const holding = [
      card(3, "C"),
      card(3, "S"),
      card(4, "C"),
      card(4, "S"),
      card(5, "C"),
      card(5, "S"),
      card(7, "D"),
    ];
    const plays = enumerateLegalPlays(holding, null);
    const ds = plays.filter((p) => p.type === "doubles-straight");
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0]!.cards).toHaveLength(6);
  });
});

describe("enumerateLegalPlays", () => {
  it("when leading, enumerates singles, pairs, triples, and bombs in the holding", () => {
    const holding = [
      card(3, "C"),
      card(3, "S"),
      card(3, "D"),
      card(3, "H"),
      card(7, "C"),
      card(7, "S"),
    ];
    const plays = enumerateLegalPlays(holding, null);
    const counts = { single: 0, pair: 0, triple: 0, bomb: 0, straight: 0 } as Record<
      Hand["type"],
      number
    >;
    for (const h of plays) counts[h.type] += 1;
    expect(counts.single).toBe(6);
    expect(counts.pair).toBe(7);
    expect(counts.triple).toBe(4);
    expect(counts.bomb).toBe(1);
  });

  it("filters out plays that don't beat the top hand", () => {
    const holding = [card(4, "C"), card(4, "S"), card(8, "C"), card(8, "S")];
    const top = pair(card(5, "D"), card(5, "H"));
    const plays = enumerateLegalPlays(holding, top);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toEqual(pair(card(8, "C"), card(8, "S")));
  });

  it("always includes a bomb override when present, even against a non-bomb top", () => {
    const holding = [card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H"), card(5, "C")];
    const top = single(card("2", "H"));
    const plays = enumerateLegalPlays(holding, top);
    expect(plays.some((h) => h.type === "bomb")).toBe(true);
  });

  it("when leading, enumerates the 5-card straight discoverable in holding", () => {
    const holding = [
      card(3, "C"),
      card(4, "C"),
      card(5, "C"),
      card(6, "C"),
      card(7, "C"),
      card("J", "H"),
    ];
    const plays = enumerateLegalPlays(holding, null);
    const straights = plays.filter((p) => p.type === "straight");
    expect(straights.some((s) => s.cards.length === 5)).toBe(true);
    const five = straights.find((s) => s.cards.length === 5);
    expect(five?.cards).toEqual([
      card(3, "C"),
      card(4, "C"),
      card(5, "C"),
      card(6, "C"),
      card(7, "C"),
    ]);
  });

  it("when leading, enumerates straights of multiple lengths from a long run", () => {
    const holding = [
      card(3, "C"),
      card(4, "C"),
      card(5, "C"),
      card(6, "C"),
      card(7, "C"),
      card(8, "C"),
      card(9, "C"),
    ];
    const straights = enumerateLegalPlays(holding, null).filter((p) => p.type === "straight");
    const byLength = new Map<number, number>();
    for (const s of straights) {
      byLength.set(s.cards.length, (byLength.get(s.cards.length) ?? 0) + 1);
    }
    expect(byLength.get(5)).toBe(3);
    expect(byLength.get(6)).toBe(2);
    expect(byLength.get(7)).toBe(1);
  });

  it("never enumerates a straight that includes a 2", () => {
    const holding = [
      card(10, "C"),
      card("J", "C"),
      card("Q", "C"),
      card("K", "C"),
      card("A", "C"),
      card("2", "C"),
    ];
    const straights = enumerateLegalPlays(holding, null).filter((p) => p.type === "straight");
    expect(straights.length).toBeGreaterThan(0);
    for (const s of straights) {
      expect(s.cards.some((c) => c.rank === "2")).toBe(false);
    }
  });

  it("when top is a straight, enumerates only same-length beating straights", () => {
    const holding = [
      card(4, "C"),
      card(5, "C"),
      card(6, "C"),
      card(7, "C"),
      card(8, "C"),
      card(9, "C"),
    ];
    const top = straight(card(3, "S"), card(4, "S"), card(5, "S"), card(6, "S"), card(7, "S"));
    const plays = enumerateLegalPlays(holding, top);
    const straights = plays.filter((p) => p.type === "straight");
    expect(straights).toHaveLength(2);
    const tops = straights.map((s) => s.cards[s.cards.length - 1]);
    expect(tops).toContainEqual(card(8, "C"));
    expect(tops).toContainEqual(card(9, "C"));
    for (const s of straights) expect(s.cards).toHaveLength(5);
  });
});

describe("compareCards orders by rank then suit", () => {
  it("orders 3♣ as the lowest card", () => {
    const deck = freshDeck().toSorted(compareCards);
    expect(deck[0]).toEqual({ rank: 3, suit: "C" });
  });

  it("orders 2♥ as the highest card", () => {
    const deck = freshDeck().toSorted(compareCards);
    expect(deck[deck.length - 1]).toEqual({ rank: "2", suit: "H" });
  });
});

describe("applyPlay — singles", () => {
  it("plays a single, removes it from the seat's hand, updates trick, advances turn", () => {
    const state = dealGame(7, 0);
    const first = state.players[0].hand[0]!;
    const next = applyPlay(state, 0, { kind: "play", hand: single(first) });

    expect(next.players[0].hand).toHaveLength(12);
    expect(next.players[0].hand.some((c) => c.rank === first.rank && c.suit === first.suit)).toBe(
      false,
    );
    expect(next.trick.top).toEqual(single(first));
    expect(next.trick.lastPlayer).toBe(0);
    expect(next.turn).toBe(1);
  });

  it("is a no-op when called for a non-active seat", () => {
    const state = dealGame(7, 0);
    const cardInSeat1 = state.players[1].hand[0]!;
    const next = applyPlay(state, 1, { kind: "play", hand: single(cardInSeat1) });
    expect(next).toEqual(state);
  });

  it("is a no-op when the card is not in the active seat's hand", () => {
    const state = dealGame(7, 0);
    const other = state.players[1].hand[0]!;
    const next = applyPlay(state, 0, { kind: "play", hand: single(other) });
    expect(next).toEqual(state);
  });

  it("rejects a play that does not beat the current top", () => {
    const initial = dealGame(7, 0);
    const seat0Hand = initial.players[0].hand.toSorted(compareCards);
    const highest = seat0Hand[seat0Hand.length - 1]!;
    const afterHigh = applyPlay(initial, 0, { kind: "play", hand: single(highest) });

    const seat1Hand = afterHigh.players[1].hand;
    const lower = seat1Hand.find((c) => compareCards(c, highest) < 0);
    if (!lower) return;

    const blocked = applyPlay(afterHigh, 1, { kind: "play", hand: single(lower) });
    expect(blocked).toEqual(afterHigh);
  });
});

describe("applyPlay — multi-card hands", () => {
  it("plays a pair, removes the two cards, advances turn and top", () => {
    const cards = [card(5, "C"), card(5, "S"), card(9, "D")];
    const state = seatedGame(cards);
    const next = applyPlay(state, 0, {
      kind: "play",
      hand: pair(card(5, "C"), card(5, "S")),
    });
    expect(next.players[0].hand).toEqual([card(9, "D")]);
    expect(next.trick.top?.type).toBe("pair");
    expect(next.turn).toBe(1);
  });

  it("plays a triple and removes three cards", () => {
    const cards = [card("J", "C"), card("J", "S"), card("J", "D"), card(4, "H")];
    const state = seatedGame(cards);
    const next = applyPlay(state, 0, {
      kind: "play",
      hand: triple(card("J", "C"), card("J", "S"), card("J", "D")),
    });
    expect(next.players[0].hand).toEqual([card(4, "H")]);
    expect(next.trick.top?.type).toBe("triple");
  });

  it("a bomb plays successfully on top of a single", () => {
    const cards = [card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H")];
    const state = seatedGame(cards);
    const afterLead = applyPlay(state, 0, {
      kind: "play",
      hand: single(card(4, "C")),
    });
    expect(afterLead.trick.top?.type).toBe("single");

    const cardsSeat1 = [card(7, "C"), card(7, "S"), card(7, "D"), card(7, "H"), card(5, "C")];
    const players = afterLead.players.slice() as [
      PlayerState,
      PlayerState,
      PlayerState,
      PlayerState,
    ];
    players[1] = { ...players[1], hand: cardsSeat1 };
    const ready: GameState = { ...afterLead, players };

    const after = applyPlay(ready, 1, {
      kind: "play",
      hand: bomb(card(7, "C"), card(7, "S"), card(7, "D"), card(7, "H")),
    });
    expect(after.trick.top?.type).toBe("bomb");
    expect(after.players[1].hand).toEqual([card(5, "C")]);
  });
});

function customGame(hands: readonly [Card[], Card[], Card[], Card[]], turn: Seat = 0): GameState {
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

describe("applyPlay — pass", () => {
  it("is a no-op when leading (no top hand to beat)", () => {
    const state = dealGame(7, 0);
    const next = applyPlay(state, 0, { kind: "pass" });
    expect(next).toEqual(state);
  });

  it("is a no-op when called for a non-active seat", () => {
    const state = customGame([[card(3, "C")], [card(4, "C")], [card(5, "C")], [card(6, "C")]], 0);
    const afterLead = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    const blocked = applyPlay(afterLead, 0, { kind: "pass" });
    expect(blocked).toEqual(afterLead);
  });

  it("records the passer in passedThisTrick and advances the turn", () => {
    const state = customGame(
      [
        [card(3, "C"), card("A", "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    const afterLead = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    const afterPass = applyPlay(afterLead, 1, { kind: "pass" });
    expect(afterPass.trick.passedThisTrick).toEqual(new Set([1]));
    expect(afterPass.turn).toBe(2);
    expect(afterPass.trick.top).toEqual(single(card(3, "C")));
  });

  it("a player who has passed cannot play later in the same trick", () => {
    const state = customGame(
      [
        [card(3, "C"), card("A", "C")],
        [card(4, "C"), card("K", "C")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "pass" });
    s = applyPlay(s, 2, { kind: "play", hand: single(card(5, "C")) });
    s = applyPlay(s, 3, { kind: "pass" });
    expect(s.turn).toBe(0);
    s = applyPlay(s, 0, { kind: "play", hand: single(card("A", "C")) });
    expect(s.trick.top).toEqual(single(card("A", "C")));
    expect(s.turn).toBe(2);
    const blocked = applyPlay(s, 1, { kind: "play", hand: single(card("K", "C")) });
    expect(blocked).toBe(s);
  });

  it("a player who has passed is skipped on subsequent turn advances", () => {
    const state = customGame(
      [
        [card(3, "C"), card("A", "C")],
        [card(4, "C"), card("K", "C")],
        [card(5, "C"), card("Q", "C")],
        [card(6, "C"), card("J", "C")],
      ],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "pass" });
    expect(s.turn).toBe(2);
    s = applyPlay(s, 2, { kind: "play", hand: single(card(5, "C")) });
    expect(s.turn).toBe(3);
    s = applyPlay(s, 3, { kind: "play", hand: single(card(6, "C")) });
    expect(s.turn).toBe(0);
  });

  it("closes the trick when three opponents have passed in a row; lead returns to last player", () => {
    const state = customGame(
      [
        [card(3, "C"), card("A", "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "pass" });
    s = applyPlay(s, 2, { kind: "pass" });
    s = applyPlay(s, 3, { kind: "pass" });
    expect(s.trick.top).toBeNull();
    expect(s.trick.lastPlayer).toBeNull();
    expect(s.trick.passedThisTrick).toEqual(new Set());
    expect(s.turn).toBe(0);
  });
});

describe("applyPlay — going out mid-trick", () => {
  it("adds the player to finishingOrder and skips them on subsequent turn advances", () => {
    const state = customGame(
      [
        [card(3, "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    const next = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    expect(next.players[0].hand).toEqual([]);
    expect(next.players[0].finishedAt).toBe(0);
    expect(next.finishingOrder).toEqual([0]);
    expect(next.turn).toBe(1);

    const afterB = applyPlay(next, 1, { kind: "play", hand: single(card(4, "D")) });
    expect(afterB.turn).toBe(2);
  });

  it("closes the trick when every remaining active player has passed after a player goes out", () => {
    const state = customGame(
      [
        [card(3, "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    expect(s.finishingOrder).toEqual([0]);
    s = applyPlay(s, 1, { kind: "pass" });
    s = applyPlay(s, 2, { kind: "pass" });
    s = applyPlay(s, 3, { kind: "pass" });
    expect(s.trick.top).toBeNull();
    expect(s.trick.passedThisTrick).toEqual(new Set());
  });

  it("transfers the lead clockwise when the last player to play is now out", () => {
    const state = customGame(
      [
        [card(3, "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "pass" });
    s = applyPlay(s, 2, { kind: "pass" });
    s = applyPlay(s, 3, { kind: "pass" });
    expect(s.turn).toBe(1);
  });

  it("allows a bomb to be the final hand a player goes out on", () => {
    const state = customGame(
      [
        [card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H")],
        [card("J", "C"), card("J", "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    const lead = applyPlay(state, 0, { kind: "play", hand: single(card(4, "C")) });
    const next = applyPlay(lead, 1, {
      kind: "play",
      hand: bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H")),
    });
    expect(next).toBe(lead);

    const bombGame = customGame(
      [
        [card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H")],
        [card("J", "C")],
        [card(5, "C")],
        [card(6, "C")],
      ],
      0,
    );
    const afterBomb = applyPlay(bombGame, 0, {
      kind: "play",
      hand: bomb(card(4, "C"), card(4, "S"), card(4, "D"), card(4, "H")),
    });
    expect(afterBomb.players[0].hand).toEqual([]);
    expect(afterBomb.finishingOrder).toEqual([0]);
  });
});

describe("gameIsOver and finalTitles", () => {
  it("gameIsOver is false until three players have finished", () => {
    const state = customGame(
      [
        [card(3, "C")],
        [card(4, "C"), card(4, "D")],
        [card(5, "C"), card(5, "D")],
        [card(6, "C"), card(6, "D")],
      ],
      0,
    );
    expect(gameIsOver(state)).toBe(false);
    const oneDone = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    expect(gameIsOver(oneDone)).toBe(false);
  });

  it("gameIsOver is true once finishingOrder.length === 3", () => {
    const state = customGame(
      [[card(3, "C")], [card(4, "C")], [card(5, "C")], [card(6, "C"), card(7, "C")]],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "play", hand: single(card(4, "C")) });
    s = applyPlay(s, 2, { kind: "play", hand: single(card(5, "C")) });
    expect(s.finishingOrder).toEqual([0, 1, 2]);
    expect(gameIsOver(s)).toBe(true);
  });

  it("applyPlay is a no-op once the game is over", () => {
    const state = customGame(
      [[card(3, "C")], [card(4, "C")], [card(5, "C")], [card(6, "C"), card(7, "C")]],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "play", hand: single(card(4, "C")) });
    s = applyPlay(s, 2, { kind: "play", hand: single(card(5, "C")) });
    const stuck = applyPlay(s, 3, { kind: "play", hand: single(card(6, "C")) });
    expect(stuck).toBe(s);
  });

  it("finalTitles assigns King/Queen/3rd/Joker by finishing order", () => {
    const state = customGame(
      [[card(3, "C")], [card(4, "C")], [card(5, "C")], [card(6, "C"), card(7, "C")]],
      0,
    );
    let s = applyPlay(state, 0, { kind: "play", hand: single(card(3, "C")) });
    s = applyPlay(s, 1, { kind: "play", hand: single(card(4, "C")) });
    s = applyPlay(s, 2, { kind: "play", hand: single(card(5, "C")) });
    expect(finalTitles(s)).toEqual({ 0: "king", 1: "queen", 2: "third", 3: "joker" });
  });

  it("finalTitles is null while the game is in progress", () => {
    const state = dealGame(7, 0);
    expect(finalTitles(state)).toBeNull();
  });
});

function finishedGameWithSeatOrder(order: readonly [Seat, Seat, Seat, Seat]): GameState {
  const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
    { hand: [], finishedAt: null },
    { hand: [], finishedAt: null },
    { hand: [], finishedAt: null },
    { hand: [], finishedAt: null },
  ];
  for (let i = 0; i < 3; i++) {
    players[order[i]!] = { hand: [], finishedAt: i };
  }
  players[order[3]!] = { hand: [card(7, "C")], finishedAt: null };
  return {
    players,
    turn: order[3],
    trick: { top: null, lastPlayer: null, passedThisTrick: new Set() },
    finishingOrder: [order[0], order[1], order[2]],
  };
}

describe("startKingTribute", () => {
  it("targets the Joker, asker is King, with cap 4 and 2 cards to receive", () => {
    const prev = finishedGameWithSeatOrder([0, 1, 2, 3]);
    const t = startKingTribute(prev);
    expect(t.asker).toBe(0);
    expect(t.target).toBe(3);
    expect(t.cardsToReceive).toBe(2);
    expect(t.capRemaining).toBe(KING_ASK_CAP);
    expect(t.returnsRemaining).toBe(2);
    expect(t.phase).toBe("ask");
    expect(t.received).toEqual([]);
    expect(t.missed).toEqual([]);
    expect(t.returned).toEqual([]);
  });
});

describe("startQueenTribute", () => {
  it("targets 3rd, asker is Queen, with cap 2 and 1 card to receive", () => {
    const prev = finishedGameWithSeatOrder([0, 1, 2, 3]);
    const t = startQueenTribute(prev);
    expect(t.asker).toBe(1);
    expect(t.target).toBe(2);
    expect(t.cardsToReceive).toBe(1);
    expect(t.capRemaining).toBe(QUEEN_ASK_CAP);
    expect(t.returnsRemaining).toBe(1);
    expect(t.phase).toBe("ask");
  });
});

describe("askCard", () => {
  function freshTribute(): TributeState {
    return startKingTribute(finishedGameWithSeatOrder([0, 1, 2, 3]));
  }

  it("hit: moves the asked card into received and decrements cap", () => {
    const t = freshTribute();
    const targetHand = [card(8, "H"), card("K", "C")];
    const { state, hit } = askCard(t, card(8, "H"), targetHand);
    expect(hit).toBe(true);
    expect(state.received).toEqual([card(8, "H")]);
    expect(state.missed).toEqual([]);
    expect(state.capRemaining).toBe(KING_ASK_CAP - 1);
  });

  it("miss: leaves received unchanged, records into missed and decrements cap", () => {
    const t = freshTribute();
    const targetHand = [card("K", "C")];
    const { state, hit } = askCard(t, card(8, "H"), targetHand);
    expect(hit).toBe(false);
    expect(state.received).toEqual([]);
    expect(state.missed).toEqual([card(8, "H")]);
    expect(state.capRemaining).toBe(KING_ASK_CAP - 1);
  });

  it("transitions phase to return when received quota is met", () => {
    const t = freshTribute();
    const targetHand = [card(8, "H"), card("K", "C")];
    let s = askCard(t, card(8, "H"), targetHand).state;
    s = askCard(s, card("K", "C"), targetHand).state;
    expect(s.received).toHaveLength(2);
    expect(s.phase).toBe("return");
  });

  it("transitions phase to return once the cap is exhausted by misses", () => {
    const t = freshTribute();
    const targetHand = [card("K", "C")];
    let s = t;
    for (let i = 0; i < KING_ASK_CAP; i++) {
      s = askCard(s, card((3 + i) as Rank, "H"), targetHand).state;
    }
    expect(s.capRemaining).toBe(0);
    expect(s.phase).toBe("return");
    expect(s.missed).toHaveLength(KING_ASK_CAP);
  });

  it("is a no-op when cap is 0", () => {
    const t = freshTribute();
    const targetHand = [card("K", "C")];
    let s = t;
    for (let i = 0; i < KING_ASK_CAP; i++) {
      s = askCard(s, card((3 + i) as Rank, "H"), targetHand).state;
    }
    const before = s;
    const { state, hit } = askCard(s, card("K", "C"), targetHand);
    expect(hit).toBe(false);
    expect(state).toBe(before);
  });

  it("is a no-op once received quota is met", () => {
    const t = freshTribute();
    const targetHand = [card(8, "H"), card("K", "C"), card("A", "D")];
    let s = askCard(t, card(8, "H"), targetHand).state;
    s = askCard(s, card("K", "C"), targetHand).state;
    const before = s;
    const { state, hit } = askCard(s, card("A", "D"), targetHand);
    expect(hit).toBe(false);
    expect(state).toBe(before);
  });
});

describe("returnCards", () => {
  function inReturnPhase(): TributeState {
    const t = startKingTribute(finishedGameWithSeatOrder([0, 1, 2, 3]));
    const targetHand = [card(8, "H"), card("K", "C")];
    let s = askCard(t, card(8, "H"), targetHand).state;
    s = askCard(s, card("K", "C"), targetHand).state;
    return s;
  }

  it("accepts the matching count of cards and marks tribute complete", () => {
    const s = inReturnPhase();
    const out = returnCards(s, [card(3, "C"), card(4, "D")]);
    expect(out.returned).toEqual([card(3, "C"), card(4, "D")]);
    expect(out.returnsRemaining).toBe(0);
    expect(tributeComplete(out)).toBe(true);
  });

  it("is a no-op if the count does not match returnsRemaining", () => {
    const s = inReturnPhase();
    const out = returnCards(s, [card(3, "C")]);
    expect(out).toBe(s);
  });

  it("is a no-op if called while still in ask phase", () => {
    const t = startKingTribute(finishedGameWithSeatOrder([0, 1, 2, 3]));
    const out = returnCards(t, [card(3, "C"), card(4, "D")]);
    expect(out).toBe(t);
  });

  it("accepts a single card for a Queen tribute", () => {
    const t = startQueenTribute(finishedGameWithSeatOrder([0, 1, 2, 3]));
    const targetHand = [card(8, "H")];
    const s = askCard(t, card(8, "H"), targetHand).state;
    expect(s.phase).toBe("return");
    const out = returnCards(s, [card(3, "C")]);
    expect(out.returned).toEqual([card(3, "C")]);
    expect(tributeComplete(out)).toBe(true);
  });
});

function completedTribute(
  prev: GameState,
  seed: number,
  role: "king" | "queen",
  receiveCount: number,
  returnCount: number,
): TributeState {
  const fresh = dealGame(seed, 0);
  let t = role === "king" ? startKingTribute(prev) : startQueenTribute(prev);
  const targetHand = fresh.players[t.target].hand;
  for (let i = 0; i < receiveCount; i++) {
    t = askCard(t, targetHand[i]!, targetHand).state;
  }
  const giverHand = fresh.players[t.asker].hand;
  if (t.returnsRemaining > 0) {
    t = returnCards(t, giverHand.slice(0, returnCount));
  }
  return t;
}

describe("finalizeTribute", () => {
  it("produces hands totaling 52 unique cards, each seat with 13", () => {
    const prev = finishedGameWithSeatOrder([0, 1, 2, 3]);
    const seed = 99;
    const king = completedTribute(prev, seed, "king", 2, 2);
    const queen = completedTribute(prev, seed, "queen", 1, 1);
    const next = finalizeTribute(prev, king, queen, seed);

    let total = 0;
    const keys = new Set<string>();
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(next.players[seat].hand).toHaveLength(13);
      total += 13;
      for (const c of next.players[seat].hand) keys.add(`${c.rank}${c.suit}`);
    }
    expect(total).toBe(52);
    expect(keys.size).toBe(52);
  });

  it("places received cards in the King's hand and returned cards in the Joker's hand", () => {
    const prev = finishedGameWithSeatOrder([0, 1, 2, 3]);
    const seed = 99;
    const king = completedTribute(prev, seed, "king", 2, 2);
    const queen = completedTribute(prev, seed, "queen", 1, 1);
    const next = finalizeTribute(prev, king, queen, seed);
    const kingHand = next.players[0].hand;
    const jokerHand = next.players[3].hand;
    for (const c of king.received) {
      expect(kingHand.some((h) => h.rank === c.rank && h.suit === c.suit)).toBe(true);
    }
    for (const c of king.returned) {
      expect(jokerHand.some((h) => h.rank === c.rank && h.suit === c.suit)).toBe(true);
    }
  });

  it("places queen received in Queen's hand and queen returned in 3rd's hand", () => {
    const prev = finishedGameWithSeatOrder([0, 1, 2, 3]);
    const seed = 99;
    const king = completedTribute(prev, seed, "king", 2, 2);
    const queen = completedTribute(prev, seed, "queen", 1, 1);
    const next = finalizeTribute(prev, king, queen, seed);
    const queenHand = next.players[1].hand;
    const thirdHand = next.players[2].hand;
    for (const c of queen.received) {
      expect(queenHand.some((h) => h.rank === c.rank && h.suit === c.suit)).toBe(true);
    }
    for (const c of queen.returned) {
      expect(thirdHand.some((h) => h.rank === c.rank && h.suit === c.suit)).toBe(true);
    }
  });

  it("sets the King as the new turn and resets trick + finishing order", () => {
    const prev = finishedGameWithSeatOrder([2, 0, 3, 1]);
    const seed = 17;
    const king = completedTribute(prev, seed, "king", 0, 0);
    const queen = completedTribute(prev, seed, "queen", 0, 0);
    const next = finalizeTribute(prev, king, queen, seed);
    expect(next.turn).toBe(2);
    expect(next.trick.top).toBeNull();
    expect(next.trick.lastPlayer).toBeNull();
    expect(next.trick.passedThisTrick).toEqual(new Set());
    expect(next.finishingOrder).toEqual([]);
  });
});
