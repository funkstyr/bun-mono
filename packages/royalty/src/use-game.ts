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
import {
  emptyLifetime,
  emptyRoleCounts,
  load,
  recordGameOver,
  save,
  summarizeSession,
  type LifetimeBlob,
  type RoleCounts,
  type SessionBlob,
  type SessionSummary,
} from "./storage";

function makeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
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
  mode: "play" | "watch";
};

export type TributeView = {
  king: TributeState;
  queen: TributeState;
  current: TributeState;
  role: "king" | "queen";
  askerHand: readonly Card[];
  targetHand: readonly Card[];
};

export type ActiveSession = {
  humanSeat: Seat | null;
  gameCount: number;
  sessionRoleCounts: RoleCounts;
};

export type UseRoyaltyGameResult = {
  session: ActiveSession | null;
  game: GameState | null;
  finishedTitles: Record<Seat, Title> | null;
  humanSeat: Seat | null;
  lifetime: LifetimeBlob;
  lastPassEvent: PassEvent | null;
  tribute: TributeView | null;
  sessionSummary: SessionSummary | null;
  onPlay: (cards: readonly Card[]) => void;
  onPass: () => void;
  onAsk: (card: Card) => void;
  onReturn: (cards: readonly Card[]) => void;
  onEndSession: () => void;
  dismissSessionSummary: () => void;
  startSession: () => void;
  restart: () => void;
};

type RoyaltyState = {
  session: SessionBlob | null;
  lifetime: LifetimeBlob;
};

function newPlaySession(): SessionBlob {
  const seed = makeSeed();
  return {
    humanSeat: pickHumanSeat(),
    seed,
    game: dealGame(seed, "three-of-clubs-holder"),
    tribute: null,
    titlesFromLastGame: null,
    gameCount: 1,
    sessionRoleCounts: emptyRoleCounts(),
  };
}

function newWatchSession(): SessionBlob {
  const seed = makeSeed();
  return {
    humanSeat: null,
    seed,
    game: dealGame(seed, "three-of-clubs-holder"),
    tribute: null,
    titlesFromLastGame: null,
    gameCount: 1,
    sessionRoleCounts: emptyRoleCounts(),
  };
}

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

function loadInitial(mode: "play" | "watch"): RoyaltyState {
  if (mode === "watch") {
    return { session: newWatchSession(), lifetime: emptyLifetime() };
  }
  const stored = load();
  return {
    session: stored.currentSession ?? newPlaySession(),
    lifetime: stored.lifetime,
  };
}

