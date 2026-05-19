import { useEffect, useState } from "react";

import type { Seat } from "../engine";
import type { PassEvent } from "../use-game";

const PASS_INDICATOR_MS = 900;

export function usePassIndicator(event: PassEvent | null): Seat | null {
  const [visible, setVisible] = useState<{ seat: Seat; key: number } | null>(null);

  useEffect(() => {
    if (event === null) return;
    setVisible(event);

    const id = setTimeout(() => setVisible(null), PASS_INDICATOR_MS);

    return () => clearTimeout(id);
  }, [event]);

  return visible?.seat ?? null;
}
