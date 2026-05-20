import { type JSX, useEffect, useState } from "react";

import { DifficultySelector } from "./difficulty-selector";
import type { Difficulty, Side } from "./engine";
import { Game } from "./game";
import { SideSelector } from "./side-selector";
import { readLastUsedSide } from "./storage";

export type TicTacToeAppProps = {
  difficulty: Difficulty;
  onDifficultyChange?: (next: Difficulty) => void;
};

export function TicTacToeApp({ difficulty, onDifficultyChange }: TicTacToeAppProps): JSX.Element {
  const [playerSide, setPlayerSide] = useState<Side>("X");

  useEffect(() => {
    setPlayerSide(readLastUsedSide());
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Tic-tac-toe</h1>

      <DifficultySelector value={difficulty} onChange={onDifficultyChange} />

      <SideSelector value={playerSide} onChange={setPlayerSide} />

      <Game key={`${difficulty}-${playerSide}`} difficulty={difficulty} playerSide={playerSide} />
    </div>
  );
}
