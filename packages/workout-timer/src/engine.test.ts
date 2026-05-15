import { describe, expect, it } from "vitest";

import {
  advancePhase,
  computeState,
  initialAnchor,
  pauseAnchor,
  resetAnchor,
  resumeAnchor,
  skipAnchor,
  type Anchor,
} from "./engine";
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

describe("engine — pause / resume", () => {
  it("pause at 7s into a 30s phase captures 23s remaining", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    const paused = pauseAnchor(anchor, 7_000);
    expect(paused.pausedRemainingMs).toBe(23_000);
    expect(paused.phaseDurationMs).toBe(30_000);
  });

  it("pause clamps remaining to [0, phaseDurationMs]", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 1_000,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    expect(pauseAnchor(anchor, 0).pausedRemainingMs).toBe(30_000);
    expect(pauseAnchor(anchor, 999_999).pausedRemainingMs).toBe(0);
  });

  it("pause is idempotent and a no-op on terminal phases", () => {
    const alreadyPaused: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: 12_000,
    };
    expect(pauseAnchor(alreadyPaused, 1_000)).toBe(alreadyPaused);

    const completeAnchor: Anchor = {
      phase: "complete",
      currentRound: 0,
      phaseStartTs: 0,
      phaseDurationMs: 0,
      pausedRemainingMs: null,
    };
    expect(pauseAnchor(completeAnchor, 1_000)).toBe(completeAnchor);
  });

  it("resume re-anchors so remaining is preserved exactly", () => {
    // Pause at t=7000 on a 30s phase that began at 0 — 23s remaining.
    const initial: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    const paused = pauseAnchor(initial, 7_000);
    // 5 minutes later, resume.
    const resumedAt = 7_000 + 5 * 60_000;
    const resumed = resumeAnchor(paused, resumedAt);
    expect(resumed.pausedRemainingMs).toBeNull();

    const stateAtResume = computeState(baseConfig, resumed, resumedAt).state;
    expect(stateAtResume.remainingMs).toBe(23_000);

    // 10s after resume, remaining is 13s.
    const stateLater = computeState(baseConfig, resumed, resumedAt + 10_000).state;
    expect(stateLater.remainingMs).toBe(13_000);
  });

  it("resume is a no-op on a non-paused anchor", () => {
    const running: Anchor = {
      phase: "active",
      currentRound: 1,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    expect(resumeAnchor(running, 5_000)).toBe(running);
  });
});

describe("engine — skip", () => {
  it("skip from active round 2 lands on rest round 2 anchored to now", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 2,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(baseConfig, anchor, 5_000);
    expect(skipped.phase).toBe("rest");
    expect(skipped.currentRound).toBe(2);
    expect(skipped.phaseStartTs).toBe(5_000);
    expect(skipped.phaseDurationMs).toBe(baseConfig.restSec * 1000);
    expect(skipped.pausedRemainingMs).toBeNull();
  });

  it("skip from rest round 2 lands on active round 3", () => {
    const anchor: Anchor = {
      phase: "rest",
      currentRound: 2,
      phaseStartTs: 0,
      phaseDurationMs: 10_000,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(baseConfig, anchor, 2_000);
    expect(skipped.phase).toBe("active");
    expect(skipped.currentRound).toBe(3);
    expect(skipped.phaseStartTs).toBe(2_000);
  });

  it("skip from the last active phase transitions to complete", () => {
    const config: SetConfig = { ...baseConfig, rounds: 3 };
    const anchor: Anchor = {
      phase: "active",
      currentRound: 3,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(config, anchor, 1_000);
    expect(skipped.phase).toBe("complete");
    expect(skipped.pausedRemainingMs).toBeNull();
  });

  it("skip while paused remains paused on the next phase", () => {
    const anchor: Anchor = {
      phase: "active",
      currentRound: 2,
      phaseStartTs: 0,
      phaseDurationMs: 30_000,
      pausedRemainingMs: 12_000,
    };
    const skipped = skipAnchor(baseConfig, anchor, 5_000);
    expect(skipped.phase).toBe("rest");
    expect(skipped.pausedRemainingMs).toBe(baseConfig.restSec * 1000);

    const state = computeState(baseConfig, skipped, 99_999).state;
    expect(state.isPaused).toBe(true);
    expect(state.remainingMs).toBe(baseConfig.restSec * 1000);
  });
});

describe("engine — reset", () => {
  it("from mid-workout returns to prep, round 0, full prep duration anchored to now", () => {
    const mid: Anchor = {
      phase: "rest",
      currentRound: 2,
      phaseStartTs: 1_000,
      phaseDurationMs: 10_000,
      pausedRemainingMs: null,
    };
    const reset = resetAnchor(baseConfig, mid, 9_999);
    expect(reset.phase).toBe("prep");
    expect(reset.currentRound).toBe(0);
    expect(reset.phaseStartTs).toBe(9_999);
    expect(reset.phaseDurationMs).toBe(baseConfig.prepSec * 1000);
    expect(reset.pausedRemainingMs).toBeNull();
  });

  it("preserves paused state across reset", () => {
    const mid: Anchor = {
      phase: "active",
      currentRound: 2,
      phaseStartTs: 1_000,
      phaseDurationMs: 30_000,
      pausedRemainingMs: 5_000,
    };
    const reset = resetAnchor(baseConfig, mid, 50_000);
    expect(reset.phase).toBe("prep");
    expect(reset.pausedRemainingMs).toBe(baseConfig.prepSec * 1000);
  });

  it("with prepSec=0, reset lands on active round 1", () => {
    const config: SetConfig = { ...baseConfig, prepSec: 0 };
    const mid: Anchor = {
      phase: "rest",
      currentRound: 2,
      phaseStartTs: 1_000,
      phaseDurationMs: 10_000,
      pausedRemainingMs: null,
    };
    const reset = resetAnchor(config, mid, 7_777);
    expect(reset.phase).toBe("active");
    expect(reset.currentRound).toBe(1);
    expect(reset.phaseDurationMs).toBe(config.activeSec * 1000);
    expect(reset.phaseStartTs).toBe(7_777);
  });
});
