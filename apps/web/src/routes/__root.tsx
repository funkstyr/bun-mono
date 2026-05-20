import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Toaster } from "@bun-mono/core-ui/sonner";
import { ThemeProvider } from "@bun-mono/core-ui/theme-provider";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";
import Header from "../components/header";

export type RouterAppContext = {
  orpc: typeof orpc;
  queryClient: QueryClient;
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(!t||t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Bun POC Monorepo",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      {
        children: themeInitScript,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <div className="grid h-svh grid-rows-[auto_1fr]">
            <Header />
            <main id="main-content" tabIndex={-1} className="outline-none">
              <Outlet />
            </main>
          </div>
          <Toaster richColors />

          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}
