import type { JSX } from "react";

import { CardGrid } from "../card/card-grid";
import type { Card } from "../engine";
import type { TributeView } from "../use-game";
import { AskHistory } from "./ask-history";

type TributeReadoutProps = {
  tribute: TributeView;
};

const EMPTY_HAND: readonly Card[] = [];

export function TributeReadout({ tribute }: TributeReadoutProps): JSX.Element {
  const { current, role } = tribute;

  const roleLabel = role === "king" ? "King" : "Queen";
  const phaseLabel =
    current.phase === "ask"
      ? `Asking — ${current.received.length}/${current.cardsToReceive} received`
      : current.returnsRemaining === 0
        ? "Complete"
        : `Returning — ${current.returnsRemaining} card${current.returnsRemaining === 1 ? "" : "s"}`;

  return (
    <section className="border-border flex w-full flex-col gap-3 rounded-md border-2 border-dashed p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold uppercase">
            {roleLabel} tribute
          </span>

          <span className="text-muted-foreground text-xs">
            Asker: Seat {current.asker} → Target: Seat {current.target}
          </span>
        </div>

        <span className="text-xs font-medium">{phaseLabel}</span>
      </header>

      <CardGrid
        askerHand={EMPTY_HAND}
        missed={current.missed}
        received={current.received}
        interactive={false}
        onPick={noop}
        viewerIsTarget={false}
      />

      {current.received.length > 0 || current.missed.length > 0 ? (
        <AskHistory received={current.received} missed={current.missed} />
      ) : null}
    </section>
  );
}

function noop(): void {}
