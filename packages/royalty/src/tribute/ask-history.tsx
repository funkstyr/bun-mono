import type { JSX } from "react";

import { CardFace } from "../card/card-face";
import { cardKey, rankLabel, SUIT_LABEL } from "../card/card-labels";
import type { Card } from "../engine";

type AskHistoryProps = {
  received: readonly Card[];
  missed: readonly Card[];
};

export function AskHistory({ received, missed }: AskHistoryProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {received.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Hits:</span>

          <div className="flex gap-1">
            {received.map((c) => (
              <CardFace key={cardKey(c)} card={c} />
            ))}
          </div>
        </div>
      ) : null}

      {missed.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Misses:</span>
          <div className="flex gap-1">
            {missed.map((c) => (
              <span
                key={cardKey(c)}
                className="border-border bg-muted text-muted-foreground inline-flex h-8 w-6 flex-col items-center justify-center rounded border text-[10px] line-through"
              >
                <span>{rankLabel(c.rank)}</span>
                <span>{SUIT_LABEL[c.suit]}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
