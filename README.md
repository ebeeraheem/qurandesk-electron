# QuranDesk

A quiet listening room for complete Qur'an recitations. Cross-platform desktop app (macOS, Windows, Linux) built on Electron + React + TypeScript. Recitations stream from a Cloudflare R2 bucket, are downloaded locally, and play back offline.

> **Status:** Phase 1 — bootstrap. Most surfaces are scaffolding; see [`TODOS.md`](./TODOS.md) for what has actually shipped vs. what's still ahead. The full design spec lives in `~/Downloads/QuranDesk-Spec.md`.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Electron 39 |
| Build | electron-vite 5 + Vite 7 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| State | Zustand |
| Router | react-router-dom 7 (`HashRouter`) |

## Develop

```sh
npm install
npm run dev      # opens the Electron dev window with HMR
npm run typecheck
npm run lint
```

## Build

```sh
npm run build           # type-check + build main / preload / renderer
npm run build:mac       # DMG + ZIP (universal)
npm run build:win       # NSIS installer
npm run build:linux     # AppImage + deb
```

Packaging targets, signing, and the auto-updater come online in later phases — see [`TODOS.md`](./TODOS.md) phases 10–11.

## Project layout

```
src/
├── main/        # Electron main process (app lifecycle, IPC handlers — to grow)
├── preload/     # Context-isolated bridge exposing window.api
├── renderer/    # React UI (Vite-served in dev, file:// in prod)
└── shared/      # IPC type contract (api.ts) shared by main + preload + renderer
```

Aliases (configured in `electron.vite.config.ts` and both tsconfigs):

- `@shared/*` → `src/shared/*`
- `@renderer/*` → `src/renderer/src/*`

## Environment

The renderer reads two compile-time env vars (Vite picks up anything starting with `VITE_`):

- `VITE_MANIFEST_URL` — full URL to `reciters.json` on R2
- `VITE_R2_HOST` — R2 host, baked into the CSP for image and connect sources

A `.env.example` is added in Phase 3.
