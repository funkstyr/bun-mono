import { Button } from "@bun-mono/core-ui/button";

import { formatMmSs } from "../format";

type CompleteViewProps = {
  elapsedMs: number;
  heading: string;
  onRepeat: () => void;
  onDone: () => void;
};

export function CompleteView({ elapsedMs, heading, onRepeat, onDone }: CompleteViewProps) {
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="text-5xl font-bold tracking-wide">DONE</div>

        <div className="flex flex-col items-center gap-3">
          <div className="text-xl font-semibold">{heading}</div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-semibold tabular-nums">{formatMmSs(elapsedSeconds)}</div>
            <div className="text-muted-foreground text-xs tracking-widest uppercase">
              Total time
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 self-stretch sm:flex-row sm:justify-center">
          <Button type="button" size="lg" onClick={onRepeat} className="sm:min-w-40">
            Repeat
          </Button>

          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={onDone}
            className="sm:min-w-40"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
