import { createFileRoute } from "@tanstack/react-router";

import { RoyaltyApp } from "@bun-mono/royalty/royalty-app";

export const Route = createFileRoute("/royalty")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RoyaltyApp />;
}
