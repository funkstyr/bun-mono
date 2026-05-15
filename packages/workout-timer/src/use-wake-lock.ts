import { useEffect } from "react";

type Sentinel = { release: () => Promise<void>; released?: boolean };

type WakeLockApi = {
  request: (type: "screen") => Promise<Sentinel>;
};

function getApi(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  return api ?? null;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = getApi();
    if (!api) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await api.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
      } catch {
        // silently ignore — feature requires user activation, may reject
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled && sentinel?.released !== false) {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [active]);
}
