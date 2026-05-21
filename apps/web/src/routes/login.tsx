import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  // `redirect` lets callers (e.g. the "Sign in to send" CTA on a Spectator
  // chat Room) come back to the page they started from instead of the
  // default /dashboard landing.
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const r = search["redirect"];
    return typeof r === "string" && r.startsWith("/") ? { redirect: r } : {};
  },
});

function RouteComponent() {
  const search = Route.useSearch();
  const [showSignIn, setShowSignIn] = useState(true);

  const switchToSignUp = useCallback(() => setShowSignIn(false), []);

  const switchToSignIn = useCallback(() => setShowSignIn(true), []);

  return showSignIn ? (
    <SignInForm
      onSwitchToSignUp={switchToSignUp}
      {...(search.redirect === undefined ? {} : { redirectTo: search.redirect })}
    />
  ) : (
    <SignUpForm onSwitchToSignIn={switchToSignIn} />
  );
}
