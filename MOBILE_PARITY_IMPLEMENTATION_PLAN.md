# QuranDesk Desktop Mobile-Parity Implementation Plan

## Goal

Bring the Electron desktop app in line with the current QuranDesk Mobile product behavior and
UI/UX decisions. Mobile behavior takes precedence unless a platform-specific desktop
constraint requires a different implementation.

Each phase below is intended to be an actionable unit that can be implemented, verified, and
reviewed in a single prompt. Complete phases in order because later phases build on contracts,
database migrations, and UI behavior introduced earlier.

## Confirmed Product Decisions

- Remove download pause/resume behavior and all related UI/API/state.
- Remove the bulk-download storage confirmation and low-space warning.
- Remove the completed `Downloaded` aggregate button from reciter detail.
- Remove the redundant play/pause action from downloaded surah rows; use the row for playback
  and the trailing action for deletion.
- Remove the reciter count and catalog age from the Reciters header.
- Remove style-based search. Search reciter names only.
- Remove reciter style from reciter detail.
- Remove the first-launch welcome/continue screen.
- Remove bismillah from Now Playing.
- Remove toasts.
- Remove raw log-file reveal.
- Remove storage-used/free/total details from Settings.
- Remove downloads-folder path and Show in Explorer access.
- Remove manual update controls from Settings.
- Keep Electron automatic update checks and downloads, but surface only an update-ready banner
  with a restart action. Otherwise updates remain silent.
- Keep desktop-only infrastructure that is required by Electron, including the `app://`
  protocol, controlled photo cache, sidebar navigation, and `electron-updater`.

## Cross-Phase Completion Rules

Every phase must:

1. Preserve existing user databases through additive or compatibility migrations.
2. Validate all renderer-provided IPC input in the main process.
3. Keep light and dark themes working.
4. Keep keyboard access and visible focus behavior working.
5. Avoid rendering raw technical errors to users.
6. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
7. Smoke-test the affected behavior with `npm run dev` when possible.
8. Update `README.md`, `TODOS.md`, and `AGENTS.md` when the phase changes documented behavior
   or architectural invariants.

---

## Phase 1 - Simplify And Prioritize The Download Queue

**Status:** Implemented

### Outcome

The desktop downloader no longer supports pausing. Explicit single-surah and
playback-required downloads run before bulk-download queue items.

### Work

- Add a persistent `priority INTEGER NOT NULL DEFAULT 0` column to `download_queue`.
  - Migrate existing databases idempotently.
  - Continue accepting legacy rows whose status is `paused`, but convert them to `queued`.
- Remove `paused` from active TypeScript queue status unions.
- Remove pause/resume state and behavior from:
  - Shared API types and IPC constants.
  - Preload bridge.
  - Main-process IPC handlers.
  - Downloader state and worker loop.
  - Renderer downloads store.
  - Downloads page.
- Extend single-surah enqueue behavior with a priority option.
  - New explicit requests are inserted as priority.
  - Existing queued bulk items are promoted when explicitly requested.
  - Bulk reciter downloads remain normal priority.
- Claim queued work using `ORDER BY priority DESC, created_at ASC`.
- Make retry actions priority requests.
- Make auto-advance download requests priority requests.
- Preserve the three-download concurrency limit and persistent crash recovery.

### Likely Files

- `src/shared/api.ts`
- `src/preload/index.ts`
- `src/main/db.ts`
- `src/main/downloader.ts`
- `src/main/index.ts`
- `src/main/downloads.ts`
- `src/renderer/src/stores/downloads.ts`
- `src/renderer/src/routes/Downloads.tsx`
- `src/renderer/src/components/SurahRow.tsx`
- `src/renderer/src/audioEngine.ts`

### Acceptance Criteria

- No Pause All or Resume All UI remains.
- No public pause/resume IPC methods remain.
- Existing databases containing paused rows open successfully and resume those rows as queued.
- Clicking download/retry for a surah already inside a bulk queue promotes it ahead of normal
  bulk work.
- Playback-required downloads run before normal bulk queue items.
- Queue order remains stable among entries with the same priority.

### Focused Verification

- Start a full-reciter download, then request a later surah explicitly and confirm it starts
  before earlier normal-priority queued items.
- Restart with active and legacy paused queue rows and confirm all recover as queued.
- Confirm bulk downloads, single downloads, cancellation, and failed retry still work.

