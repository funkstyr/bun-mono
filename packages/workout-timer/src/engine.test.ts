import { describe, expect, it } from "vitest";

import { advancePhase, computeState, initialAnchor, type Anchor } from "./engine";
import type { SetConfig } from "./schemas";

const baseConfig: SetConfig = {
  rounds: 3,
  prepSec: 5,
  activeSec: 30,
  restSec: 10,
};

function runSequence(
  config: SetConfig,
  startTs: number,
): Array<{ anchor: Anchor; endsAt: number }> {
  const result: Array<{ anchor: Anchor; endsAt: number }> = [];
  let anchor = initialAnchor(config, startTs);
  while (anchor.phase !== "complete") {
    const endsAt = anchor.phaseStartTs + anchor.phaseDurationMs;
    result.push({ anchor, endsAt });
    anchor = advancePhase(config, anchor, endsAt);
  }
  result.push({ anchor, endsAt: anchor.phaseStartTs });
  return result;
}

describe("engine — phase sequence", () => {
  it("rounds=3 with non-zero durations: prep → (active → rest)×2 → active → complete", () => {
    const seq = runSequence(baseConfig, 0);
    const phases = seq.map((s) => ({ phase: s.anchor.phase, round: s.anchor.currentRound }));
    expect(phases).toEqual([
      { phase: "prep", round: 0 },
      { phase: "active", round: 1 },
      { phase: "rest", round: 1 },
      { phase: "active", round: 2 },
      { phase: "rest", round: 2 },
      { phase: "active", round: 3 },
      { phase: "complete", round: 0 },
    ]);
  });

  it("each transition fires at the expected now value relative to start", () => {
    const seq = runSequence(baseConfig, 0);
    expect(seq.map((s) => s.endsAt)).toEqual([
      5_000, // prep ends
      35_000, // active 1 ends
      45_000, // rest 1 ends
      75_000, // active 2 ends
      85_000, // rest 2 ends
      115_000, // active 3 ends
      115_000, // complete (terminal — no duration)
    ]);
  });

  it("prepSec=0 means the first phase is active round 1", () => {
    const config: SetConfig = { ...baseConfig, prepSec: 0 };
    const anchor = initialAnchor(config, 0);
    expect(anchor.phase).toBe("active");
    expect(anchor.currentRound).toBe(1);
    expect(anchor.phaseDurationMs).toBe(config.activeSec * 1000);
  });

  it("restSec=0 produces a single active phase per round with no rest transitions", () => {
    const config: SetConfig = { ...baseConfig, restSec: 0, rounds: 3 };
    const seq = runSequence(config, 0);
    const phases = seq.map((s) => s.anchor.phase);
    expect(phases.filter((p) => p === "rest")).toHaveLength(0);
    expect(phases).toEqual(["prep", "active", "active", "active", "complete"]);
  });

  it("rounds=1: prep → active → complete (no rest at all)", () => {
    const config: SetConfig = { ...baseConfig, rounds: 1 };
    const seq = runSequence(config, 0);
    expect(seq.map((s) => s.anchor.phase)).toEqual(["prep", "active", "complete"]);
  });

  it("for rounds=N there are exactly N-1 rest phases (final rest skipped)", () => {
    for (const rounds of [1, 2, 3, 5, 8]) {
      const config: SetConfig = { ...baseConfig, rounds };
      const seq = runSequence(config, 0);
      const restCount = seq.filter((s) => s.anchor.phase === "rest").length;
      expect(restCount).toBe(rounds - 1);
    }
  });
});

