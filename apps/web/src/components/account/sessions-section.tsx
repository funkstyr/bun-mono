import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { client, orpc } from "@/utils/orpc";

type SessionItem = {
  id: string;
  browser: string;
  os: string;
  device: string;
  ipAddress?: string | null;
  lastActiveAt: Date | string;
  isCurrent?: boolean;
};

function SessionRow({
  session,
  onRevoke,
  isRevoking,
}: {
  session: SessionItem;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) {
  const handleRevoke = useCallback(() => onRevoke(session.id), [onRevoke, session.id]);
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {session.browser} on {session.os}
          </span>
          {session.isCurrent ? (
            <span className="bg-primary/10 text-primary rounded-none px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
              Current
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground">
          {session.device}
          {session.ipAddress ? ` · ${session.ipAddress}` : ""}
        </div>
        <div className="text-muted-foreground">
          Last active {formatRelative(session.lastActiveAt)}
        </div>
      </div>
      {!session.isCurrent ? (
        <Button variant="outline" size="sm" disabled={isRevoking} onClick={handleRevoke}>
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelative(date: Date | string): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = target.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE_TIME.format(diffSec, "second");
  if (abs < 3600) return RELATIVE_TIME.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return RELATIVE_TIME.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2592000) return RELATIVE_TIME.format(Math.round(diffSec / 86400), "day");
  if (abs < 31536000) return RELATIVE_TIME.format(Math.round(diffSec / 2592000), "month");
  return RELATIVE_TIME.format(Math.round(diffSec / 31536000), "year");
}

export function SessionsSection() {
  const queryClient = useQueryClient();
  const queryOptions = orpc.account.listSessions.queryOptions();

  const { data: sessions, isLoading } = useQuery(queryOptions);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => client.account.revokeSession({ sessionId }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Session revoked");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to revoke session";
      toast.error(message);
    },
  });

  const revokeOthers = useMutation({
    mutationFn: () => client.account.revokeOtherSessions(),
    onSuccess: async () => {
      await invalidate();
      toast.success("Signed out everywhere else");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to sign out other sessions";
      toast.error(message);
    },
  });

  const hasOthers = (sessions?.length ?? 0) > 1;

  const handleRevoke = useCallback((id: string) => revoke.mutate(id), [revoke]);
  const handleRevokeOthers = useCallback(() => revokeOthers.mutate(), [revokeOthers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Devices signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-muted-foreground">No active sessions.</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onRevoke={handleRevoke}
                isRevoking={revoke.isPending && revoke.variables === s.id}
              />
            ))}
          </ul>
        )}

        {hasOthers ? (
          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={revokeOthers.isPending}
              onClick={handleRevokeOthers}
            >
              {revokeOthers.isPending ? "Signing out..." : "Sign out everywhere else"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
