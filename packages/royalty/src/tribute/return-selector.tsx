import { type JSX, useCallback, useMemo, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import { CardButton } from "../card/card-button";
import { cardKey } from "../card/card-labels";
import type { Card } from "../engine";

type ReturnSelectorProps = {
  hand: readonly Card[];
  returnsRemaining: number;
  onReturn: (cards: readonly Card[]) => void;
};

export function ReturnSelector({
  hand,
  returnsRemaining,
  onReturn,
}: ReturnSelectorProps): JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCard = useCallback((card: Card) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = cardKey(card);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  const selected = useMemo(
    () => hand.filter((c) => selectedKeys.has(cardKey(c))),
    [hand, selectedKeys],
  );

  const canSubmit = selected.length === returnsRemaining;

  const submit = useCallback(() => {
    if (!canSubmit) return;

    onReturn(selected);
    setSelectedKeys(new Set());
  }, [canSubmit, onReturn, selected]);

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Pick {returnsRemaining} card{returnsRemaining === 1 ? "" : "s"} to return
        </span>

        <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
          Return ({selected.length}/{returnsRemaining})
        </Button>
      </header>

      <div className="flex flex-wrap gap-1">
        {hand.map((c) => (
          <CardButton
            key={cardKey(c)}
            card={c}
            selected={selectedKeys.has(cardKey(c))}
            onClick={toggleCard}
          />
        ))}
      </div>
    </div>
  );
}
