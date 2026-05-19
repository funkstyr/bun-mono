import type { JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Confetti } from "@bun-mono/core-ui/confetti";

import type { Seat, Title } from "./engine";
import { SEATS, TITLE_LABEL } from "./seat/seat-utils";

type EndGameOverlayProps = {
  titles: Record<Seat, Title>;
  humanSeat: Seat;
  onRestart: () => void;
};

export function EndGameOverlay({ titles, humanSeat, onRestart }: EndGameOverlayProps): JSX.Element {
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
