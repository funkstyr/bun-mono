import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  advancePhase,
  computeState,
  initialAnchor,
  pauseAnchor,
  resetAnchor,
  resumeAnchor,
  skipAnchor,
  type EngineAnchor,
  type EngineState,
  type PhaseDescriptor,
} from "./engine";

export type TimerEngineCallbacks = {
  onPhaseChange?: (prev: PhaseDescriptor, next: PhaseDescriptor) => void;
  onCountdownTick?: (secondsLeft: number) => void;
  onComplete?: () => void;
};

export type TimerEngineControls = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  stop: () => void;
};

export type TimerEngine = {
  state: EngineState;
  controls: TimerEngineControls;
};

function totalDuration(sequence: PhaseDescriptor[]): number {
  let total = 0;
  for (const d of sequence) total += d.durationMs;
  return total;
}

function preStartState(sequence: PhaseDescriptor[]): EngineState {
  const first = sequence[0];
  return {
    phaseIndex: 0,
    remainingMs: first?.durationMs ?? 0,
    totalRemainingMs: totalDuration(sequence),
    isPaused: false,
    isComplete: first?.kind === "complete",
  };
}

export function useTimerEngine(
  sequence: PhaseDescriptor[],
  callbacks: TimerEngineCallbacks = {},
): TimerEngine {
  const anchorRef = useRef<EngineAnchor | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const lastCountdownSecondRef = useRef<number>(-1);

  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTickInterval = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    let anchor = anchorRef.current;
    if (!anchor) {
      forceTick();
      return;
    }
    if (sequence[anchor.phaseIndex]!.kind === "complete") {
      forceTick();
      return;
    }
    const now = Date.now();
    let result = computeState(sequence, anchor, now);

    let safety = 32;
    while (result.phaseEnded && safety-- > 0) {
      const prevDescriptor = sequence[anchor.phaseIndex]!;
      anchor = advancePhase(sequence, anchor, now);
      anchorRef.current = anchor;
      const nextDescriptor = sequence[anchor.phaseIndex]!;
      callbacksRef.current.onPhaseChange?.(prevDescriptor, nextDescriptor);
      lastCountdownSecondRef.current = -1;
      if (nextDescriptor.kind === "complete") {
        callbacksRef.current.onComplete?.();
        clearTickInterval();
        break;
      }
      result = computeState(sequence, anchor, now);
    }

    const currentDescriptor = sequence[anchor.phaseIndex]!;
    if (currentDescriptor.kind !== "complete") {
      const secondsLeft = Math.ceil(result.state.remainingMs / 1000);
      if (secondsLeft >= 1 && secondsLeft <= 3 && secondsLeft !== lastCountdownSecondRef.current) {
        lastCountdownSecondRef.current = secondsLeft;
        callbacksRef.current.onCountdownTick?.(secondsLeft);
      }
    }

    forceTick();
  }, [sequence, clearTickInterval]);

  const ensureInterval = useCallback(() => {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(tick, 100);
  }, [tick]);

  const start = useCallback(() => {
    const now = Date.now();
    anchorRef.current = initialAnchor(sequence, now);
    lastCountdownSecondRef.current = -1;
    ensureInterval();
    forceTick();
  }, [sequence, ensureInterval]);

  const stop = useCallback(() => {
    clearTickInterval();
    anchorRef.current = null;
    forceTick();
  }, [clearTickInterval]);

  const pause = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    if (a.pausedRemainingMs !== null) return;
    if (sequence[a.phaseIndex]!.kind === "complete") return;
    anchorRef.current = pauseAnchor(sequence, a, Date.now());
    clearTickInterval();
    forceTick();
  }, [sequence, clearTickInterval]);

  const resume = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    if (a.pausedRemainingMs === null) return;
    if (sequence[a.phaseIndex]!.kind === "complete") return;
    anchorRef.current = resumeAnchor(sequence, a, Date.now());
    ensureInterval();
    forceTick();
  }, [sequence, ensureInterval]);

  const skip = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    if (sequence[a.phaseIndex]!.kind === "complete") return;
    const now = Date.now();
    const prevDescriptor = sequence[a.phaseIndex]!;
    const next = skipAnchor(sequence, a, now);
    anchorRef.current = next;
    lastCountdownSecondRef.current = -1;
    const nextDescriptor = sequence[next.phaseIndex]!;
    callbacksRef.current.onPhaseChange?.(prevDescriptor, nextDescriptor);
    if (nextDescriptor.kind === "complete") {
      callbacksRef.current.onComplete?.();
      clearTickInterval();
    }
    forceTick();
  }, [sequence, clearTickInterval]);

  const reset = useCallback(() => {
    const a = anchorRef.current;
    if (!a) {
      start();
      return;
    }
    const wasPaused = a.pausedRemainingMs !== null;
    anchorRef.current = resetAnchor(sequence, a, Date.now());
    lastCountdownSecondRef.current = -1;
    if (wasPaused) {
      clearTickInterval();
    } else {
      ensureInterval();
    }
    forceTick();
  }, [sequence, clearTickInterval, ensureInterval, start]);

  useEffect(() => {
    return () => {
      clearTickInterval();
    };
  }, [clearTickInterval]);

  const state = anchorRef.current
    ? computeState(sequence, anchorRef.current, Date.now()).state
    : preStartState(sequence);

  return {
    state,
    controls: {
      start,
      pause,
      resume,
      skip,
      reset,
      stop,
    },
  };
}
