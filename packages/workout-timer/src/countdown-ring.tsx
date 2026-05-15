import { type ReactNode } from "react";

import type { Phase } from "./engine";

const SIZE = 280;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const phaseStroke: Record<Exclude<Phase, "idle" | "complete">, string> = {
  prep: "var(--timer-prep)",
  active: "var(--timer-active)",
  rest: "var(--timer-rest)",
};

export type CountdownRingProps = {
  phase: Phase;
  phaseDurationMs: number;
  remainingMs: number;
  children?: ReactNode;
};

export function CountdownRing({
  phase,
  phaseDurationMs,
  remainingMs,
  children,
}: CountdownRingProps) {
  const elapsed = Math.max(0, phaseDurationMs - remainingMs);
  const progress = phaseDurationMs > 0 ? Math.min(1, elapsed / phaseDurationMs) : 0;
  const dashOffset = CIRCUMFERENCE * progress;
  const stroke =
    phase === "prep" || phase === "active" || phase === "rest"
      ? phaseStroke[phase]
      : "var(--muted-foreground)";

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${phase} countdown ring`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
