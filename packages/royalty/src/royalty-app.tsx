import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Confetti } from "@bun-mono/core-ui/confetti";

import {
  beats,
  classifyHand,
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
import type { SessionSummary } from "./storage";
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

export function RoyaltyApp() {
  const {
    session,
    game,
    finishedTitles,
    humanSeat,
    lastPassEvent,
    tribute,
    sessionSummary,
    onPlay,
    onPass,
    onAsk,
    onReturn,
    onEndSession,
    dismissSessionSummary,
    startSession,
    restart,
  } = useRoyaltyGame({ mode: "play" });
  const isOver = finishedTitles !== null;
  const passingSeat = usePassIndicator(lastPassEvent);

  if (session === null || game === null || humanSeat === null) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-2xl font-semibold">Royalty</h1>
        </header>
        <div className="flex w-full flex-col items-center gap-4 py-12">
          <p className="text-muted-foreground text-sm">No active session.</p>
          <Button onClick={startSession}>Start a session</Button>
        </div>
        {sessionSummary ? (
          <SessionSummaryModal summary={sessionSummary} onClose={dismissSessionSummary} />
        ) : null}
      </div>
    );
  }

  const opponentSeats = SEATS.filter((s) => s !== humanSeat);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold">Royalty</h1>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Game {session.gameCount}</span>
          <Button onClick={restart} size="sm" variant="outline">
            Restart
          </Button>
          <Button onClick={onEndSession} size="sm" variant="outline">
            End session
          </Button>
        </div>
      </header>

      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
          <PlayLog log={game.log} humanSeat={humanSeat} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-6">
          <div className="grid w-full grid-cols-3 gap-3">
            {opponentSeats.map((seat) => (
              <OpponentSeat
                key={seat}
                seat={seat}
                cardCount={game.players[seat].hand.length}
                active={!isOver && tribute === null && seat === game.turn}
                finished={game.players[seat].finishedAt !== null}
                passing={passingSeat === seat}
                titles={finishedTitles}
              />
            ))}
          </div>

          {tribute ? (
            <TributePanel
              tribute={tribute}
              humanSeat={humanSeat}
              onAsk={onAsk}
              onReturn={onReturn}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {finishedTitles && !tribute ? (
        <EndGameOverlay titles={finishedTitles} humanSeat={humanSeat} onRestart={restart} />
      ) : null}

      {sessionSummary ? (
        <SessionSummaryModal summary={sessionSummary} onClose={dismissSessionSummary} />
      ) : null}
    </div>
  );
}

type SessionSummaryModalProps = {
  summary: SessionSummary;
  onClose: () => void;
};

function SessionSummaryModal({ summary, onClose }: SessionSummaryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background flex w-full max-w-md flex-col gap-4 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Session summary</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center justify-between">
            <span>Games played</span>
            <span className="font-semibold tabular-nums">{summary.gamesPlayed}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>King</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.king}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Queen</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.queen}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>3rd</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.third}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Joker</span>
            <span className="font-semibold tabular-nums">{summary.roleCounts.joker}</span>
          </li>
        </ul>
        <Button onClick={onClose} className="self-end">
          Close
        </Button>
      </div>
    </div>
  );
}

type EndGameOverlayProps = {
  titles: Record<Seat, Title>;
  humanSeat: Seat;
  onRestart: () => void;
};

function EndGameOverlay({ titles, humanSeat, onRestart }: EndGameOverlayProps) {
  const humanTitle = titles[humanSeat];
  const isKing = humanTitle === "king";
  const isJoker = humanTitle === "joker";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {isKing ? <Confetti /> : null}
      <div className="bg-background relative flex w-full max-w-md flex-col gap-4 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Game over</h2>
          {isJoker ? (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              Joker — better luck next round
            </span>
          ) : null}
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {SEATS.map((seat) => {
            const title = titles[seat];
            const isHuman = seat === humanSeat;
            const muted = isHuman && !isKing;
            return (
              <li key={seat} className="flex items-center justify-between">
                <span>
                  Seat {seat}
                  {isHuman ? <span className="text-muted-foreground ml-1">(you)</span> : null}
                </span>
                <span
                  className={[
                    "font-semibold",
                    muted ? "text-muted-foreground" : "",
                    isHuman && isKing ? "text-primary" : "",
                  ].join(" ")}
                >
                  {TITLE_LABEL[title]}
                </span>
              </li>
            );
          })}
        </ul>
        <Button onClick={onRestart} className="self-end">
          Restart
        </Button>
      </div>
    </div>
  );
}