---

## Phase 2 - Harden Download Reliability And Library Reconciliation

**Status:** Implemented

### Outcome

Desktop downloads adopt the mobile implementation's stronger timeout, retry, file-verification,
and reconciliation behavior.

### Work

- Classify downloader failures as transient or permanent.
- Add request timeout and stream-inactivity timeout handling.
- Respect HTTP `Retry-After` for retryable responses.
- Retry transient failures with the mobile backoff strategy and a capped maximum delay.
- Do not retry permanent failures such as invalid local paths or unrecoverable filesystem
  writes.
- Verify downloaded byte counts before promoting `.partial` files.
- Verify final-file existence and size before recording completion in SQLite.
- Reset progress cleanly while retrying.
- Add an idempotent SQLite trigger or equivalent transaction guarantee that removes a completed
  surah from `download_queue`.
- Add a main-process library refresh operation that:
  - Reconciles the filesystem and database.
  - Returns current queue/download state or emits the existing events needed to refresh it.
  - Cannot race live progress events into stale renderer state.
- Log technical failure details while returning generic actionable messages to the renderer.

### Likely Files

- `src/main/db.ts`
- `src/main/downloader.ts`
- `src/main/downloads.ts`
- `src/main/errors.ts`
- `src/main/index.ts`
- `src/shared/api.ts`
- `src/preload/index.ts`
- `src/renderer/src/stores/downloads.ts`

### Acceptance Criteria

- Stalled requests and streams eventually retry or fail instead of hanging indefinitely.
- HTTP 408, 429, and 5xx responses are treated as transient.
- `Retry-After` is honored within a safe maximum.
- Truncated or empty downloads never become playable completed files.
- Completed files cannot remain in the queue.
- A manual library refresh safely detects externally added or removed audio files.
- User-facing failure copy does not expose stack traces, URLs, or local paths.

### Focused Verification

- Exercise cancellation during request, stream, retry delay, and finalization.
- Simulate a truncated file and confirm it is rejected.
- Remove a completed file externally, refresh the library, and confirm the UI reverts it.
- Place a valid audio file externally, refresh the library, and confirm it appears downloaded.

---

## Phase 3 - Make Playback The Primary Download Surface

**Status:** Implemented

### Outcome

The PlayerBar and Now Playing primary action adapt to the current surah's download state, and
navigation can land on missing surahs so the user can download them directly.

### Work

- Add a renderer `downloadAndPlay(track)` operation.
  - Set the requested track as current.
  - Enqueue it as priority.
  - Set it as pending so it automatically plays when completed.
- Change missing-track handling:
  - Keep the requested track selected.
  - In Stop mode, do not enqueue; show a download affordance.
  - In Auto-download mode, enqueue as priority and play when complete.
- Change end-of-surah handling:
  - Always advance the displayed current track to the next surah.
  - If downloaded, play immediately.
  - If missing in Stop mode, stop on it with a download action.
  - If missing in Auto-download mode, enqueue it as priority and play when ready.
- Keep Prev and Next navigation available for valid surah numbers regardless of download
  status.
- Make PlayerBar's primary action context-aware:
  - Downloaded: play/pause.
  - Not downloaded: download and play.
  - Queued/active: cancel.
  - Failed: priority retry and play.
- Make Now Playing's primary action use the same states.
- Show download-aware status copy and progress in PlayerBar and Now Playing.
- Disable seeking while the current surah is not downloaded.
- Hide PlayerBar entirely when no track is selected.
- Remove bismillah from Now Playing.

### Likely Files

- `src/renderer/src/audioEngine.ts`
- `src/renderer/src/components/PlayerBar.tsx`
- `src/renderer/src/routes/NowPlaying.tsx`
- `src/renderer/src/stores/player.ts`
- `src/renderer/src/stores/downloads.ts`

### Acceptance Criteria

- Selecting Next can move onto a missing surah.
- A missing current surah clearly shows a download action instead of a playback error.
- Explicit download-to-play requests jump ahead of bulk downloads and start playback when
  complete.
- Queued and active current-surah downloads can be cancelled from both player surfaces.
- Failed current-surah downloads can be retried from both player surfaces.
- Seeking is unavailable until the current surah is downloaded.
- PlayerBar renders nothing when no track has been selected.
- No bismillah appears on Now Playing.

