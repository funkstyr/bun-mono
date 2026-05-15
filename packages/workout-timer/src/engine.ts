import type { SetConfig } from "./schemas";

export type Phase = "idle" | "prep" | "active" | "rest" | "complete";

export type EngineState = {
  phase: Phase;
  currentRound: number;
  remainingMs: number;
  totalRemainingMs: number;
  isPaused: boolean;
};

export type Anchor = {
  phase: Phase;
  currentRound: number;
  phaseStartTs: number;
  phaseDurationMs: number;
  pausedRemainingMs: number | null;
};

type PhaseDescriptor = { phase: Phase; currentRound: number; durationMs: number };

function nextDescriptor(config: SetConfig, phase: Phase, round: number): PhaseDescriptor | null {
  if (phase === "complete") return null;
  if (phase === "idle" || phase === "prep") {
    return { phase: "active", currentRound: 1, durationMs: config.activeSec * 1000 };
  }
  if (phase === "active") {
    if (round >= config.rounds) {
      return { phase: "complete", currentRound: 0, durationMs: 0 };
    }
    if (config.restSec <= 0) {
      return { phase: "active", currentRound: round + 1, durationMs: config.activeSec * 1000 };
    }
    return { phase: "rest", currentRound: round, durationMs: config.restSec * 1000 };
  }
  // rest
  return { phase: "active", currentRound: round + 1, durationMs: config.activeSec * 1000 };
}

function remainingPhaseDurations(config: SetConfig, fromPhase: Phase, fromRound: number): number {
  let total = 0;
  let phase = fromPhase;
  let round = fromRound;
  while (true) {
    const next = nextDescriptor(config, phase, round);
    if (!next || next.phase === "complete") return total;
    total += next.durationMs;
    phase = next.phase;
    round = next.currentRound;
  }
}

export function initialAnchor(config: SetConfig, now: number): Anchor {
  if (config.prepSec > 0) {
    return {
      phase: "prep",
      currentRound: 0,
      phaseStartTs: now,
      phaseDurationMs: config.prepSec * 1000,
      pausedRemainingMs: null,
    };
  }
  return {
    phase: "active",
    currentRound: 1,
    phaseStartTs: now,
    phaseDurationMs: config.activeSec * 1000,
    pausedRemainingMs: null,
  };
}

export function computeState(
  config: SetConfig,
  anchor: Anchor,
  now: number,
): { state: EngineState; phaseEnded: boolean } {
  const isPaused = anchor.pausedRemainingMs !== null;
  const isTerminal = anchor.phase === "complete" || anchor.phase === "idle";

  let remainingMs: number;
  if (isPaused) {
    remainingMs = Math.max(0, anchor.pausedRemainingMs ?? 0);
  } else if (isTerminal) {
    remainingMs = 0;
  } else {
    const elapsed = now - anchor.phaseStartTs;
    remainingMs = Math.max(0, anchor.phaseDurationMs - elapsed);
  }

  const phaseEnded =
    !isPaused && !isTerminal && now - anchor.phaseStartTs >= anchor.phaseDurationMs;

  const downstream = remainingPhaseDurations(config, anchor.phase, anchor.currentRound);
  const totalRemainingMs = remainingMs + downstream;

  return {
    state: {
      phase: anchor.phase,
      currentRound: anchor.currentRound,
      remainingMs,
      totalRemainingMs,
      isPaused,
    },
    phaseEnded,
  };
}

export function advancePhase(config: SetConfig, anchor: Anchor, _now: number): Anchor {
  const next = nextDescriptor(config, anchor.phase, anchor.currentRound);
  if (!next) return anchor;
  return {
    phase: next.phase,
    currentRound: next.currentRound,
    phaseStartTs: anchor.phaseStartTs + anchor.phaseDurationMs,
    phaseDurationMs: next.durationMs,
    pausedRemainingMs: null,
  };
}
