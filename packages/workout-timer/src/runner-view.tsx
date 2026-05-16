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
import { toast } from "@bun-mono/core-ui/sonner";

import { isMuted, playComplete, playPhaseChange, playTick, setMuted } from "./audio";
import { CountdownRing } from "./countdown-ring";
import { buildPhaseSequence, type PhaseDescriptor, type PhaseKind } from "./engine";
import { formatMmSs } from "./format";
import type { SavedSet, SavedWorkout } from "./schemas";
import type { TimerAppNavigate, TimerKind } from "./timer-app";
import { useTimerEngine } from "./use-timer-engine";
import { useTimers, useWorkouts } from "./use-timers";
import { useWakeLock } from "./use-wake-lock";

export type RunnerHostProps = {
  setId: string;
  onNavigate: TimerAppNavigate;
};

export function RunnerHost({ setId, onNavigate }: RunnerHostProps) {
  const sets = useTimers();
  const [snapshot] = useState<SavedSet | null>(() => sets.find((s) => s.id === setId) ?? null);

  useEffect(() => {
    if (!snapshot) onNavigate({ view: "list", kind: "set", id: null });
  }, [snapshot, onNavigate]);

  if (!snapshot) return null;
  return <RunnerView kind="set" set={snapshot} onNavigate={onNavigate} />;
}

export type WorkoutRunnerHostProps = {
  workoutId: string;
  onNavigate: TimerAppNavigate;
};

type WorkoutSnapshot = { workout: SavedWorkout; resolvedSets: SavedSet[] };

export function WorkoutRunnerHost({ workoutId, onNavigate }: WorkoutRunnerHostProps) {
  const workouts = useWorkouts();
  const sets = useTimers();
  const [snapshot] = useState<WorkoutSnapshot | null>(() => {
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout) return null;
    const resolved: SavedSet[] = [];
    for (const slot of workout.slots) {
      const found = sets.find((s) => s.id === slot.setId);
      if (!found) return null;
      resolved.push(found);
    }
    if (resolved.length === 0) return null;
    return { workout, resolvedSets: resolved };
  });
  const failedRef = useRef(false);

  useEffect(() => {
    if (snapshot) return;
    if (failedRef.current) return;
    failedRef.current = true;
    toast.error("Couldn't start workout — a referenced set is missing.");
    onNavigate({ view: "list", kind: "workout", id: null });
  }, [snapshot, onNavigate]);

  if (!snapshot) return null;
  return (
    <RunnerView
      kind="workout"
      workout={snapshot.workout}
      resolvedSets={snapshot.resolvedSets}
      onNavigate={onNavigate}
    />
  );
}

export type RunnerViewProps =
  | { kind: "set"; set: SavedSet; onNavigate: TimerAppNavigate }
  | {
      kind: "workout";
      workout: SavedWorkout;
      resolvedSets: SavedSet[];
      onNavigate: TimerAppNavigate;
    };

const phaseLabel = (kind: PhaseKind): string => {
  switch (kind) {
    case "prep":
      return "GET READY";
    case "active":
      return "ACTIVE";
    case "rest":
      return "REST";
    case "complete":
      return "DONE";
  }
};

