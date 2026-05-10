import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@bun-mono/core-ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@bun-mono/core-ui/dialog";
import { Input } from "@bun-mono/core-ui/input";
import { Label } from "@bun-mono/core-ui/label";

import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export function DeleteAccountDialog({
  username,
  displayUsername,
}: {
  username: string;
  displayUsername: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);

  const matches = confirmation.trim().toLowerCase() === username.toLowerCase();

  const onOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (!next) setConfirmation("");
  };

  const onConfirm = async () => {
    if (!matches || isPending) return;
    setIsPending(true);
    try {
      await client.account.deleteAccount({ confirmation });
      await authClient.signOut();
      toast.success("Account deleted");
      setOpen(false);
      await navigate({ to: "/" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete account";
      toast.error(message);
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Delete account
          </Button>
        }
      />
      <DialogContent showClose={!isPending}>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This is permanent. Your account, sessions, and data will be removed and cannot be
            recovered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type your username <span className="font-mono">{displayUsername}</span> to confirm.
          </Label>
          <Input
            id="delete-confirm"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" size="sm" disabled={isPending}>
                Cancel
              </Button>
            }
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={!matches || isPending}
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : "Delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
