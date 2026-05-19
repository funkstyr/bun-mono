export type Side = "X" | "O";
export type Cell = Side | null;
export type Board = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];
export type Difficulty = "easy" | "medium" | "hard";
export type WinningLine = readonly [number, number, number];
export type GameStatus =
  | { kind: "playing"; turn: Side }
  | { kind: "won"; winner: Side; line: WinningLine }
  | { kind: "draw" };

const LINES: readonly WinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Board {
  return [null, null, null, null, null, null, null, null, null];
}

function legalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) moves.push(i);
  }
  return moves;
}

function findWinner(board: Board): { winner: Side; line: WinningLine } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const cell = board[a];
    if (cell && cell === board[b] && cell === board[c]) {
      return { winner: cell, line };
    }
  }
  return null;
}

export function status(board: Board): GameStatus {
  const won = findWinner(board);
  if (won) return { kind: "won", winner: won.winner, line: won.line };
  const xCount = board.filter((c) => c === "X").length;
  const oCount = board.filter((c) => c === "O").length;
  if (xCount + oCount === 9) return { kind: "draw" };
  return { kind: "playing", turn: xCount === oCount ? "X" : "O" };
}

export function applyMove(board: Board, index: number, side: Side): Board {
  if (index < 0 || index > 8) return board;
  if (board[index] !== null) return board;
  if (status(board).kind !== "playing") return board;
  const next = board.slice() as Cell[];
  next[index] = side;
  return next as unknown as Board;
}

function pickEasy(board: Board): number {
  const moves = legalMoves(board);
  return moves[Math.floor(Math.random() * moves.length)]!;
}

export function nextAiMove(board: Board, _aiSide: Side, difficulty: Difficulty): number {
  if (difficulty === "easy") return pickEasy(board);
  return pickEasy(board);
}
