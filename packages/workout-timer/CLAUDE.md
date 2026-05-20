# packages/workout-timer

Interval timer: pure engine + React UI + audio cues + persistence + wake-lock. Consumed by `apps/web` and `apps/static` via subpath exports.

## Layout

```
src/
├── engine.ts, engine.test.ts         # Pure timer engine
├── cascade.ts, cascade.test.ts       # Round/set cascade logic
├── schemas.ts                        # arktype schemas (timer config)
├── format.ts                         # Duration formatting
├── storage.ts, storage.test.ts       # Persistence
├── audio.ts                          # Audio cues
├── use-timer-engine.ts               # Main React hook
├── use-timers.ts, use-wake-lock.ts   # Supporting hooks
├── countdown-ring.tsx                # SVG countdown ring
├── timer-app.tsx                     # App shell (subpath-exported)
├── form/                             # @tanstack/react-form helpers
│   ├── field-error.tsx, form-utils.ts, name-text-field.tsx, numeric-stepper.tsx
├── set-editor/                       # Set/round editor sheet
│   ├── editor-sheet.tsx, validators.ts
└── runner/
    └── phase-helpers.ts
```

## Subpath exports

`./engine`, `./cascade`, `./schemas`, `./format`, `./storage`, `./audio`, `./countdown-ring`, `./timer-app`, `./use-timer-engine`, `./use-timers`, `./use-wake-lock`, `./styles.css`.

## Commands

| Command                                            | Purpose        |
| -------------------------------------------------- | -------------- |
| `bun --filter @bun-mono/workout-timer dev`         | tsdown --watch |
| `bun --filter @bun-mono/workout-timer build`       | tsdown         |
| `bun --filter @bun-mono/workout-timer test`        | vitest run     |
| `bun --filter @bun-mono/workout-timer check-types` | tsgo --build   |

## Conventions

- **Engine is pure** — same rule as the other game packages. Tests run without jsdom.
- **Schemas use arktype** (`schemas.ts`) — single source of truth for timer config validation.
- Drag-and-drop reordering uses `@dnd-kit/*`.
- Forms use `@tanstack/react-form` + helpers in `src/form/`.
- `react`, `react-dom`, `tailwindcss`, `lucide-react` are peerDependencies.
- Audio + wake-lock are browser-only — guard with feature detection, never assume availability.
