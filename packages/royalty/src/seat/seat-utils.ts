import type { Seat, Title } from "../engine";

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export const TITLE_LABEL: Record<Title, string> = {
  king: "King",
  queen: "Queen",
  third: "3rd",
  joker: "Joker",
};
