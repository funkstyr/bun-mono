import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readLastUsedSide,
  readStats,
  SIDE_STORAGE_KEY,
  STATS_STORAGE_KEY,
  useTicTacToeGame,
  type StatsBlob,
} from "./use-game";

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

function playSequence(
  result: { current: ReturnType<typeof useTicTacToeGame> },
  moves: readonly number[],
): void {
  for (const move of moves) {
    act(() => {
      result.current.onCellClick(move);
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });
  }
}

describe("useTicTacToeGame stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns score=0 for every difficulty on fresh render and does not write storage", () => {
    const { result } = renderHook(() =>
      useTicTacToeGame({ difficulty: "medium", playerSide: "X" }),
    );

    expect(result.current.score).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(window.localStorage.getItem(STATS_STORAGE_KEY)).toBeNull();
    expect(readStats()).toEqual<StatsBlob>({
      easy: { wins: 0, losses: 0, draws: 0 },
      medium: { wins: 0, losses: 0, draws: 0 },
      hard: { wins: 0, losses: 0, draws: 0 },
    });
  });

  it("restores score from a stored blob on initial render", () => {
    const stored: StatsBlob = {
      easy: { wins: 1, losses: 2, draws: 3 },
      medium: { wins: 4, losses: 5, draws: 6 },
      hard: { wins: 7, losses: 8, draws: 9 },
    };
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useTicTacToeGame({ difficulty: "hard", playerSide: "X" }));
    expect(result.current.score).toEqual({ wins: 7, losses: 8, draws: 9 });
  });

  it("increments only the active difficulty's wins after a player win on Medium", () => {
    const { result } = renderHook(() =>
      useTicTacToeGame({ difficulty: "medium", playerSide: "X" }),
    );

    playSequence(result, [0, 4, 6, 3]);

    expect(result.current.status).toEqual({
      kind: "won",
      winner: "X",
      line: [0, 3, 6],
    });
    expect(result.current.score).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect(readStats()).toEqual<StatsBlob>({
      easy: { wins: 0, losses: 0, draws: 0 },
      medium: { wins: 1, losses: 0, draws: 0 },
      hard: { wins: 0, losses: 0, draws: 0 },
    });
  });

  it("increments only the active difficulty's losses after a player loss on Easy", () => {
    const { result } = renderHook(() => useTicTacToeGame({ difficulty: "easy", playerSide: "X" }));

    playSequence(result, [3, 8, 6]);

    expect(result.current.status).toEqual({
      kind: "won",
      winner: "O",
      line: [0, 1, 2],
    });
    expect(result.current.score).toEqual({ wins: 0, losses: 1, draws: 0 });
    expect(readStats().easy).toEqual({ wins: 0, losses: 1, draws: 0 });
    expect(readStats().medium).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(readStats().hard).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it("increments only the active difficulty's draws after a drawn game on Medium", () => {
    const { result } = renderHook(() =>
      useTicTacToeGame({ difficulty: "medium", playerSide: "X" }),
    );

    playSequence(result, [0, 2, 5, 4, 7]);

    expect(result.current.status).toEqual({ kind: "draw" });
    expect(result.current.score).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(readStats().medium).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(readStats().easy).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(readStats().hard).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it("falls back to all-zero scores when the stored blob is the wrong shape", () => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({ medium: "broken" }));
    const { result } = renderHook(() =>
      useTicTacToeGame({ difficulty: "medium", playerSide: "X" }),
    );
    expect(result.current.score).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it("does not touch the stats blob when restart() is called", () => {
    const seed: StatsBlob = {
      easy: { wins: 0, losses: 0, draws: 0 },
      medium: { wins: 2, losses: 1, draws: 0 },
      hard: { wins: 0, losses: 0, draws: 0 },
    };
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(seed));

    const { result } = renderHook(() =>
      useTicTacToeGame({ difficulty: "medium", playerSide: "X" }),
    );
    expect(result.current.score).toEqual({ wins: 2, losses: 1, draws: 0 });

    act(() => {
      result.current.restart();
    });

    expect(result.current.score).toEqual({ wins: 2, losses: 1, draws: 0 });
    expect(readStats()).toEqual(seed);
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
