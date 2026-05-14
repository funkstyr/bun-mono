export type TimerView = "list" | "edit" | "run";

export type TimerAppProps = {
  view: TimerView;
  timerId: string | null;
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function TimerApp(_props: TimerAppProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Workout Timer</h1>
      <div className="flex items-center gap-3">
        <PhaseSwatch label="Prep" varName="--timer-prep" />
        <PhaseSwatch label="Work" varName="--timer-work" />
        <PhaseSwatch label="Rest" varName="--timer-rest" />
      </div>
    </div>
  );
}

function PhaseSwatch({ label, varName }: { label: string; varName: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-6 w-6 rounded-full border border-border"
        style={{ background: `var(${varName})` }}
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
