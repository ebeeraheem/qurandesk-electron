# QuranDesk Shipped Behavior And Remaining Work

This file records the current product rather than the historical implementation sequence.

## Shipped

### Catalog And Reciters

- Cached remote catalog with offline browsing and friendly loading/error states.
- Name-only reciter search.
- Reciter cards and detail pages show mobile-aligned download status.
- No welcome gate, reciter count, style search, or reciter style UI.

### Downloads

- Persistent SQLite queue with three worker slots and streamed atomic downloads.
- Explicit surah, retry, and playback-needed requests receive priority.
- Bulk reciter downloads use normal priority and promote already-queued items when explicitly
  requested.
- Queue states are queued, active, and failed. Legacy paused rows are migrated to queued.
- Downloads page shows Downloading now, Failed, and On device.
- Refresh Library reconciles SQLite and the filesystem.
- Delete-surah, delete-reciter, and delete-all actions require confirmation.

### Playback

- One hidden audio element plays downloaded files through the controlled `app://` protocol.
- Surah rows use one playback surface plus a separate delete action.
- Previous/next, seek, speed, repeat-one, position restore, and sequential progression work.
- Missing next surahs either stop or auto-download based on the Auto-download setting.
- Missing/corrupt audio resets player/download state and records a diagnostic.

### Settings, Diagnostics, And Updates

- Mobile-aligned Settings sections: Appearance, Playback, Library, Storage, Support, About.
- Privacy-safe bounded diagnostics export through a native save dialog.
- Root renderer error boundary with a Try Again fallback.
- Automatic updates check/download silently on launch and every six hours.
- Only a ready update presents a Restart banner; ignored ready updates install on quit.
- No toast UI, raw log reveal, downloads-folder access, or manual update control.

### Packaging

- Windows x64 NSIS, macOS arm64 DMG/ZIP, Linux AppImage/deb.
- Tag-driven release workflow with macOS signing/notarization support and optional Windows
  signing.
- `better-sqlite3` is unpacked from asar for runtime loading.

## Release Validation

Before release, run:

```sh
npm run typecheck
npm run lint
npm run build
npm run build:unpack
```

Then exercise the release smoke matrix in `MOBILE_PARITY_IMPLEMENTATION_PLAN.md`, including
offline startup, legacy paused-row migration, priority promotion, deletion confirmations,
missing-file recovery, diagnostics export, ready-update UI, and both themes.

## Deferred Decisions

- Windows code-signing certificate.
- Crash reporting or analytics beyond user-exported diagnostics.
- Additional release channels beyond stable.
- Intel macOS packaging.
- Optional Arabic reciter short names in the manifest.
- Moving the manifest cache from JSON into SQLite.
