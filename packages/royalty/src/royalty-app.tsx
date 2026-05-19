import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useRoyaltyGame, type PassEvent } from "./use-game";

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const PASS_INDICATOR_MS = 900;

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

function usePassIndicator(event: PassEvent | null): Seat | null {
  const [visible, setVisible] = useState<{ seat: Seat; key: number } | null>(null);

  useEffect(() => {
    if (event === null) return;
    setVisible(event);
    const id = setTimeout(() => setVisible(null), PASS_INDICATOR_MS);
    return () => clearTimeout(id);
  }, [event]);

  return visible?.seat ?? null;
}

export function RoyaltyApp() {
  const { game, finishedTitles, humanSeat, lastPassEvent, onPlay, onPass, restart } =
    useRoyaltyGame({ mode: "play" });
  const isOver = finishedTitles !== null;
  const passingSeat = usePassIndicator(lastPassEvent);

  const opponentSeats = SEATS.filter((s) => s !== humanSeat);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold">Royalty</h1>
        <Button onClick={restart} size="sm" variant="outline">
          Restart
        </Button>
      </header>

      <div className="grid w-full grid-cols-3 gap-3">
        {opponentSeats.map((seat) => (
          <OpponentSeat
            key={seat}
            seat={seat}
            cardCount={game.players[seat].hand.length}
            active={!isOver && seat === game.turn}
            finished={game.players[seat].finishedAt !== null}
            passing={passingSeat === seat}
          />
        ))}
      </div>

      <TopHand top={game.trick.top} lastPlayer={game.trick.lastPlayer} />

      <HumanSeat
        seat={humanSeat}
        hand={game.players[humanSeat].hand}
        active={!isOver && humanSeat === game.turn}
        top={game.trick.top}
        finished={game.players[humanSeat].finishedAt !== null}
        passing={passingSeat === humanSeat}
        onPlay={onPlay}
        onPass={onPass}
      />

      {finishedTitles ? (
        <EndGameOverlay titles={finishedTitles} humanSeat={humanSeat} onRestart={restart} />
      ) : null}
    </div>
  );
}

type EndGameOverlayProps = {
  titles: Record<Seat, Title>;
  humanSeat: Seat;
  onRestart: () => void;
};

function EndGameOverlay({ titles, humanSeat, onRestart }: EndGameOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background flex w-full max-w-md flex-col gap-4 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Game over</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {SEATS.map((seat) => (
            <li key={seat} className="flex items-center justify-between">
              <span>
                Seat {seat}
                {seat === humanSeat ? (
                  <span className="text-muted-foreground ml-1">(you)</span>
                ) : null}
              </span>
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

type OpponentSeatProps = {
  seat: Seat;
  cardCount: number;
  active: boolean;
  finished: boolean;
  passing: boolean;
};

function OpponentSeat({ seat, cardCount, active, finished, passing }: OpponentSeatProps) {
  return (
    <section
      className={[
        "relative flex flex-col items-center gap-1 rounded-md border p-3",
        active ? "border-primary bg-primary/5" : "border-border",
        finished ? "opacity-60" : "",
      ].join(" ")}
    >
      <header className="flex w-full items-center justify-between">
        <span className="text-xs font-medium">
          Seat {seat}
          {finished ? <span className="text-muted-foreground ml-1">finished</span> : null}
        </span>
        {active ? (
          <span className="text-primary text-[10px] font-semibold uppercase">Turn</span>
        ) : null}
      </header>
      <div className="flex items-center gap-2">
        <div className="bg-muted border-border h-10 w-7 rounded border" aria-hidden="true" />
        <span className="text-sm font-semibold tabular-nums">{cardCount}</span>
      </div>
      {passing ? (
        <span className="bg-foreground text-background absolute -top-2 right-2 rounded px-2 py-0.5 text-[10px] font-semibold uppercase shadow">
          Pass
        </span>
      ) : null}
    </section>
  );
}

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

function HumanSeat({ seat, hand, active, top, finished, passing, onPlay, onPass }: HumanSeatProps) {
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
