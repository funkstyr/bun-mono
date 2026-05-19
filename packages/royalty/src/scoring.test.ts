import { describe, expect, it } from "vitest";

import type { Seat, Title } from "./engine";
import { recordGameOver } from "./scoring";
import { emptyLifetime, emptyRoleCounts, type LifetimeBlob } from "./storage";

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
