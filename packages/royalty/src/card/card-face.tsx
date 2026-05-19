import type { JSX } from "react";

import type { Card } from "../engine";
import { isRedSuit, rankLabel, SUIT_LABEL } from "./card-labels";

export function CardFace({ card }: { card: Card }): JSX.Element {
  return (
    <span
      className={[
        "border-border bg-background inline-flex h-14 w-10 flex-col items-center justify-center rounded border text-base font-semibold",
        isRedSuit(card.suit) ? "text-red-600" : "text-foreground",
      ].join(" ")}
    >
      <span>{rankLabel(card.rank)}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
    </span>
  );
}