### Focused Verification

- Test downloaded, missing, queued, active, failed, and completed states in both player
  surfaces.
- Test manual Prev/Next into missing surahs.
- Test end-of-surah behavior in Stop and Auto-download modes.
- Test cancellation and retry while the missing surah is selected.

---

## Phase 4 - Add Confirmed Destructive Actions

### Outcome

All deletion actions use one accessible custom confirmation dialog, and users can delete one
surah, one reciter, or the entire downloaded library.

### Work

- Create a reusable custom destructive confirmation dialog.
  - Theme-aware.
  - Keyboard accessible.
  - Focus trapped/restored appropriately.
  - Escape and Cancel close it.
  - Confirm button shows busy state.
  - Failures remain in the dialog with friendly retry copy.
- Change downloaded surah rows:
  - Clicking the row plays or toggles the current surah.
  - The trailing action becomes Delete.
  - Delete opens the confirmation dialog.
  - Remove the redundant second play/pause button.
- Add confirmation before deleting all downloaded surahs for a reciter from Downloads.
- Add a main-process `deleteAllDownloads` operation.
  - Cancel active work.
  - Remove queued and failed work.
  - Delete all completed audio.
  - Preserve catalog data, settings, and playback position.
- Add a confirmed `Delete all downloads` action in Settings.
- Keep deletion state synchronized across reciter cards, reciter detail, Downloads, and player
  surfaces.

### Likely Files

- `src/renderer/src/components/ConfirmationDialog.tsx`
- `src/renderer/src/components/SurahRow.tsx`
- `src/renderer/src/routes/ReciterDetail.tsx`
- `src/renderer/src/routes/Downloads.tsx`
- `src/renderer/src/routes/Settings.tsx`
- `src/main/downloader.ts`
- `src/main/index.ts`
- `src/shared/api.ts`
- `src/preload/index.ts`

### Acceptance Criteria

- No delete operation runs from a single unconfirmed click.
- Downloaded surah rows have one playback surface and one delete action.
- Deleting the currently selected surah leaves the player on that surah in a
  not-downloaded state with a download affordance.
- Delete-all removes completed, queued, active, failed, and partial download data.
- A failed delete produces friendly dialog feedback and can be retried.

### Focused Verification

- Confirm and cancel each deletion scope.
- Test keyboard-only dialog use.
- Delete active, queued, failed, downloaded, and currently playing surahs.
- Restart after delete-all and confirm removed data does not return.

---

## Phase 5 - Bring Catalog And Reciter Detail To Mobile Parity

### Outcome

Reciters and reciter detail use the mobile app's simpler status language and remove desktop-only
metadata and confirmation surfaces.

### Work

- Remove the first-launch Welcome gate and route directly into the app.
  - Show catalog loading/error/empty states inside Reciters.
  - Use the valid cached catalog immediately while refreshing in the background.
- Remove reciter count and catalog age from the Reciters header.
- Sort reciters alphabetically.
- Search reciter names only; remove style matching.
- Update reciter status presentation to the mobile three-state model:
  - Complete: green check plus `Downloaded`.
  - Empty: `Not downloaded · size`.
  - Partial: `X / 114 · size`.
- Highlight the currently playing reciter.
- Remove reciter style from reciter detail.
- Update reciter-detail hero status to the same three-state wording.
- Remove the completed `Downloaded` aggregate control.
- Remove `ConfirmDownloadDialog` and make bulk download start immediately.
- Keep total reciter size visible before the bulk-download action.
- Remove obsolete welcome and bulk-confirm components and related state.

### Likely Files

- `src/renderer/src/App.tsx`
- `src/renderer/src/routes/Welcome.tsx`
- `src/renderer/src/routes/Reciters.tsx`
- `src/renderer/src/components/ReciterCard.tsx`
- `src/renderer/src/routes/ReciterDetail.tsx`
- `src/renderer/src/components/ConfirmDownloadDialog.tsx`

### Acceptance Criteria

- App launch never requires a Continue action.
- Reciters header contains only the page title and name-only search.
- Reciters are alphabetically ordered.
- Currently playing reciter is visually distinct.
- Reciter list and detail use consistent three-state wording.
- Reciter detail shows no style, completed aggregate button, or bulk-download confirmation.
- Bulk download starts immediately from the visible action.

### Focused Verification

