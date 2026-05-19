import { type JSX, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import {
  RANK_ORDER,
  SUIT_ORDER,
  type Card,
  type Hand,
  type HandType,
  type LogEntry,
  type Rank,
  type Seat,
  type Suit,
  type Title,
} from "./engine";
import { useRoyaltyGame, type PassEvent, type TributeView } from "./use-game";

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

const HAND_TYPE_LABEL: Record<HandType, string> = {
  single: "Single",
  pair: "Doubles",
  triple: "Triples",
  bomb: "Quads",
  straight: "Run",
  "doubles-straight": "Doubles run",
};

function handLabel(hand: Hand): string {
  if (hand.type === "straight") return `Run of ${hand.cards.length}`;
  if (hand.type === "doubles-straight") return `Doubles run (${hand.cards.length / 2} pairs)`;
  return HAND_TYPE_LABEL[hand.type];
}

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

export function RoyaltyWatch(): JSX.Element {
  const { session, game, finishedTitles, lastPassEvent, tribute, restart } = useRoyaltyGame({
    mode: "watch",
  });
  const passingSeat = usePassIndicator(lastPassEvent);

  if (session === null || game === null) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-8">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-2xl font-semibold">Royalty — Watch</h1>
        </header>
        <div className="flex w-full flex-col items-center gap-4 py-12">
          <p className="text-muted-foreground text-sm">No watch session.</p>
          <Button onClick={restart}>Start watch</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold">Royalty — Watch</h1>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Game {session.gameCount}</span>
          <Button onClick={restart} size="sm" variant="outline">
            Restart
          </Button>
        </div>
      </header>

      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
          <PlayLog log={game.log} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-6">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {SEATS.map((seat) => (
              <BotSeat
                key={seat}
                seat={seat}
                cardCount={game.players[seat].hand.length}
                active={finishedTitles === null && tribute === null && seat === game.turn}
                finished={game.players[seat].finishedAt !== null}
                passing={passingSeat === seat}
                titles={finishedTitles}
              />
            ))}
          </div>

          {tribute ? (
            <TributeReadout tribute={tribute} />
          ) : (
            <TopHand top={game.trick.top} lastPlayer={game.trick.lastPlayer} />
          )}
        </div>
      </div>
    </div>
  );
}

type PlayLogProps = {
  log: readonly LogEntry[];
};

function PlayLog({ log }: PlayLogProps) {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  return (
    <section className="border-border w-full rounded-md border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>
          Play log
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">({log.length})</span>
        </span>
        <span aria-hidden className="text-muted-foreground text-xs">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded ? (
        log.length === 0 ? (
          <p className="text-muted-foreground px-3 pb-3 text-xs">No plays yet.</p>
        ) : (
          <ol
            reversed
            className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto px-3 pb-3 text-xs"
          >
            {log.toReversed().map((entry) => (
              <li key={entry.tick} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground w-6 tabular-nums">{entry.tick + 1}.</span>
                <span className="shrink-0">Seat {entry.seat}</span>
                {entry.action === "pass" ? (
                  <span className="text-muted-foreground ml-auto">Pass</span>
                ) : (
                  <>
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold">
                      {handLabel(entry.hand)}
                    </span>
                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {entry.hand.cards.map((c) => (
                        <span
                          key={cardKey(c)}
                          className={[
                            "border-border bg-background inline-flex items-center rounded border px-1 text-[10px] font-semibold",
                            isRedSuit(c.suit) ? "text-red-600" : "text-foreground",
                          ].join(" ")}
                        >
                          {rankLabel(c.rank)}
                          {SUIT_LABEL[c.suit]}
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}

type TopHandProps = {
  top: Hand | null;
  lastPlayer: Seat | null;
};

function TopHand({ top, lastPlayer }: TopHandProps) {
  return (
    <div className="border-border flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-3">
      {top ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Top — Seat {lastPlayer}</span>
            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold">
              {handLabel(top)}
            </span>
          </div>
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

type BotSeatProps = {
  seat: Seat;
  cardCount: number;
  active: boolean;
  finished: boolean;
  passing: boolean;
  titles: Record<Seat, Title> | null;
};

function BotSeat({ seat, cardCount, active, finished, passing, titles }: BotSeatProps) {
  const title = titles?.[seat] ?? null;
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
          {title ? <span className="text-muted-foreground ml-1">{TITLE_LABEL[title]}</span> : null}
          {finished && !title ? <span className="text-muted-foreground ml-1">finished</span> : null}
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

type TributeReadoutProps = {
  tribute: TributeView;
};

function TributeReadout({ tribute }: TributeReadoutProps) {
  const { current, role } = tribute;
  const roleLabel = role === "king" ? "King" : "Queen";
  const phaseLabel =
    current.phase === "ask"
      ? `Asking — ${current.received.length}/${current.cardsToReceive} received`
      : current.returnsRemaining === 0
        ? "Complete"
        : `Returning — ${current.returnsRemaining} card${current.returnsRemaining === 1 ? "" : "s"}`;

  return (
    <section className="border-border flex w-full flex-col gap-3 rounded-md border-2 border-dashed p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold uppercase">
            {roleLabel} tribute
          </span>
          <span className="text-muted-foreground text-xs">
            Asker: Seat {current.asker} → Target: Seat {current.target}
          </span>
        </div>
        <span className="text-xs font-medium">{phaseLabel}</span>
      </header>

      <TributeGrid missed={current.missed} received={current.received} />

      {current.received.length > 0 || current.missed.length > 0 ? (
        <AskHistory received={current.received} missed={current.missed} />
      ) : null}
    </section>
  );
}

type TributeGridProps = {
  missed: readonly Card[];
  received: readonly Card[];
};

const GRID_STYLE = {
  gridTemplateColumns: `repeat(${RANK_ORDER.length}, minmax(0, 1fr))`,
};

const ALL_CARDS: readonly Card[] = SUIT_ORDER.flatMap((suit) =>
  RANK_ORDER.map((rank) => ({ rank: rank as Rank, suit })),
);

function TributeGrid({ missed, received }: TributeGridProps) {
  const receivedKeys = useMemo(() => new Set(received.map(cardKey)), [received]);
  const missedKeys = useMemo(() => new Set(missed.map(cardKey)), [missed]);

  return (
    <div
      className="grid w-full gap-1"
      style={GRID_STYLE}
      role="grid"
      aria-label="Tribute card grid (watch)"
    >
      {ALL_CARDS.map((c) => {
        const k = cardKey(c);
        const isReceived = receivedKeys.has(k);
        const isMissed = missedKeys.has(k);
        return (
          <div
            key={k}
            className={[
              "flex h-10 w-full flex-col items-center justify-center rounded border text-xs font-semibold",
              isReceived
                ? "border-green-500 bg-green-100 text-green-800"
                : isMissed
                  ? "border-red-300 bg-red-50 text-red-600 line-through"
                  : "border-border bg-background",
              isRedSuit(c.suit) && !isMissed && !isReceived ? "text-red-600" : "",
            ].join(" ")}
          >
            <span>{rankLabel(c.rank)}</span>
            <span>{SUIT_LABEL[c.suit]}</span>
          </div>
        );
      })}
    </div>
  );
}

type AskHistoryProps = {
  received: readonly Card[];
  missed: readonly Card[];
};

function AskHistory({ received, missed }: AskHistoryProps) {
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
