import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import * as indexCss from "./index.css";
void indexCss;
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  basepath: "/bun-mono",
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <div>Not Found</div>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById("app");
if (!container) throw new Error("missing #app root");
createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
