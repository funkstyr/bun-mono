import { type JSX, useCallback, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { CardButton } from "../card/card-button";
import { CardFace } from "../card/card-face";
import { cardKey, handLabel } from "../card/card-labels";
import {
  beats,
  type Card,
  classifyHand,
  enumerateLegalPlays,
  type Hand,
  type HandType,
  rankIndex,
  type Seat,
} from "../engine";

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

  const legalPlays = useMemo(
    () => (active ? enumerateLegalPlays(hand, top) : []),
    [active, hand, top],
  );

  const quickPlays = useMemo(
    () => sortPlays(dedupePlays(legalPlays.filter((p) => p.type !== "single"))),
    [legalPlays],
  );

  const playableKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of legalPlays) for (const c of p.cards) set.add(cardKey(c));
    return set;
  }, [legalPlays]);

  const toggleCard = useCallback((card: Card) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = cardKey(card);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const pickQuickPlay = useCallback((play: Hand) => {
    setSelectedKeys(new Set(play.cards.map(cardKey)));
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
        {hand.map((c) => {
          const key = cardKey(c);
          return (
            <CardButton
              key={key}
              card={c}
              selected={selectedKeys.has(key)}
              disabled={!active || !playableKeys.has(key)}
              onClick={toggleCard}
            />
          );
        })}
        {hand.length === 0 ? (
          <span className="text-muted-foreground text-xs">Empty hand</span>
        ) : null}
      </div>

      {active && quickPlays.length > 0 ? (
        <QuickPlayStrip plays={quickPlays} onPick={pickQuickPlay} />
      ) : null}
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

type QuickPlayStripProps = {
  plays: readonly Hand[];
  onPick: (play: Hand) => void;
};

function QuickPlayStrip({ plays, onPick }: QuickPlayStripProps): JSX.Element {
  return (
    <div className="border-border flex flex-col gap-1 border-t pt-2">
      <span className="text-muted-foreground text-[10px] font-semibold uppercase">
        Quick select
      </span>
      <ul className="flex flex-col gap-1">
        {plays.map((play) => (
          <QuickPlayRow key={playKey(play)} play={play} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}

type QuickPlayRowProps = {
  play: Hand;
  onPick: (play: Hand) => void;
};

function QuickPlayRow({ play, onPick }: QuickPlayRowProps): JSX.Element {
  const handleClick = useCallback(() => onPick(play), [onPick, play]);
  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="border-border bg-background hover:bg-accent flex w-full items-center gap-2 rounded border px-2 py-0.5 text-left"
      >
        <span className="text-muted-foreground w-24 shrink-0 text-xs font-semibold uppercase">
          {handLabel(play)}
        </span>
        <span className="flex flex-wrap gap-1">
          {play.cards.map((c) => (
            <CardFace key={cardKey(c)} card={c} compact />
          ))}
        </span>
      </button>
    </li>
  );
}

function playKey(play: Hand): string {
  return `${play.type}:${play.cards.map(cardKey).join(",")}`;
}

function playSignature(play: Hand): string {
  const ranks = play.cards
    .map((c) => c.rank)
    .toSorted()
    .join(",");
  return `${play.type}:${ranks}`;
}

function dedupePlays(plays: readonly Hand[]): Hand[] {
  const seen = new Map<string, Hand>();
  for (const p of plays) {
    const sig = playSignature(p);
    if (!seen.has(sig)) seen.set(sig, p);
  }
  return Array.from(seen.values());
}

const TYPE_ORDER: Record<HandType, number> = {
  single: 0,
  pair: 1,
  triple: 2,
  bomb: 3,
  straight: 4,
  "doubles-straight": 5,
};

function lowestRankIndex(play: Hand): number {
  let min = Infinity;

  for (const c of play.cards) {
    const idx = rankIndex(c.rank);
    if (idx < min) min = idx;
  }
  
  return min;
}

function sortPlays(plays: readonly Hand[]): Hand[] {
  return plays.toSorted((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;

    const lenDiff = a.cards.length - b.cards.length;
    if (lenDiff !== 0) return lenDiff;

    return lowestRankIndex(a) - lowestRankIndex(b);
  });
}
