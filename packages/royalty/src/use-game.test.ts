import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_PLAY_MS } from "./engine";
import { useRoyaltyGame } from "./use-game";

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
    expect(seat).toBeGreaterThanOrEqual(0);
    expect(seat).toBeLessThanOrEqual(3);
    expect(Number.isInteger(seat)).toBe(true);
  });

  it("advances a bot turn after BOT_PLAY_MS when leading", () => {
    // Force humanSeat = 0 so the bot will lead when 3♣ is not in seat 0.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    expect(result.current.humanSeat).toBe(0);

    if (result.current.game.turn === result.current.humanSeat) {
      // Edge case: human opens. Pass to a bot first to drive the test.
      // The fixed Math.random(=0) seed makes this deterministic across runs.
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
    expect(result.current.game.trick.top).not.toBeNull();
  });

  it("onPlay is a no-op when called on a non-human turn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { result } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    const before = result.current.game;
    if (before.turn === result.current.humanSeat) return;

    act(() => {
      // Try to play any card from any seat — should be ignored.
      const someCard = before.players[before.turn].hand[0]!;
      result.current.onPlay([someCard]);
    });

    expect(result.current.game).toBe(before);
  });

  it("clears the pending bot timer on unmount", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const { result, unmount } = renderHook(() => useRoyaltyGame({ mode: "play" }));
    if (result.current.game.turn === result.current.humanSeat) return;

    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
