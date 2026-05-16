import { describe, expect, it } from "vitest";

import {
  advancePhase,
  buildPhaseSequence,
  computeState,
  initialAnchor,
  pauseAnchor,
  resetAnchor,
  resumeAnchor,
  skipAnchor,
  type EngineAnchor,
  type PhaseDescriptor,
} from "./engine";
import type { SavedSet, SetConfig } from "./schemas";

const baseConfig: SetConfig = {
  rounds: 3,
  prepSec: 5,
  activeSec: 30,
  restSec: 10,
};

function makeSet(config: SetConfig): SavedSet {
  return { id: "s1", name: "Test Set", createdAt: 0, updatedAt: 0, config };
}

function makeSequence(config: SetConfig): PhaseDescriptor[] {
  return buildPhaseSequence({ kind: "set", set: makeSet(config) });
}

function runSequence(
  sequence: PhaseDescriptor[],
  startTs: number,
): Array<{ anchor: EngineAnchor; descriptor: PhaseDescriptor; endsAt: number }> {
  const result: Array<{ anchor: EngineAnchor; descriptor: PhaseDescriptor; endsAt: number }> = [];
  let anchor = initialAnchor(sequence, startTs);
  while (sequence[anchor.phaseIndex]!.kind !== "complete") {
    const descriptor = sequence[anchor.phaseIndex]!;
    const endsAt = anchor.phaseStartTs + descriptor.durationMs;
    result.push({ anchor, descriptor, endsAt });
    anchor = advancePhase(sequence, anchor, endsAt);
  }
  result.push({
    anchor,
    descriptor: sequence[anchor.phaseIndex]!,
    endsAt: anchor.phaseStartTs,
  });
  return result;
}

describe("buildPhaseSequence — standalone Set", () => {
  it("rounds=3 with all-non-zero durations: prep → (active, rest)×2 → active → complete", () => {
    const sequence = makeSequence(baseConfig);
    expect(sequence.map((d) => ({ kind: d.kind, round: d.round }))).toEqual([
      { kind: "prep", round: undefined },
      { kind: "active", round: 1 },
      { kind: "rest", round: 1 },
      { kind: "active", round: 2 },
      { kind: "rest", round: 2 },
      { kind: "active", round: 3 },
      { kind: "complete", round: undefined },
    ]);
  });

  it("durations match config × 1000", () => {
    const sequence = makeSequence(baseConfig);
    expect(sequence.map((d) => d.durationMs)).toEqual([
      5_000, // prep
      30_000, // active 1
      10_000, // rest 1
      30_000, // active 2
      10_000, // rest 2
      30_000, // active 3
      0, // complete
    ]);
  });

  it("prepSec=0 emits no prep descriptor at all", () => {
    const sequence = makeSequence({ ...baseConfig, prepSec: 0 });
    expect(sequence[0]!.kind).toBe("active");
    expect(sequence.some((d) => d.kind === "prep")).toBe(false);
  });

  it("restSec=0 emits no rest descriptors at all", () => {
    const sequence = makeSequence({ ...baseConfig, restSec: 0, rounds: 3 });
    expect(sequence.some((d) => d.kind === "rest")).toBe(false);
    expect(sequence.map((d) => d.kind)).toEqual(["prep", "active", "active", "active", "complete"]);
  });

  it("rounds=1: prep → active → complete (no rest)", () => {
    const sequence = makeSequence({ ...baseConfig, rounds: 1 });
    expect(sequence.map((d) => d.kind)).toEqual(["prep", "active", "complete"]);
  });

  it("rounds=N produces N active descriptors and N-1 rest descriptors", () => {
    for (const rounds of [1, 2, 3, 5, 8]) {
      const sequence = makeSequence({ ...baseConfig, rounds });
      const actives = sequence.filter((d) => d.kind === "active");
      const rests = sequence.filter((d) => d.kind === "rest");
      expect(actives).toHaveLength(rounds);
      expect(rests).toHaveLength(rounds - 1);
    }
  });

  it("restSec=0 yields zero rest descriptors regardless of rounds", () => {
    for (const rounds of [1, 2, 3, 5, 8]) {
      const sequence = makeSequence({ ...baseConfig, rounds, restSec: 0 });
      expect(sequence.filter((d) => d.kind === "rest")).toHaveLength(0);
    }
  });

  it("round metadata is numbered 1..N on actives (and rests carry the active's round)", () => {
    const sequence = makeSequence({ ...baseConfig, rounds: 4 });
    const activeRounds = sequence.filter((d) => d.kind === "active").map((d) => d.round);
    const restRounds = sequence.filter((d) => d.kind === "rest").map((d) => d.round);
    expect(activeRounds).toEqual([1, 2, 3, 4]);
    expect(restRounds).toEqual([1, 2, 3]);
  });

  it("final descriptor is always complete with durationMs=0", () => {
    for (const cfg of [
      baseConfig,
      { ...baseConfig, prepSec: 0 },
      { ...baseConfig, restSec: 0 },
      { ...baseConfig, rounds: 1 },
    ]) {
      const sequence = makeSequence(cfg);
      const last = sequence[sequence.length - 1]!;
      expect(last.kind).toBe("complete");
      expect(last.durationMs).toBe(0);
    }
  });

  it("prep descriptor carries no setIdx/setName/repeatIdx/upNextSetName for standalone Set", () => {
    const sequence = makeSequence(baseConfig);
    const prep = sequence[0]!;
    expect(prep.kind).toBe("prep");
    expect(prep.setIdx).toBeUndefined();
    expect(prep.setName).toBeUndefined();
    expect(prep.repeatIdx).toBeUndefined();
    expect(prep.upNextSetName).toBeUndefined();
  });
});

