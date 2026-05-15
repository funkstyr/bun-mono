import { useEffect, useMemo, useRef } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";

import { CountdownRing } from "./countdown-ring";
import type { Phase } from "./engine";
import { formatMmSs } from "./format";
import type { SavedTimer } from "./schemas";
import type { TimerView } from "./timer-app";
import { useTimerEngine } from "./use-timer-engine";
import { useWakeLock } from "./use-wake-lock";

const COMPLETE_RETURN_DELAY_MS = 1500;

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

  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engine = useTimerEngine(config, {
    onComplete: () => {
      if (completeTimeoutRef.current != null) return;
      completeTimeoutRef.current = setTimeout(() => {
        onNavigate({ view: "list", timerId: null });
      }, COMPLETE_RETURN_DELAY_MS);
    },
  });

  useWakeLock(engine.state.phase !== "idle" && engine.state.phase !== "complete");

  useEffect(() => {
    engine.controls.start();
    return () => {
      engine.controls.stop();
      if (completeTimeoutRef.current != null) {
        clearTimeout(completeTimeoutRef.current);
        completeTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { state } = engine;
  const phaseDurationMs = useMemo(() => {
    if (state.phase === "prep") return config.prepSec * 1000;
    if (state.phase === "active") return config.activeSec * 1000;
    if (state.phase === "rest") return config.restSec * 1000;
    return 0;
  }, [state.phase, config]);

  const totalSeconds = Math.ceil(state.totalRemainingMs / 1000);
  const showRoundIndicator = state.phase === "active" || state.phase === "rest";

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

        <CountdownRing
          phase={state.phase}
          phaseDurationMs={phaseDurationMs}
          remainingMs={state.remainingMs}
        >
          <div className="text-5xl font-bold tabular-nums">
            {formatMmSs(state.remainingMs / 1000)}
          </div>
        </CountdownRing>

        <div className="h-6 text-base text-muted-foreground">
          {showRoundIndicator ? `Round ${state.currentRound} of ${config.rounds}` : ""}
        </div>
      </div>

      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        Total: {formatMmSs(totalSeconds)} left
      </div>
    </div>
  );
}
