import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";

import { DeleteAccountDialog } from "./delete-account-dialog";

type DangerZoneUser = {
  username?: string | null | undefined;
  displayUsername?: string | null | undefined;
};

export function DangerZoneSection({ user }: { user: DangerZoneUser }) {
  const username = user.username ?? "";
  const displayUsername = user.displayUsername ?? user.username ?? "";

  return (
    <Card className="ring-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>

        <CardDescription>Permanently delete your account.</CardDescription>
      </CardHeader>

      <CardContent>
        {username ? (
          <DeleteAccountDialog username={username} displayUsername={displayUsername} />
        ) : (
          <p className="text-muted-foreground">Set a username before deleting your account.</p>
        )}
      </CardContent>
    </Card>
  );
}
