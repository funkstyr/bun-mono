import { type JSX, useCallback, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { CardButton } from "../card/card-button";
import { cardKey, handLabel } from "../card/card-labels";
import { beats, type Card, classifyHand, type Hand, type Seat } from "../engine";

type HumanSeatProps = {
  seat: Seat;
  hand: readonly Card[];
  active: boolean;
  top: Hand | null;
  finished: boolean;
  passing: boolean;
  onPlay: (cards: readonly Card[]) => void;
  onPass: () => void;
};

export function HumanSeat({
  seat,
  hand,
  active,
  top,
  finished,
  passing,
  onPlay,
  onPass,
}: HumanSeatProps): JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const selectedCards = useMemo(
    () => hand.filter((c) => selectedKeys.has(cardKey(c))),
    [hand, selectedKeys],
  );

  const candidate = useMemo(() => classifyHand(selectedCards), [selectedCards]);
  const canPlay = active && candidate !== null && (top === null || beats(candidate, top));
  const canPass = active && top !== null;

  const toggleCard = useCallback((card: Card) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = cardKey(card);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const submitPlay = useCallback(() => {
    if (!canPlay) return;
    onPlay(selectedCards);
    setSelectedKeys(new Set());
  }, [canPlay, onPlay, selectedCards]);

  const submitPass = useCallback(() => {
    if (!canPass) return;
    onPass();
    setSelectedKeys(new Set());
  }, [canPass, onPass]);

  return (
    <section
      className={[
        "relative flex w-full flex-col gap-2 rounded-md border p-3",
        active ? "border-primary bg-primary/5" : "border-border",
        finished ? "opacity-60" : "",
      ].join(" ")}
    >
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium">
          You (Seat {seat})
          {finished ? <span className="text-muted-foreground ml-2 text-xs">finished</span> : null}
        </span>

        <div className="flex items-center gap-2">
          {active ? (
            <span className="text-primary text-xs font-semibold uppercase">Your turn</span>
          ) : null}
          <SelectionBadge selectedCount={selectedCards.length} candidate={candidate} />

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canPass}
            onClick={submitPass}
          >
            Pass
          </Button>

          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={!canPlay}
            onClick={submitPlay}
          >
            Play
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1">
        {hand.map((c) => (
          <CardButton
            key={cardKey(c)}
            card={c}
            selected={selectedKeys.has(cardKey(c))}
            onClick={toggleCard}
          />
        ))}
        {hand.length === 0 ? (
          <span className="text-muted-foreground text-xs">Empty hand</span>
        ) : null}
      </div>
      {passing ? (
        <span className="bg-foreground text-background absolute -top-2 right-3 rounded px-2 py-0.5 text-[10px] font-semibold uppercase shadow">
          Pass
        </span>
      ) : null}
    </section>
  );
}

type SelectionBadgeProps = {
  selectedCount: number;
  candidate: Hand | null;
};

function SelectionBadge({ selectedCount, candidate }: SelectionBadgeProps): JSX.Element | null {
  if (selectedCount === 0) return null;

  if (candidate === null) {
    return (
      <span className="bg-destructive/10 text-destructive rounded px-2 py-0.5 text-xs font-semibold">
        Invalid
      </span>
    );
  }

  return (
    <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold">
      {handLabel(candidate)}
    </span>
  );
}
