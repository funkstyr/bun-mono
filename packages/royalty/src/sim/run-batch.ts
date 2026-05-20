import { decide } from "../bot";
import {
  ALL_SEATS,
  applyPlay,
  dealGame,
  finalTitles,
  gameIsOver,
  type Seat,
  type Title,
} from "../engine";
import type { StrategyName } from "../strategy";

export type RoleDistribution = Record<
  Seat,
  { king: number; queen: number; third: number; joker: number }
>;

export type RunBatchArgs = {
  strategies: Record<Seat, StrategyName>;
  n: number;
  seed?: number;
};

type Counts = Record<Seat, Record<Title, number>>;

const MAX_TURNS_PER_GAME = 10_000;

export function runBatch(args: RunBatchArgs): RoleDistribution {
  const counts = emptyCounts();

  for (let i = 0; i < args.n; i++) {
    const seed = args.seed === undefined ? randomSeed() : args.seed + i;
    const titles = playOneGame(seed, args.strategies);
    for (const seat of ALL_SEATS) {
      counts[seat][titles[seat]] += 1;
    }
  }

  const result = {} as RoleDistribution;
  for (const seat of ALL_SEATS) {
    result[seat] = {
      king: percent(counts[seat].king, args.n),
      queen: percent(counts[seat].queen, args.n),
      third: percent(counts[seat].third, args.n),
      joker: percent(counts[seat].joker, args.n),
    };
  }
  return result;
}

function playOneGame(seed: number, strategies: Record<Seat, StrategyName>): Record<Seat, Title> {
  let state = dealGame(seed, "three-of-clubs-holder");
  for (let turn = 0; turn < MAX_TURNS_PER_GAME; turn++) {
    if (gameIsOver(state)) break;
    const seat = state.turn;
    const action = decide({ phase: "play", strategy: strategies[seat], state, seat });
    if (action.kind !== "play" && action.kind !== "pass") break;
    const next = applyPlay(state, seat, action);
    if (next === state) break;
    state = next;
  }
  const titles = finalTitles(state);
  if (titles === null) throw new Error("runBatch: game failed to finish");
  return titles;
}

function emptyCounts(): Counts {
  return {
    0: { king: 0, queen: 0, third: 0, joker: 0 },
    1: { king: 0, queen: 0, third: 0, joker: 0 },
    2: { king: 0, queen: 0, third: 0, joker: 0 },
    3: { king: 0, queen: 0, third: 0, joker: 0 },
  };
}

function percent(count: number, n: number): number {
  return Math.round((count / n) * 1000) / 10;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
