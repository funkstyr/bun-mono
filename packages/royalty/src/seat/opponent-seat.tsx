import type { JSX } from "react";

import type { Seat, Title } from "../engine";
import { TITLE_LABEL } from "./seat-utils";

type OpponentSeatProps = {
  seat: Seat;
  cardCount: number;
  active: boolean;
  finished: boolean;
  passing: boolean;
  titles: Record<Seat, Title> | null;
};

export function OpponentSeat({
  seat,
  cardCount,
  active,
  finished,
  passing,
  titles,
}: OpponentSeatProps): JSX.Element {
  const title = titles?.[seat] ?? null;
  return (
    <section
      className={[
        "relative flex flex-col items-center gap-1 rounded-md border p-3",
        active ? "border-primary bg-primary/5" : "border-border",
        finished ? "opacity-60" : "",
      ].join(" ")}
    >
      <header className="flex w-full items-center justify-between">
        <span className="text-xs font-medium">
          Seat {seat}
          {title ? <span className="text-muted-foreground ml-1">{TITLE_LABEL[title]}</span> : null}
          {finished && !title ? <span className="text-muted-foreground ml-1">finished</span> : null}
        </span>

        {active ? (
          <span className="text-primary text-[10px] font-semibold uppercase">Turn</span>
        ) : null}
      </header>
      <div className="flex items-center gap-2">
        <div className="bg-muted border-border h-10 w-7 rounded border" aria-hidden="true" />
        <span className="text-sm font-semibold tabular-nums">{cardCount}</span>
      </div>

      {passing ? (
        <span className="bg-foreground text-background absolute -top-2 right-2 rounded px-2 py-0.5 text-[10px] font-semibold uppercase shadow">
          Pass
        </span>
      ) : null}
    </section>
  );
}
