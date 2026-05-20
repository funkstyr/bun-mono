import { Outlet, createRootRoute } from "@tanstack/react-router";

import { Toaster } from "@bun-mono/core-ui/sonner";
import { ThemeProvider } from "@bun-mono/core-ui/theme-provider";

import Header from "../components/header";
import PwaUpdate from "../components/pwa-update";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider>
      <div className="grid h-svh grid-rows-[auto_1fr]">
        <Header />
        <main id="main-content" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
      </div>
      <Toaster richColors />
      <PwaUpdate />
    </ThemeProvider>
  );
}
