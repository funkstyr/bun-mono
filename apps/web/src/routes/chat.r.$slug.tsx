import { createFileRoute } from "@tanstack/react-router";

import { ChatRoom } from "@/components/chat/chat-room";

// This route is intentionally *not* auth-gated: anonymous visitors land
// here as Spectators (read-only, no slot). The Room WS attaches them
// without a `userId` and the snapshot reports `yourRole: "spectator"`.
// Signed-in visitors get a slot if one is free, or attach as a Spectator
// with a full-room banner if not.
export const Route = createFileRoute("/chat/r/$slug")({
  component: RouteComponent,
});

function RouteComponent(): React.ReactElement {
  const { slug } = Route.useParams();
  return <ChatRoom slug={slug} />;
}
