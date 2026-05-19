import { createFileRoute } from "@tanstack/react-router";

import { TicTacToeApp } from "@bun-mono/tic-tac-toe/tic-tac-toe-app";

export const Route = createFileRoute("/tic-tac-toe")({
  component: RouteComponent,
});

function RouteComponent() {
  return <TicTacToeApp />;
}
