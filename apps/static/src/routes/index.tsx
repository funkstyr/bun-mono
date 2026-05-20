import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@bun-mono/core-ui/card";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

const timerLink = <Link to="/timer" search={{ view: "list", kind: undefined, id: undefined }} />;
const ticTacToeLink = <Link to="/tic-tac-toe" search={{ difficulty: "easy" }} />;
const royaltyLink = <Link to="/royalty" />;

function RouteComponent() {
  useEffect(() => {
    document.title = "bun-mono showcase";
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-lg font-medium">bun-mono showcase</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Workout Timer</CardTitle>

            <CardDescription>
              Interval and workout timers that run entirely in your browser.
            </CardDescription>
          </CardHeader>

          <CardFooter>
            <Button render={timerLink} variant="outline" size="sm">
              Open Workout Timer
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tic-Tac-Toe</CardTitle>

            <CardDescription>
              Classic tic-tac-toe against a configurable-difficulty bot.
            </CardDescription>
          </CardHeader>

          <CardFooter>
            <Button render={ticTacToeLink} variant="outline" size="sm">
              Open Tic-Tac-Toe
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Royalty</CardTitle>

            <CardDescription>
              Four-player shedding card game. You vs. three bots; or watch four bots play in{" "}
              <Link to="/royalty/watch" className="underline underline-offset-2">
                Watch mode
              </Link>
              .
            </CardDescription>
          </CardHeader>

          <CardFooter>
            <Button render={royaltyLink} variant="outline" size="sm">
              Open Royalty
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
