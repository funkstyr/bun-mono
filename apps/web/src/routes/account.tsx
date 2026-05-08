import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

import { ProfileSection } from "@/components/account/profile-section";

export const Route = createFileRoute("/account")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await getUser();
    return { session };
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  if (!session) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6 overflow-y-auto">
      <h1 className="text-xl font-semibold">Account</h1>
      <ProfileSection user={session.user} />
    </div>
  );
}
