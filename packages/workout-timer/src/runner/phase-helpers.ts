import type { PhaseDescriptor, PhaseKind } from "../engine";
import type { SavedSet, SavedWorkout } from "../schemas";
import type { TimerAppNavigate } from "../timer-app";

export type RunnerViewProps =
  | { kind: "set"; set: SavedSet; onNavigate: TimerAppNavigate }
  | {
      kind: "workout";
      workout: SavedWorkout;
      resolvedSets: SavedSet[];
      onNavigate: TimerAppNavigate;
    };

export const phaseLabel = (kind: PhaseKind): string => {
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

export const phaseColor = (kind: PhaseKind): string => {
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

export const rootStyle = {
  "--ring-size": "min(clamp(240px, 70dvmin, 1200px), 50dvh)",
  "--rhythm-gap": "clamp(12px, calc(var(--ring-size) * 0.06), 80px)",
  "--btn-size": "max(44px, calc(var(--ring-size) * 0.18))",
  "--btn-pause-size": "max(48px, calc(var(--ring-size) * 0.22))",
} as React.CSSProperties;

export const rhythmGapStyle = { gap: "var(--rhythm-gap)" } as const;

export const phaseLabelStyle = {
  fontSize: "calc(var(--ring-size) * 0.13)",
  lineHeight: 1.1,
} as const;

export const remainingTimeStyle = {
  fontSize: "calc(var(--ring-size) * 0.28)",
  lineHeight: 1,
} as const;

export const pausedLabelStyle = {
  fontSize: "max(11px, calc(var(--ring-size) * 0.045))",
  lineHeight: 1.2,
} as const;

export const roundIndicatorStyle = {
  fontSize: "calc(var(--ring-size) * 0.075)",
  lineHeight: 1.2,
  minHeight: "1.5em",
} as const;

export const subLineStyle = {
  fontSize: "calc(var(--ring-size) * 0.055)",
  lineHeight: 1.2,
} as const;

export const sideButtonStyle = { width: "var(--btn-size)", height: "var(--btn-size)" } as const;

export const sideIconStyle = {
  width: "calc(var(--btn-size) * 0.4)",
  height: "calc(var(--btn-size) * 0.4)",
} as const;

export const pauseButtonStyle = {
  width: "var(--btn-pause-size)",
  height: "var(--btn-pause-size)",
} as const;

export const pauseIconStyle = {
  width: "calc(var(--btn-pause-size) * 0.4)",
  height: "calc(var(--btn-pause-size) * 0.4)",
} as const;

export const totalLineStyle = {
  fontSize: "max(12px, calc(var(--ring-size) * 0.05))",
  lineHeight: 1.4,
} as const;

export function computePositional(
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
