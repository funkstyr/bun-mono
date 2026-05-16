import { useCallback, useMemo } from "react";

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

  const closeEditor = useCallback(
    () => onNavigate({ view: "list", kind: "set", id: null }),
    [onNavigate],
  );

  return (
    <>
      <ListView onNavigate={onNavigate} />
      <EditorSheet
        open={view === "edit" && kind === "set"}
        onClose={closeEditor}
        initialValues={initialValues}
      />
      {view === "run" && kind === "set" && id ? (
        <RunnerHost key={id} setId={id} onNavigate={onNavigate} />
      ) : null}
    </>
  );
}
