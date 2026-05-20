import type { JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@bun-mono/core-ui/dialog";

const triggerRender = (
  <Button size="sm" variant="outline">
    Rules
  </Button>
);

export function RulesModal(): JSX.Element {
  return (
    <Dialog>
      <DialogTrigger render={triggerRender} />

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">How to play Royalty</DialogTitle>

          <DialogDescription>
            Be the first to play all your cards. Last one out is the Joker.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2 text-xs/relaxed">
          <h3 className="text-sm font-semibold">Your turn</h3>

          <p>
            Play a hand that <strong>beats the current top</strong>, or pass. If everyone passes,
            the last player to play starts a fresh trick with any hand they like.
          </p>
        </section>

        <section className="flex flex-col gap-2 text-xs/relaxed">
          <h3 className="text-sm font-semibold">Hand types</h3>

          <ul className="list-disc pl-5">
            <li>
              <strong>Single</strong>, <strong>pair</strong>, or <strong>triple</strong> — beaten by
              the same shape at a higher rank.
            </li>

            <li>
              <strong>Straight</strong> (3+ cards, consecutive ranks) and{" "}
              <strong>doubles-straight</strong> (3+ consecutive pairs) — beaten by the same length
              at a higher top card. No 2s allowed.
            </li>

            <li>
              <strong>Bomb</strong> (four of a kind) — beats any non-bomb hand. Higher bombs beat
              lower bombs.
            </li>
          </ul>

          <p>
            Rank order: 3 → 4 → … → K → A → <strong>2</strong> (highest).
          </p>
        </section>

        <section className="flex flex-col gap-2 text-xs/relaxed">
          <h3 className="text-sm font-semibold">After the game</h3>

          <p>
            First out becomes <strong>King</strong>, second <strong>Queen</strong>, third is just{" "}
            <strong>Third</strong>, last is the <strong>Joker</strong>. Next game, the King and
            Queen ask the bottom two for cards (tribute) before play resumes.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
