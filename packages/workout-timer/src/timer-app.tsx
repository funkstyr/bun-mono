import { useCallback, useMemo } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { EditorSheet, type EditorInitialValues } from "./editor-sheet";
import { ListView } from "./list-view";
import { RunnerHost } from "./runner-view";
import { useTimers } from "./use-timers";

export type TimerView = "list" | "edit" | "run";
export type TimerKind = "set" | "workout";

export type TimerAppNavigate = (next: {
  view: TimerView;
  kind: TimerKind;
  id: string | null;
}) => void;

export type TimerAppProps = {
  view: TimerView;
  kind: TimerKind;
  id: string | null;
  onNavigate: TimerAppNavigate;
};

export function TimerApp({ view, kind, id, onNavigate }: TimerAppProps) {
  const sets = useTimers();

  const initialValues = useMemo<EditorInitialValues | undefined>(() => {
    if (view !== "edit" || kind !== "set" || !id) return undefined;
    const found = sets.find((s) => s.id === id);
    if (!found) return undefined;
    return { id: found.id, name: found.name, config: found.config };
  }, [view, kind, id, sets]);

  const closeSetEditor = useCallback(
    () => onNavigate({ view: "list", kind: "set", id: null }),
    [onNavigate],
  );

  const closeWorkoutEditor = useCallback(
    () => onNavigate({ view: "list", kind: "workout", id: null }),
    [onNavigate],
  );

  return (
    <>
      {view === "list" ? <ListView kind={kind} onNavigate={onNavigate} /> : null}
      {view === "edit" && kind === "set" ? (
        <EditorSheet open onClose={closeSetEditor} initialValues={initialValues} />
      ) : null}
      {view === "edit" && kind === "workout" ? (
        <WorkoutEditorPlaceholder onClose={closeWorkoutEditor} />
      ) : null}
      {view === "run" && kind === "set" && id ? (
        <RunnerHost key={id} setId={id} onNavigate={onNavigate} />
      ) : null}
    </>
  );
}

function WorkoutEditorPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 text-center">
      <p className="text-muted-foreground">Workout editor coming next.</p>
      <Button variant="outline" onClick={onClose}>
        Back
      </Button>
    </div>
  );
}
