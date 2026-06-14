# AGENTS.md

## Project At A Glance

QuranDesk is an offline-first desktop player for complete Qur'an recitations. It is built
with Electron, React, TypeScript, Tailwind CSS, Zustand, and `better-sqlite3`.

- Use Node.js 22 and npm. CI installs dependencies with `npm ci`.
- The app has three Electron process boundaries plus shared contracts:
  - `src/main/`: privileged Electron main process, SQLite, downloads, filesystem, protocols,
    and updates.
  - `src/preload/`: context-isolated bridge that exposes the narrow `globalThis.api` surface.
  - `src/renderer/src/`: React UI, routes, Zustand stores, and the audio engine.
  - `src/shared/`: IPC types/constants and static Qur'an metadata. Keep this directory free of
    Node-only and DOM-only imports.
- `out/` and `dist/` are generated build/package output. Do not edit them.

Read `README.md` for setup, packaging, environment variables, and release details. Read
`TODOS.md` when a change relates to project phases or planned features.

## Common Commands

```sh
npm ci                 # clean dependency install matching package-lock.json
npm run dev            # Electron development window with HMR
npm run typecheck      # node and renderer TypeScript checks
npm run lint           # ESLint
npm run build          # typecheck, then compile main/preload/renderer
npm run format         # format the repository with Prettier
npm run build:unpack   # local unpacked application smoke test
```

There is currently no automated test suite. Do not claim tests passed unless a test suite is
added and run. For normal code changes, run `npm run typecheck` and `npm run lint`; run
`npm run build` for cross-boundary, build-configuration, or release-relevant changes.

## Architecture And Ownership

Keep privileged behavior in the main process. Renderer code must not import Node or Electron
APIs directly; it should use the typed preload bridge exposed as `globalThis.api`.

When adding or changing IPC behavior, update the complete contract:

1. Add shared request/response types and the channel name in `src/shared/api.ts`.
2. Implement the main-process handler in `src/main/index.ts` or an owned main-process module.
3. Expose the call through `src/preload/index.ts`.
4. Consume the typed API in the renderer.
5. Add event overloads and `EVENTS` entries for main-to-renderer broadcasts.

Treat every renderer-supplied IPC argument as untrusted. Validate it in the main process
before using it in SQL, filesystem paths, network requests, or shell operations. Preserve the
existing reciter ID allowlist (`^[a-z0-9-]+$`), surah range (`1..114`), and resolved-path
containment checks.

The custom `app://` protocol in `src/main/protocol.ts` is the renderer-facing boundary for
downloaded audio and cached photos. Preserve HTTP range behavior for audio seeking and do not
replace controlled protocol URLs with arbitrary `file://` access.

SQLite is the source of truth for downloads and queue state; the filesystem is reconciled into
it. Keep migrations additive and compatible with existing user databases. Use prepared
statements and transactions for grouped writes. Settings are a validated JSON-encoded KV
store, with defaults defined in `src/shared/api.ts`.

The renderer uses:

- `HashRouter`, because packaged Electron loads the renderer from a file URL.
- Zustand stores for shared UI state and event bridges.
- A single `<audio>` element owned by `components/AudioEngine.tsx`; imperative playback logic
  belongs in `audioEngine.ts`.
- Tailwind CSS v4 with CSS-first tokens in `assets/main.css`. Reuse semantic theme tokens and
  support both light and dark themes.

## Coding Conventions

- Follow `.editorconfig`, ESLint, and Prettier: 2 spaces, single quotes, no semicolons, and a
  100-character print width.
- Prefer the existing path aliases: `@shared/*` and renderer-only `@renderer/*`.
- Keep changes scoped. Match nearby module and component patterns before adding abstractions.
- Use explicit return types for exported functions and React components, matching existing
  code.
- Keep comments for non-obvious invariants, security boundaries, lifecycle ordering, and
  recovery behavior.
- User-facing main-process errors should use the typed `AppError` codes and helpers in
  `src/main/errors.ts`; log technical detail and expose friendly copy.
- Preserve unsubscribe cleanup for `globalThis.api.on(...)` subscriptions created by React
  effects or long-lived bridges.
- Do not commit `.env` or secrets. Add documented placeholders to `.env.example` when adding
  configuration.

## Assets And Generated Files

`src/renderer/src/assets/logo.svg` is the source for platform icons. After changing it, run:

```sh
npm run icons
```

Commit the regenerated `build/icon.{png,icns,ico}` and `resources/icon.png`. Do not hand-edit
those generated icon files.

Do not modify `package-lock.json` unless dependencies or package metadata intentionally change.
Packaging and release commands can be slow, platform-specific, and may require signing
credentials; run them only when the task calls for packaging validation.

## Verification Checklist

- Pure documentation/configuration change: inspect the diff and run the relevant parser or
  command when one exists.
- Renderer/UI change: run `npm run typecheck`, `npm run lint`, and smoke-test with
  `npm run dev` when possible. Check light/dark themes, keyboard focus, empty/loading/error
  states, and the persistent player bar.
- Main/preload/shared IPC change: run `npm run build` and exercise the affected flow in the
  Electron app.
- Download, database, protocol, or playback change: verify success, cancellation/failure,
  app restart/recovery, missing-file behavior, and offline behavior relevant to the change.
- Logo/icon change: run `npm run icons`, then `npm run build`.

Before finishing, review `git diff` and make sure generated output, local environment files,
and unrelated changes were not included.
