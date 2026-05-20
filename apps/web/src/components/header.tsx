import { Link } from "@tanstack/react-router";

import { ThemeToggle } from "@bun-mono/core-ui/theme-toggle";

import UserMenu from "./user-menu";

const ACTIVE_PROPS = { "aria-current": "page" } as const;
const EXACT_ACTIVE_OPTIONS = { exact: true } as const;
const PREFIX_ACTIVE_OPTIONS = { exact: false } as const;

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/ai", label: "AI Chat" },
    { to: "/timer", label: "Workouts" },
    { to: "/tic-tac-toe", label: "Tic-tac-toe" },
    { to: "/royalty", label: "Royalty" },
  ] as const;

  return (
    <header>
      <a
        href="#main-content"
        className="focus:bg-background focus:text-foreground focus:outline-ring sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:shadow focus:outline-2"
      >
        Skip to main content
      </a>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav aria-label="Primary" className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link
                key={to}
                to={to}
                activeOptions={to === "/" ? EXACT_ACTIVE_OPTIONS : PREFIX_ACTIVE_OPTIONS}
                activeProps={ACTIVE_PROPS}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      <hr />
    </header>
  );
}
