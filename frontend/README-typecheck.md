# Fast type-check with tsgo (not enabled)

`tsgo` is the native TypeScript compiler (`@typescript/native-preview`, TS 7).
We tried it as an opt-in `npm run typecheck:fast` for the 8 GB laptop. It does
not work with this repo's config yet, so there is no script and no dependency.
Builds and CI still use `tsc` 5.8.3.

## Why it does not run

`tsconfig.base.json` sets `"baseUrl": "."` and uses non-relative `paths`
(`"apps/..."`, `"libs/..."`). TS 7 removed `baseUrl`, so
`tsgo --noEmit -p apps/artcraft/tsconfig.json` stops at once with:

```
apps/artcraft/tsconfig.json(9,3): error TS5090: Non-relative paths are not allowed. Did you forget a leading './'?
apps/artcraft/tsconfig.json(9,3): error TS5102: Option 'baseUrl' has been removed. Please remove it from your configuration.
```

`libs/api`, `libs/api-enums` and `libs/model-list` also set `baseUrl` in
their `tsconfig.lib.json`.

## Measured (desktop app, `--noEmit`)

Version `@typescript/native-preview@7.0.0-dev.20260707.2`, Node 22.18,
Windows 11, 7.7 GB RAM. Time from a PowerShell stopwatch. Peak memory is the
working set of the process and its children, sampled every 200 ms.

| Run | Time | Peak memory | Errors reported |
| --- | --- | --- | --- |
| `tsc --noEmit -p apps/artcraft/tsconfig.json` (warm, 2 runs) | 23.8 s / 25.2 s | 543 / 546 MB | 47 |
| same, cold first run | 48.0 s | 734 MB | 47 |
| `tsgo` on the real config | config error, no check | n/a | 2 (TS5090, TS5102) |
| `tsgo` on a scratch copy of the config without `baseUrl` (warm, 2 runs) | 2.3 s / 2.2 s | 374 / 383 MB | 48 |
| same, cold first run | 4.8 s | 661 MB | 48 |

So once the config works, tsgo is about 10x faster and uses about 30% less
peak memory. Its diagnostics are not yet the same as tsc's. The scratch run
also reported files from `node_modules/@remix-run/deno` (TS5097, TS2307) and
TS6305 for referenced libs whose `dist` was not built.

## To enable it later

1. Remove `baseUrl` from `tsconfig.base.json` and the three `tsconfig.lib.json`
   files, and prefix every `paths` target with `./`. Check that `tsc` and the
   vite builds still pass, because bare `apps/...` or `libs/...` imports that
   relied on `baseUrl` would stop resolving.
2. Add `@typescript/native-preview` as an exact-version devDependency and the
   script `"typecheck:fast": "tsgo --noEmit -p apps/artcraft/tsconfig.json"`.
3. Keep `tsc` in nx, vite and CI. tsgo stays an opt-in local check.
