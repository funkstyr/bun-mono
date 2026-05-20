import { type JSX, useCallback } from "react";

import type { Card } from "../engine";
import { isRedSuit, rankLabel, SUIT_LABEL } from "./card-labels";

type CardButtonProps = {
  card: Card;
  selected: boolean;
  disabled?: boolean;
  onClick: (card: Card) => void;
};

export function CardButton({
  card,
  selected,
  disabled = false,
  onClick,
}: CardButtonProps): JSX.Element {
  const handleClick = useCallback(() => onClick(card), [onClick, card]);
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={`${rankLabel(card.rank)} of ${SUIT_LABEL[card.suit]}`}
      aria-pressed={selected}
      className={[
        "flex h-12 w-9 flex-col items-center justify-center rounded border text-sm font-semibold transition",
        selected
          ? "border-primary bg-primary/20 -translate-y-1"
          : "bg-background border-border hover:bg-accent",
        disabled && !selected ? "opacity-40" : "",
        isRedSuit(card.suit) ? "text-red-600" : "text-foreground",
      ].join(" ")}
    >
      <span>{rankLabel(card.rank)}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
    </button>
  );
}
