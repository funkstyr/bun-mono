import { useCallback, useState } from "react";
import { isDefinedError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

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
import { getUser } from "@/functions/get-user";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/chat/")({
  component: RouteComponent,
  // The Memberships list is per-user, so this index needs a session — `/chat/r/:slug` does not.
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) throw redirect({ to: "/login" });
  },
});

type CappedMembership = {
  slug: string;
  name: string | null;
  lastEventAt: number | null;
};

type CapErrorData = { memberships: CappedMembership[]; cap: number };

function RouteComponent(): React.ReactElement {
  const navigate = useNavigate();
  const rooms = useQuery(orpc.room.list.queryOptions());

  const [capData, setCapData] = useState<CapErrorData | null>(null);

  const create = useMutation(
    orpc.room.create.mutationOptions({
      onSuccess: async ({ slug }) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.room.list.queryOptions().queryKey,
        });
        navigate({ to: "/chat/r/$slug", params: { slug } });
      },
      onError: (err) => {
        // Cap error opens the inline "leave one first" modal; other errors fall through to the global toast in utils/orpc.ts.
        if (isDefinedError(err) && err.code === "MEMBERSHIP_CAP_EXCEEDED") {
          setCapData(err.data);
        }
      },
    }),
  );

  const leave = useMutation(
    orpc.room.leave.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.room.list.queryOptions().queryKey,
        });
        setCapData(null);
      },
    }),
  );

  const handleCreate = useCallback(() => {
    create.mutate({ kind: "chat" });
  }, [create]);

  const handleCloseCap = useCallback(() => setCapData(null), []);

  const handleLeave = useCallback(
    (slug: string) => {
      leave.mutate({ slug });
    },
    [leave],
  );

  const handleCapOpenChange = useCallback((next: boolean) => {
    if (!next) setCapData(null);
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat</h1>

        <Button onClick={handleCreate} disabled={create.isPending}>
          {create.isPending ? "Creating..." : "Create Room"}
        </Button>
      </header>

      <ul className="space-y-2">
        {(rooms.data ?? []).map((r) => (
          <li key={r.slug}>
            <Card>
              <CardContent className="flex items-center justify-between">
                <a href={`/chat/r/${r.slug}`} className="font-medium">
                  {r.name ?? `Room ${r.slug.slice(0, 6)}`}
                </a>
                <span className="text-muted-foreground text-sm">
                  {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                </span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {rooms.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          You haven't joined any rooms yet — create one to get started.
        </p>
      )}

      <CapDialog
        data={capData}
        onClose={handleCloseCap}
        onOpenChange={handleCapOpenChange}
        onLeave={handleLeave}
        leavingSlug={leave.isPending ? (leave.variables?.slug ?? null) : null}
      />
    </div>
  );
}

type CapDialogProps = {
  data: CapErrorData | null;
  onClose: () => void;
  onOpenChange: (next: boolean) => void;
  onLeave: (slug: string) => void;
  leavingSlug: string | null;
};

function CapDialog({
  data,
  onClose,
  onOpenChange,
  onLeave,
  leavingSlug,
}: CapDialogProps): React.ReactElement {
  const open = data !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You're already a Member of {data?.cap ?? 10} Rooms</DialogTitle>

          <DialogDescription>
            Leave one below to free up a slot, then try creating again. You can be a Member of up to{" "}
            {data?.cap ?? 10} Rooms at once.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {(data?.memberships ?? []).map((m) => (
            <CapMembershipRow
              key={m.slug}
              membership={m}
              onLeave={onLeave}
              leaving={leavingSlug === m.slug}
            />
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CapMembershipRowProps = {
  membership: CappedMembership;
  onLeave: (slug: string) => void;
  leaving: boolean;
};

function CapMembershipRow({
  membership,
  onLeave,
  leaving,
}: CapMembershipRowProps): React.ReactElement {
  const handleClick = useCallback(() => onLeave(membership.slug), [onLeave, membership.slug]);
  return (
    <li className="flex items-center justify-between gap-3 rounded-none border px-3 py-2">
      <div className="min-w-0">
        <div className="truncate font-medium">
          {membership.name ?? `Room ${membership.slug.slice(0, 6)}`}
        </div>

        <div className="text-muted-foreground text-xs">
          {membership.lastEventAt === null
            ? "no activity yet"
            : `last active ${new Date(membership.lastEventAt).toLocaleString()}`}
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={handleClick} disabled={leaving}>
        {leaving ? "Leaving..." : "Leave"}
      </Button>
    </li>
  );
}
