---
status: accepted
---

# GitHub Pages static app

We host the client-side feature packages (`royalty`, `tic-tac-toe`, `workout-timer`) on GitHub Pages as a second app at `apps/static`, separate from `apps/web`. `apps/static` is plain Vite + `@tanstack/react-router` (not TanStack Start), depends only on `core-ui` and the three feature packages, and has no auth/orpc/DB code at all — so the "hide login when DB isn't connected" requirement is satisfied structurally rather than via a runtime flag. `apps/web` is unchanged and remains the everything-included dev server.

## Considered Options

- **Cloudflare Pages / Vercel free tier instead of GH Pages** — rejected for now. Either would let `apps/web` deploy with `tanstackStart()` SSR/prerender intact and skip this whole second-app refactor. GH Pages chosen because it's free, requires no new account, and the showcase URL lives next to the repo. Revisit if the GH Pages constraints (basepath, SPA fallback, no edge functions) become painful.
- **TanStack Start with `prerender`** — rejected. Start's reason to exist is server functionality the static app doesn't use; `prerender` works but ships the Start runtime to the client for no payoff. Plain Vite + Router is the right tool and forces a clean line between "has a server" (`web`) and "doesn't" (`static`).
- **Hoist `Header` into `core-ui` or a new `@bun-mono/shell` package** — rejected. The two headers are deliberately different (static has 3 nav links and no `UserMenu`; web has more links and auth); abstraction would shift variation from code to config without removing it, and would pull `@tanstack/react-router` into `core-ui`'s peer deps where it has no business being. Re-evaluate at the third app.
- **Runtime feature flag in `apps/web` to hide login when DB is absent** — rejected. The original requirement was satisfied by the structural split; `apps/web` is a developer environment with a DB by definition. Adding a runtime check there solves a problem no real user has.
- **`HashRouter` for SPA routing** — rejected. The `404.html` redirect trick (rafgraph's `spa-github-pages`) is five lines, invisible to users, and keeps clean URLs that work with link previews.
- **Custom domain** — deferred. Project-pages URL (`funkstyr.github.io/bun-mono/`) is free and a one-line basepath config; swap to a custom domain later is trivial.
- **Pre-render every route to its own HTML file** — rejected. Would require re-introducing a meta-framework (Vike or similar), defeating the plain-Vite choice above.
- **Deploy via `gh-pages` branch + `peaceiris/actions-gh-pages`** — rejected. `actions/deploy-pages` is GitHub's canonical path, avoids branch noise, and uses OIDC instead of a PAT.

## Consequences

- Route shims for the three features now exist in both apps (`apps/web/src/routes/...` and `apps/static/src/routes/...`). Accepted duplication — each shim is small and the apps' contexts (Start vs plain Router) differ enough that sharing would mostly be re-exposing the differences as props.
- `core-ui` stays router- and auth-free, preserved as a low-coupling primitive package.
- The static app uses the system font stack instead of `@fontsource-variable/inter`; ~120 KB smaller bundle, no FOUT, no typography branding.
- Deploys gated on `push` to `main` (plus `workflow_dispatch`) via `.github/workflows/deploy-static.yml`, path-filtered to `apps/static/**` and the four packages it consumes, building with `turbo run build --filter=static...`.
