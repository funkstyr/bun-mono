/// <reference types="vite-plugin-pwa/react" />
import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { toast } from "@bun-mono/core-ui/sonner";

const OFFLINE_TOAST_ID = "pwa-offline-ready";
const UPDATE_TOAST_ID = "pwa-update-available";

export default function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;

    toast.success("Ready to use offline.", {
      id: OFFLINE_TOAST_ID,
      onDismiss: () => setOfflineReady(false),
      onAutoClose: () => setOfflineReady(false),
    });
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;

    toast("New version available.", {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => setNeedRefresh(false),
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
