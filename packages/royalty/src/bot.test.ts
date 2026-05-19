import { describe, expect, it } from "vitest";

import { decide } from "./bot";
import {
  applyPlay,
  dealGame,
  enumerateLegalPlays,
  type GameState,
  type Hand,
  type PlayerState,
  type Seat,
} from "./engine";

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

describe("decide (play phase)", () => {
  it("returns a play with a single low card when leading", () => {
    const state = dealGame(42, "three-of-clubs-holder");
    const seat = state.turn;
    const action = decide({ phase: "play", state, seat });
    expect(action.kind).toBe("play");
    if (action.kind !== "play") return;
    expect(action.hand.type).toBe("single");
  });

  it("returned play is always in enumerateLegalPlays for the seat", () => {
    const state = dealGame(101, "three-of-clubs-holder");
    const seat = state.turn;
    const action = decide({ phase: "play", state, seat });
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
    const action = decide({ phase: "play", state, seat });
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
    const action = decide({ phase: "play", state, seat });
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
        const action = decide({ phase: "play", state, seat });
        expect(action.kind === "play" || action.kind === "pass").toBe(true);
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
    const action = decide({ phase: "play", state, seat: 0 });
    expect(action.kind).toBe("pass");
  });
});
