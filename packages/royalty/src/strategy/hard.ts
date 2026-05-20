import { decidePlay, decideTributeAsk, decideTributeReturn } from "./easy";
import type { Strategy } from "./types";

export const hard: Strategy = { decidePlay, decideTributeAsk, decideTributeReturn };
