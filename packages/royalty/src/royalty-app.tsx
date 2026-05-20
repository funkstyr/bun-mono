import { useCallback, useEffect, useState, type JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { EndGameOverlay } from "./end-game-overlay";
import { PlayLog } from "./play-log";
import { RulesModal } from "./rules-modal";
import { HumanSeat } from "./seat/human-seat";
import { OpponentSeat } from "./seat/opponent-seat";
import { SEATS } from "./seat/seat-utils";
import { usePassIndicator } from "./seat/use-pass-indicator";
import { SessionSummaryModal } from "./session-summary-modal";
import type { StrategyName } from "./strategy";
import { TopHand } from "./top-hand";
import { TributePanel } from "./tribute/tribute-panel";
import { useRoyaltyGame } from "./use-game";

export function RoyaltyApp(): JSX.Element {
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
  const [tier, setTier] = useState<StrategyName>("easy");
  const isOver = finishedTitles !== null;
  const passingSeat = usePassIndicator(lastPassEvent);

  useEffect(() => {
    if (session === null) setTier("easy");
  }, [session]);

  const pickEasy = useCallback(() => setTier("easy"), []);
  const pickHard = useCallback(() => setTier("hard"), []);
  const onStart = useCallback(() => startSession(tier), [startSession, tier]);

  if (session === null || game === null || humanSeat === null) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-2xl font-semibold">Royalty</h1>

          <RulesModal />
        </header>
        <div className="flex w-full flex-col items-center gap-4 py-12">
          <p className="text-muted-foreground text-sm">No active session.</p>
          <div className="flex items-center gap-2">
            <fieldset className="flex items-center" aria-label="Difficulty">
              <Button
                aria-pressed={tier === "easy"}
                onClick={pickEasy}
                size="sm"
                variant={tier === "easy" ? "default" : "outline"}
              >
                Easy
              </Button>
              <Button
                aria-pressed={tier === "hard"}
                onClick={pickHard}
                size="sm"
                variant={tier === "hard" ? "default" : "outline"}
              >
                Hard
              </Button>
            </fieldset>
            <Button onClick={onStart}>Start a session</Button>
          </div>
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
          <RulesModal />
          <Button onClick={restart} size="sm" variant="outline">
            Restart
          </Button>
          <Button onClick={onEndSession} size="sm" variant="outline">
            End session
          </Button>
        </div>
      </header>

      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
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

        <aside className="w-full lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
          <PlayLog log={game.log} humanSeat={humanSeat} />
        </aside>
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
