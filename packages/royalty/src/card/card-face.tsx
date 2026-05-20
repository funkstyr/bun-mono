import type { JSX } from "react";

import type { Card } from "../engine";
import { isRedSuit, rankLabel, SUIT_LABEL } from "./card-labels";

type CardFaceProps = {
  card: Card;
  compact?: boolean;
};

export function CardFace({ card, compact = false }: CardFaceProps): JSX.Element {
  const color = isRedSuit(card.suit) ? "text-red-600" : "text-foreground";
  if (compact) {
    return (
      <span
        className={[
          "border-border bg-background inline-flex items-center gap-1 rounded border px-2 py-1 text-sm font-semibold leading-none",
          color,
        ].join(" ")}
      >
        <span>{rankLabel(card.rank)}</span>
        <span>{SUIT_LABEL[card.suit]}</span>
      </span>
    );
  }
  return (
    <span
      className={[
        "border-border bg-background inline-flex h-14 w-10 flex-col items-center justify-center rounded border text-base font-semibold",
        color,
      ].join(" ")}
    >
      <span>{rankLabel(card.rank)}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
    </span>
  );
}
