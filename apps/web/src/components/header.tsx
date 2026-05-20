import { Link } from "@tanstack/react-router";

import { ThemeToggle } from "@bun-mono/core-ui/theme-toggle";

import UserMenu from "./user-menu";

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
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
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
    </div>
  );
}
