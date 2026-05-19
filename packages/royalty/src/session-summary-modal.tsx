import type { JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";

import type { SessionSummary } from "./storage";

type SessionSummaryModalProps = {
  summary: SessionSummary;
  onClose: () => void;
};

export function SessionSummaryModal({ summary, onClose }: SessionSummaryModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background flex w-full max-w-md flex-col gap-4 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Session summary</h2>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center justify-between">
            <span>Games played</span>
            <span className="font-semibold tabular-nums">{summary.gamesPlayed}</span>
          </li>

          <li className="flex items-center justify-between">
            <span>King</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.king}</span>
          </li>

          <li className="flex items-center justify-between">
            <span>Queen</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.queen}</span>
          </li>

          <li className="flex items-center justify-between">
            <span>3rd</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.third}</span>
          </li>

          <li className="flex items-center justify-between">
            <span>Joker</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.joker}</span>
          </li>
        </ul>

        <Button onClick={onClose} className="self-end">
          Close
        </Button>
      </div>
    </div>
  );
}
