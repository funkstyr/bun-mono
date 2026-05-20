# packages/core-ui

shadcn-derived UI primitives built on `@base-ui/react`. Consumed by every app and most game packages.

## Layout

```
src/
├── button.tsx, card.tsx, checkbox.tsx, dialog.tsx, dropdown-menu.tsx,
│   form.tsx, input.tsx, label.tsx, radio-group.tsx, skeleton.tsx, sonner.tsx,
│   confetti.tsx, theme-provider.tsx, theme-toggle.tsx, utils.tsx
├── styles.css            # Tailwind layer + CSS vars (exported as ./styles.css)
└── components.json       # shadcn CLI config (for re-syncing primitives)
```

Each primitive is its own subpath export (`@bun-mono/core-ui/button`, `/card`, …) so consumers tree-shake naturally.

## Commands

| Command                                      | Purpose        |
| -------------------------------------------- | -------------- |
| `bun --filter @bun-mono/core-ui dev`         | tsdown --watch |
| `bun --filter @bun-mono/core-ui build`       | tsdown         |
| `bun --filter @bun-mono/core-ui check-types` | tsgo --build   |

## Conventions

- **One primitive per file, one subpath export per primitive.** When adding a new primitive: create `src/<name>.tsx`, add the `./` export to `package.json`, and add a `tsdown` entry if the bundler needs it.
- Imports from this package must use the subpath form (`@bun-mono/core-ui/button`), not a root import — there is no `.` export.
- Tailwind classes use the CSS vars in `styles.css`; theming flows through `theme-provider`.
- `react`, `react-dom`, `tailwindcss`, `tw-animate-css`, and `lucide-react` are **peerDependencies** — don't add them to `dependencies`.
- New shadcn primitives: regenerate via shadcn CLI using `components.json`, then re-export and add the subpath.
