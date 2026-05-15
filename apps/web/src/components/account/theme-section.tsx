import { useCallback, useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { Label } from "@bun-mono/core-ui/label";
import { RadioGroup, RadioGroupItem } from "@bun-mono/core-ui/radio-group";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const groupId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleValueChange = useCallback((value: string) => setTheme(String(value)), [setTheme]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Choose how the app looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={mounted ? (theme ?? "system") : "system"}
          onValueChange={handleValueChange}
          aria-label="Theme"
        >
          {OPTIONS.map((opt) => {
            const id = `${groupId}-${opt.value}`;
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem id={id} value={opt.value} />
                <Label htmlFor={id}>{opt.label}</Label>
              </div>
            );
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
