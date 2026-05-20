import { useCallback, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@bun-mono/core-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bun-mono/core-ui/dropdown-menu";
import { Skeleton } from "@bun-mono/core-ui/skeleton";
import { authClient } from "@/lib/auth-client";

const triggerButton = <Button variant="outline" />;

export default function UserMenu() {
  const navigate = useNavigate();

  const { data: session, isPending } = authClient.useSession();

  const goAccount = useCallback(() => {
    void navigate({ to: "/account" });
  }, [navigate]);

  const signOut = useCallback(() => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          void navigate({ to: "/" });
        },
      },
    });
  }, [navigate]);

  const trigger = useMemo(() => triggerButton, []);

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{session.user.name}</DropdownMenuTrigger>

      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem onClick={goAccount}>Account</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={signOut}>
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
