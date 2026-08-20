# QuranDesk

QuranDesk is an offline-first desktop player for complete Qur'an recitations. It downloads
surahs for local playback and runs on Windows, macOS, and Linux.

Built with Electron, React, TypeScript, Zustand, Tailwind CSS v4, and `better-sqlite3`.

## Features

- **Offline-first.** The reciter catalog is cached for offline browsing, and playback uses
  only audio already downloaded to the device.
- **Prioritized downloads.** A persistent SQLite queue with three worker slots streams atomic
  downloads. Explicit surah requests, retries, and playback-needed downloads jump ahead of
  bulk reciter downloads.
- **Sequential playback.** Previous/next, seek, playback speed, repeat-one, and position
  restore. Reaching a missing surah either stops or auto-downloads it, per the Auto-download
  setting. Press <kbd>Space</kbd> to toggle play/pause.
- **Managed library.** The Downloads page separates active work, failures, and reciters with
  audio on device. Refresh Library reconciles SQLite against the filesystem. Delete actions
  require confirmation.
- **Silent auto-updates.** Updates check and download on launch and every six hours. A banner
  appears only when an update is ready to restart; ignored updates install on the next quit.
- **Privacy-safe diagnostics.** Settings › Support exports a JSON report that redacts URLs,
  credentials, secrets, and local paths.

## Getting started

Requires **Node.js 22** and npm.

```sh
npm install
npm run dev
```

Set the catalog URL in `.env` (copy `.env.example` as a starting point; never commit `.env`):

```sh
MAIN_VITE_MANIFEST_URL=https://your-host/reciters.json
```

## Development

```sh
npm run dev          # Electron dev window with HMR
npm run typecheck    # node + renderer TypeScript checks
npm run lint         # ESLint
npm run format       # Prettier
npm run build        # typecheck, then compile main, preload, and renderer
npm run build:unpack # build and produce a local unpacked app for smoke testing
```

There is no automated test suite. For normal changes run `typecheck` and `lint`; run `build`
for cross-boundary, build-config, or release-relevant changes. See [AGENTS.md](./AGENTS.md)
for architecture, IPC contracts, and coding conventions.

## Building installers

```sh
npm run icons        # regenerate platform icons from src/renderer/src/assets/logo.svg
npm run build:win    # Windows NSIS installer, x64
npm run build:mac    # macOS DMG + ZIP, arm64
npm run build:linux  # Linux AppImage + deb
```

macOS local builds skip notarization; CI notarizes tagged releases. Windows builds are
unsigned unless signing credentials are provided.

## Releasing

Releases are **tag-driven**: pushing a `v*` tag triggers `.github/workflows/release.yml`,
which builds macOS arm64, Windows x64, and Linux packages and publishes a single **draft**
GitHub Release. Published releases are consumed by `electron-updater`.

> **Important:** `electron-builder` reads the version from `package.json`, **not** from the
> git tag — it names every asset and writes the auto-updater's `latest*.yml` from it. The tag
> and `package.json` must agree, or the build ships assets carrying the wrong version and
> auto-update breaks. CI enforces this with a guard step that fails the release on a mismatch.

Use `npm version` so the bump, commit, and tag are always in sync:

```sh
# 1. Ensure main is clean and green.
git checkout main && git pull
npm run typecheck && npm run lint && npm run build:unpack

# 2. Bump package.json, commit, and create the matching tag in one step.
#    Pass the explicit version to release.
npm version x.y.z -m "release: v%s"

# 3. Push the commit and the tag.
git push --follow-tags
```

Then:

4. Watch the **Release** workflow succeed for all three OSes.
5. Open the generated **draft** release, verify every asset is named with the new version and
   the `latest*.yml` files are present, then publish it.

Never create a `v*` tag by hand without bumping `package.json` first — that is exactly what
the guard step prevents.

### Release secrets

- `MAIN_VITE_MANIFEST_URL`
- `MAC_CERT_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID` — signed/notarized macOS releases
- `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` — Windows signing (optional)

## Architecture

```text
src/
  main/       Electron lifecycle, SQLite, downloads, protocols, diagnostics, updates
  preload/    Context-isolated typed bridge exposed as globalThis.api
  renderer/   React routes, components, Zustand stores, and the audio engine
  shared/     IPC types/constants and bundled surah metadata
```

- SQLite is the source of truth for downloads and the persistent queue; the filesystem is
  reconciled into it at startup and via Refresh Library.
- Downloaded audio and cached photos are served through the controlled `app://` protocol.
- The main process owns structured diagnostics, native save dialogs, and automatic updates.
- The renderer owns presentation and a single hidden `<audio>` element
  (`components/AudioEngine.tsx`; imperative playback logic lives in `audioEngine.ts`).

See [AGENTS.md](./AGENTS.md) for the full IPC contract, security boundaries, and conventions.
