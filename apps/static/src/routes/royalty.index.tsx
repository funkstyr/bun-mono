import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RoyaltyApp } from "@bun-mono/royalty/royalty-app";

export const Route = createFileRoute("/royalty/")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    document.title = "Royalty";
  }, []);

  return <RoyaltyApp />;
}
