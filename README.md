# QuranDesk

QuranDesk is an offline-first desktop player for complete Qur'an recitations. It downloads
surahs for local playback and runs on Windows, macOS, and Linux using Electron, React,
TypeScript, Zustand, Tailwind CSS, and SQLite.

## Product Behavior

- The catalog is cached for offline browsing.
- Playback uses downloaded audio only. Selecting a missing surah offers download-and-play.
- Explicit surah requests, retries, and playback-needed downloads are prioritized ahead of
  bulk reciter downloads.
- Sequential playback can stop at a missing surah or auto-download it before continuing.
- The Downloads page separates active work, failures, and reciters with audio on device.
- Delete-surah, delete-reciter, and delete-all actions require confirmation.
- Settings can export a privacy-safe diagnostics JSON report. Raw logs and local paths are not
  exposed in the UI.
- Updates check and download silently on launch and every six hours. A banner appears only
  when an update is ready to restart; ignored updates install on normal quit.

See [TODOS.md](./TODOS.md) for the shipped feature summary and remaining release decisions.

## Develop

Use Node.js 22 and npm.

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

Set the catalog URL in `.env`:

```sh
MAIN_VITE_MANIFEST_URL=https://your-host/reciters.json
```

Copy `.env.example` as a starting point. Do not commit `.env`.

## Build And Package

```sh
npm run icons        # regenerate platform icons from logo.svg
npm run build        # type-check and compile main, preload, and renderer
npm run build:unpack # create an unpacked local application
npm run build:win    # Windows NSIS installer, x64
npm run build:mac    # macOS DMG + ZIP, arm64
npm run build:linux  # Linux AppImage + deb
```

macOS local builds skip notarization. CI enables notarization for tagged releases. Windows
builds are unsigned unless signing credentials are provided.

## Release Flow

1. Bump the version in `package.json`.
2. Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run build:unpack`.
3. Exercise the release smoke matrix in [MOBILE_PARITY_IMPLEMENTATION_PLAN.md](./MOBILE_PARITY_IMPLEMENTATION_PLAN.md).
4. Push a `v*` tag.
5. Verify the draft GitHub Release artifacts before publishing it.

The release workflow builds macOS arm64, Windows x64, and Linux packages. Published releases
are consumed by `electron-updater`.

Required release secrets:

- `MAIN_VITE_MANIFEST_URL`
- `MAC_CERT_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
  `APPLE_TEAM_ID` for signed/notarized macOS releases
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` when Windows signing is enabled

## Architecture

```text
src/
  main/       Electron lifecycle, SQLite, downloads, protocols, diagnostics, updates
  preload/    Context-isolated typed bridge exposed as globalThis.api
  renderer/   React routes, components, Zustand stores, and the audio engine
  shared/     IPC types/constants and bundled surah metadata
```

- SQLite is the source of truth for downloads and the persistent queue.
- The filesystem is reconciled into SQLite at startup and through Refresh Library.
- Downloaded audio and cached photos are served through the controlled `app://` protocol.
- The main process owns structured diagnostics, native save dialogs, and automatic updates.
- The renderer owns presentation and one hidden `<audio>` element.

## Diagnostics

Settings > Support > Export diagnostics opens a native save dialog for a JSON report containing
app/catalog/settings state, aggregate download/storage/update state, and recent sanitized
errors. The exporter redacts URLs, credentials, secrets, and local paths and bounds retained
diagnostic size.