- Test first launch online, first launch offline, warm-cache offline, and warm-cache refresh
  failure.
- Test complete, empty, and partial reciter states.
- Test search against names and verify style-only queries no longer match.
- Test bulk download for empty and partial reciters.

---

## Phase 6 - Bring The Downloads Page To Mobile Parity

### Outcome

Downloads becomes a simpler operational view with active work, failures, and all on-device
reciters, plus explicit refresh/reconciliation.

### Work

- Replace separate `Fully downloaded` and `Partial` sections with one `On device` section.
- Keep failed entries out of active reciter progress cards.
- Make cancel-all for a reciter cancel only queued/active work while preserving completed
  downloads and failed entries.
- Display friendly generic failure copy rather than raw stored technical errors.
- Make failed retry actions priority requests.
- Retain remove-failed actions.
- Add a visible Refresh Library action suitable for desktop.
  - Reconcile filesystem and SQLite.
  - Refresh queue, counts, and storage readout.
- Keep storage-used summary in the Downloads header.
- Preserve empty state and Browse Reciters action.
- Ensure all delete-reciter actions use the Phase 4 confirmation dialog.

### Likely Files

- `src/renderer/src/routes/Downloads.tsx`
- `src/renderer/src/stores/downloads.ts`
- `src/main/downloader.ts`
- `src/main/downloads.ts`
- `src/main/index.ts`
- `src/shared/api.ts`
- `src/preload/index.ts`

### Acceptance Criteria

- Downloads contains `Downloading now`, `Failed`, and `On device` sections only.
- Failed entries do not distort active progress calculations.
- Cancel-all preserves failed entries and downloaded files.
- No raw error details appear in the UI.
- Refresh Library reconciles externally added and removed files without restarting.
- Counts, queue entries, and storage summary update after refresh and deletion.

### Focused Verification

- Exercise active plus failed entries for the same reciter.
- Cancel all active work and confirm failed/completed items remain.
- Refresh after external file addition and removal.
- Verify complete and partial reciters both appear under On device.

---

## Phase 7 - Add Privacy-Safe Diagnostics And Error Recovery

### Outcome

The desktop app records structured diagnostic context, exports a sanitized report, and recovers
from unexpected renderer failures without relying on raw log reveal or toasts.

### Work

- Add a bounded structured diagnostic error store in the main process.
  - Record timestamp, operation, sanitized error, and sanitized context.
  - Limit entry count and serialized size.
  - Redact secrets, credentials, URLs, user paths, and sensitive keys.
  - Diagnostics failures must never crash the app.
- Route meaningful caught failures through operation-aware logging.
- Add an IPC operation that creates and exports/saves a privacy-safe diagnostics JSON report
  containing:
  - App version and platform.
  - Catalog status and age.
  - Validated settings.
  - Download counts, queue state, and storage summary.
  - Update status.
  - Recent sanitized errors.
- Use a desktop-native save or share flow that lets the user choose the destination.
- Replace raw log-file reveal with `Export diagnostics` in Settings.
- Add a root React error boundary with a friendly Try Again fallback.
- Remove toast store, Toaster component, root mounting, and toast event wiring.
- Replace toast-only missing-file feedback with state-aware player/download UI and diagnostic
  logging.

### Likely Files

- `src/main/diagnostics.ts`
- `src/main/errors.ts`
- `src/main/index.ts`
- `src/shared/api.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/ErrorBoundary.tsx`
- `src/renderer/src/routes/Settings.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/stores/toasts.ts`
- `src/renderer/src/components/Toaster.tsx`

### Acceptance Criteria

- Settings exports a readable JSON diagnostics report.
- Exported reports contain useful state but no manifest/audio URLs, credentials, or local user
  paths.
- Raw log reveal is no longer available.
- Unexpected renderer errors show a recoverable fallback instead of a blank screen.
- No toast UI or toast state remains.
- Missing-file recovery still updates the affected surah and player state.

### Focused Verification

- Generate representative catalog, download, playback, and update errors, then inspect the
  export.
- Confirm redaction against URLs, Windows paths, secrets, and circular/large values.
- Force a renderer error and verify Try Again behavior.
- Trigger missing-file recovery and confirm the app updates without a toast.

---

## Phase 8 - Simplify Settings And Make Desktop Updates Quiet

### Outcome

Settings follows mobile's simpler structure, while Electron updates remain automatic and only
interrupt the user when a restart can install a ready update.

