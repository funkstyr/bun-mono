# packages/config

Shared build/test/typecheck config. **No runtime code.** Every other workspace devDepends on it.

## Exports

| Export                                  | Purpose                                             |
| --------------------------------------- | --------------------------------------------------- |
| `@bun-mono/config/tsconfig.base.json`   | Base tsconfig — extend from this in every workspace |
| `@bun-mono/config/tsdown`               | Shared tsdown bundler config                        |
| `@bun-mono/config/vitest`               | Shared vitest config                                |
| `@bun-mono/config/vitest-setup-browser` | Browser-mode vitest setup (jsdom + RTL)             |

## Gotchas

- A change here ripples through **every** workspace — bump deliberately and run `bun check` before committing.
- No `dist/` — this package ships sources directly (tsconfig is JSON, configs are `.js`/`.ts`).
- Don't add runtime helpers here. If you need shared runtime code, create a new package.
