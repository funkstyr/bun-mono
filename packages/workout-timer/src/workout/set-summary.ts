import { formatMmSs } from "../format";
import type { SavedSet } from "../schemas";

export function setSummary(set: SavedSet): string {
  const { rounds, activeSec, restSec } = set.config;
  return `${rounds} rounds · ${formatMmSs(activeSec)} / ${formatMmSs(restSec)}`;
}
