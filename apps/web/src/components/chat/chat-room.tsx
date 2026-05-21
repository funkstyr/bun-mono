import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent } from "@bun-mono/core-ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bun-mono/core-ui/dialog";
import { client, queryClient, orpc } from "@/utils/orpc";

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
    spectatorReason,
    spectatorCount,
    members,
    displayNamesByUserId,
    timeline,
    typingUserIds,
    send,
    sendTypingPing,
  } = useRoomSocket(slug);

  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const leave = useMutation({
    mutationFn: () => client.room.leave({ slug }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.room.list.queryOptions().queryKey,
      });
      setConfirmOpen(false);
      navigate({ to: "/chat" });
    },
  });

  const onLeaveClick = useCallback(() => setConfirmOpen(true), []);

  const onLeaveCancel = useCallback(() => setConfirmOpen(false), []);

  const onLeaveConfirm = useCallback(() => leave.mutate(), [leave]);

  const onDialogOpenChange = useCallback((next: boolean) => {
    if (!next) setConfirmOpen(false);
  }, []);

  // Spectator UX splits on whether the user has a session: anonymous → sign-in CTA, authenticated full-room → banner, cap-downgrade → cap prompt.
  const isSpectator = myRole === "spectator";
  const isAnonymous = myUserId === null;
  const isCapSpectator = isSpectator && spectatorReason === "membership_cap";
  const showFullRoomBanner = isSpectator && !isAnonymous && !isCapSpectator;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="text-muted-foreground flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
        <div>
          Room {slug} — <span className="font-mono">{status}</span>
          {isSpectator ? <span className="ml-2 italic">(spectator)</span> : null}
        </div>

        {!isSpectator ? (
          <Button variant="outline" size="sm" onClick={onLeaveClick} disabled={leave.isPending}>
            Leave Room
          </Button>
        ) : null}
      </header>

      {isCapSpectator ? <CapSpectatorBanner /> : null}

      {showFullRoomBanner ? <FullRoomBanner members={members} /> : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList timeline={timeline} displayNamesByUserId={displayNamesByUserId} />

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

      <LeaveConfirmDialog
        open={confirmOpen}
        pending={leave.isPending}
        onOpenChange={onDialogOpenChange}
        onCancel={onLeaveCancel}
        onConfirm={onLeaveConfirm}
      />
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

function CapSpectatorBanner(): React.ReactElement {
  return (
    <Card className="mx-4 my-2">
      <CardContent className="text-sm">
        You're already a Member of 10 Rooms. To join this one, leave another first — visit{" "}
        <Link to="/chat" className="text-primary font-medium hover:underline">
          your rooms
        </Link>{" "}
        and pick one to leave.
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

type LeaveDialogProps = {
  open: boolean;
  pending: boolean;
  onOpenChange: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function LeaveConfirmDialog({
  open,
  pending,
  onOpenChange,
  onCancel,
  onConfirm,
}: LeaveDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this Room?</DialogTitle>

          <DialogDescription>
            Your slot will be released immediately and another User can take it.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>

          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Leaving..." : "Leave Room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
