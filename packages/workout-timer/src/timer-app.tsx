import { ListView } from "./list-view";

export type TimerView = "list" | "edit" | "run";

export type TimerAppProps = {
  view: TimerView;
  timerId: string | null;
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function TimerApp({ view }: TimerAppProps) {
  if (view === "list") {
    return <ListView />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Workout Timer</h1>
      <p className="text-sm text-muted-foreground">View &quot;{view}&quot; not implemented yet.</p>
    </div>
  );
}