const phaseColor = (kind: PhaseKind): string => {
  switch (kind) {
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

const subLineStyle = {
  fontSize: "calc(var(--ring-size) * 0.055)",
  lineHeight: 1.2,
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

export function RunnerView(props: RunnerViewProps) {
  const { kind, onNavigate } = props;
  const sourceKind: TimerKind = kind;
  const sequence = useMemo(
    () =>
      props.kind === "set"
        ? buildPhaseSequence({ kind: "set", set: props.set })
        : buildPhaseSequence({
            kind: "workout",
            workout: props.workout,
            sets: props.resolvedSets,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.kind, props.kind === "set" ? props.set : props.workout],
  );

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

  const engine = useTimerEngine(sequence, {
    onCountdownTick: () => {
      playTick();
    },
    onPhaseChange: (_prev, next) => {
      if (next.kind === "complete") return;
      playPhaseChange();
    },
    onComplete: () => {
      playComplete();
      setElapsedMs(Date.now() - workoutStartedAtRef.current);
    },
  });

  useWakeLock(!engine.state.isComplete);

  const goHome = useCallback(() => {
    onNavigate({ view: "list", kind: sourceKind, id: null });
  }, [onNavigate, sourceKind]);

  const currentDescriptor = sequence[engine.state.phaseIndex]!;
  const currentKind = currentDescriptor.kind;

  const phaseLabelDynamicStyle = useMemo(
    () => ({ ...phaseLabelStyle, color: phaseColor(currentKind) }),
    [currentKind],
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

  if (state.isComplete) {
    return props.kind === "workout" ? (
      <CompleteView
        elapsedMs={elapsedMs ?? 0}
        heading={`${props.workout.name} · ${props.workout.slots.length} sets × ${props.workout.repeats} passes`}
        onRepeat={startWorkout}
        onDone={goHome}
      />
    ) : (
      <CompleteView
        elapsedMs={elapsedMs ?? 0}
        heading={props.set.name}
        onRepeat={startWorkout}
        onDone={goHome}
      />
    );
  }

  const totalSeconds = Math.ceil(state.totalRemainingMs / 1000);
  const isPaused = state.isPaused;

  const positional = computePositional(props, currentDescriptor);

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
          {phaseLabel(currentKind)}
        </div>

        <div className={isPaused ? "relative opacity-60" : "relative"}>
          <CountdownRing
            phase={currentKind}
            phaseDurationMs={currentDescriptor.durationMs}
            remainingMs={state.remainingMs}
            phaseKey={state.phaseIndex}
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

        <div className="flex flex-col items-center">
          <div className="text-muted-foreground" style={roundIndicatorStyle}>
            {positional.upper}
          </div>
          {positional.lower ? (
            <div className="text-muted-foreground" style={subLineStyle}>
              {positional.lower}
            </div>
          ) : null}
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
  heading: string;
  onRepeat: () => void;
  onDone: () => void;
};

function CompleteView({ elapsedMs, heading, onRepeat, onDone }: CompleteViewProps) {
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="text-5xl font-bold tracking-wide">DONE</div>
        <div className="flex flex-col items-center gap-3">
          <div className="text-xl font-semibold">{heading}</div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{formatMmSs(elapsedSeconds)}</div>
            <div className="text-muted-foreground text-xs tracking-widest uppercase">
              Total time
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

function computePositional(
  props: RunnerViewProps,
  d: PhaseDescriptor,
): { upper: string; lower: string } {
  if (props.kind === "set") {
    if (d.kind === "active" || d.kind === "rest") {
      return { upper: `Round ${d.round} of ${props.set.config.rounds}`, lower: "" };
    }
    return { upper: "", lower: "" };
  }
  const { workout } = props;
  const M = workout.slots.length;
  const R = workout.repeats;
  if (d.kind === "active" || d.kind === "rest") {
    const setIdx = d.setIdx ?? 0;
    const repeatIdx = d.repeatIdx ?? 0;
    const set = props.resolvedSets[setIdx];
    const totalRounds = set?.config.rounds ?? 0;
    return {
      upper: `${d.setName ?? ""} · Round ${d.round} of ${totalRounds}`,
      lower: `Set ${setIdx + 1} of ${M} · Pass ${repeatIdx + 1} of ${R}`,
    };
  }
  if (d.kind === "prep") {
    const setIdx = d.setIdx ?? 0;
    const repeatIdx = d.repeatIdx ?? 0;
    const isWorkoutStart = setIdx === 0 && repeatIdx === 0;
    return {
      upper: `Up next: ${d.upNextSetName ?? ""}`,
      lower: isWorkoutStart
        ? `Pass 1 of ${R}`
        : `Set ${setIdx + 1} of ${M} · Pass ${repeatIdx + 1} of ${R}`,
    };
  }
  return { upper: "", lower: "" };
}
