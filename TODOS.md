# QuranDesk — Build Tracker

Phase-by-phase TODO list. The spec lives in `Downloads/QuranDesk-Spec.md`; this file tracks **what has actually shipped**.

Legend: ✅ done · 🚧 in progress · ⬜ not started

---

## Phase 1 — Bootstrap

- ✅ Scaffold `electron-vite` with React + TypeScript
- ✅ Add Tailwind v4 with full colour palette (light + dark themes, primary purple, semantic colours)
- ✅ Shared IPC contract in `src/shared/api.ts` (typed `QuranDeskAPI` + channel constants)
- ✅ Typed preload bridge exposing `window.api` (most methods are `notImplemented` stubs awaiting later phases)
- ✅ Main process IPC handlers for `app:ping` and `app:getAppInfo`
- ✅ Sidebar + routes layout (Reciters · Downloads · Settings) using `HashRouter`
- ✅ Persistent player bar (visual only — no audio engine yet)
- ✅ Theme store (system / light / dark) with `prefers-color-scheme` follow + localStorage persistence
- ✅ Verify `npm run dev` opens window cleanly (main + preload + renderer all built; no startup errors)
- ⬜ User initialises git, adds remote, pushes

## Phase 2 — Custom `app://` protocol with Range support

- ⬜ `src/main/protocol.ts` — handles `app://audio/<reciter-id>/<NNN>.mp3` → file under `<userData>/audio/`
- ⬜ Path-traversal guard (resolved path must be inside the audio root)
- ⬜ HTTP Range request support → 206 Partial Content with `Content-Range`
- ⬜ Wire `getAudioUrl` IPC to return `app://...` URLs
- ⬜ Smoke test with a hand-placed mp3

## Phase 3 — Manifest fetch + cache

- ⬜ `src/main/manifest.ts` — fetch `reciters.json`, validate `schema_version`, persist to `manifest.cache.json`
- ⬜ `getReciters` / `refreshManifest` / `getManifestStatus` IPC
- ⬜ `manifest:updated` event fan-out
- ⬜ `.env.example` with `VITE_MANIFEST_URL` and `VITE_R2_HOST`
- ⬜ Welcome / loading splash on first launch (manifest not yet cached)

## Phase 4 — Catalog UI

- ⬜ Real reciter grid (photo, name, style, total size, state badge)
- ⬜ Search box (client-side filter)
- ⬜ Offline banner when cached manifest + no network
- ⬜ Blocking error state when no cache + no network

## Phase 5 — Reciter detail UI

- ⬜ 114-row surah table joined to local download state
- ⬜ Bundled `src/shared/surahs.json` (114 entries with `name_en`, `name_ar`, `name_translit`)
- ⬜ Row actions (download / cancel / play)

## Phase 6 — Single-surah downloader

- ⬜ SQLite via `better-sqlite3` (`downloads`, `download_queue`, `manifest_cache` tables)
- ⬜ `src/main/downloader.ts` — streamed fetch → `.partial` → rename, with progress events
- ⬜ Exponential backoff 1 / 4 / 16 s, then `failed`
- ⬜ Queue persistence across restarts (`active` → `queued` on boot, then resume)
- ⬜ Progress events throttled to ~2/sec per download

## Phase 7 — Batch download

- ⬜ "Download all 114" enqueues missing surahs
- ⬜ Pre-flight free-disk check (`total_size_bytes > freeDisk - 1 GB` blocks with friendly error)
- ⬜ Per-reciter aggregate state recomputation (`none` / `partial` / `complete`)

## Phase 8 — Player

- ⬜ HTML5 `<audio>` pointed at `app://` URLs
- ⬜ Continuous play with `autoAdvanceMode = 'stop' | 'download-then-play'`
- ⬜ Persist last reciter / surah / position
- ⬜ Variable playback speed (0.75 / 1.0 / 1.25 / 1.5)
- ⬜ Expanded Now Playing view

## Phase 9 — Settings & storage

- ⬜ Theme, default reciter, default playback speed, auto-advance mode
- ⬜ Storage block in sidebar (app used / total device, with "other apps" tooltip)
- ⬜ Downloads folder displayed read-only with "Show in Finder/Explorer"
- ⬜ "Refresh library" button calling `refreshManifest`

## Phase 10 — Auto-updater

- ⬜ `electron-updater` wired to GitHub Releases
- ⬜ Check on launch and every 6 hours
- ⬜ Update banner / restart prompt

## Phase 11 — Packaging

- ⬜ Icons script generating `icon.icns`, `icon.ico`, `icon.png` from `logo.svg`
- ⬜ macOS universal binary signed + notarized (env-gated)
- ⬜ Windows NSIS (unsigned for v1; cert env vars wired)
- ⬜ GitHub Actions matrix release workflow

## Phase 12 — Polish

- ⬜ Empty states, offline banner, error toasts
- ⬜ Audio-file-missing recovery (row reverts to `not_downloaded` + toast)
- ⬜ Accessibility pass (focus rings, ARIA labels, keyboard reachability for primary controls)

---

## Open decisions deferred from spec §13

- Windows code-signing cert — v1 ships unsigned; build config cert-ready
- Crash reporting / analytics — none in v1
- Release channels — stable only in v1
- Production `VITE_MANIFEST_URL` / `VITE_R2_HOST` — to be filled in once R2 base URL is provided
