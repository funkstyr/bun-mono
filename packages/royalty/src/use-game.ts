import { useCallback, useState } from "react";

import { applyPlay, classifyHand, dealGame, type Card, type GameState, type Seat } from "./engine";

function makeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function newGame(): GameState {
  return dealGame(makeSeed(), "three-of-clubs-holder");
}

export type UseRoyaltyGameResult = {
  game: GameState;
  onPlay: (seat: Seat, card: Card) => void;
  restart: () => void;
};

export function useRoyaltyGame(): UseRoyaltyGameResult {
  const [game, setGame] = useState<GameState>(() => newGame());

  const onPlay = useCallback((seat: Seat, c: Card) => {
    setGame((current) => {
      if (seat !== current.turn) return current;
      const hand = classifyHand([c]);
      if (hand === null) return current;
      return applyPlay(current, seat, { kind: "play", hand });
    });
  }, []);

  const restart = useCallback(() => {
    setGame(newGame());
  }, []);

  return { game, onPlay, restart };
}
