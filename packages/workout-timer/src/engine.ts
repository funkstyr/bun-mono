import type { SavedSet, SavedWorkout } from "./schemas";

export type PhaseKind = "prep" | "active" | "rest" | "complete";

export type PhaseDescriptor = {
  kind: PhaseKind;
  durationMs: number;
  setIdx?: number;
  setName?: string;
  repeatIdx?: number;
  round?: number;
  upNextSetName?: string;
};

export type BuildSequenceInput =
  | { kind: "set"; set: SavedSet }
  | { kind: "workout"; workout: SavedWorkout; sets: SavedSet[] };

export function buildPhaseSequence(input: BuildSequenceInput): PhaseDescriptor[] {
  const sequence: PhaseDescriptor[] = [];

  if (input.kind === "set") {
    const { config } = input.set;

    if (config.prepSec > 0) {
      sequence.push({ kind: "prep", durationMs: config.prepSec * 1000 });
    }

    for (let r = 1; r <= config.rounds; r++) {
      sequence.push({ kind: "active", durationMs: config.activeSec * 1000, round: r });
      const isLastRound = r === config.rounds;
      if (!isLastRound && config.restSec > 0) {
        sequence.push({ kind: "rest", durationMs: config.restSec * 1000, round: r });
      }
    }
  } else {
    const { workout, sets } = input;
    const prepMs = workout.prepSec * 1000;
    for (let p = 0; p < workout.repeats; p++) {
      for (let i = 0; i < workout.slots.length; i++) {
        const set = sets[i]!;
        const { config } = set;

        if (prepMs > 0) {
          sequence.push({
            kind: "prep",
            durationMs: prepMs,
            setIdx: i,
            repeatIdx: p,
            upNextSetName: set.name,
          });
        }

        for (let r = 1; r <= config.rounds; r++) {
          sequence.push({
            kind: "active",
            durationMs: config.activeSec * 1000,
            setIdx: i,
            setName: set.name,
            repeatIdx: p,
            round: r,
          });
          const isLastRound = r === config.rounds;
          if (!isLastRound && config.restSec > 0) {
            sequence.push({
              kind: "rest",
              durationMs: config.restSec * 1000,
              setIdx: i,
              setName: set.name,
              repeatIdx: p,
              round: r,
            });
          }
        }
      }
    }
  }

  sequence.push({ kind: "complete", durationMs: 0 });
  return sequence;
}

export type EngineAnchor = {
  phaseIndex: number;
  phaseStartTs: number;
  pausedRemainingMs: number | null;
};

export type EngineState = {
  phaseIndex: number;
  remainingMs: number;
  totalRemainingMs: number;
  isPaused: boolean;
  isComplete: boolean;
};

export function initialAnchor(_sequence: PhaseDescriptor[], now: number): EngineAnchor {
  return { phaseIndex: 0, phaseStartTs: now, pausedRemainingMs: null };
}

function sumDurationsFrom(sequence: PhaseDescriptor[], fromIndex: number): number {
  let total = 0;
  for (let i = fromIndex; i < sequence.length; i++) {
    total += sequence[i]!.durationMs;
  }
  return total;
}

export function computeState(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  now: number,
): { state: EngineState; phaseEnded: boolean } {
  const descriptor = sequence[anchor.phaseIndex]!;
  const isComplete = descriptor.kind === "complete";
  const isPaused = anchor.pausedRemainingMs !== null;

  let remainingMs: number;
  if (isComplete) {
    remainingMs = 0;
  } else if (isPaused) {
    remainingMs = Math.max(0, anchor.pausedRemainingMs ?? 0);
  } else {
    const elapsed = now - anchor.phaseStartTs;
    remainingMs = Math.max(0, descriptor.durationMs - elapsed);
  }

  const downstream = sumDurationsFrom(sequence, anchor.phaseIndex + 1);
  const totalRemainingMs = remainingMs + downstream;

  const phaseEnded = !isPaused && !isComplete && now - anchor.phaseStartTs >= descriptor.durationMs;

  return {
    state: {
      phaseIndex: anchor.phaseIndex,
      remainingMs,
      totalRemainingMs,
      isPaused,
      isComplete,
    },
    phaseEnded,
  };
}

export function advancePhase(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  _now: number,
): EngineAnchor {
  if (anchor.phaseIndex >= sequence.length - 1) return anchor;
  const currentDuration = sequence[anchor.phaseIndex]!.durationMs;
  return {
    phaseIndex: anchor.phaseIndex + 1,
    phaseStartTs: anchor.phaseStartTs + currentDuration,
    pausedRemainingMs: null,
  };
}

export function pauseAnchor(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  now: number,
): EngineAnchor {
  if (anchor.pausedRemainingMs !== null) return anchor;
  const descriptor = sequence[anchor.phaseIndex]!;
  if (descriptor.kind === "complete") return anchor;
  const elapsed = now - anchor.phaseStartTs;
  const remaining = Math.max(0, Math.min(descriptor.durationMs, descriptor.durationMs - elapsed));
  return { ...anchor, pausedRemainingMs: remaining };
}

export function resumeAnchor(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  now: number,
): EngineAnchor {
  if (anchor.pausedRemainingMs === null) return anchor;
  const descriptor = sequence[anchor.phaseIndex]!;
  if (descriptor.kind === "complete") return anchor;
  return {
    phaseIndex: anchor.phaseIndex,
    phaseStartTs: now - (descriptor.durationMs - anchor.pausedRemainingMs),
    pausedRemainingMs: null,
  };
}

export function skipAnchor(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  now: number,
): EngineAnchor {
  const current = sequence[anchor.phaseIndex]!;
  if (current.kind === "complete") return anchor;
  const wasPaused = anchor.pausedRemainingMs !== null;
  const nextIndex = Math.min(anchor.phaseIndex + 1, sequence.length - 1);
  const nextDescriptor = sequence[nextIndex]!;
  const isNextComplete = nextDescriptor.kind === "complete";
  return {
    phaseIndex: nextIndex,
    phaseStartTs: now,
    pausedRemainingMs: wasPaused && !isNextComplete ? nextDescriptor.durationMs : null,
  };
}

export function resetAnchor(
  sequence: PhaseDescriptor[],
  anchor: EngineAnchor,
  now: number,
): EngineAnchor {
  const wasPaused = anchor.pausedRemainingMs !== null;
  const fresh = initialAnchor(sequence, now);
  if (!wasPaused) return fresh;
  const firstDescriptor = sequence[0]!;
  return { ...fresh, pausedRemainingMs: firstDescriptor.durationMs };
}
