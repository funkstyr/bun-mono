import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_PLAY_MS } from "./engine";
import { emptyLifetime, save, STORAGE_KEY } from "./storage";
import { useRoyaltyGame } from "./use-game";

const MAX_WATCH_TICK_MS = 60_000;

describe("useRoyaltyGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes humanSeat as a number 0..3", () => {
    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    const seat = result.current.humanSeat;
    expect(seat).not.toBeNull();
    expect(seat!).toBeGreaterThanOrEqual(0);
    expect(seat!).toBeLessThanOrEqual(3);
    expect(Number.isInteger(seat)).toBe(true);
  });

  it("advances a bot turn after BOT_PLAY_MS when leading", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(result.current.humanSeat).toBe(0);

    if (result.current.game!.turn === result.current.humanSeat) {
      return;
    }

    const before = result.current.game;
    act(() => {
      vi.advanceTimersByTime(BOT_PLAY_MS - 1);
    });
    expect(result.current.game).toBe(before);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.game).not.toBe(before);
    expect(result.current.game!.trick.top).not.toBeNull();
  });

  it("onPlay is a no-op when called on a non-human turn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    const before = result.current.game!;
    if (before.turn === result.current.humanSeat) return;

    act(() => {
      const someCard = before.players[before.turn].hand[0]!;
      result.current.onPlay([someCard]);
    });

    expect(result.current.game).toBe(before);
  });

  it("clears the pending bot timer on unmount", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const { result, unmount } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    if (result.current.game!.turn === result.current.humanSeat) return;

    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("persists session state to localStorage after mount", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("resumes the same game state on remount", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = renderHook(() => useRoyaltyGame({ mode: "play" }));
    const firstSeat = first.result.current.humanSeat;
    const firstHand = first.result.current.game!.players[firstSeat!].hand;
    const firstTurn = first.result.current.game!.turn;
    first.unmount();

    const second = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(second.result.current.humanSeat).toBe(firstSeat);
    expect(second.result.current.game!.turn).toBe(firstTurn);
    expect(second.result.current.game!.players[firstSeat!].hand).toEqual(firstHand);
  });

  it("re-arms a pending bot turn after remount", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = renderHook(() => useRoyaltyGame({ mode: "play" }));
    if (first.result.current.game!.turn === first.result.current.humanSeat) return;
    first.unmount();

    const second = renderHook(() => useRoyaltyGame({ mode: "play" }));
    const before = second.result.current.game!;
    expect(before.trick.top).toBeNull();
    act(() => {
      vi.advanceTimersByTime(BOT_PLAY_MS);
    });
    expect(second.result.current.game).not.toBe(before);
    expect(second.result.current.game!.trick.top).not.toBeNull();
  });

  it("onEndSession clears the session and exposes the summary", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(result.current.session).not.toBeNull();

    act(() => {
      result.current.onEndSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.game).toBeNull();
    expect(result.current.humanSeat).toBeNull();
    expect(result.current.sessionSummary).not.toBeNull();
    expect(result.current.sessionSummary!.gamesPlayed).toBe(1);
  });

  it("startSession creates a new session after end-session", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));

    act(() => {
      result.current.onEndSession();
    });
    expect(result.current.session).toBeNull();

    act(() => {
      result.current.startSession();
    });
    expect(result.current.session).not.toBeNull();
    expect(result.current.game).not.toBeNull();
    expect(result.current.sessionSummary).toBeNull();
  });

  it("lifetime defaults to zeros without stored data", () => {
    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(result.current.lifetime.gamesPlayed).toBe(0);
    expect(result.current.lifetime.kings).toBe(0);
    expect(result.current.lifetime.longestKingStreak).toBe(0);
  });

  it("loads existing lifetime stats from storage", () => {
    save({
      schemaVersion: 1,
      currentSession: null,
      lifetime: {
        ...emptyLifetime(),
        gamesPlayed: 7,
        kings: 3,
        longestKingStreak: 2,
      },
    });
    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(result.current.lifetime.gamesPlayed).toBe(7);
    expect(result.current.lifetime.kings).toBe(3);
    expect(result.current.lifetime.longestKingStreak).toBe(2);
  });

  describe("watch mode", () => {
    it("starts with no human seat and a dealt game", () => {
      const { result } = renderHook(() => useRoyaltyGame({ mode: "watch" }));
      expect(result.current.humanSeat).toBeNull();
      expect(result.current.session).not.toBeNull();
      expect(result.current.game).not.toBeNull();
      expect(result.current.session!.gameCount).toBe(1);
    });

    it("does not write to localStorage while watching", () => {
      window.localStorage.clear();
      vi.spyOn(Math, "random").mockReturnValue(0);
      const { result } = renderHook(() => useRoyaltyGame({ mode: "watch" }));
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

      act(() => {
        vi.advanceTimersByTime(BOT_PLAY_MS * 4);
      });
      expect(result.current.game!.trick.top).not.toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not load an existing play-mode session blob", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const play = renderHook(() => useRoyaltyGame({ mode: "play" }));
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      const playHumanSeat = play.result.current.humanSeat;
      play.unmount();

      const watch = renderHook(() => useRoyaltyGame({ mode: "watch" }));
      expect(watch.result.current.humanSeat).toBeNull();
      expect(watch.result.current.humanSeat).not.toBe(playHumanSeat);
    });

    it("loops through end-of-game into tribute and the next game", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const { result } = renderHook(() => useRoyaltyGame({ mode: "watch" }));

      const startGameCount = result.current.session!.gameCount;
      let sawTribute = false;
      let sawGameOver = false;
      // Each act() advances one bot-action's worth of fake time, then lets
      // React flush state + re-arm the next setTimeout via useEffect.
      for (let step = 0; step < 2000; step++) {
        if (result.current.tribute !== null) sawTribute = true;
        if (result.current.finishedTitles !== null) sawGameOver = true;
        if (result.current.session!.gameCount > startGameCount) break;
        act(() => {
          vi.advanceTimersByTime(MAX_WATCH_TICK_MS);
        });
      }

      expect(sawGameOver).toBe(true);
      expect(sawTribute).toBe(true);
      expect(result.current.session!.gameCount).toBeGreaterThan(startGameCount);
      expect(result.current.tribute).toBeNull();
      expect(result.current.humanSeat).toBeNull();
      expect(result.current.lifetime.gamesPlayed).toBe(0);
    });

    it("onPlay/onPass are inert in watch mode", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const { result } = renderHook(() => useRoyaltyGame({ mode: "watch" }));
      const before = result.current.game!;
      const card = before.players[before.turn].hand[0]!;
      act(() => {
        result.current.onPlay([card]);
        result.current.onPass();
      });
      expect(result.current.game).toBe(before);
    });

    it("restart reshuffles into a fresh watch session", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const { result } = renderHook(() => useRoyaltyGame({ mode: "watch" }));
      act(() => {
        vi.advanceTimersByTime(BOT_PLAY_MS * 3);
      });
      const midGame = result.current.game!;
      expect(midGame.log.length).toBeGreaterThan(0);

      act(() => {
        result.current.restart();
      });
      expect(result.current.humanSeat).toBeNull();
      expect(result.current.session!.gameCount).toBe(1);
      expect(result.current.game!.log.length).toBe(0);
      expect(result.current.game!.trick.top).toBeNull();
    });
  });
});
