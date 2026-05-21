import { MemberList } from "./member-list";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { useRoomSocket } from "./use-room-socket";

type Props = { slug: string };

export function ChatRoom({ slug }: Props): React.ReactElement {
  const { status, myUserId, members, timeline, send } = useRoomSocket(slug);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="text-muted-foreground border-b px-4 py-2 text-sm">
        Room {slug} — <span className="font-mono">{status}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList timeline={timeline} />

          <MessageInput onSend={send} disabled={status !== "open"} />
        </div>

        <MemberList members={members} myUserId={myUserId} />
      </div>
    </div>
  );
}
