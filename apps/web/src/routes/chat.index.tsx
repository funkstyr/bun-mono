import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent } from "@bun-mono/core-ui/card";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/chat/")({
  component: RouteComponent,
});

function RouteComponent(): React.ReactElement {
  const navigate = useNavigate();
  const rooms = useQuery(orpc.room.list.queryOptions());

  const create = useMutation({
    mutationFn: () => client.room.create({ kind: "chat" }),
    onSuccess: async ({ slug }) => {
      await queryClient.invalidateQueries({
        queryKey: orpc.room.list.queryOptions().queryKey,
      });
      navigate({ to: "/chat/r/$slug", params: { slug } });
    },
  });

  const handleCreate = useCallback(() => {
    create.mutate();
  }, [create]);

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
    </div>
  );
}
