import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

import { DangerZoneSection } from "@/components/account/danger-zone-section";
import { PasswordSection } from "@/components/account/password-section";
import { ProfileSection } from "@/components/account/profile-section";
import { SessionsSection } from "@/components/account/sessions-section";
import { ThemeSection } from "@/components/account/theme-section";

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
    <div className='overflow-y-auto'>
      <div className='mx-auto w-full max-w-2xl px-4 py-8 space-y-6'>
        <h1 className='text-xl font-semibold'>Account</h1>

        <ThemeSection />

        <ProfileSection user={session.user} />

        <PasswordSection />

        <SessionsSection />

        <DangerZoneSection user={session.user} />
      </div>
    </div>
  );
}
