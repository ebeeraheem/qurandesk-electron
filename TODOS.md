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

- ✅ SQLite via `better-sqlite3@12` (`downloads`, `download_queue` tables — WAL mode, indexes). `manifest_cache` left as JSON file (see open items)
- ✅ `src/main/downloader.ts` — worker pool (MAX_CONCURRENT=3), streamed `fetch` → `<file>.partial` → atomic rename
- ✅ Exponential backoff 1s / 4s / 16s, then `'failed'` with error message
- ✅ Cancel: AbortController per job, deletes queue row + `.partial` file
- ✅ Queue persistence across restarts (`recoverFromCrash` demotes `'active'`/`'paused'` → `'queued'` on boot, then resumes)
- ✅ Progress events throttled to 500ms per active download (~2/sec)
- ✅ `pauseAll` / `resumeAll` — process-wide flag prevents new starts; in-flight finish normally
- ✅ Filesystem reconciliation on boot — pre-existing audio files get INSERTed into `downloads` so they appear in the UI
- ✅ All IPC validations (reciter-id regex, surah range) enforced at the handler boundary per spec §8
- ✅ Renderer downloads store (`stores/downloads.ts`) — per-reciter map hydrated lazily, kept live via `download:progress` / `download:completed`
- ✅ `SurahRow` renders all states: download / queued / active (with progress %) / failed (with retry) / downloaded (with play|pause)
- ✅ Active rows show a subtle gradient progress fill across the row
- ✅ `Download all 114` / `Resume · X left` / `Downloading N…` aggregate button on reciter detail (now functional)
- ✅ Full Downloads page: per-reciter active card with progress bar + current surah + cancel-all, Failed list with retry/remove, Fully Downloaded list with delete, Partial list, Pause all / Resume all
- ✅ Sidebar badge: live count of queued + active + failed entries

### Caveats discovered during build

- `better-sqlite3@11` failed to compile against Electron 39's V8 (removed `Context::GetIsolate`). Bumped to `v12.10.0` which builds cleanly. If a contributor's local install ever needs to rebuild for a different Electron ABI (you'll see `The module ... was compiled against a different Node.js version`), run `npx @electron/rebuild -f -w better-sqlite3`.

## Phase 7 — Batch download

- ✅ "Download all 114" enqueues missing surahs (shipped in Phase 6; preserved here)
- ✅ Per-reciter aggregate state recomputation (shipped in Phase 6 via `getReciterStats`)
- ✅ `src/main/storage.ts` — `getStorageUsage()` via `fsp.statfs` + SQL `SUM(size_bytes)`; wired through `getStorageUsage` IPC
- ✅ `ConfirmDownloadDialog` with three states: **ok** (plain readout + Download CTA), **tight** (within 5 GB safety amber warning, still proceedable), **insufficient** (within 1 GB margin → blocking red error, Cancel only)
- ✅ Aggregate header button now opens the dialog instead of enqueuing directly; estimate computed as `total_size_bytes × (114 − downloaded) / 114` since manifest lacks per-surah sizes
- ✅ Sidebar storage block now shows real numbers — primary slice = QuranDesk, muted slice = other apps; tooltip breaks down used / free / total
- ✅ Storage updates on `download:completed` events + 30s sanity poll

## Phase 8 — Player

- ✅ HTML5 `<audio>` pointed at `app://` URLs (shipped in Phase 5)
- ✅ Variable playback speed (shipped in Phase 5)
- ✅ Settings + playback-state SQLite tables, `src/main/settings.ts` + `src/main/playback.ts`
- ✅ `getSettings` / `updateSettings` / `getLastPlayback` / `setLastPlayback` IPC wired
- ✅ Renderer `stores/settings.ts` with optimistic update + IPC sync
- ✅ **Repeat mode** (player-bar + Now Playing button) backed by `settings.repeatMode`. `'off'` (default) = sequential play stopping at 114 / at first not-downloaded gap; `'one'` = loop current surah. Replaced the earlier `autoAdvance: boolean` toggle which was confusing — sequential play is the implicit default, the meaningful user choice is whether to loop one
- ✅ `handleEnded` advances to next surah; `'stop'` mode leaves a hint, `'download-then-play'` enqueues + sets `pendingTrack`; `download:completed` resolves pending into playback
- ✅ Prev / Next surah navigation (1↔114 clamped)
- ✅ Position persistence — `playback_state` written on play / pause / ended + throttled ~5s during playback + on `beforeunload`
- ✅ App boots restoring last track into `current` *and* pre-loads `audioEl.src` so the next play press resumes from the saved position. Removed the `resumePosition` one-shot — it was set but never made the audio element load anything, so play did nothing and duration stayed at 0. Now `applySrc(url, seekTo)` pushes the URL eagerly and queues it if `AudioEngine` hasn't mounted yet (covers the boot race between `restoreLastPlayback` and React's `useEffect`)
- ✅ `/now-playing` route — large avatar, bismillah (omitted for surah 1 + 9), big Arabic name, Latin + meaning, reciter + "Surah X of 114", scrubber, control cluster (continuous, prev, big play/pause, next, speed)
- ✅ PlayerBar hidden while `/now-playing` is active; chevron-down collapses back; clicking PlayerBar's now-playing summary or expand icon opens NowPlaying

## Phase 9 — Settings & storage

- ✅ Settings page UI — Appearance / Playback / Storage / About sections
  - Theme: System / Light / Dark segmented control (writes through `updateSettings`). **Sole control surface** — PlayerBar theme button removed since the Settings page covers it
  - Default playback speed: 0.75× / 1× / 1.25× / 1.5×
  - "When the next surah isn't downloaded": Stop / Download then play (the `autoAdvanceMode` toggle)
  - Downloads folder: read-only path + Show in Explorer
  - Refresh library: calls `refreshManifest`. Subtitle reads "Check for newly added reciters." (was "Re-download reciters.json from cloud storage" — too technical); on failure surfaces the error
  - About: version + library-last-updated date
- ✅ Theme refactored to be settings-derived — `localStorage` only as first-paint cache; `useSettingsStore` is the source of truth
- ✅ `revealDownloadsFolder` IPC (`shell.openPath` on the audio root; no renderer-provided path → no traversal surface)
- ✅ Sidebar storage block was already wired in Phase 7 (kept as-is)
- ❌ Default reciter — removed per user feedback (not useful enough to justify the row + the on-launch redirect complexity)

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
- **Manifest cache in SQLite** — spec §3.3 has a `manifest_cache` table; we kept Phase 3's JSON-file cache instead because both work and migration would touch a stable module. Consolidate once we have a reason.
