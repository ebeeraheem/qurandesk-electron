# QuranDesk

A quiet listening room for complete Qur'an recitations. Cross-platform desktop app (macOS, Windows, Linux) built on Electron + React + TypeScript. Recitations stream from a Cloudflare R2 bucket, are downloaded locally, and play back offline.

> See [`TODOS.md`](./TODOS.md) for what has shipped per phase.

## Stack

| Concern     | Choice                               |
| ----------- | ------------------------------------ |
| Runtime     | Electron 39                          |
| Build       | electron-vite 5 + Vite 7             |
| UI          | React 19 + TypeScript                |
| Styling     | Tailwind CSS v4 (CSS-first `@theme`) |
| State       | Zustand                              |
| Router      | react-router-dom 7 (`HashRouter`)    |
| Storage     | better-sqlite3 (WAL)                 |
| Auto-update | electron-updater → GitHub Releases   |

## Develop

```sh
npm install
npm run dev          # opens the Electron dev window with HMR
npm run typecheck
npm run lint
```

## Build & package

```sh
npm run icons        # regenerate build/icon.{png,icns,ico} from logo.svg
npm run build        # type-check + compile main / preload / renderer

npm run build:unpack # quick local pack (no installer)
npm run build:mac    # DMG + ZIP, universal (arm64 + x64)
npm run build:win    # NSIS installer, x64
npm run build:linux  # AppImage + deb
```

Local mac builds skip notarization by default (the YAML's `mac.notarize: false`); CI overrides it on tag pushes. To force a notarized local build, run:

```sh
npx electron-builder --mac --arch=arm64 -c.mac.notarize=true
```

…with `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` set in your env.

> **Mac is arm64-only for v1.** Universal binaries don't merge cleanly with `better-sqlite3`'s native module out of the box. To add Intel (x64) support, add a `macos-13` runner to the release matrix building `--arch=x64`; you'll then need to handle the parallel `latest-mac.yml` write race (simplest: run the two mac jobs sequentially with `needs:`).

## Release flow

Push a `v*` tag and the [Release workflow](.github/workflows/release.yml) builds for every OS in the matrix and uploads installers + `latest*.yml` to a GitHub Release:

```sh
# bump version in package.json first
git tag v0.2.0
git push --tags
```

The Release lands as a **draft** — verify the artifacts before promoting it; once published, existing installs pick it up via `electron-updater` (checks on launch + every 6h).

### Required GitHub Secrets

| Secret                        | When                                      | What                                                              |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `GITHUB_TOKEN`                | always                                    | Provided automatically by Actions                                 |
| `MAC_CERT_BASE64`             | mac signing                               | base64-encoded Developer ID Application `.p12`                    |
| `MAC_CERT_PASSWORD`           | mac signing                               | Password for the `.p12`                                           |
| `APPLE_ID`                    | notarization                              | Apple ID email                                                    |
| `APPLE_APP_SPECIFIC_PASSWORD` | notarization                              | App-specific password ([create here](https://appleid.apple.com/)) |
| `APPLE_TEAM_ID`               | notarization                              | 10-char team id from developer.apple.com                          |
| `WIN_CSC_LINK`                | win signing (optional, v1 ships unsigned) | base64-encoded `.pfx` cert                                        |
| `WIN_CSC_KEY_PASSWORD`        | win signing                               | Password for the `.pfx`                                           |

## Project layout

```
src/
├── main/        # Electron main process (lifecycle, IPC, DB, downloader, updater)
├── preload/     # Context-isolated bridge exposing window.api
├── renderer/    # React UI (Vite-served in dev, file:// in prod)
└── shared/      # IPC types + bundled surahs.json (no Node or DOM imports)

scripts/
└── build-icons.mjs  # regenerates platform icons from logo.svg

.github/workflows/
├── ci.yml       # typecheck + lint + build on push / PR
└── release.yml  # matrix package + publish on tag push
```

Path aliases (configured in `electron.vite.config.ts` and both tsconfigs):

- `@shared/*` → `src/shared/*`
- `@renderer/*` → `src/renderer/src/*`

## Environment

`.env` keys (copy from `.env.example`):

- `MAIN_VITE_MANIFEST_URL` — full URL to `reciters.json` on R2 (main process fetches this)
- `VITE_R2_HOST` — R2 host reserved for the renderer (kept for future CSP tightening)

The auto-updater publish target is hard-coded to `ebeeraheem/qurandesk-electron` in `electron-builder.yml`.
