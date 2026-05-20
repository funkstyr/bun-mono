import { type JSX, useCallback, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "./button";

function ThemeToggle(): JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  const toggle = useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark, setTheme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      aria-pressed={mounted ? isDark : undefined}
      onClick={toggle}
    >
      <SunIcon aria-hidden="true" className="hidden dark:block" />
      <MoonIcon aria-hidden="true" className="block dark:hidden" />
    </Button>
  );
}

export { ThemeToggle };
