import { type JSX, useCallback, useState } from "react";

import { cardKey, handLabel, isRedSuit, rankLabel, SUIT_LABEL } from "./card/card-labels";
import type { LogEntry, Seat } from "./engine";

type PlayLogProps = {
  log: readonly LogEntry[];
  humanSeat: Seat | null;
};

export function PlayLog({ log, humanSeat }: PlayLogProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <section className="border-border w-full rounded-md border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>
          Play log
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">({log.length})</span>
        </span>

        <span aria-hidden className="text-muted-foreground text-xs">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        log.length === 0 ? (
          <p className="text-muted-foreground px-3 pb-3 text-xs">No plays yet.</p>
        ) : (
          <ol
            reversed
            className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto px-3 pb-3 text-xs"
          >
            {log.toReversed().map((entry) => (
              <li key={entry.tick} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground w-6 tabular-nums">{entry.tick + 1}.</span>
                <span className="shrink-0">
                  Seat {entry.seat}
                  {entry.seat === humanSeat ? (
                    <span className="text-muted-foreground ml-1">(you)</span>
                  ) : null}
                </span>

                {entry.action === "pass" ? (
                  <span className="text-muted-foreground ml-auto">Pass</span>
                ) : (
                  <>
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold">
                      {handLabel(entry.hand)}
                    </span>

                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {entry.hand.cards.map((c) => (
                        <span
                          key={cardKey(c)}
                          className={[
                            "border-border bg-background inline-flex items-center rounded border px-1 text-[10px] font-semibold",
                            isRedSuit(c.suit) ? "text-red-600" : "text-foreground",
                          ].join(" ")}
                        >
                          {rankLabel(c.rank)}
                          {SUIT_LABEL[c.suit]}
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}