describe("engine — phase sequence walking", () => {
  it("walking advancePhase produces the expected (kind, round) progression", () => {
    const sequence = makeSequence(baseConfig);
    const walked = runSequence(sequence, 0);
    expect(walked.map((s) => ({ kind: s.descriptor.kind, round: s.descriptor.round }))).toEqual([
      { kind: "prep", round: undefined },
      { kind: "active", round: 1 },
      { kind: "rest", round: 1 },
      { kind: "active", round: 2 },
      { kind: "rest", round: 2 },
      { kind: "active", round: 3 },
      { kind: "complete", round: undefined },
    ]);
  });

  it("each transition fires at the expected now value relative to start", () => {
    const sequence = makeSequence(baseConfig);
    const walked = runSequence(sequence, 0);
    expect(walked.map((s) => s.endsAt)).toEqual([
      5_000, 35_000, 45_000, 75_000, 85_000, 115_000, 115_000,
    ]);
  });

  it("with prepSec=0, the first descriptor is active round 1", () => {
    const sequence = makeSequence({ ...baseConfig, prepSec: 0 });
    const anchor = initialAnchor(sequence, 0);
    const descriptor = sequence[anchor.phaseIndex]!;
    expect(descriptor.kind).toBe("active");
    expect(descriptor.round).toBe(1);
    expect(descriptor.durationMs).toBe(baseConfig.activeSec * 1000);
  });

  it("with restSec=0, rest descriptors are skipped entirely", () => {
    const sequence = makeSequence({ ...baseConfig, restSec: 0 });
    const walked = runSequence(sequence, 0);
    expect(walked.map((s) => s.descriptor.kind).filter((k) => k === "rest")).toHaveLength(0);
  });

  it("advancePhase clamps at the final complete descriptor", () => {
    const sequence = makeSequence(baseConfig);
    const lastIdx = sequence.length - 1;
    const completeAnchor: EngineAnchor = {
      phaseIndex: lastIdx,
      phaseStartTs: 1_000,
      pausedRemainingMs: null,
    };
    const same = advancePhase(sequence, completeAnchor, 2_000);
    expect(same).toEqual(completeAnchor);
  });
});

describe("engine — computeState math", () => {
  it("remainingMs equals descriptor.durationMs - (now - phaseStartTs), clamped at 0", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 1, // active round 1, duration 30_000
      phaseStartTs: 1_000,
      pausedRemainingMs: null,
    };
    expect(computeState(sequence, anchor, 1_000).state.remainingMs).toBe(30_000);
    expect(computeState(sequence, anchor, 8_000).state.remainingMs).toBe(23_000);
    expect(computeState(sequence, anchor, 31_000).state.remainingMs).toBe(0);
    expect(computeState(sequence, anchor, 61_000).state.remainingMs).toBe(0);
  });

  it("phaseEnded fires once elapsed reaches descriptor.durationMs", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 0, // prep, duration 5_000
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    expect(computeState(sequence, anchor, 4_999).phaseEnded).toBe(false);
    expect(computeState(sequence, anchor, 5_000).phaseEnded).toBe(true);
    expect(computeState(sequence, anchor, 9_999).phaseEnded).toBe(true);
  });

  it("never reports phaseEnded on the terminal complete descriptor", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: sequence.length - 1,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    expect(computeState(sequence, anchor, 999_999).phaseEnded).toBe(false);
    expect(computeState(sequence, anchor, 999_999).state.isComplete).toBe(true);
    expect(computeState(sequence, anchor, 999_999).state.remainingMs).toBe(0);
  });

  it("paused anchor freezes remainingMs and never reports phaseEnded", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 3, // active round 2
      phaseStartTs: 0,
      pausedRemainingMs: 12_345,
    };
    const result = computeState(sequence, anchor, 99_999_999);
    expect(result.state.remainingMs).toBe(12_345);
    expect(result.state.isPaused).toBe(true);
    expect(result.phaseEnded).toBe(false);
  });
});

