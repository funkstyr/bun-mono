import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type } from "arktype";

import type { Difficulty } from "@bun-mono/tic-tac-toe/engine";
import { TicTacToeApp } from "@bun-mono/tic-tac-toe/tic-tac-toe-app";

const ticTacToeSearchSchema = type({
  "difficulty?": "'easy' | 'medium' | 'hard' | undefined",
});

type TicTacToeSearch = { difficulty: Difficulty };

export const Route = createFileRoute("/tic-tac-toe")({
  component: RouteComponent,
  validateSearch: (search): TicTacToeSearch => {
    const parsed = ticTacToeSearchSchema(search);
    if (parsed instanceof type.errors) return { difficulty: "easy" };
    return { difficulty: parsed.difficulty ?? "easy" };
  },
});

function RouteComponent() {
  const { difficulty } = Route.useSearch();
  const navigate = useNavigate({ from: "/tic-tac-toe" });

  const handleDifficultyChange = useCallback(
    (next: Difficulty) => {
      void navigate({
        to: "/tic-tac-toe",
        search: () => ({ difficulty: next }),
      });
    },
    [navigate],
  );

  return <TicTacToeApp difficulty={difficulty} onDifficultyChange={handleDifficultyChange} />;
}
