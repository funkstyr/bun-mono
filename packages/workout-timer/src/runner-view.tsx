import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon, XIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";

import { CountdownRing } from "./countdown-ring";
import type { Phase } from "./engine";
import { formatMmSs } from "./format";
import type { SavedTimer } from "./schemas";
import type { TimerView } from "./timer-app";
import { useTimerEngine } from "./use-timer-engine";
import { useTimers } from "./use-timers";
import { useWakeLock } from "./use-wake-lock";

export type RunnerHostProps = {
  timerId: string;
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function RunnerHost({ timerId, onNavigate }: RunnerHostProps) {
  const timers = useTimers();
  const [snapshot] = useState<SavedTimer | null>(
    () => timers.find((t) => t.id === timerId) ?? null,
  );

  useEffect(() => {
    if (!snapshot) onNavigate({ view: "list", timerId: null });
  }, [snapshot, onNavigate]);

  if (!snapshot) return null;
  return <RunnerView timer={snapshot} onNavigate={onNavigate} />;
}

export type RunnerViewProps = {
  timer: SavedTimer;
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

const phaseLabel = (phase: Phase): string => {
  switch (phase) {
    case "prep":
      return "GET READY";
    case "active":
      return "ACTIVE";
    case "rest":
      return "REST";
    case "complete":
      return "DONE";
    default:
      return "";
  }
};

const phaseColor = (phase: Phase): string => {
  switch (phase) {
    case "prep":
      return "var(--timer-prep)";
    case "active":
      return "var(--timer-active)";
    case "rest":
      return "var(--timer-rest)";
    default:
      return "var(--foreground)";
  }
};

export function RunnerView({ timer, onNavigate }: RunnerViewProps) {
  const config = useMemo(() => timer.sets[0]!, [timer]);

  const workoutStartedAtRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const engine = useTimerEngine(config, {
    onComplete: () => {
      setElapsedMs(Date.now() - workoutStartedAtRef.current);
    },
  });

  useWakeLock(engine.state.phase !== "idle" && engine.state.phase !== "complete");

  const startWorkout = useCallback(() => {
    workoutStartedAtRef.current = Date.now();
    setElapsedMs(null);
    engine.controls.start();
  }, [engine.controls]);

  useEffect(() => {
    startWorkout();
    return () => {
      engine.controls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { state } = engine;

  if (state.phase === "complete") {
    return (
      <CompleteView
        elapsedMs={elapsedMs ?? 0}
        rounds={config.rounds}
        onRepeat={startWorkout}
        onDone={() => onNavigate({ view: "list", timerId: null })}
      />
    );
  }

  const phaseDurationMs =
    state.phase === "prep"
      ? config.prepSec * 1000
      : state.phase === "active"
        ? config.activeSec * 1000
        : state.phase === "rest"
          ? config.restSec * 1000
          : 0;

  const totalSeconds = Math.ceil(state.totalRemainingMs / 1000);
  const showRoundIndicator = state.phase === "active" || state.phase === "rest";
  const isPaused = state.isPaused;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancel workout"
          onClick={() => onNavigate({ view: "list", timerId: null })}
        >
          <XIcon />
        </Button>
        <div />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <div
          className="text-3xl font-semibold tracking-wide uppercase"
          style={{ color: phaseColor(state.phase) }}
        >
          {phaseLabel(state.phase)}
        </div>

        <div className={isPaused ? "relative opacity-60" : "relative"}>
          <CountdownRing
            phase={state.phase}
            phaseDurationMs={phaseDurationMs}
            remainingMs={state.remainingMs}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="text-5xl font-bold tabular-nums">
                {formatMmSs(state.remainingMs / 1000)}
              </div>
              {isPaused ? (
                <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Paused
                </div>
              ) : null}
            </div>
          </CountdownRing>
        </div>

        <div className="h-6 text-base text-muted-foreground">
          {showRoundIndicator ? `Round ${state.currentRound} of ${config.rounds}` : ""}
        </div>

        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label="Reset workout"
            onClick={engine.controls.reset}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-16 w-16 rounded-full"
            aria-label={isPaused ? "Resume workout" : "Pause workout"}
            onClick={isPaused ? engine.controls.resume : engine.controls.pause}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label="Skip phase"
            onClick={engine.controls.skip}
          >
            <SkipForwardIcon />
          </Button>
        </div>
      </div>

      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        Total: {formatMmSs(totalSeconds)} left
      </div>
    </div>
  );
}

type CompleteViewProps = {
  elapsedMs: number;
  rounds: number;
  onRepeat: () => void;
  onDone: () => void;
};

function CompleteView({ elapsedMs, rounds, onRepeat, onDone }: CompleteViewProps) {
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="text-5xl font-bold tracking-wide">DONE</div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{formatMmSs(elapsedSeconds)}</div>
            <div className="text-xs tracking-widest text-muted-foreground uppercase">
              Total time
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{rounds}</div>
            <div className="text-xs tracking-widest text-muted-foreground uppercase">
              Rounds completed
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-3 self-stretch sm:flex-row sm:justify-center">
          <Button type="button" size="lg" onClick={onRepeat} className="sm:min-w-40">
            Repeat
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={onDone}
            className="sm:min-w-40"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