type PlayLogProps = {
  log: readonly LogEntry[];
  humanSeat: Seat;
};

function PlayLog({ log, humanSeat }: PlayLogProps) {
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
                <span className="shrink-0">
                  Seat {entry.seat}
                  {entry.seat === humanSeat ? (
                    <span className="text-muted-foreground ml-1">(you)</span>
                  ) : null}
                </span>
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

type OpponentSeatProps = {
  seat: Seat;
  cardCount: number;
  active: boolean;
  finished: boolean;
  passing: boolean;
  titles: Record<Seat, Title> | null;
};

function OpponentSeat({ seat, cardCount, active, finished, passing, titles }: OpponentSeatProps) {
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

type TributePanelProps = {
  tribute: TributeView;
  humanSeat: Seat;
  onAsk: (card: Card) => void;
  onReturn: (cards: readonly Card[]) => void;
};

function TributePanel({ tribute, humanSeat, onAsk, onReturn }: TributePanelProps) {
  const { current, role, askerHand, targetHand } = tribute;
  const isHumanAsker = current.asker === humanSeat;
  const isHumanTarget = current.target === humanSeat;
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
            Asker: Seat {current.asker}
            {current.asker === humanSeat ? " (you)" : ""} → Target: Seat {current.target}
            {current.target === humanSeat ? " (you)" : ""}
          </span>
        </div>
        <span className="text-xs font-medium">{phaseLabel}</span>
      </header>

      <CardGrid
        askerHand={isHumanTarget ? targetHand : askerHand}
        missed={current.missed}
        received={current.received}
        interactive={isHumanAsker && current.phase === "ask"}
        onPick={onAsk}
        viewerIsTarget={isHumanTarget}
      />

      {current.phase === "return" && current.returnsRemaining > 0 && isHumanAsker ? (
        <ReturnSelector
          hand={askerHand}
          returnsRemaining={current.returnsRemaining}
          onReturn={onReturn}
        />
      ) : null}

      {current.received.length > 0 || current.missed.length > 0 ? (
        <AskHistory received={current.received} missed={current.missed} />
      ) : null}
    </section>
  );
}

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

function CardGrid({
  askerHand,
  missed,
  received,
  interactive,
  onPick,
  viewerIsTarget,
}: CardGridProps) {
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
}: GridCellProps) {
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

type ReturnSelectorProps = {
  hand: readonly Card[];
  returnsRemaining: number;
  onReturn: (cards: readonly Card[]) => void;
};

function ReturnSelector({ hand, returnsRemaining, onReturn }: ReturnSelectorProps) {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCard = useCallback((card: Card) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = cardKey(card);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selected = useMemo(
    () => hand.filter((c) => selectedKeys.has(cardKey(c))),
    [hand, selectedKeys],
  );

  const canSubmit = selected.length === returnsRemaining;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    onReturn(selected);
    setSelectedKeys(new Set());
  }, [canSubmit, onReturn, selected]);

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Pick {returnsRemaining} card{returnsRemaining === 1 ? "" : "s"} to return
        </span>
        <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
          Return ({selected.length}/{returnsRemaining})
        </Button>
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
      </div>
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

type CardButtonProps = {
  card: Card;
  selected: boolean;
  onClick: (card: Card) => void;
};

type SelectionBadgeProps = {
  selectedCount: number;
  candidate: Hand | null;
};

function SelectionBadge({ selectedCount, candidate }: SelectionBadgeProps) {
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
