import { describe, expect, it } from "vitest";

import {
  KING_ASK_CAP,
  QUEEN_ASK_CAP,
  type Card,
  type GameState,
  type Hand,
  type LogEntry,
  type PlayerState,
  type Seat,
  type TributeState,
} from "../engine";
import { runBatch } from "../sim/run-batch";
import { decidePlay, decideTributeAsk, decideTributeReturn } from "./hard";
import type { StrategyName } from "./types";

function fakeHand(size: number): readonly Card[] {
  const out: Card[] = [];
  for (let i = 0; i < size; i++) out.push({ rank: 3, suit: "C" });
  return out;
}

function makeState(opts: {
  hands: Record<Seat, readonly Card[]>;
  top?: Hand;
  lastPlayer?: Seat;
  log?: readonly LogEntry[];
}): GameState {
  const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
    { hand: opts.hands[0], finishedAt: null },
    { hand: opts.hands[1], finishedAt: null },
    { hand: opts.hands[2], finishedAt: null },
    { hand: opts.hands[3], finishedAt: null },
  ];
  return {
    players,
    turn: 0,
    trick: {
      top: opts.top ?? null,
      lastPlayer: opts.top !== undefined ? (opts.lastPlayer ?? 1) : null,
      passedThisTrick: new Set(),
    },
    finishingOrder: [],
    log: opts.log ?? [],
  };
}

function fourOfSevens(): readonly Card[] {
  return [
    { rank: 7, suit: "C" },
    { rank: 7, suit: "S" },
    { rank: 7, suit: "D" },
    { rank: 7, suit: "H" },
  ];
}

describe("hard.decidePlay — bomb policy", () => {
  it("plays the bomb as a finisher", () => {
    const state = makeState({
      hands: {
        0: fourOfSevens(),
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("bomb");
  });

  it("preserves the bomb when not a finisher and no opponent at endgame", () => {
    const state = makeState({
      hands: {
        0: [...fourOfSevens(), { rank: 6, suit: "C" }],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: 5, suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).not.toBe("bomb");
    expect(action.hand.cards[0]!.rank).toBe(6);
  });

  it("plays the bomb defensively when an opponent has 1 card and no non-bomb beat exists", () => {
    const state = makeState({
      hands: {
        0: [...fourOfSevens(), { rank: 4, suit: "C" }],
        1: fakeHand(1),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: "K", suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("bomb");
  });
});

describe("hard.decidePlay — combo preservation", () => {
  it("prefers a play that does not break a pair (soft)", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 7, suit: "C" },
          { rank: 7, suit: "S" },
          { rank: 8, suit: "C" },
        ],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: 6, suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.cards[0]!.rank).toBe(8);
  });

  it("breaks the lower-rank pair when forced to break (rank-aware soft cost)", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 8, suit: "C" },
          { rank: 8, suit: "S" },
          { rank: "J", suit: "C" },
          { rank: "J", suit: "S" },
        ],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: 7, suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("single");
    expect(action.hand.cards[0]!.rank).toBe(8);
  });
});

describe("hard.decidePlay — leading", () => {
  it("prefers a straight over triple, pair, and single when leading", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 3, suit: "C" },
          { rank: 4, suit: "C" },
          { rank: 6, suit: "C" },
          { rank: 6, suit: "S" },
          { rank: 8, suit: "C" },
          { rank: 8, suit: "S" },
          { rank: 8, suit: "D" },
          { rank: 10, suit: "C" },
          { rank: "J", suit: "C" },
          { rank: "Q", suit: "C" },
        ],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("straight");
  });

  it("does not lead with an Ace single when alternative non-A/2 plays exist", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 5, suit: "C" },
          { rank: 7, suit: "S" },
          { rank: "A", suit: "H" },
        ],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.cards[0]!.rank).not.toBe("A");
    expect(action.hand.cards[0]!.rank).not.toBe("2");
  });
});

describe("hard.decidePlay — strategic pass", () => {
  it("passes when the cheapest legal single is K or higher and the hand is still large", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 3, suit: "C" },
          { rank: 4, suit: "C" },
          { rank: 5, suit: "H" },
          { rank: 6, suit: "H" },
          { rank: 7, suit: "H" },
          { rank: 8, suit: "D" },
          { rank: 9, suit: "D" },
          { rank: "K", suit: "C" },
        ],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: "Q", suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("pass");
  });

  it("plays the K instead of passing when it would empty Hard's hand", () => {
    const state = makeState({
      hands: {
        0: [{ rank: "K", suit: "C" }],
        1: fakeHand(5),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: "Q", suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.cards[0]!.rank).toBe("K");
  });
});

describe("hard.decidePlay — endgame override", () => {
  it("leads its highest single when any opponent has 1 card", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 5, suit: "C" },
          { rank: 9, suit: "C" },
          { rank: "J", suit: "C" },
        ],
        1: fakeHand(1),
        2: fakeHand(5),
        3: fakeHand(5),
      },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("single");
    expect(action.hand.cards[0]!.rank).toBe("J");
  });

  it("plays an Ace to beat top when opponent at 1 (overrides ≥K pass)", () => {
    const state = makeState({
      hands: {
        0: [
          { rank: 3, suit: "C" },
          { rank: "A", suit: "H" },
        ],
        1: fakeHand(1),
        2: fakeHand(5),
        3: fakeHand(5),
      },
      top: { type: "single", cards: [{ rank: "Q", suit: "H" }] },
    });
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.cards[0]!.rank).toBe("A");
  });
});

