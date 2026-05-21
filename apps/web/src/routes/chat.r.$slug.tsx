import { createFileRoute } from "@tanstack/react-router";

import { ChatRoom } from "@/components/chat/chat-room";

// Auth gate lives on the parent `/chat` route (see `chat.tsx`); TanStack
// runs the parent loader first and redirects unauthenticated users to
// `/login` before this child renders.
export const Route = createFileRoute("/chat/r/$slug")({
  component: RouteComponent,
});

function RouteComponent(): React.ReactElement {
  const { slug } = Route.useParams();
  return <ChatRoom slug={slug} />;
}
