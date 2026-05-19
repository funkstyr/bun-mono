import { type JSX, useCallback, useMemo } from "react";

import { type Card, type Rank, RANK_ORDER, SUIT_ORDER } from "../engine";
import { cardKey, isRedSuit, rankLabel, SUIT_LABEL } from "./card-labels";

type CardGridProps = {
  askerHand: readonly Card[];
  missed: readonly Card[];
  received: readonly Card[];
  interactive: boolean;
  onPick: (card: Card) => void;
  viewerIsTarget: boolean;
};

const GRID_STYLE = {
  gridTemplateColumns: `repeat(${RANK_ORDER.length}, minmax(0, 1fr))`,
};

const ALL_CARDS: readonly Card[] = SUIT_ORDER.flatMap((suit) =>
  RANK_ORDER.map((rank) => ({ rank: rank as Rank, suit })),
);

export function CardGrid({
  askerHand,
  missed,
  received,
  interactive,
  onPick,
  viewerIsTarget,
}: CardGridProps): JSX.Element {
  const dimmedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of askerHand) set.add(cardKey(c));
    for (const c of missed) set.add(cardKey(c));
    for (const c of received) set.add(cardKey(c));
    return set;
  }, [askerHand, missed, received]);

  const receivedKeys = useMemo(() => new Set(received.map(cardKey)), [received]);
  const missedKeys = useMemo(() => new Set(missed.map(cardKey)), [missed]);

  return (
    <div
      className="grid w-full gap-1"
      style={GRID_STYLE}
      role="grid"
      aria-label={viewerIsTarget ? "Asker's pick grid (read-only)" : "Tribute card grid"}
    >
      {ALL_CARDS.map((c) => {
        const k = cardKey(c);
        const isReceived = receivedKeys.has(k);
        const isMissed = missedKeys.has(k);
        const dim = dimmedKeys.has(k) && !isReceived && !isMissed;
        const disabled = !interactive || isReceived || isMissed || dim;
        return (
          <GridCell
            key={k}
            card={c}
            isReceived={isReceived}
            isMissed={isMissed}
            dim={dim}
            disabled={disabled}
            interactive={interactive}
            onPick={onPick}
          />
        );
      })}
    </div>
  );
}

type GridCellProps = {
  card: Card;
  isReceived: boolean;
  isMissed: boolean;
  dim: boolean;
  disabled: boolean;
  interactive: boolean;
  onPick: (card: Card) => void;
};

function GridCell({
  card,
  isReceived,
  isMissed,
  dim,
  disabled,
  interactive,
  onPick,
}: GridCellProps): JSX.Element {
  const handleClick = useCallback(() => onPick(card), [onPick, card]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-label={`${rankLabel(card.rank)} of ${SUIT_LABEL[card.suit]}`}
      className={[
        "flex h-10 w-full flex-col items-center justify-center rounded border text-xs font-semibold transition",
        isReceived
          ? "border-green-500 bg-green-100 text-green-800"
          : isMissed
            ? "border-red-300 bg-red-50 text-red-600 line-through"
            : dim
              ? "border-border text-muted-foreground bg-muted opacity-50"
              : interactive
                ? "bg-background border-border hover:bg-accent"
                : "border-border bg-background",
        isRedSuit(card.suit) && !isMissed ? "text-red-600" : "",
      ].join(" ")}
    >
      <span>{rankLabel(card.rank)}</span>
      <span>{SUIT_LABEL[card.suit]}</span>
    </button>
  );
}
