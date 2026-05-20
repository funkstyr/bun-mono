import { describe, expect, it } from "vitest";

import {
  applyPlay,
  dealGame,
  enumerateLegalPlays,
  KING_ASK_CAP,
  QUEEN_ASK_CAP,
  type Card,
  type GameState,
  type Hand,
  type PlayerState,
  type Seat,
  type TributeState,
} from "../engine";
import { decidePlay, decideTributeAsk, decideTributeReturn } from "./easy";

function handsEqual(a: Hand, b: Hand): boolean {
  if (a.type !== b.type) return false;
  if (a.cards.length !== b.cards.length) return false;
  for (let i = 0; i < a.cards.length; i++) {
    if (a.cards[i]!.rank !== b.cards[i]!.rank) return false;
    if (a.cards[i]!.suit !== b.cards[i]!.suit) return false;
  }
  return true;
}

function withTop(state: GameState, top: Hand): GameState {
  return { ...state, trick: { ...state.trick, top, lastPlayer: 1 } };
}

describe("easy.decidePlay", () => {
  it("returns a play with a single low card when leading", () => {
    const state = dealGame(42, "three-of-clubs-holder");
    const seat = state.turn;
    const action = decidePlay(state, seat);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("single");
  });

  it("returned play is always in enumerateLegalPlays for the seat", () => {
    const state = dealGame(101, "three-of-clubs-holder");
    const seat = state.turn;
    const action = decidePlay(state, seat);
    if (action.kind !== "play") return;
    const legal = enumerateLegalPlays(state.players[seat].hand, state.trick.top);
    expect(legal.some((h) => handsEqual(h, action.hand))).toBe(true);
  });

  it("passes when responding with no legal beat", () => {
    const base = dealGame(7, "three-of-clubs-holder");
    const seat: Seat = 0;
    const players = base.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
    players[seat] = {
      hand: [
        { rank: 3, suit: "C" },
        { rank: 4, suit: "S" },
      ],
      finishedAt: null,
    };
    const top: Hand = { type: "single", cards: [{ rank: "A", suit: "H" }] };
    const state: GameState = {
      ...base,
      players,
      turn: seat,
      trick: { top, lastPlayer: 1, passedThisTrick: new Set() },
    };
    const action = decidePlay(state, seat);
    expect(action.kind).toBe("pass");
  });

  it("plays the lowest legal beat when responding", () => {
    const base = dealGame(7, "three-of-clubs-holder");
    const seat: Seat = 0;
    const players = base.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
    players[seat] = {
      hand: [
        { rank: 4, suit: "C" },
        { rank: 7, suit: "D" },
        { rank: 10, suit: "H" },
      ],
      finishedAt: null,
    };
    const top: Hand = { type: "single", cards: [{ rank: 5, suit: "S" }] };
    const state: GameState = {
      ...base,
      players,
      turn: seat,
      trick: { top, lastPlayer: 1, passedThisTrick: new Set() },
    };
    const action = decidePlay(state, seat);
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.cards[0]!.rank).toBe(7);
  });

  it("never throws across many seeds and many simulated turns", () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = dealGame(seed, "three-of-clubs-holder");
      for (let i = 0; i < 50; i++) {
        const seat = state.turn;
        if (state.players[seat].finishedAt !== null) break;
        if (state.finishingOrder.length >= 3) break;
        const action = decidePlay(state, seat);
        expect(action.kind === "play" || action.kind === "pass").toBe(true);
        if (action.kind !== "play" && action.kind !== "pass") break;
        state = applyPlay(state, seat, action);
      }
    }
  });

  it("returns pass when top exists and hand is empty (defensive)", () => {
    const base = dealGame(7, "three-of-clubs-holder");
    const players = base.players.slice() as [PlayerState, PlayerState, PlayerState, PlayerState];
    players[0] = { hand: [], finishedAt: 0 };
    const top: Hand = { type: "single", cards: [{ rank: 3, suit: "C" }] };
    const state: GameState = { ...base, players, turn: 0, trick: withTop(base, top).trick };
    const action = decidePlay(state, 0);
    expect(action.kind).toBe("pass");
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

describe("easy.decideTributeAsk", () => {
  it("returns an ask for a card the asker does not already hold or know is missed", () => {
    const state = freshKingTribute();
    const askerHand: Card[] = [
      { rank: "2", suit: "H" },
      { rank: "2", suit: "D" },
    ];
    const action = decideTributeAsk(state, askerHand);
    expect(action.kind).toBe("ask");
    if (action.kind !== "ask") return;
    const inHand = askerHand.some(
      (c) => c.rank === action.card.rank && c.suit === action.card.suit,
    );
    expect(inHand).toBe(false);
  });

  it("never re-asks a missed card", () => {
    const askerHand: Card[] = [{ rank: 3, suit: "C" }];
    const state: TributeState = {
      ...freshKingTribute(),
      missed: [{ rank: "2", suit: "H" }],
      capRemaining: KING_ASK_CAP - 1,
    };
    const action = decideTributeAsk(state, askerHand);
    if (action.kind !== "ask") {
      throw new Error("expected ask");
    }
    expect(action.card.rank === "2" && action.card.suit === "H").toBe(false);
  });

  it("targets the highest unseen rank first", () => {
    const askerHand: Card[] = [];
    const state = freshKingTribute();
    const action = decideTributeAsk(state, askerHand);
    if (action.kind !== "ask") throw new Error("expected ask");
    expect(action.card.rank).toBe("2");
  });
});

describe("easy.decideTributeReturn", () => {
  it("returns 2 lowest cards for a King tribute", () => {
    const state = { ...freshKingTribute(), phase: "return" as const };
    const giverHand: Card[] = [
      { rank: "K", suit: "C" },
      { rank: 3, suit: "C" },
      { rank: 5, suit: "D" },
      { rank: "A", suit: "H" },
    ];
    const action = decideTributeReturn(state, giverHand);
    expect(action.kind).toBe("return");
    if (action.kind !== "return") return;
    expect(action.cards).toHaveLength(2);
    const inGiver = action.cards.every((c) =>
      giverHand.some((g) => g.rank === c.rank && g.suit === c.suit),
    );
    expect(inGiver).toBe(true);
    const ranks = new Set(action.cards.map((c) => `${c.rank}${c.suit}`));
    expect(ranks.has("3C")).toBe(true);
    expect(ranks.has("5D")).toBe(true);
  });

  it("returns 1 lowest card for a Queen tribute", () => {
    const state = { ...freshQueenTribute(), phase: "return" as const };
    const giverHand: Card[] = [
      { rank: "K", suit: "C" },
      { rank: 7, suit: "C" },
      { rank: 5, suit: "D" },
    ];
    const action = decideTributeReturn(state, giverHand);
    if (action.kind !== "return") throw new Error("expected return");
    expect(action.cards).toHaveLength(1);
    expect(action.cards[0]!.rank).toBe(5);
  });
});