function freshKingTribute(): TributeState {
  return {
    asker: 0,
    target: 3,
    cardsToReceive: 2,
    capRemaining: KING_ASK_CAP,
    received: [],
    missed: [],
    returned: [],
    phase: "ask",
    returnsRemaining: 2,
  };
}

function freshQueenTribute(): TributeState {
  return {
    asker: 1,
    target: 2,
    cardsToReceive: 1,
    capRemaining: QUEEN_ASK_CAP,
    received: [],
    missed: [],
    returned: [],
    phase: "ask",
    returnsRemaining: 1,
  };
}

describe("hard.decideTributeAsk", () => {
  it("asks for the missing fourth card of a held triple (bomb completion)", () => {
    const askerHand: Card[] = [
      { rank: 7, suit: "C" },
      { rank: 7, suit: "S" },
      { rank: 7, suit: "D" },
      { rank: 4, suit: "H" },
    ];
    const action = decideTributeAsk(freshKingTribute(), askerHand);
    expect(action.kind).toBe("ask");
    if (action.kind !== "ask") return;
    expect(action.card.rank).toBe(7);
    expect(action.card.suit).toBe("H");
  });

  it("falls back to highest unknown rank after a bomb-completion miss", () => {
    const askerHand: Card[] = [
      { rank: 7, suit: "C" },
      { rank: 7, suit: "S" },
      { rank: 7, suit: "D" },
    ];
    const state: TributeState = {
      ...freshKingTribute(),
      missed: [{ rank: 7, suit: "H" }],
      capRemaining: KING_ASK_CAP - 1,
    };
    const action = decideTributeAsk(state, askerHand);
    expect(action.kind).toBe("ask");
    if (action.kind !== "ask") return;
    expect(action.card.rank).not.toBe(7);
    expect(action.card.rank).toBe("2");
  });

  it("uses highest unknown rank when the hand has no triple", () => {
    const askerHand: Card[] = [
      { rank: 3, suit: "C" },
      { rank: 5, suit: "S" },
      { rank: 7, suit: "D" },
    ];
    const action = decideTributeAsk(freshKingTribute(), askerHand);
    expect(action.kind).toBe("ask");
    if (action.kind !== "ask") return;
    expect(action.card.rank).toBe("2");
  });
});

describe("hard.decideTributeReturn", () => {
  it("returns a mid-rank singleton before a 2 or Ace", () => {
    const state: TributeState = { ...freshKingTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 9, suit: "C" },
      { rank: "2", suit: "H" },
      { rank: 3, suit: "C" },
      { rank: 4, suit: "C" },
      { rank: 5, suit: "C" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    expect(action.cards).toHaveLength(2);
    const keys = new Set(action.cards.map((c) => `${c.rank}${c.suit}`));
    expect(keys.has("9C")).toBe(true);
    expect(keys.has("2H")).toBe(false);
  });

  it("returns singletons rather than breaking a pair", () => {
    const state: TributeState = { ...freshKingTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 7, suit: "C" },
      { rank: 7, suit: "S" },
      { rank: 9, suit: "C" },
      { rank: 10, suit: "C" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    const keys = new Set(action.cards.map((c) => `${c.rank}${c.suit}`));
    expect(keys.has("9C")).toBe(true);
    expect(keys.has("10C")).toBe(true);
    expect(keys.has("7C")).toBe(false);
    expect(keys.has("7S")).toBe(false);
  });

  it("never returns a bomb constituent", () => {
    const state: TributeState = { ...freshKingTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 7, suit: "C" },
      { rank: 7, suit: "S" },
      { rank: 7, suit: "D" },
      { rank: 7, suit: "H" },
      { rank: 3, suit: "C" },
      { rank: 4, suit: "C" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    for (const c of action.cards) expect(c.rank).not.toBe(7);
  });

  it("prefers a low-rank singleton over breaking a pair", () => {
    const state: TributeState = { ...freshKingTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 3, suit: "C" },
      { rank: 4, suit: "C" },
      { rank: 7, suit: "C" },
      { rank: 7, suit: "S" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    const keys = new Set(action.cards.map((c) => `${c.rank}${c.suit}`));
    expect(keys.has("3C")).toBe(true);
    expect(keys.has("4C")).toBe(true);
  });

  it("returns 2 cards for a King tribute", () => {
    const state: TributeState = { ...freshKingTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 3, suit: "C" },
      { rank: 4, suit: "C" },
      { rank: 5, suit: "C" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    expect(action.cards).toHaveLength(2);
  });

  it("returns 1 card for a Queen tribute", () => {
    const state: TributeState = { ...freshQueenTribute(), phase: "return" };
    const giverHand: Card[] = [
      { rank: 3, suit: "C" },
      { rank: 4, suit: "C" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    expect(action.cards).toHaveLength(1);
  });
});

describe("hard sim smoke", () => {
  it(
    "1×Hard + 3×Easy: Hard king-rate is at least 5pp above each Easy seat",
    { timeout: 60_000 },
    () => {
      const strategies: Record<Seat, StrategyName> = {
        0: "hard",
        1: "easy",
        2: "easy",
        3: "easy",
      };
      const result = runBatch({ strategies, n: 200, seed: 12345 });
      expect(result[0].king - result[1].king).toBeGreaterThanOrEqual(5);
      expect(result[0].king - result[2].king).toBeGreaterThanOrEqual(5);
      expect(result[0].king - result[3].king).toBeGreaterThanOrEqual(5);
    },
  );
});
