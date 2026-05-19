import { type JSX, useCallback } from "react";

import type { Card } from "../engine";
import { isRedSuit, rankLabel, SUIT_LABEL } from "./card-labels";

type CardButtonProps = {
  card: Card;
  selected: boolean;
  onClick: (card: Card) => void;
};

export function CardButton({ card, selected, onClick }: CardButtonProps): JSX.Element {
  const handleClick = useCallback(() => onClick(card), [onClick, card]);
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${rankLabel(card.rank)} of ${SUIT_LABEL[card.suit]}`}
      aria-pressed={selected}
      className={[
        "flex h-12 w-9 flex-col items-center justify-center rounded border text-sm font-semibold",
        selected
          ? "border-primary bg-primary/20 -translate-y-1"
          : "bg-background border-border hover:bg-accent",
        isRedSuit(card.suit) ? "text-red-600" : "text-foreground",
      ].join(" ")}
    >
      <span>{rankLabel(card.rank)}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
    </button>
  );
}
