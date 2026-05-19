import { useCallback, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import {
  beats,
  classifyHand,
  type Card,
  type Hand,
  type Seat,
  type Suit,
  type Title,
} from "./engine";
import { useRoyaltyGame } from "./use-game";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

const TITLE_LABEL: Record<Title, string> = {
  king: "King",
  queen: "Queen",
  third: "3rd",
  joker: "Joker",
};

const SUIT_LABEL: Record<Suit, string> = {
  C: "♣",
  S: "♠",
  D: "♦",
  H: "♥",
};

function rankLabel(rank: Card["rank"]): string {
  return String(rank);
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

function isRedSuit(suit: Suit): boolean {
  return suit === "D" || suit === "H";
}

export function RoyaltyApp() {
  const { game, finishedTitles, onPlay, onPass, restart } = useRoyaltyGame();
  const isOver = finishedTitles !== null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold">Royalty — debug</h1>
        <Button onClick={restart} size="sm" variant="outline">
          Restart
        </Button>
      </header>

      <TopHand top={game.trick.top} lastPlayer={game.trick.lastPlayer} />

      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
        {SEATS.map((seat) => (
          <SeatPanel
            key={seat}
            seat={seat}
            hand={game.players[seat].hand}
            active={!isOver && seat === game.turn}
            top={game.trick.top}
            finished={game.players[seat].finishedAt !== null}
            onPlay={onPlay}
            onPass={onPass}
          />
        ))}
      </div>

      {finishedTitles ? <EndGameOverlay titles={finishedTitles} onRestart={restart} /> : null}
    </div>
  );
}

type EndGameOverlayProps = {
  titles: Record<Seat, Title>;
  onRestart: () => void;
};

function EndGameOverlay({ titles, onRestart }: EndGameOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background flex w-full max-w-md flex-col gap-4 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Game over</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {SEATS.map((seat) => (
            <li key={seat} className="flex items-center justify-between">
              <span>Seat {seat}</span>
              <span className="font-semibold">{TITLE_LABEL[titles[seat]]}</span>
            </li>
          ))}
        </ul>
        <Button onClick={onRestart} className="self-end">
          Restart
        </Button>
      </div>
    </div>
  );
}

type TopHandProps = {
  top: Hand | null;
  lastPlayer: Seat | null;
};

function TopHand({ top, lastPlayer }: TopHandProps) {
  return (
    <div className="border-border flex min-h-20 w-full items-center justify-center gap-3 rounded-md border-2 border-dashed px-4 py-3">
      {top ? (
        <>
          <span className="text-muted-foreground text-xs">
            Top — Seat {lastPlayer} ({top.type})
          </span>
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

type SeatPanelProps = {
  seat: Seat;
  hand: readonly Card[];
  active: boolean;
  top: Hand | null;
  finished: boolean;
  onPlay: (seat: Seat, cards: readonly Card[]) => void;
  onPass: (seat: Seat) => void;
};

function SeatPanel({ seat, hand, active, top, finished, onPlay, onPass }: SeatPanelProps) {
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
    onPlay(seat, selectedCards);
    setSelectedKeys(new Set());
  }, [canPlay, onPlay, seat, selectedCards]);

  const submitPass = useCallback(() => {
    if (!canPass) return;
    onPass(seat);
    setSelectedKeys(new Set());
  }, [canPass, onPass, seat]);

  return (
    <section
      className={[
        "flex flex-col gap-2 rounded-md border p-3",
        active ? "border-primary bg-primary/5" : "border-border",
        finished ? "opacity-60" : "",
      ].join(" ")}
    >
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Seat {seat}
          {finished ? <span className="text-muted-foreground ml-2 text-xs">finished</span> : null}
        </span>
        <div className="flex items-center gap-2">
          {active ? (
            <span className="text-primary text-xs font-semibold uppercase">Turn</span>
          ) : null}
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
    </section>
  );
}

type CardButtonProps = {
  card: Card;
  selected: boolean;
  onClick: (card: Card) => void;
};

function CardButton({ card, selected, onClick }: CardButtonProps) {
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

function CardFace({ card }: { card: Card }) {
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
