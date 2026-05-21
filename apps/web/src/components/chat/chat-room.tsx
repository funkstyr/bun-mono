import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { useRoomSocket } from "./use-room-socket";

type Props = { slug: string };

export function ChatRoom({ slug }: Props): React.ReactElement {
  const { status, messages, send } = useRoomSocket(slug);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="text-muted-foreground border-b px-4 py-2 text-sm">
        Room {slug} — <span className="font-mono">{status}</span>
      </header>

      <MessageList messages={messages} />

      <MessageInput onSend={send} disabled={status !== "open"} />
    </div>
  );
}
