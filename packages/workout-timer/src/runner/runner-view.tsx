import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
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
import { Confetti } from "@bun-mono/core-ui/confetti";

import { isMuted, playFanfare, playPhaseChange, playTick, setMuted } from "../audio";
import { CountdownRing } from "../countdown-ring";
import { buildPhaseSequence } from "../engine";
import { formatMmSs } from "../format";
import type { TimerKind } from "../timer-app";
import { useTimerEngine } from "../use-timer-engine";
import { useWakeLock } from "../use-wake-lock";
import { CompleteView } from "./complete-view";
import {
  computePositional,
  pauseButtonStyle,
  pausedLabelStyle,
  pauseIconStyle,
  phaseColor,
  phaseLabel,
  phaseLabelStyle,
  remainingTimeStyle,
  rhythmGapStyle,
  rootStyle,
  roundIndicatorStyle,
  type RunnerViewProps,
  sideButtonStyle,
  sideIconStyle,
  subLineStyle,
  totalLineStyle,
} from "./phase-helpers";

export type { RunnerViewProps } from "./phase-helpers";

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
      playFanfare();
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

  const animationOptions = { duration: 200, easing: "ease-out" } as const;
  const [swapParent] = useAutoAnimate<HTMLDivElement>(animationOptions);
  const [labelParent] = useAutoAnimate<HTMLDivElement>(animationOptions);
  const [positionalParent] = useAutoAnimate<HTMLDivElement>(animationOptions);
  const [pausedParent] = useAutoAnimate<HTMLDivElement>(animationOptions);

  const totalSeconds = Math.ceil(state.totalRemainingMs / 1000);
  const isPaused = state.isPaused;
  const positional = computePositional(props, currentDescriptor);
  const completeHeading =
    props.kind === "workout"
      ? `${props.workout.name} · ${props.workout.slots.length} sets × ${props.workout.repeats} passes`
      : props.set.name;

  return (
    <div ref={swapParent} className="bg-background fixed inset-0 z-50" style={rootStyle}>
      {state.isComplete ? (
        <>
          <CompleteView
            key="complete"
            elapsedMs={elapsedMs ?? 0}
            heading={completeHeading}
            onRepeat={startWorkout}
            onDone={goHome}
          />
          <Confetti />
        </>
      ) : (
        <div key="runner" className="absolute inset-0 flex flex-col">
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

          <div
            className="flex flex-1 flex-col items-center justify-center px-4"
            style={rhythmGapStyle}
          >
            <div ref={labelParent}>
              <div
                key={state.phaseIndex}
                className="font-semibold tracking-wide uppercase"
                style={phaseLabelDynamicStyle}
              >
                {phaseLabel(currentKind)}
              </div>
            </div>

            <div
              className={
                isPaused
                  ? "relative opacity-60 transition-opacity duration-200"
                  : "relative transition-opacity duration-200"
              }
            >
              <CountdownRing
                phase={currentKind}
                phaseDurationMs={currentDescriptor.durationMs}
                remainingMs={state.remainingMs}
                phaseKey={state.phaseIndex}
              >
                <div ref={pausedParent} className="flex flex-col items-center gap-1">
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

            <div ref={positionalParent}>
              <div key={state.phaseIndex} className="flex flex-col items-center">
                <div className="text-muted-foreground" style={roundIndicatorStyle}>
                  {positional.upper}
                </div>
                {positional.lower ? (
                  <div className="text-muted-foreground" style={subLineStyle}>
                    {positional.lower}
                  </div>
                ) : null}
              </div>
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
                {isPaused ? (
                  <PlayIcon style={pauseIconStyle} />
                ) : (
                  <PauseIcon style={pauseIconStyle} />
                )}
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
      )}
    </div>
  );
}