export function useRoyaltyGame(
  options: UseRoyaltyGameOptions = { mode: "play" },
): UseRoyaltyGameResult {
  const { mode } = options;
  const [state, setState] = useState<RoyaltyState>(() => loadInitial(mode));
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [lastPassEvent, setLastPassEvent] = useState<PassEvent | null>(null);
  const passKeyRef = useRef(0);

  useEffect(() => {
    if (mode === "watch") return;
    save({ schemaVersion: 1, currentSession: state.session, lifetime: state.lifetime });
  }, [mode, state]);

  const recordPass = useCallback((seat: Seat) => {
    passKeyRef.current += 1;
    setLastPassEvent({ seat, key: passKeyRef.current });
  }, []);

  const { session, lifetime } = state;
  const humanSeat = session?.humanSeat ?? null;
  const game = session?.game ?? null;
  const tribute = session?.tribute ?? null;

  const onPlay = useCallback((cards: readonly Card[]) => {
    setState((s) => {
      if (s.session === null) return s;
      const seat = s.session.humanSeat;
      if (seat === null) return s;
      if (s.session.tribute !== null) return s;
      if (gameIsOver(s.session.game)) return s;
      if (s.session.game.turn !== seat) return s;
      const hand = classifyHand(cards);
      if (hand === null) return s;
      const next = applyPlay(s.session.game, seat, { kind: "play", hand });
      if (next === s.session.game) return s;
      return { ...s, session: { ...s.session, game: next } };
    });
  }, []);

  const onPass = useCallback(() => {
    setState((s) => {
      if (s.session === null) return s;
      const seat = s.session.humanSeat;
      if (seat === null) return s;
      if (s.session.tribute !== null) return s;
      if (gameIsOver(s.session.game)) return s;
      if (s.session.game.turn !== seat) return s;
      const next = applyPlay(s.session.game, seat, { kind: "pass" });
      if (next === s.session.game) return s;
      recordPass(seat);
      return { ...s, session: { ...s.session, game: next } };
    });
  }, [recordPass]);

  const onAsk = useCallback((card: Card) => {
    setState((s) => {
      if (s.session === null) return s;
      const t = s.session.tribute;
      if (t === null) return s;
      const seat = s.session.humanSeat;
      if (seat === null) return s;
      const active = currentRoleAndTribute(t);
      if (active === null) return s;
      if (active.tribute.phase !== "ask") return s;
      if (active.tribute.asker !== seat) return s;
      const targetHand = effectiveTargetHand(t.fresh, active.tribute);
      const { state: next } = askCard(active.tribute, card, targetHand);
      if (next === active.tribute) return s;
      return {
        ...s,
        session: {
          ...s.session,
          tribute: withTributeUpdated(t, active.role, next),
        },
      };
    });
  }, []);

  const onReturn = useCallback((cards: readonly Card[]) => {
    setState((s) => {
      if (s.session === null) return s;
      const t = s.session.tribute;
      if (t === null) return s;
      const seat = s.session.humanSeat;
      if (seat === null) return s;
      const active = currentRoleAndTribute(t);
      if (active === null) return s;
      if (active.tribute.phase !== "return") return s;
      if (active.tribute.asker !== seat) return s;
      const next = returnCards(active.tribute, cards);
      if (next === active.tribute) return s;
      return {
        ...s,
        session: {
          ...s.session,
          tribute: withTributeUpdated(t, active.role, next),
        },
      };
    });
  }, []);

  useEffect(() => {
    if (session === null) return undefined;
    const seat = session.humanSeat;
    const currentTribute = session.tribute;
    const currentGame = session.game;

    if (currentTribute === null && !gameIsOver(currentGame) && currentGame.turn !== seat) {
      const botSeat = currentGame.turn;
      const action = decide({ phase: "play", state: currentGame, seat: botSeat });
      if (action.kind !== "play" && action.kind !== "pass") return undefined;
      const playAction = action;
      const delay = playAction.kind === "pass" ? BOT_PASS_MS : BOT_PLAY_MS;
      const id = setTimeout(() => {
        setState((s) => {
          if (s.session === null) return s;
          if (s.session.tribute !== null) return s;
          if (gameIsOver(s.session.game)) return s;
          if (s.session.game.turn !== botSeat) return s;
          const next = applyPlay(s.session.game, botSeat, playAction);
          if (next === s.session.game) return s;
          if (playAction.kind === "pass") recordPass(botSeat);
          return { ...s, session: { ...s.session, game: next } };
        });
      }, delay);
      return () => clearTimeout(id);
    }

    if (currentTribute === null && gameIsOver(currentGame)) {
      const freshSeed = makeSeed();
      const id = setTimeout(() => {
        setState((s) => {
          if (s.session === null) return s;
          if (s.session.tribute !== null) return s;
          if (!gameIsOver(s.session.game)) return s;
          const titles = finalTitles(s.session.game);
          if (titles === null) return s;
          const humanSeatForScoring = s.session.humanSeat;
          const { lifetime: nextLifetime, sessionRoleCounts: nextCounts } =
            humanSeatForScoring === null
              ? { lifetime: s.lifetime, sessionRoleCounts: s.session.sessionRoleCounts }
              : recordGameOver(
                  s.lifetime,
                  s.session.sessionRoleCounts,
                  humanSeatForScoring,
                  titles,
                );
          return {
            lifetime: nextLifetime,
            session: {
              ...s.session,
              titlesFromLastGame: titles,
              sessionRoleCounts: nextCounts,
              tribute: {
                king: startKingTribute(s.session.game),
                queen: startQueenTribute(s.session.game),
                freshSeed,
                fresh: freshDealFor(s.session.game, freshSeed),
              },
            },
          };
        });
      }, BETWEEN_GAMES_MS);
      return () => clearTimeout(id);
    }

    if (currentTribute !== null) {
      const active = currentRoleAndTribute(currentTribute);

      if (active === null) {
        const id = setTimeout(() => {
          setState((s) => {
            if (s.session === null) return s;
            const t = s.session.tribute;
            if (t === null) return s;
            if (currentRoleAndTribute(t) !== null) return s;
            const next = finalizeTribute(s.session.game, t.king, t.queen, t.freshSeed);
            return {
              ...s,
              session: {
                ...s.session,
                seed: t.freshSeed,
                game: next,
                tribute: null,
                gameCount: s.session.gameCount + 1,
              },
            };
          });
        }, 0);
        return () => clearTimeout(id);
      }

      const { role, tribute: current } = active;
      if (seat !== null && current.asker === seat) return undefined;

      if (current.phase === "ask") {
        const askerHand = effectiveAskerHand(currentTribute.fresh, current);
        const action = decide({ phase: "tribute-ask", state: current, askerHand });
        if (action.kind !== "ask") return undefined;
        const id = setTimeout(() => {
          setState((s) => {
            if (s.session === null) return s;
            const t = s.session.tribute;
            if (t === null) return s;
            const a = currentRoleAndTribute(t);
            if (a === null || a.role !== role) return s;
            const targetHand = effectiveTargetHand(t.fresh, a.tribute);
            const { state: next } = askCard(a.tribute, action.card, targetHand);
            if (next === a.tribute) return s;
            return {
              ...s,
              session: { ...s.session, tribute: withTributeUpdated(t, role, next) },
            };
          });
        }, BOT_ASK_MS);
        return () => clearTimeout(id);
      }

      if (current.returnsRemaining === 0) return undefined;

      const giverHand = effectiveAskerHand(currentTribute.fresh, current);
      const action = decide({ phase: "tribute-return", state: current, giverHand });
      if (action.kind !== "return") return undefined;
      const delay = BOT_RETURN_MS * Math.max(action.cards.length, 1);
      const id = setTimeout(() => {
        setState((s) => {
          if (s.session === null) return s;
          const t = s.session.tribute;
          if (t === null) return s;
          const a = currentRoleAndTribute(t);
          if (a === null || a.role !== role) return s;
          const next = returnCards(a.tribute, action.cards);
          if (next === a.tribute) return s;
          return {
            ...s,
            session: { ...s.session, tribute: withTributeUpdated(t, role, next) },
          };
        });
      }, delay);
      return () => clearTimeout(id);
    }

    return undefined;
  }, [session, recordPass]);

  const restart = useCallback(() => {
    setLastPassEvent(null);
    passKeyRef.current = 0;
    setSessionSummary(null);
    setState((s) => {
      if (mode === "watch") {
        return { ...s, session: newWatchSession() };
      }
      const seed = makeSeed();
      if (s.session === null) {
        return { ...s, session: newPlaySession() };
      }
      return {
        ...s,
        session: {
          ...s.session,
          seed,
          game: dealGame(seed, "three-of-clubs-holder"),
          tribute: null,
          titlesFromLastGame: null,
        },
      };
    });
  }, [mode]);

  const startSession = useCallback(() => {
    setLastPassEvent(null);
    passKeyRef.current = 0;
    setSessionSummary(null);
    setState((s) => ({
      ...s,
      session: mode === "watch" ? newWatchSession() : newPlaySession(),
    }));
  }, [mode]);

  const onEndSession = useCallback(() => {
    setLastPassEvent(null);
    passKeyRef.current = 0;
    setState((s) => {
      if (s.session === null) return s;
      let finalLifetime = s.lifetime;
      let finalSession = s.session;
      if (
        finalSession.tribute === null &&
        finalSession.titlesFromLastGame === null &&
        gameIsOver(finalSession.game)
      ) {
        const titles = finalTitles(finalSession.game);
        if (titles !== null && finalSession.humanSeat !== null) {
          const result = recordGameOver(
            finalLifetime,
            finalSession.sessionRoleCounts,
            finalSession.humanSeat,
            titles,
          );
          finalLifetime = result.lifetime;
          finalSession = {
            ...finalSession,
            titlesFromLastGame: titles,
            sessionRoleCounts: result.sessionRoleCounts,
          };
        }
      }
      setSessionSummary(summarizeSession(finalSession));
      return { lifetime: finalLifetime, session: null };
    });
  }, []);

  const dismissSessionSummary = useCallback(() => {
    setSessionSummary(null);
  }, []);

  const finishedTitles = useMemo(() => (game === null ? null : finalTitles(game)), [game]);

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

  const activeSession = useMemo<ActiveSession | null>(() => {
    if (session === null) return null;
    return {
      humanSeat: session.humanSeat,
      gameCount: session.gameCount,
      sessionRoleCounts: session.sessionRoleCounts,
    };
  }, [session]);

  return {
    session: activeSession,
    game,
    finishedTitles,
    humanSeat,
    lifetime: lifetime ?? emptyLifetime(),
    lastPassEvent,
    tribute: tributeView,
    sessionSummary,
    onPlay,
    onPass,
    onAsk,
    onReturn,
    onEndSession,
    dismissSessionSummary,
    startSession,
    restart,
  };
}
