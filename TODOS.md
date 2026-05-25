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

- ✅ `src/main/protocol.ts` — handles `app://audio/<reciter-id>/<NNN>.mp3` → file under `<userData>/audio/`
- ✅ Path-traversal guard (resolved path must be inside the audio root)
- ✅ HTTP Range request support → 206 Partial Content with `Content-Range` (handles open-ended, suffix, and clamp-past-EOF cases; returns 416 on truly invalid ranges)
- ✅ HEAD requests respected (size only, no body)
- ✅ Reciter-id allowlist `/^[a-z0-9-]+$/` and surah range 1–114 enforced at the protocol layer
- ✅ `productName: "QuranDesk"` set so `<userData>` = `%APPDATA%/QuranDesk` (matches spec)
- ✅ `getAudioUrl` IPC wired — returns `app://...` if file exists on disk, else `null`
- ✅ `AppInfo.audioDir` surfaced to renderer so smoke-test panel can show the drop path
- ⬜ Smoke test with a hand-placed mp3 (waiting on user)

## Phase 3 — Manifest fetch + cache

- ✅ `src/main/manifest.ts` — fetch `reciters.json`, validate `schema_version` (rejects unknown majors with friendly error), tolerant per-reciter validation, persists to `manifest.cache.json` with `fetchedAt`
- ✅ `getReciters` / `refreshManifest` / `getManifestStatus` IPC
- ✅ `manifest:updated` event fan-out (`EVENTS` constants in shared, broadcast to all open windows)
- ✅ `.env.example` with `MAIN_VITE_MANIFEST_URL` and `VITE_R2_HOST` + `.env*` ignored by git
- ✅ Welcome / loading splash on first launch (skipped if cache exists; CTA on success; Retry + friendly error on failure)
- ✅ Reciters route now shows real reciter count, list, and cache age; reloads on `manifest:updated`

## Phase 4 — Catalog UI

- ✅ Real reciter grid — responsive `auto-fill` cards, name + "size · state" subtitle, partial / complete badges
- ✅ `ReciterAvatar` — loads `photo_url`, falls back to deterministic gradient + first letter
- ✅ Search box in header (client-side, case-insensitive, matches name + style)
- ✅ Offline banner when cached manifest + no network (amber, with cache age)
- ✅ Blocking error state when no cache + no network (or fetch error) with Retry
- ✅ Click-through to `/reciter/:id` (Phase 5 fills in the 114-row table)
- ✅ Removed BOOTSTRAP CHECK and AUDIO PROBE panels — served their purpose in Phases 1–3

## Phase 5 — Reciter detail UI

- ✅ Bundled `src/shared/surahs.json` (114 entries, `{ number, name_ar, name_en, meaning_en }`) + typed accessor in `surahs.ts`
- ✅ `src/main/downloads.ts` — filesystem-backed `getSurahDownloads` and `buildReciterSummary` (Phase 6 will swap for SQLite without changing the public surface)
- ✅ Reciter cards now show real `X / 114` counts via the enriched `getReciters`
- ✅ 114-row surah table — number, English + meaning, Arabic right-aligned, action button
- ✅ "Currently playing" row marker (primary purple left bar + tinted background)
- ✅ Aggregate header button (Download all / Resume · X left / Downloaded), download/resume disabled with Phase 6 tooltips
- ✅ Player store (`stores/player.ts`) + audio engine (`audioEngine.ts` + `AudioEngine.tsx`) — single hidden `<audio>` element drives playback state into the store
- ✅ Play button on downloaded rows plays via `app://` URL; row click also plays; click-to-toggle on the currently-playing row
- ✅ PlayerBar wired: play / pause / seek / speed cycling all work end-to-end; reciter + surah info displayed; prev / next / continuous / expand stay deferred to Phase 8

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
- Production `MAIN_VITE_MANIFEST_URL` / `VITE_R2_HOST` — to be filled in once R2 base URL is provided
- **Manifest extension** — add `name_ar` (Arabic short form) per reciter so card placeholders match the design language. Currently we fall back to the first English letter.
