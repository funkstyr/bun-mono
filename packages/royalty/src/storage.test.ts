import { beforeEach, describe, expect, it } from "vitest";

import { applyPlay, dealGame, type GameState, type Hand, type Seat } from "./engine";
import {
  emptyLifetime,
  emptyStorage,
  load,
  save,
  STORAGE_KEY,
  type RoyaltyStorage,
} from "./storage";

function freshSession(): RoyaltyStorage["currentSession"] {
  const seed = 12345;
  const game: GameState = dealGame(seed, "three-of-clubs-holder");
  // Make passedThisTrick non-empty to validate Set serialization.
  const withPass: GameState = {
    ...game,
    trick: { ...game.trick, passedThisTrick: new Set<Seat>([1]) },
  };
  return {
    humanSeat: 2,
    seed,
    game: withPass,
    tribute: null,
    titlesFromLastGame: null,
    gameCount: 3,
    sessionRoleCounts: { king: 1, queen: 0, third: 1, joker: 1 },
    strategies: { 0: "easy", 1: "easy", 2: null, 3: "easy" },
  };
}

describe("storage load/save", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty storage when no blob is present", () => {
    expect(load()).toEqual(emptyStorage());
  });

  it("returns empty storage when blob is unparseable", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(load()).toEqual(emptyStorage());
  });

  it("returns empty storage on schemaVersion mismatch", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, currentSession: null, lifetime: emptyLifetime() }),
    );
    expect(load()).toEqual(emptyStorage());
  });

  it("returns empty storage when schemaVersion is missing", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentSession: null, lifetime: emptyLifetime() }),
    );
    expect(load()).toEqual(emptyStorage());
  });

  it("round-trips a session's play log", () => {
    const seed = 12345;
    const dealt: GameState = dealGame(seed, "three-of-clubs-holder");
    const firstCard = dealt.players[dealt.turn].hand[0]!;
    const hand: Hand = { type: "single", cards: [firstCard] };
    const afterPlay = applyPlay(dealt, dealt.turn, { kind: "play", hand });
    expect(afterPlay.log).toHaveLength(1);

    const session = {
      humanSeat: dealt.turn,
      seed,
      game: afterPlay,
      tribute: null,
      titlesFromLastGame: null,
      gameCount: 1,
      sessionRoleCounts: { king: 0, queen: 0, third: 0, joker: 0 },
      strategies: {
        0: "easy" as const,
        1: "easy" as const,
        2: "easy" as const,
        3: "easy" as const,
      },
    };
    save({ schemaVersion: 1, currentSession: session, lifetime: emptyLifetime() });

    const loaded = load();
    expect(loaded.currentSession?.game.log).toEqual(afterPlay.log);
  });

  it("drops a pre-feature session (no strategies field) and preserves lifetime", () => {
    const seed = 12345;
    const game = dealGame(seed, "three-of-clubs-holder");
    const preFeatureSession = {
      humanSeat: 2,
      seed,
      game: {
        ...game,
        trick: {
          top: game.trick.top,
          lastPlayer: game.trick.lastPlayer,
          passedThisTrick: Array.from(game.trick.passedThisTrick),
        },
      },
      tribute: null,
      titlesFromLastGame: null,
      gameCount: 3,
      sessionRoleCounts: { king: 1, queen: 0, third: 1, joker: 1 },
    };
    const lifetime = {
      ...emptyLifetime(),
      gamesPlayed: 9,
      kings: 4,
      longestKingStreak: 3,
    };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        currentSession: preFeatureSession,
        lifetime,
      }),
    );

    const loaded = load();

    expect(loaded.currentSession).toBeNull();
    expect(loaded.lifetime.gamesPlayed).toBe(9);
    expect(loaded.lifetime.kings).toBe(4);
    expect(loaded.lifetime.longestKingStreak).toBe(3);
  });

  it("round-trips a session with non-empty passedThisTrick set", () => {
    const session = freshSession();
    const stored: RoyaltyStorage = {
      schemaVersion: 1,
      currentSession: session,
      lifetime: emptyLifetime(),
    };

    save(stored);
    const loaded = load();

    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.currentSession?.humanSeat).toBe(session!.humanSeat);
    expect(loaded.currentSession?.seed).toBe(session!.seed);
    expect(loaded.currentSession?.gameCount).toBe(session!.gameCount);
    expect(loaded.currentSession?.sessionRoleCounts).toEqual(session!.sessionRoleCounts);
    expect(Array.from(loaded.currentSession!.game.trick.passedThisTrick).toSorted()).toEqual([1]);
    expect(loaded.currentSession?.game.players[0].hand).toEqual(session!.game.players[0].hand);
  });
});
