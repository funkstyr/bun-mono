import { createFileRoute } from "@tanstack/react-router";

import { ChatRoom } from "@/components/chat/chat-room";

export const Route = createFileRoute("/chat/r/$slug")({
  component: RouteComponent,
});

function RouteComponent(): React.ReactElement {
  const { slug } = Route.useParams();
  return <ChatRoom slug={slug} />;
}
