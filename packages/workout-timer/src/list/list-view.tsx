import type { TimerAppNavigate, TimerKind } from "../timer-app";
import { SetsList } from "./sets-list";
import { TabBar } from "./tab-bar";
import { WorkoutsList } from "./workouts-list";

export type ListViewProps = {
  kind: TimerKind;
  onNavigate: TimerAppNavigate;
};

export function ListView({ kind, onNavigate }: ListViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
      <TabBar kind={kind} onNavigate={onNavigate} />
      {kind === "workout" ? (
        <WorkoutsList onNavigate={onNavigate} />
      ) : (
        <SetsList onNavigate={onNavigate} />
      )}
    </div>
  );
}
