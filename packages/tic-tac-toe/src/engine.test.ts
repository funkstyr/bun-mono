import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMove,
  emptyBoard,
  legalMoves,
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

describe("nextAiMove — Medium", () => {
  it("takes an immediate-win move when one exists", () => {
    // O can win at index 2 to complete row 0
    const board = boardFrom("OO.XX....");
    const move = nextAiMove(board, "O", "medium");
    expect(move).toBe(2);
  });

  it("prefers its own win over blocking the opponent", () => {
    // O wins at 6 to complete col 0 (0=O, 3=O). X threatens to win at 7
    // (col 1: 1=X, 4=X). It's O's turn (X has moved 3 times, O 2 times).
    const board = boardFrom("OX.OX...X");
    const move = nextAiMove(board, "O", "medium");
    expect(move).toBe(6);
  });

  it("blocks the opponent's immediate win when no win is available", () => {
    // X threatens to win at 2 (row 0). O has no immediate win.
    const board = boardFrom("XX...O.O.");
    const move = nextAiMove(board, "O", "medium");
    expect(move).toBe(2);
  });

  it("falls back to a legal random cell when neither win nor block is available", () => {
    const board = boardFrom("X...O....");
    for (let i = 0; i < 50; i++) {
      const move = nextAiMove(board, "O", "medium");
      expect(board[move]).toBeNull();
    }
  });
});

function opposite(side: Side): Side {
  return side === "X" ? "O" : "X";
}

function findImmediateWin(board: Board, side: Side): number | null {
  for (const m of legalMoves(board)) {
    const next = applyMove(board, m, side);
    const s = status(next);
    if (s.kind === "won" && s.winner === side) return m;
  }
  return null;
}

describe("nextAiMove — Hard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never hands the opponent an immediate win (no slip)", () => {
    // Disable slip by forcing Math.random > 0.2.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    // Walk many random games; on every Hard move, record any position
    // where the opponent has an immediate winning reply. Use a seeded
    // helper so positions vary across iterations even with Math.random mocked.
    let seed = 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const violations: { game: number; board: Board; winAt: number }[] = [];

    for (let game = 0; game < 50; game++) {
      let board = emptyBoard();
      const hardSide: Side = rand() < 0.5 ? "X" : "O";
      const oppSide = opposite(hardSide);
      while (status(board).kind === "playing") {
        const s = status(board);
        if (s.kind !== "playing") break;
        if (s.turn === hardSide) {
          const move = nextAiMove(board, hardSide, "hard");
          board = applyMove(board, move, hardSide);
          const after = status(board);
          const oppWin = after.kind === "playing" ? findImmediateWin(board, oppSide) : null;
          if (oppWin !== null) violations.push({ game, board, winAt: oppWin });
        } else {
          const moves = legalMoves(board);
          const pick = moves[Math.floor(rand() * moves.length)]!;
          board = applyMove(board, pick, oppSide);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("never loses a 100-game tournament against a uniformly random opponent", () => {
    // Sanity test for minimax correctness. Slip is disabled here (mocked to
    // > 0.2) so the test is deterministic and isolates minimax behavior;
    // the assertion is losses=0, not wins=100, because draws are fine.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let losses = 0;
    for (let g = 0; g < 100; g++) {
      let board = emptyBoard();
      const hardSide: Side = g % 2 === 0 ? "X" : "O";
      while (status(board).kind === "playing") {
        const s = status(board);
        if (s.kind !== "playing") break;
        const toMove = s.turn;
        let move: number;
        if (toMove === hardSide) {
          move = nextAiMove(board, hardSide, "hard");
        } else {
          const moves = legalMoves(board);
          move = moves[Math.floor(rand() * moves.length)]!;
        }
        board = applyMove(board, move, toMove);
      }
      const final = status(board);
      if (final.kind === "won" && final.winner !== hardSide) losses++;
    }
    expect(losses).toBe(0);
  });
});
