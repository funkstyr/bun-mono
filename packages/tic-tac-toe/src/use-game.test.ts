import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLastUsedSide, SIDE_STORAGE_KEY, useTicTacToeGame } from "./use-game";

describe("useTicTacToeGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AI takes the opening move after ~350ms when player is O", () => {
    const { result } = renderHook(() => useTicTacToeGame({ difficulty: "easy", playerSide: "O" }));

    expect(result.current.isAiThinking).toBe(true);
    expect(result.current.board.every((cell) => cell === null)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(result.current.board.every((cell) => cell === null)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const placed = result.current.board.filter((cell) => cell !== null);
    expect(placed).toEqual(["X"]);
    expect(result.current.isAiThinking).toBe(false);
  });

  it("onCellClick is a no-op while the AI is thinking", () => {
    const { result } = renderHook(() => useTicTacToeGame({ difficulty: "easy", playerSide: "X" }));

    act(() => {
      result.current.onCellClick(0);
    });

    expect(result.current.board[0]).toBe("X");
    expect(result.current.isAiThinking).toBe(true);

    act(() => {
      result.current.onCellClick(1);
    });

    expect(result.current.board[1]).toBeNull();
  });

  it("persists the current playerSide to localStorage on each player move", () => {
    const { result: x } = renderHook(() =>
      useTicTacToeGame({ difficulty: "easy", playerSide: "X" }),
    );
    act(() => {
      x.current.onCellClick(4);
    });
    expect(window.localStorage.getItem(SIDE_STORAGE_KEY)).toBe("X");

    window.localStorage.removeItem(SIDE_STORAGE_KEY);

    const { result: o } = renderHook(() =>
      useTicTacToeGame({ difficulty: "easy", playerSide: "O" }),
    );
    act(() => {
      vi.advanceTimersByTime(350);
    });
    const firstEmpty = o.current.board.findIndex((cell) => cell === null);
    act(() => {
      o.current.onCellClick(firstEmpty);
    });
    expect(window.localStorage.getItem(SIDE_STORAGE_KEY)).toBe("O");
  });
});

describe("readLastUsedSide", () => {
  it("defaults to X when localStorage has no stored side", () => {
    expect(readLastUsedSide()).toBe("X");
  });

  it("restores the previously stored side", () => {
    window.localStorage.setItem(SIDE_STORAGE_KEY, "O");
    expect(readLastUsedSide()).toBe("O");
  });

  it("falls back to X when the stored value is not a recognised side", () => {
    window.localStorage.setItem(SIDE_STORAGE_KEY, "Z");
    expect(readLastUsedSide()).toBe("X");
  });
});
