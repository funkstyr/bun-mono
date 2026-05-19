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

export function legalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) moves.push(i);
  }
  return moves;
}

function opposite(side: Side): Side {
  return side === "X" ? "O" : "X";
}

function findImmediateWin(board: Board, side: Side): number | null {
  for (const move of legalMoves(board)) {
    const next = applyMove(board, move, side);
    const s = status(next);
    if (s.kind === "won" && s.winner === side) return move;
  }
  return null;
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

function pickMedium(board: Board, aiSide: Side): number {
  const win = findImmediateWin(board, aiSide);
  if (win !== null) return win;
  const block = findImmediateWin(board, opposite(aiSide));
  if (block !== null) return block;
  return pickEasy(board);
}

function minimax(
  board: Board,
  toMove: Side,
  aiSide: Side,
  alpha: number,
  beta: number,
): { score: number; move: number } {
  const s = status(board);
  if (s.kind === "won") {
    return { score: s.winner === aiSide ? 1 : -1, move: -1 };
  }
  if (s.kind === "draw") return { score: 0, move: -1 };
  const moves = legalMoves(board);
  const isMaxi = toMove === aiSide;
  let bestScore = isMaxi ? -Infinity : Infinity;
  let bestMove = moves[0]!;
  let a = alpha;
  let b = beta;
  for (const move of moves) {
    const next = applyMove(board, move, toMove);
    const { score } = minimax(next, opposite(toMove), aiSide, a, b);
    if (isMaxi) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (bestScore > a) a = bestScore;
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (bestScore < b) b = bestScore;
    }
    if (a >= b) break;
  }
  return { score: bestScore, move: bestMove };
}

const HARD_SLIP_PROBABILITY = 0.2;

function pickHard(board: Board, aiSide: Side): number {
  if (Math.random() < HARD_SLIP_PROBABILITY) return pickEasy(board);
  return minimax(board, aiSide, aiSide, -Infinity, Infinity).move;
}

export function nextAiMove(board: Board, aiSide: Side, difficulty: Difficulty): number {
  if (difficulty === "easy") return pickEasy(board);
  if (difficulty === "medium") return pickMedium(board, aiSide);
  return pickHard(board, aiSide);
}
