import { useMemo } from "react";
import { Link } from "@tanstack/react-router";

import { Card, CardContent } from "@bun-mono/core-ui/card";

import { MemberList } from "./member-list";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import type { MemberView } from "./room-events";
import { TypingIndicator } from "./typing-indicator";
import { useRoomSocket } from "./use-room-socket";

type Props = { slug: string };

export function ChatRoom({ slug }: Props): React.ReactElement {
  const {
    status,
    myUserId,
    myRole,
    spectatorCount,
    members,
    timeline,
    typingUserIds,
    send,
    sendTypingPing,
  } = useRoomSocket(slug);

  // Spectator UX splits on whether the user has a session: anonymous → sign-in CTA, authenticated full-room → banner.
  const isSpectator = myRole === "spectator";
  const isAnonymous = myUserId === null;
  const showFullRoomBanner = isSpectator && !isAnonymous;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="text-muted-foreground border-b px-4 py-2 text-sm">
        Room {slug} — <span className="font-mono">{status}</span>
        {isSpectator ? <span className="ml-2 italic">(spectator)</span> : null}
      </header>

      {showFullRoomBanner ? <FullRoomBanner members={members} /> : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList timeline={timeline} />

          {isSpectator ? (
            <SpectatorFooter slug={slug} anonymous={isAnonymous} />
          ) : (
            <>
              <TypingIndicator
                typingUserIds={typingUserIds}
                members={members}
                myUserId={myUserId}
              />

              <MessageInput onSend={send} onTyping={sendTypingPing} disabled={status !== "open"} />
            </>
          )}
        </div>

        <MemberList members={members} myUserId={myUserId} spectatorCount={spectatorCount} />
      </div>
    </div>
  );
}

function FullRoomBanner({ members }: { members: readonly MemberView[] }): React.ReactElement {
  const names = members.map((m) => m.displayName).join(", ");
  return (
    <Card className="mx-4 my-2">
      <CardContent className="text-sm">
        This Room is full. You're watching as a spectator. Members in this Room: {names}.
      </CardContent>
    </Card>
  );
}

function SpectatorFooter({
  slug,
  anonymous,
}: {
  slug: string;
  anonymous: boolean;
}): React.ReactElement {
  const loginSearch = useMemo(() => ({ redirect: `/chat/r/${slug}` }), [slug]);

  if (!anonymous) {
    return (
      <div className="text-muted-foreground bg-background border-t px-4 py-3 text-sm">
        Waiting for a slot to open up...
      </div>
    );
  }

  return (
    <div className="bg-background flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">Reading along as a spectator.</span>

      <Link to="/login" search={loginSearch} className="text-primary font-medium hover:underline">
        Sign in to send
      </Link>
    </div>
  );
}