describe("engine — totalRemainingMs", () => {
  it("at start equals prep + N×active + (N-1)×rest", () => {
    const sequence = makeSequence(baseConfig);
    const anchor = initialAnchor(sequence, 0);
    const expected =
      baseConfig.prepSec * 1000 +
      baseConfig.rounds * baseConfig.activeSec * 1000 +
      (baseConfig.rounds - 1) * baseConfig.restSec * 1000;
    expect(computeState(sequence, anchor, 0).state.totalRemainingMs).toBe(expected);
  });

  it("decreases monotonically across the workout", () => {
    const sequence = makeSequence(baseConfig);
    let anchor = initialAnchor(sequence, 0);
    let lastTotal = Infinity;
    while (sequence[anchor.phaseIndex]!.kind !== "complete") {
      const start = computeState(sequence, anchor, anchor.phaseStartTs).state.totalRemainingMs;
      expect(start).toBeLessThanOrEqual(lastTotal);
      lastTotal = start;
      const descriptor = sequence[anchor.phaseIndex]!;
      anchor = advancePhase(sequence, anchor, anchor.phaseStartTs + descriptor.durationMs);
    }
    expect(computeState(sequence, anchor, anchor.phaseStartTs).state.totalRemainingMs).toBe(0);
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
      const sequence = makeSequence(config);
      const anchor = initialAnchor(sequence, 0);
      for (const now of [0, 1, 1_000, 9_999_999_999]) {
        expect(() => computeState(sequence, anchor, now)).not.toThrow();
      }
    }
  });

  it("looping advancePhase from a far-future now lands in the phase containing now", () => {
    const sequence = makeSequence(baseConfig);
    let anchor = initialAnchor(sequence, 0);
    const now = 100_000; // falls in active round 3 [85_000, 115_000]
    let { phaseEnded } = computeState(sequence, anchor, now);
    let safety = 100;
    while (phaseEnded && safety-- > 0) {
      anchor = advancePhase(sequence, anchor, now);
      ({ phaseEnded } = computeState(sequence, anchor, now));
    }
    const descriptor = sequence[anchor.phaseIndex]!;
    expect(descriptor.kind).toBe("active");
    expect(descriptor.round).toBe(3);
    expect(anchor.phaseStartTs).toBe(85_000);
    expect(anchor.phaseStartTs + descriptor.durationMs).toBe(115_000);
  });
});

