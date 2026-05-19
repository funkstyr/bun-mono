import { describe, expect, it } from "vitest";

import {
  applyPlay,
  beats,
  classifyHand,
  compareCards,
  dealGame,
  freshDeck,
  shuffle,
  type Card,
  type Hand,
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

describe("classifyHand — singles only in this slice", () => {
  it("classifies a single card as a single", () => {
    const c = card(7, "D");
    expect(classifyHand([c])).toEqual({ type: "single", cards: [c] });
  });

  it("returns null for empty input", () => {
    expect(classifyHand([])).toBeNull();
  });

  it("returns null for any multi-card input", () => {
    expect(classifyHand([card(5, "C"), card(5, "S")])).toBeNull();
    expect(classifyHand([card(5, "C"), card(5, "S"), card(5, "D")])).toBeNull();
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
