import { useCallback, useMemo, useState } from "react";

import {
  applyPlay,
  classifyHand,
  dealGame,
  finalTitles,
  gameIsOver,
  type Card,
  type GameState,
  type Seat,
  type Title,
} from "./engine";

function makeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function newGame(): GameState {
  return dealGame(makeSeed(), "three-of-clubs-holder");
}

export type UseRoyaltyGameResult = {
  game: GameState;
  finishedTitles: Record<Seat, Title> | null;
  onPlay: (seat: Seat, cards: readonly Card[]) => void;
  onPass: (seat: Seat) => void;
  restart: () => void;
};

export function useRoyaltyGame(): UseRoyaltyGameResult {
  const [game, setGame] = useState<GameState>(() => newGame());

  const onPlay = useCallback((seat: Seat, cards: readonly Card[]) => {
    setGame((current) => {
      if (gameIsOver(current)) return current;
      if (seat !== current.turn) return current;
      const hand = classifyHand(cards);
      if (hand === null) return current;
      return applyPlay(current, seat, { kind: "play", hand });
    });
  }, []);

  const onPass = useCallback((seat: Seat) => {
    setGame((current) => {
      if (gameIsOver(current)) return current;
      if (seat !== current.turn) return current;
      return applyPlay(current, seat, { kind: "pass" });
    });
  }, []);

  const restart = useCallback(() => {
    setGame(newGame());
  }, []);

  const finishedTitles = useMemo(() => finalTitles(game), [game]);

  return { game, finishedTitles, onPlay, onPass, restart };
}
