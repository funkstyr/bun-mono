import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

import { validateLoginSearch } from "./-login-search";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  validateSearch: validateLoginSearch,
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
