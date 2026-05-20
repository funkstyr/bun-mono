import type { JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { PlayLog } from "./play-log";
import { OpponentSeat } from "./seat/opponent-seat";
import { SEATS } from "./seat/seat-utils";
import { usePassIndicator } from "./seat/use-pass-indicator";
import { TopHand } from "./top-hand";
import { TributeReadout } from "./tribute/tribute-readout";
import { useRoyaltyGame } from "./use-game";

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
        <div className="flex min-w-0 flex-1 flex-col items-center gap-6">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {SEATS.map((seat) => (
              <OpponentSeat
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

        <aside className="w-full lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
          <PlayLog log={game.log} humanSeat={null} />
        </aside>
      </div>
    </div>
  );
}
