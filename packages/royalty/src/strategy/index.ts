import { easy } from "./easy";
import { hard } from "./hard";
import type { Strategy, StrategyName } from "./types";

export const STRATEGIES: Record<StrategyName, Strategy> = { easy, hard };

export type { BotAction, Strategy, StrategyName } from "./types";
