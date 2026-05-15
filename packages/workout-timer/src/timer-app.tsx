import { useMemo } from "react";

import { EditorSheet, type EditorInitialValues } from "./editor-sheet";
import { ListView } from "./list-view";
import { useTimers } from "./use-timers";

export type TimerView = "list" | "edit" | "run";

export type TimerAppProps = {
  view: TimerView;
  timerId: string | null;
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function TimerApp({ view, timerId, onNavigate }: TimerAppProps) {
  const timers = useTimers();

  const initialValues = useMemo<EditorInitialValues | undefined>(() => {
    if (view !== "edit" || !timerId) return undefined;
    const found = timers.find((t) => t.id === timerId);
    if (!found) return undefined;
    return { id: found.id, name: found.name, set: found.sets[0]! };
  }, [view, timerId, timers]);

  const closeEditor = () => onNavigate({ view: "list", timerId: null });

  return (
    <>
      <ListView onNavigate={onNavigate} />
      <EditorSheet open={view === "edit"} onClose={closeEditor} initialValues={initialValues} />
      {view === "run" ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6">
          <h1 className="text-2xl font-semibold">Workout Timer</h1>
          <p className="text-sm text-muted-foreground">Runner not implemented yet.</p>
        </div>
      ) : null}
    </>
  );
}
