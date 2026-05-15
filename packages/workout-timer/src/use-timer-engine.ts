import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  advancePhase,
  computeState,
  initialAnchor,
  type Anchor,
  type EngineState,
  type Phase,
} from "./engine";
import type { SetConfig } from "./schemas";

export type TimerEngineCallbacks = {
  onPhaseChange?: (prev: Phase, next: Phase) => void;
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

const idleAnchor = (): Anchor => ({
  phase: "idle",
  currentRound: 0,
  phaseStartTs: 0,
  phaseDurationMs: 0,
  pausedRemainingMs: null,
});

export function useTimerEngine(
  config: SetConfig,
  callbacks: TimerEngineCallbacks = {},
): TimerEngine {
  const anchorRef = useRef<Anchor>(idleAnchor());
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const lastCountdownPhaseStartRef = useRef<number>(-1);
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
    if (anchor.phase === "idle" || anchor.phase === "complete") {
      forceTick();
      return;
    }
    const now = Date.now();
    let result = computeState(config, anchor, now);

    let safety = 32;
    while (result.phaseEnded && safety-- > 0) {
      const prevPhase = anchor.phase;
      anchor = advancePhase(config, anchor, now);
      anchorRef.current = anchor;
      callbacksRef.current.onPhaseChange?.(prevPhase, anchor.phase);
      lastCountdownPhaseStartRef.current = anchor.phaseStartTs;
      lastCountdownSecondRef.current = -1;
      if (anchor.phase === "complete") {
        callbacksRef.current.onComplete?.();
        break;
      }
      result = computeState(config, anchor, now);
    }

    const phase = result.state.phase;
    if (phase === "prep" || phase === "active" || phase === "rest") {
      const secondsLeft = Math.ceil(result.state.remainingMs / 1000);
      if (secondsLeft >= 1 && secondsLeft <= 3 && secondsLeft !== lastCountdownSecondRef.current) {
        lastCountdownSecondRef.current = secondsLeft;
        callbacksRef.current.onCountdownTick?.(secondsLeft);
      }
    }

    forceTick();
  }, [config]);

  const ensureInterval = useCallback(() => {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(tick, 100);
  }, [tick]);

  const start = useCallback(() => {
    const now = Date.now();
    anchorRef.current = initialAnchor(config, now);
    lastCountdownPhaseStartRef.current = anchorRef.current.phaseStartTs;
    lastCountdownSecondRef.current = -1;
    ensureInterval();
    forceTick();
  }, [config, ensureInterval]);

  const stop = useCallback(() => {
    clearTickInterval();
    anchorRef.current = idleAnchor();
    forceTick();
  }, [clearTickInterval]);

  const noop = useCallback(() => {}, []);

  useEffect(() => {
    return () => {
      clearTickInterval();
    };
  }, [clearTickInterval]);

  const result = computeState(config, anchorRef.current, Date.now());
  return {
    state: result.state,
    controls: {
      start,
      pause: noop,
      resume: noop,
      skip: noop,
      reset: noop,
      stop,
    },
  };
}
