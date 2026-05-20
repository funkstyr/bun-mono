import { describe, expect, it } from "vitest";

import { ALL_SEATS, type Seat } from "../engine";
import type { StrategyName } from "../strategy";
import { runBatch, type RoleDistribution } from "./run-batch";

const ALL_EASY: Record<Seat, StrategyName> = { 0: "easy", 1: "easy", 2: "easy", 3: "easy" };

describe("runBatch", () => {
  it("is deterministic for the same seed and strategies", () => {
    const a = runBatch({ strategies: ALL_EASY, n: 20, seed: 12345 });
    const b = runBatch({ strategies: ALL_EASY, n: 20, seed: 12345 });
    expect(a).toEqual(b);
  });

  it("produces different distributions for different seeds (with high probability)", () => {
    const a = runBatch({ strategies: ALL_EASY, n: 20, seed: 1 });
    const b = runBatch({ strategies: ALL_EASY, n: 20, seed: 999 });
    expect(a).not.toEqual(b);
  });

  it("role percentages sum to 100% across seats for each role", () => {
    const dist = runBatch({ strategies: ALL_EASY, n: 50, seed: 7 });
    for (const role of ["king", "queen", "third", "joker"] as const) {
      const sum = ALL_SEATS.reduce((acc, seat) => acc + dist[seat][role], 0);
      expect(sum).toBeCloseTo(100, 5);
    }
  });

  it("returns a RoleDistribution entry for every seat", () => {
    const dist = runBatch({ strategies: ALL_EASY, n: 5, seed: 42 });
    for (const seat of ALL_SEATS) {
      const entry: RoleDistribution[Seat] = dist[seat];
      expect(entry).toBeDefined();
      expect(entry.king + entry.queen + entry.third + entry.joker).toBeCloseTo(100, 5);
    }
  });
});
