import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RoyaltyWatch } from "@bun-mono/royalty/royalty-watch";

export const Route = createFileRoute("/royalty/watch")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    document.title = "Royalty — Watch";
  }, []);

  return <RoyaltyWatch />;
}
