import { describe, expect, it } from "vitest";

import {
  applyPlay,
  beats,
  classifyHand,
  compareCards,
  dealGame,
  enumerateLegalPlays,
  freshDeck,
  shuffle,
  type Card,
  type GameState,
  type Hand,
  type PlayerState,
  type Rank,
  type Seat,
  type Suit,
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
    expect(state.trick.consecutivePasses).toBe(0);
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

  it("returns null for straights (slice 3 territory)", () => {
    expect(
      classifyHand([card(3, "C"), card(4, "C"), card(5, "C"), card(6, "C"), card(7, "C")]),
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
