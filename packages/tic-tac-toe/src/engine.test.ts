import { describe, expect, it } from "vitest";

import {
  applyMove,
  emptyBoard,
  nextAiMove,
  status,
  type Board,
  type Cell,
  type Side,
} from "./engine";

function boardFrom(cells: string): Board {
  if (cells.length !== 9) throw new Error("board string must be 9 chars");
  const arr: Cell[] = [];
  for (const ch of cells) {
    if (ch === "X" || ch === "O") arr.push(ch as Side);
    else arr.push(null);
  }
  return arr as unknown as Board;
}

describe("emptyBoard", () => {
  it("returns 9 nulls", () => {
    expect(emptyBoard()).toEqual([null, null, null, null, null, null, null, null, null]);
  });
});

describe("status — winning lines", () => {
  const rows = [
    ["XXX......", [0, 1, 2]],
    ["...XXX...", [3, 4, 5]],
    ["......XXX", [6, 7, 8]],
  ] as const;
  const cols = [
    ["X..X..X..", [0, 3, 6]],
    [".X..X..X.", [1, 4, 7]],
    ["..X..X..X", [2, 5, 8]],
  ] as const;
  const diags = [
    ["X...X...X", [0, 4, 8]],
    ["..X.X.X..", [2, 4, 6]],
  ] as const;

  for (const [cells, line] of [...rows, ...cols, ...diags]) {
    it(`detects X win on ${cells}`, () => {
      const result = status(boardFrom(cells));
      expect(result).toEqual({ kind: "won", winner: "X", line });
    });

    it(`detects O win on ${cells.replaceAll("X", "O")}`, () => {
      const result = status(boardFrom(cells.replaceAll("X", "O")));
      expect(result).toEqual({ kind: "won", winner: "O", line });
    });
  }
});

describe("status — draw vs in-progress", () => {
  it("identifies a full board with no winner as draw", () => {
    expect(status(boardFrom("XOXXOOOXX")).kind).toBe("draw");
  });

  it("identifies an empty board as playing (X to move)", () => {
    expect(status(emptyBoard())).toEqual({ kind: "playing", turn: "X" });
  });

  it("alternates turn based on counts", () => {
    expect(status(boardFrom("X........"))).toEqual({ kind: "playing", turn: "O" });
    expect(status(boardFrom("XO......."))).toEqual({ kind: "playing", turn: "X" });
  });
});

describe("applyMove — forgiveness", () => {
  it("places a move on an empty cell", () => {
    const next = applyMove(emptyBoard(), 4, "X");
    expect(next[4]).toBe("X");
  });

  it("returns the same board (unchanged) when the cell is occupied", () => {
    const start = boardFrom("X........");
    const next = applyMove(start, 0, "O");
    expect(next).toEqual(start);
  });

  it("returns the board unchanged when the game has already been won", () => {
    const start = boardFrom("XXX......");
    const next = applyMove(start, 3, "O");
    expect(next).toEqual(start);
  });

  it("returns the board unchanged when the game is already a draw", () => {
    const start = boardFrom("XOXXOOOXX");
    const next = applyMove(start, 0, "X");
    expect(next).toEqual(start);
  });
});

describe("nextAiMove — Easy", () => {
  it("returns a legal cell on an empty board", () => {
    const move = nextAiMove(emptyBoard(), "O", "easy");
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThan(9);
    expect(emptyBoard()[move]).toBeNull();
  });

  it("only returns indices of empty cells across many samples", () => {
    const board = boardFrom("XOXOX.O.X");
    for (let i = 0; i < 100; i++) {
      const move = nextAiMove(board, "O", "easy");
      expect(board[move]).toBeNull();
    }
  });
});
