import { beforeEach, describe, expect, it } from "vitest";

import { dealGame, type GameState, type Seat, type Title } from "./engine";
import {
  emptyLifetime,
  emptyRoleCounts,
  emptyStorage,
  load,
  recordGameOver,
  save,
  STORAGE_KEY,
  type LifetimeBlob,
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

describe("recordGameOver", () => {
  it("increments role count + games played for the human's title", () => {
    const lifetime = emptyLifetime();
    const counts = emptyRoleCounts();
    const titles: Record<Seat, Title> = { 0: "king", 1: "queen", 2: "third", 3: "joker" };
    const r = recordGameOver(lifetime, counts, 0, titles);
    expect(r.lifetime.gamesPlayed).toBe(1);
    expect(r.lifetime.kings).toBe(1);
    expect(r.lifetime.queens).toBe(0);
    expect(r.sessionRoleCounts).toEqual({ king: 1, queen: 0, third: 0, joker: 0 });
  });

  it("tracks streaks across King → King → Joker", () => {
    const titles1: Record<Seat, Title> = { 0: "king", 1: "queen", 2: "third", 3: "joker" };
    const titles2: Record<Seat, Title> = { 0: "king", 1: "queen", 2: "third", 3: "joker" };
    const titles3: Record<Seat, Title> = { 0: "joker", 1: "king", 2: "queen", 3: "third" };

    let lifetime: LifetimeBlob = emptyLifetime();
    let counts = emptyRoleCounts();

    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titles1));
    expect(lifetime.currentKingStreak).toBe(1);
    expect(lifetime.longestKingStreak).toBe(1);

    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titles2));
    expect(lifetime.currentKingStreak).toBe(2);
    expect(lifetime.longestKingStreak).toBe(2);

    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titles3));
    expect(lifetime.currentKingStreak).toBe(0);
    expect(lifetime.longestKingStreak).toBe(2);
    expect(lifetime.currentJokerStreak).toBe(1);
    expect(lifetime.longestJokerStreak).toBe(1);
    expect(counts).toEqual({ king: 2, queen: 0, third: 0, joker: 1 });
  });

  it("resets King streak on a Queen/Third finish but keeps longest", () => {
    let lifetime: LifetimeBlob = emptyLifetime();
    let counts = emptyRoleCounts();
    const titlesKing: Record<Seat, Title> = { 0: "king", 1: "queen", 2: "third", 3: "joker" };
    const titlesQueen: Record<Seat, Title> = { 0: "queen", 1: "king", 2: "third", 3: "joker" };

    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titlesKing));
    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titlesKing));
    expect(lifetime.currentKingStreak).toBe(2);

    ({ lifetime, sessionRoleCounts: counts } = recordGameOver(lifetime, counts, 0, titlesQueen));
    expect(lifetime.currentKingStreak).toBe(0);
    expect(lifetime.longestKingStreak).toBe(2);
    expect(lifetime.currentJokerStreak).toBe(0);
  });
});
