import type { JSX } from "react";

import { CardGrid } from "../card/card-grid";
import type { Card, Seat } from "../engine";
import type { TributeView } from "../use-game";
import { AskHistory } from "./ask-history";
import { ReturnSelector } from "./return-selector";

type TributePanelProps = {
  tribute: TributeView;
  humanSeat: Seat;
  onAsk: (card: Card) => void;
  onReturn: (cards: readonly Card[]) => void;
};

export function TributePanel({
  tribute,
  humanSeat,
  onAsk,
  onReturn,
}: TributePanelProps): JSX.Element {
  const { current, role, askerHand, targetHand } = tribute;
  const isHumanAsker = current.asker === humanSeat;
  const isHumanTarget = current.target === humanSeat;

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
            Asker: Seat {current.asker}
            {current.asker === humanSeat ? " (you)" : ""} → Target: Seat {current.target}
            {current.target === humanSeat ? " (you)" : ""}
          </span>
        </div>

        <span className="text-xs font-medium">{phaseLabel}</span>
      </header>

      <CardGrid
        askerHand={isHumanTarget ? targetHand : askerHand}
        missed={current.missed}
        received={current.received}
        interactive={isHumanAsker && current.phase === "ask"}
        onPick={onAsk}
        viewerIsTarget={isHumanTarget}
      />

      {current.phase === "return" && current.returnsRemaining > 0 && isHumanAsker ? (
        <ReturnSelector
          hand={askerHand}
          returnsRemaining={current.returnsRemaining}
          onReturn={onReturn}
        />
      ) : null}

      {current.received.length > 0 || current.missed.length > 0 ? (
        <AskHistory received={current.received} missed={current.missed} />
      ) : null}
    </section>
  );
}