### Work

- Remove the manual Updates row and Check for Updates action from Settings.
- Preserve automatic update checks on launch and every six hours.
- Preserve automatic update downloads and install-on-quit behavior.
- Change `UpdateBanner` so it:
  - Is hidden for up-to-date, available, downloading, and error states.
  - Appears only when an update is ready.
  - Offers Restart to install.
- Record update errors in diagnostics without showing routine update-management UI.
- Remove storage-used/free/total details from Settings.
- Remove the downloads-folder path and Show in Explorer action.
- Keep Refresh Library, but use the mobile wording and state behavior.
- Keep the confirmed Delete All Downloads action from Phase 4.
- Use the mobile label `Auto-download` for the download-then-play setting.
- Reorganize Settings into:
  - Appearance
  - Playback
  - Library
  - Storage
  - Support
  - About

### Likely Files

- `src/renderer/src/routes/Settings.tsx`
- `src/renderer/src/components/UpdateBanner.tsx`
- `src/renderer/src/stores/updater.ts`
- `src/main/updater.ts`
- `src/main/diagnostics.ts`

### Acceptance Criteria

- No manual update check or update status row remains in Settings.
- Routine update checks/downloads are silent.
- A ready update presents one restart action.
- Ignoring the ready banner still installs the update on normal quit.
- Update failures are captured in exported diagnostics.
- Settings has no storage capacity readout or raw log reveal.
- Downloads-folder access is no longer available.

### Focused Verification

- Exercise every normalized updater state in development with mocked/store-injected states.
- Confirm only `ready` renders the banner.
- Confirm Settings layout and controls work in both themes.
- Confirm auto-update scheduling and install-on-quit code remain active.

---

## Phase 9 - Final Mobile-Parity Polish And Release Validation

### Outcome

The complete desktop experience is internally consistent, obsolete code is removed, and the
result is ready for release testing.

### Work

- Audit all user-facing copy against current mobile wording.
- Audit all download actions to ensure explicit and playback-needed requests use priority.
- Audit all destructive actions to ensure they require confirmation.
- Audit empty, loading, error, queued, active, failed, downloaded, and missing-file states.
- Audit keyboard navigation, accessible names, dialog focus handling, and focus-visible rings.
- Remove dead API methods, types, imports, components, styles, and comments left by earlier
  phases.
- Remove obsolete `paused` compatibility code except the minimum migration needed for existing
  databases.
- Update documentation:
  - Rewrite relevant shipped behavior in `TODOS.md`.
  - Update `README.md` for diagnostics export, update behavior, and download workflow.
  - Update `AGENTS.md` architecture/invariants after queue and diagnostics changes.
- Run full build and unpacked-package validation.

### Likely Files

- All files changed in Phases 1-8
- `README.md`
- `TODOS.md`
- `AGENTS.md`

### Acceptance Criteria

- No user-visible behavior contradicts the confirmed product decisions.
- No pause/resume, toast, bismillah, welcome gate, style search, bulk-download confirmation,
  completed aggregate button, downloads-folder access, raw log reveal, or manual update control
  remains.
- No raw technical errors are shown to users.
- Priority, playback progression, confirmations, diagnostics export, and quiet updates work
  together end-to-end.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run build:unpack` pass.

### Release Smoke Matrix

- Fresh install online.
- Fresh install offline.
- Existing install with cached manifest and downloads.
- Existing install with legacy paused queue rows.
- Single download, bulk download, priority promotion, cancellation, failure, and retry.
- Delete one surah, one reciter, and all downloads.
- Sequential playback through downloaded and missing surahs in both advance modes.
- Restart during active downloads and during pending download-to-play.
- Missing/corrupt audio-file recovery.
- Diagnostics export after representative failures.
- Automatic updater states and ready-to-restart banner.
- Light and dark themes at minimum supported window size.

## Deferred Outside This Plan

The following mobile/platform differences are not desktop parity work:

- Replacing Electron sidebar navigation with mobile bottom tabs.
- Replacing the `app://` protocol with direct `file://` playback.
- Replacing controlled desktop photo caching with `expo-image`.
- Replacing Electron auto-update infrastructure with EAS Update.
- Mobile lock-screen controls, mobile background-audio configuration, safe-area handling,
  haptics, and pull-to-refresh gestures.
