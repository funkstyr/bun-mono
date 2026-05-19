import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { decide } from "./bot";
import {
  applyPlay,
  askCard,
  BETWEEN_GAMES_MS,
  BOT_ASK_MS,
  BOT_PASS_MS,
  BOT_PLAY_MS,
  BOT_RETURN_MS,
  classifyHand,
  dealGame,
  finalTitles,
  finalizeTribute,
  freshDealFor,
  gameIsOver,
  returnCards,
  startKingTribute,
  startQueenTribute,
  tributeComplete,
  type Card,
  type GameState,
  type Seat,
  type Title,
  type TributeState,
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

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

function effectiveTargetHand(fresh: GameState, t: TributeState): readonly Card[] {
  const receivedKeys = new Set(t.received.map(cardKey));
  return fresh.players[t.target].hand.filter((c) => !receivedKeys.has(cardKey(c)));
}

function effectiveAskerHand(fresh: GameState, t: TributeState): readonly Card[] {
  const returnedKeys = new Set(t.returned.map(cardKey));
  return fresh.players[t.asker].hand.filter((c) => !returnedKeys.has(cardKey(c)));
}

export type PassEvent = { seat: Seat; key: number };

export type TributeBundle = {
  king: TributeState;
  queen: TributeState;
  fresh: GameState;
  freshSeed: number;
};

export type UseRoyaltyGameOptions = {
  mode: "play";
};

export type TributeView = {
  king: TributeState;
  queen: TributeState;
  current: TributeState;
  role: "king" | "queen";
  askerHand: readonly Card[];
  targetHand: readonly Card[];
};

export type UseRoyaltyGameResult = {
  game: GameState;
  finishedTitles: Record<Seat, Title> | null;
  humanSeat: Seat;
  lastPassEvent: PassEvent | null;
  tribute: TributeView | null;
  onPlay: (cards: readonly Card[]) => void;
  onPass: () => void;
  onAsk: (card: Card) => void;
  onReturn: (cards: readonly Card[]) => void;
  restart: () => void;
};

type RoyaltyState = {
  game: GameState;
  tribute: TributeBundle | null;
};

function currentRoleAndTribute(
  bundle: TributeBundle,
): { role: "king" | "queen"; tribute: TributeState } | null {
  if (!tributeComplete(bundle.king)) return { role: "king", tribute: bundle.king };
  if (!tributeComplete(bundle.queen)) return { role: "queen", tribute: bundle.queen };
  return null;
}

function withTributeUpdated(
  bundle: TributeBundle,
  role: "king" | "queen",
  next: TributeState,
): TributeBundle {
  return role === "king" ? { ...bundle, king: next } : { ...bundle, queen: next };
}

export function useRoyaltyGame(
  _options: UseRoyaltyGameOptions = { mode: "play" },
): UseRoyaltyGameResult {
  const [state, setState] = useState<RoyaltyState>(() => ({
    game: newGame(),
    tribute: null,
  }));
  const [humanSeat] = useState<Seat>(() => pickHumanSeat());
  const [lastPassEvent, setLastPassEvent] = useState<PassEvent | null>(null);
  const passKeyRef = useRef(0);

  const recordPass = useCallback((seat: Seat) => {
    passKeyRef.current += 1;
    setLastPassEvent({ seat, key: passKeyRef.current });
  }, []);

  const { game, tribute } = state;

  const onPlay = useCallback(
    (cards: readonly Card[]) => {
      setState((s) => {
        if (s.tribute !== null) return s;
        if (gameIsOver(s.game)) return s;
        if (s.game.turn !== humanSeat) return s;
        const hand = classifyHand(cards);
        if (hand === null) return s;
        const next = applyPlay(s.game, humanSeat, { kind: "play", hand });
        if (next === s.game) return s;
        return { ...s, game: next };
      });
    },
    [humanSeat],
  );

  const onPass = useCallback(() => {
    setState((s) => {
      if (s.tribute !== null) return s;
      if (gameIsOver(s.game)) return s;
      if (s.game.turn !== humanSeat) return s;
      const next = applyPlay(s.game, humanSeat, { kind: "pass" });
      if (next === s.game) return s;
      recordPass(humanSeat);
      return { ...s, game: next };
    });
  }, [humanSeat, recordPass]);

  const onAsk = useCallback(
    (card: Card) => {
      setState((s) => {
        if (s.tribute === null) return s;
        const active = currentRoleAndTribute(s.tribute);
        if (active === null) return s;
        if (active.tribute.phase !== "ask") return s;
        if (active.tribute.asker !== humanSeat) return s;
        const targetHand = effectiveTargetHand(s.tribute.fresh, active.tribute);
        const { state: next } = askCard(active.tribute, card, targetHand);
        if (next === active.tribute) return s;
        return { ...s, tribute: withTributeUpdated(s.tribute, active.role, next) };
      });
    },
    [humanSeat],
  );

  const onReturn = useCallback(
    (cards: readonly Card[]) => {
      setState((s) => {
        if (s.tribute === null) return s;
        const active = currentRoleAndTribute(s.tribute);
        if (active === null) return s;
        if (active.tribute.phase !== "return") return s;
        if (active.tribute.asker !== humanSeat) return s;
        const next = returnCards(active.tribute, cards);
        if (next === active.tribute) return s;
        return { ...s, tribute: withTributeUpdated(s.tribute, active.role, next) };
      });
    },
    [humanSeat],
  );

  useEffect(() => {
    if (state.tribute === null && !gameIsOver(state.game) && state.game.turn !== humanSeat) {
      const botSeat = state.game.turn;
      const action = decide({ phase: "play", state: state.game, seat: botSeat });
      if (action.kind !== "play" && action.kind !== "pass") return undefined;
      const playAction = action;
      const delay = playAction.kind === "pass" ? BOT_PASS_MS : BOT_PLAY_MS;
      const id = setTimeout(() => {
        setState((s) => {
          if (s.tribute !== null) return s;
          if (gameIsOver(s.game)) return s;
          if (s.game.turn !== botSeat) return s;
          const next = applyPlay(s.game, botSeat, playAction);
          if (next === s.game) return s;
          if (playAction.kind === "pass") recordPass(botSeat);
          return { ...s, game: next };
        });
      }, delay);
      return () => clearTimeout(id);
    }

    if (state.tribute === null && gameIsOver(state.game)) {
      const freshSeed = makeSeed();
      const id = setTimeout(() => {
        setState((s) => {
          if (s.tribute !== null) return s;
          if (!gameIsOver(s.game)) return s;
          return {
            ...s,
            tribute: {
              king: startKingTribute(s.game),
              queen: startQueenTribute(s.game),
              freshSeed,
              fresh: freshDealFor(s.game, freshSeed),
            },
          };
        });
      }, BETWEEN_GAMES_MS);
      return () => clearTimeout(id);
    }

    if (state.tribute !== null) {
      const active = currentRoleAndTribute(state.tribute);

      if (active === null) {
        const id = setTimeout(() => {
          setState((s) => {
            if (s.tribute === null) return s;
            if (currentRoleAndTribute(s.tribute) !== null) return s;
            const next = finalizeTribute(
              s.game,
              s.tribute.king,
              s.tribute.queen,
              s.tribute.freshSeed,
            );
            return { game: next, tribute: null };
          });
        }, 0);
        return () => clearTimeout(id);
      }

      const { role, tribute: current } = active;
      if (current.asker === humanSeat) return;

      if (current.phase === "ask") {
        const askerHand = effectiveAskerHand(state.tribute.fresh, current);
        const action = decide({ phase: "tribute-ask", state: current, askerHand });
        if (action.kind !== "ask") return;
        const id = setTimeout(() => {
          setState((s) => {
            if (s.tribute === null) return s;
            const a = currentRoleAndTribute(s.tribute);
            if (a === null || a.role !== role) return s;
            const targetHand = effectiveTargetHand(s.tribute.fresh, a.tribute);
            const { state: next } = askCard(a.tribute, action.card, targetHand);
            if (next === a.tribute) return s;
            return { ...s, tribute: withTributeUpdated(s.tribute, role, next) };
          });
        }, BOT_ASK_MS);
        return () => clearTimeout(id);
      }

      if (current.returnsRemaining === 0) return;

      const giverHand = effectiveAskerHand(state.tribute.fresh, current);
      const action = decide({ phase: "tribute-return", state: current, giverHand });
      if (action.kind !== "return") return;
      const delay = BOT_RETURN_MS * Math.max(action.cards.length, 1);
      const id = setTimeout(() => {
        setState((s) => {
          if (s.tribute === null) return s;
          const a = currentRoleAndTribute(s.tribute);
          if (a === null || a.role !== role) return s;
          const next = returnCards(a.tribute, action.cards);
          if (next === a.tribute) return s;
          return { ...s, tribute: withTributeUpdated(s.tribute, role, next) };
        });
      }, delay);
      return () => clearTimeout(id);
    }

    return undefined;
  }, [state, humanSeat, recordPass]);

  const restart = useCallback(() => {
    setLastPassEvent(null);
    passKeyRef.current = 0;
    setState({ game: newGame(), tribute: null });
  }, []);

  const finishedTitles = useMemo(() => finalTitles(game), [game]);

  const tributeView = useMemo<TributeView | null>(() => {
    if (tribute === null) return null;
    const active = currentRoleAndTribute(tribute);
    if (active === null) return null;
    return {
      king: tribute.king,
      queen: tribute.queen,
      current: active.tribute,
      role: active.role,
      askerHand: effectiveAskerHand(tribute.fresh, active.tribute),
      targetHand: effectiveTargetHand(tribute.fresh, active.tribute),
    };
  }, [tribute]);

  return {
    game,
    finishedTitles,
    humanSeat,
    lastPassEvent,
    tribute: tributeView,
    onPlay,
    onPass,
    onAsk,
    onReturn,
    restart,
  };
}
