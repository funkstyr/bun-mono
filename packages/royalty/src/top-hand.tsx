import type { JSX } from "react";

import { CardFace } from "./card/card-face";
import { cardKey, handLabel } from "./card/card-labels";
import type { Hand, Seat } from "./engine";

type TopHandProps = {
  top: Hand | null;
  lastPlayer: Seat | null;
};

export function TopHand({ top, lastPlayer }: TopHandProps): JSX.Element {
  return (
    <div className="border-border flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-3">
      {top ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Top — Seat {lastPlayer}</span>

            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold">
              {handLabel(top)}
            </span>
          </div>

          <div className="flex gap-1">
            {top.cards.map((c) => (
              <CardFace key={cardKey(c)} card={c} />
            ))}
          </div>
        </>
      ) : (
        <span className="text-muted-foreground text-sm">No play yet</span>
      )}
    </div>
  );
}
