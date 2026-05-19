import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { decide } from "./bot";
import {
  applyPlay,
  BOT_PASS_MS,
  BOT_PLAY_MS,
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

function pickHumanSeat(): Seat {
  return Math.floor(Math.random() * 4) as Seat;
}

export type PassEvent = { seat: Seat; key: number };

export type UseRoyaltyGameOptions = {
  mode: "play";
};

export type UseRoyaltyGameResult = {
  game: GameState;
  finishedTitles: Record<Seat, Title> | null;
  humanSeat: Seat;
  lastPassEvent: PassEvent | null;
  onPlay: (cards: readonly Card[]) => void;
  onPass: () => void;
  restart: () => void;
};

export function useRoyaltyGame(
  _options: UseRoyaltyGameOptions = { mode: "play" },
): UseRoyaltyGameResult {
  const [game, setGame] = useState<GameState>(() => newGame());
  const [humanSeat] = useState<Seat>(() => pickHumanSeat());
  const [lastPassEvent, setLastPassEvent] = useState<PassEvent | null>(null);
  const passKeyRef = useRef(0);

  const recordPass = useCallback((seat: Seat) => {
    passKeyRef.current += 1;
    setLastPassEvent({ seat, key: passKeyRef.current });
  }, []);

  const onPlay = useCallback(
    (cards: readonly Card[]) => {
      setGame((current) => {
        if (gameIsOver(current)) return current;
        if (current.turn !== humanSeat) return current;
        const hand = classifyHand(cards);
        if (hand === null) return current;
        return applyPlay(current, humanSeat, { kind: "play", hand });
      });
    },
    [humanSeat],
  );

  const onPass = useCallback(() => {
    setGame((current) => {
      if (gameIsOver(current)) return current;
      if (current.turn !== humanSeat) return current;
      const next = applyPlay(current, humanSeat, { kind: "pass" });
      if (next !== current) recordPass(humanSeat);
      return next;
    });
  }, [humanSeat, recordPass]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isBotTurn = !gameIsOver(game) && game.turn !== humanSeat;
  const botSeat: Seat = game.turn;

  useEffect(() => {
    if (!isBotTurn) return;
    cancelTimer();
    const action = decide({ phase: "play", state: game, seat: botSeat });
    const delay = action.kind === "pass" ? BOT_PASS_MS : BOT_PLAY_MS;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setGame((current) => {
        if (gameIsOver(current)) return current;
        if (current.turn !== botSeat) return current;
        const next = applyPlay(current, botSeat, action);
        if (next !== current && action.kind === "pass") recordPass(botSeat);
        return next;
      });
    }, delay);
    return cancelTimer;
  }, [isBotTurn, game, botSeat, cancelTimer, recordPass]);

  useEffect(() => cancelTimer, [cancelTimer]);

  const restart = useCallback(() => {
    cancelTimer();
    setLastPassEvent(null);
    passKeyRef.current = 0;
    setGame(newGame());
  }, [cancelTimer]);

  const finishedTitles = useMemo(() => finalTitles(game), [game]);

  return { game, finishedTitles, humanSeat, lastPassEvent, onPlay, onPass, restart };
}
