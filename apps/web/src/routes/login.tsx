import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(true);

  const switchToSignUp = useCallback(() => setShowSignIn(false), []);
  const switchToSignIn = useCallback(() => setShowSignIn(true), []);

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={switchToSignUp} />
  ) : (
    <SignUpForm onSwitchToSignIn={switchToSignIn} />
  );
}
