import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";

import { isMuted, playComplete, playPhaseChange, playTick, setMuted } from "./audio";
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

const rootStyle = {
  "--ring-size": "min(clamp(240px, 70dvmin, 1200px), 50dvh)",
  "--rhythm-gap": "clamp(12px, calc(var(--ring-size) * 0.06), 80px)",
  "--btn-size": "max(44px, calc(var(--ring-size) * 0.18))",
  "--btn-pause-size": "max(48px, calc(var(--ring-size) * 0.22))",
} as React.CSSProperties;

const rhythmGapStyle = { gap: "var(--rhythm-gap)" } as const;

const phaseLabelStyle = {
  fontSize: "calc(var(--ring-size) * 0.13)",
  lineHeight: 1.1,
} as const;

const remainingTimeStyle = {
  fontSize: "calc(var(--ring-size) * 0.28)",
  lineHeight: 1,
} as const;

const pausedLabelStyle = {
  fontSize: "max(11px, calc(var(--ring-size) * 0.045))",
  lineHeight: 1.2,
} as const;

const roundIndicatorStyle = {
  fontSize: "calc(var(--ring-size) * 0.075)",
  lineHeight: 1.2,
  minHeight: "1.5em",
} as const;

const sideButtonStyle = { width: "var(--btn-size)", height: "var(--btn-size)" } as const;
const sideIconStyle = {
  width: "calc(var(--btn-size) * 0.4)",
  height: "calc(var(--btn-size) * 0.4)",
} as const;
const pauseButtonStyle = {
  width: "var(--btn-pause-size)",
  height: "var(--btn-pause-size)",
} as const;
const pauseIconStyle = {
  width: "calc(var(--btn-pause-size) * 0.4)",
  height: "calc(var(--btn-pause-size) * 0.4)",
} as const;
const totalLineStyle = {
  fontSize: "max(12px, calc(var(--ring-size) * 0.05))",
  lineHeight: 1.4,
} as const;

export function RunnerView({ timer, onNavigate }: RunnerViewProps) {
  const config = useMemo(() => timer.sets[0]!, [timer]);

  const workoutStartedAtRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      setMuted(next);
      return next;
    });
  }, []);

  const engine = useTimerEngine(config, {
    onCountdownTick: () => {
      playTick();
    },
    onPhaseChange: (_prev, next) => {
      if (next === "complete") return;
      playPhaseChange();
    },
    onComplete: () => {
      playComplete();
      setElapsedMs(Date.now() - workoutStartedAtRef.current);
    },
  });

  useWakeLock(engine.state.phase !== "idle" && engine.state.phase !== "complete");

  const goHome = useCallback(() => {
    onNavigate({ view: "list", timerId: null });
  }, [onNavigate]);

  const phaseLabelDynamicStyle = useMemo(
    () => ({ ...phaseLabelStyle, color: phaseColor(engine.state.phase) }),
    [engine.state.phase],
  );

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
        onDone={goHome}
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
    <div className="bg-background fixed inset-0 z-50 flex flex-col" style={rootStyle}>
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancel workout"
          onClick={goHome}
        >
          <XIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          aria-pressed={muted}
          onClick={toggleMuted}
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4" style={rhythmGapStyle}>
        <div className="font-semibold tracking-wide uppercase" style={phaseLabelDynamicStyle}>
          {phaseLabel(state.phase)}
        </div>

        <div className={isPaused ? "relative opacity-60" : "relative"}>
          <CountdownRing
            phase={state.phase}
            phaseDurationMs={phaseDurationMs}
            remainingMs={state.remainingMs}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="font-bold tabular-nums" style={remainingTimeStyle}>
                {formatMmSs(state.remainingMs / 1000)}
              </div>
              {isPaused ? (
                <div
                  className="text-muted-foreground font-semibold tracking-widest uppercase"
                  style={pausedLabelStyle}
                >
                  Paused
                </div>
              ) : null}
            </div>
          </CountdownRing>
        </div>

        <div className="text-muted-foreground" style={roundIndicatorStyle}>
          {showRoundIndicator ? `Round ${state.currentRound} of ${config.rounds}` : ""}
        </div>

        <div className="flex items-center" style={rhythmGapStyle}>
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label="Reset workout"
            onClick={engine.controls.reset}
            style={sideButtonStyle}
          >
            <RotateCcwIcon style={sideIconStyle} />
          </Button>
          <Button
            type="button"
            size="lg"
            className="rounded-full"
            aria-label={isPaused ? "Resume workout" : "Pause workout"}
            onClick={isPaused ? engine.controls.resume : engine.controls.pause}
            style={pauseButtonStyle}
          >
            {isPaused ? <PlayIcon style={pauseIconStyle} /> : <PauseIcon style={pauseIconStyle} />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label="Skip phase"
            onClick={engine.controls.skip}
            style={sideButtonStyle}
          >
            <SkipForwardIcon style={sideIconStyle} />
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground px-4 py-6 text-center" style={totalLineStyle}>
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
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="text-5xl font-bold tracking-wide">DONE</div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{formatMmSs(elapsedSeconds)}</div>
            <div className="text-muted-foreground text-xs tracking-widest uppercase">
              Total time
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{rounds}</div>
            <div className="text-muted-foreground text-xs tracking-widest uppercase">
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