describe("engine — computeState math", () => {
  it("remainingMs equals phaseDurationMs - (now - phaseStartTs), clamped at 0", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 1_000,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    expect(computeState(baseConfig, anchor, 1_000).state.remainingMs).toBe(30_000);
    expect(computeState(baseConfig, anchor, 1_000 + 7_000).state.remainingMs).toBe(23_000);
    expect(computeState(baseConfig, anchor, 1_000 + 30_000).state.remainingMs).toBe(0);
    expect(computeState(baseConfig, anchor, 1_000 + 60_000).state.remainingMs).toBe(0);
  });

  it("reports phaseEnded once elapsed reaches phaseDurationMs", () => {
    const anchor: Anchor = {
      phase: "prep",
      currentRound: 0,
      phaseStartTs: 0,
      phaseDurationMs: 5_000,
      pausedRemainingMs: null,
    };
    expect(computeState(baseConfig, anchor, 4_999).phaseEnded).toBe(false);
    expect(computeState(baseConfig, anchor, 5_000).phaseEnded).toBe(true);
    expect(computeState(baseConfig, anchor, 9_999).phaseEnded).toBe(true);
  });

  it("never reports phaseEnded for the terminal complete phase", () => {
    const anchor: Anchor = {
      phase: "complete",
      currentRound: 0,
      phaseStartTs: 0,
      phaseDurationMs: 0,
      pausedRemainingMs: null,
    };
    expect(computeState(baseConfig, anchor, 999_999).phaseEnded).toBe(false);
  });

  it("paused anchor freezes remainingMs and never reports phaseEnded", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 2,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: 12_345,
    };
    const result = computeState(baseConfig, anchor, 99_999_999);
    expect(result.state.remainingMs).toBe(12_345);
    expect(result.state.isPaused).toBe(true);
    expect(result.phaseEnded).toBe(false);
  });
});

describe("engine — totalRemainingMs", () => {
  it("sums remaining phase durations + current remainingMs", () => {
    const anchor = initialAnchor(baseConfig, 0);
    const expectedTotal =
      baseConfig.prepSec * 1000 +
      baseConfig.rounds * baseConfig.activeSec * 1000 +
      (baseConfig.rounds - 1) * baseConfig.restSec * 1000;
    expect(computeState(baseConfig, anchor, 0).state.totalRemainingMs).toBe(expectedTotal);
  });

  it("decreases monotonically across the workout", () => {
    let anchor = initialAnchor(baseConfig, 0);
    let lastTotal = Infinity;
    while (anchor.phase !== "complete") {
      const start = computeState(baseConfig, anchor, anchor.phaseStartTs).state.totalRemainingMs;
      expect(start).toBeLessThanOrEqual(lastTotal);
      lastTotal = start;
      anchor = advancePhase(baseConfig, anchor, anchor.phaseStartTs + anchor.phaseDurationMs);
    }
    expect(computeState(baseConfig, anchor, anchor.phaseStartTs).state.totalRemainingMs).toBe(0);
  });
});

describe("engine — totality and catch-up", () => {
  it("computeState never throws across a fuzz of valid configs and times", () => {
    const configs: SetConfig[] = [
      baseConfig,
      { rounds: 1, prepSec: 0, activeSec: 1, restSec: 0 },
      { rounds: 99, prepSec: 60, activeSec: 3600, restSec: 3600 },
      { rounds: 5, prepSec: 0, activeSec: 5, restSec: 0 },
    ];
    for (const config of configs) {
      const anchor = initialAnchor(config, 0);
      for (const now of [0, 1, 1_000, 9_999_999_999]) {
        expect(() => computeState(config, anchor, now)).not.toThrow();
      }
    }
  });

  it("looping advancePhase from a far-future now lands in the phase containing now", () => {
    let anchor = initialAnchor(baseConfig, 0);
    const now = 100_000; // falls in active round 3 [85000, 115000]
    let { phaseEnded } = computeState(baseConfig, anchor, now);
    let safety = 100;
    while (phaseEnded && safety-- > 0) {
      anchor = advancePhase(baseConfig, anchor, now);
      ({ phaseEnded } = computeState(baseConfig, anchor, now));
    }
    expect(anchor.phase).toBe("active");
    expect(anchor.currentRound).toBe(3);
    expect(anchor.phaseStartTs).toBe(85_000);
    expect(anchor.phaseStartTs + anchor.phaseDurationMs).toBe(115_000);
  });
});