describe("engine — pause / resume", () => {
  it("pause at 7s into a 30s active phase captures 23s remaining", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 1,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    const paused = pauseAnchor(sequence, anchor, 7_000);
    expect(paused.pausedRemainingMs).toBe(23_000);
  });

  it("pause clamps remaining to [0, durationMs]", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 1,
      phaseStartTs: 1_000,
      pausedRemainingMs: null,
    };
    expect(pauseAnchor(sequence, anchor, 0).pausedRemainingMs).toBe(30_000);
    expect(pauseAnchor(sequence, anchor, 999_999).pausedRemainingMs).toBe(0);
  });

  it("pause is idempotent and a no-op on the complete descriptor", () => {
    const sequence = makeSequence(baseConfig);
    const alreadyPaused: EngineAnchor = {
      phaseIndex: 1,
      phaseStartTs: 0,
      pausedRemainingMs: 12_000,
    };
    expect(pauseAnchor(sequence, alreadyPaused, 1_000)).toBe(alreadyPaused);

    const completeAnchor: EngineAnchor = {
      phaseIndex: sequence.length - 1,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    expect(pauseAnchor(sequence, completeAnchor, 1_000)).toBe(completeAnchor);
  });

  it("resume re-anchors so remaining is preserved exactly", () => {
    const sequence = makeSequence(baseConfig);
    const initial: EngineAnchor = {
      phaseIndex: 1, // active round 1, 30s
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    const paused = pauseAnchor(sequence, initial, 7_000);
    const resumedAt = 7_000 + 5 * 60_000;
    const resumed = resumeAnchor(sequence, paused, resumedAt);
    expect(resumed.pausedRemainingMs).toBeNull();

    const stateAtResume = computeState(sequence, resumed, resumedAt).state;
    expect(stateAtResume.remainingMs).toBe(23_000);

    const stateLater = computeState(sequence, resumed, resumedAt + 10_000).state;
    expect(stateLater.remainingMs).toBe(13_000);
  });

  it("resume is a no-op on a non-paused anchor", () => {
    const sequence = makeSequence(baseConfig);
    const running: EngineAnchor = {
      phaseIndex: 1,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    expect(resumeAnchor(sequence, running, 5_000)).toBe(running);
  });
});

describe("engine — skip", () => {
  it("skip from active round 1 lands on rest round 1 anchored to now", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 1, // active round 1
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(sequence, anchor, 5_000);
    const descriptor = sequence[skipped.phaseIndex]!;
    expect(descriptor.kind).toBe("rest");
    expect(descriptor.round).toBe(1);
    expect(skipped.phaseStartTs).toBe(5_000);
    expect(skipped.pausedRemainingMs).toBeNull();
  });

  it("skip from rest round 2 lands on active round 3", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 4, // rest round 2
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(sequence, anchor, 2_000);
    const descriptor = sequence[skipped.phaseIndex]!;
    expect(descriptor.kind).toBe("active");
    expect(descriptor.round).toBe(3);
    expect(skipped.phaseStartTs).toBe(2_000);
  });

  it("skip from the last active phase transitions to complete", () => {
    const sequence = makeSequence(baseConfig);
    const lastActiveIdx = sequence.length - 2;
    const anchor: EngineAnchor = {
      phaseIndex: lastActiveIdx,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    const skipped = skipAnchor(sequence, anchor, 1_000);
    expect(sequence[skipped.phaseIndex]!.kind).toBe("complete");
    expect(skipped.pausedRemainingMs).toBeNull();
  });

  it("skip while paused remains paused on the next non-complete phase", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: 1, // active round 1
      phaseStartTs: 0,
      pausedRemainingMs: 12_000,
    };
    const skipped = skipAnchor(sequence, anchor, 5_000);
    const descriptor = sequence[skipped.phaseIndex]!;
    expect(descriptor.kind).toBe("rest");
    expect(skipped.pausedRemainingMs).toBe(baseConfig.restSec * 1000);

    const state = computeState(sequence, skipped, 99_999).state;
    expect(state.isPaused).toBe(true);
    expect(state.remainingMs).toBe(baseConfig.restSec * 1000);
  });

  it("skip is a no-op when already on complete", () => {
    const sequence = makeSequence(baseConfig);
    const anchor: EngineAnchor = {
      phaseIndex: sequence.length - 1,
      phaseStartTs: 0,
      pausedRemainingMs: null,
    };
    expect(skipAnchor(sequence, anchor, 5_000)).toBe(anchor);
  });
});

describe("engine — reset", () => {
  it("from mid-workout returns to phaseIndex 0 anchored to now", () => {
    const sequence = makeSequence(baseConfig);
    const mid: EngineAnchor = {
      phaseIndex: 4, // rest round 2
      phaseStartTs: 1_000,
      pausedRemainingMs: null,
    };
    const reset = resetAnchor(sequence, mid, 9_999);
    expect(reset.phaseIndex).toBe(0);
    expect(reset.phaseStartTs).toBe(9_999);
    expect(reset.pausedRemainingMs).toBeNull();
    expect(sequence[reset.phaseIndex]!.kind).toBe("prep");
  });

  it("preserves paused state across reset (paused on first descriptor's full duration)", () => {
    const sequence = makeSequence(baseConfig);
    const mid: EngineAnchor = {
      phaseIndex: 3,
      phaseStartTs: 1_000,
      pausedRemainingMs: 5_000,
    };
    const reset = resetAnchor(sequence, mid, 50_000);
    expect(reset.phaseIndex).toBe(0);
    expect(reset.pausedRemainingMs).toBe(sequence[0]!.durationMs);
  });

  it("with prepSec=0, reset lands on active round 1 (first descriptor)", () => {
    const sequence = makeSequence({ ...baseConfig, prepSec: 0 });
    const mid: EngineAnchor = {
      phaseIndex: 2,
      phaseStartTs: 1_000,
      pausedRemainingMs: null,
    };
    const reset = resetAnchor(sequence, mid, 7_777);
    expect(reset.phaseIndex).toBe(0);
    expect(reset.phaseStartTs).toBe(7_777);
    const descriptor = sequence[reset.phaseIndex]!;
    expect(descriptor.kind).toBe("active");
    expect(descriptor.round).toBe(1);
    expect(descriptor.durationMs).toBe(baseConfig.activeSec * 1000);
  });
});
