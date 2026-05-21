import { createFileRoute, Outlet } from "@tanstack/react-router";

// No auth gate on the parent layout — `/chat/r/:slug` accepts anonymous
// Spectators, and only the `/chat` index (Memberships list + Create Room
// CTA) requires a session. Each child route enforces its own auth
// requirement.
export const Route = createFileRoute("/chat")({
  component: RouteComponent,
});

function RouteComponent(): React.ReactElement {
  return <Outlet />;
}
