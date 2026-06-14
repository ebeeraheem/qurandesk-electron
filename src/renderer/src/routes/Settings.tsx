import { useEffect, useState } from 'react'
import type {
  AppError,
  AppInfo,
  AutoAdvanceMode,
  PlaybackSpeed,
  ThemePreference
} from '@shared/api'
import { useSettingsStore, updateSettings } from '../stores/settings'
import { useUpdaterStore } from '../stores/updater'
import { formatAbsoluteDate, formatRelativeTime } from '../utils/format'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { prepareAllDownloadsForDeletion } from '../audioEngine'

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5]

const AUTO_ADVANCE: Array<{ value: AutoAdvanceMode; label: string; sub: string }> = [
  {
    value: 'stop',
    label: 'Stop',
    sub: 'Stay offline. Pause when the next surah isn’t on disk.'
  },
  {
    value: 'download-then-play',
    label: 'Download then play',
    sub: 'Fetch the missing surah, then continue.'
  }
]

export default function Settings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [manifestStatus, setManifestStatus] = useState<{
    cachedAt: number | null
    lastError: AppError | null
  }>({ cachedAt: null, lastError: null })
  const [refreshing, setRefreshing] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false)
  const [diagnosticsSaved, setDiagnosticsSaved] = useState(false)

  useEffect(() => {
    globalThis.api
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
    globalThis.api.getManifestStatus().then(setManifestStatus)
    const off = globalThis.api.on('manifest:updated', () => {
      globalThis.api.getManifestStatus().then(setManifestStatus)
    })
    return off
  }, [])

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await globalThis.api.refreshManifest()
    } finally {
      setRefreshing(false)
    }
  }

  const onExportDiagnostics = async (): Promise<void> => {
    setExportingDiagnostics(true)
    setDiagnosticsSaved(false)
    try {
      const result = await globalThis.api.exportDiagnostics()
      setDiagnosticsSaved(result.saved)
    } catch {
      setDiagnosticsSaved(false)
    } finally {
      setExportingDiagnostics(false)
    }
  }

  return (
    <div className="px-10 py-8">
      <header className="app-drag pb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      <Section title="Appearance">
        <Row
          label="Theme"
          sub="System follows your operating system."
          control={
            <SegmentedControl
              options={THEMES}
              value={settings.theme}
              onChange={(v) => void updateSettings({ theme: v })}
            />
          }
        />
      </Section>

      <Section title="Playback">
        <Row
          label="Default playback speed"
          sub="Used the next time you start a recitation."
          control={
            <SegmentedControl
              options={SPEEDS.map((s) => ({
                value: s,
                label: `${s.toFixed(2).replace(/\.?0+$/, '')}×`
              }))}
              value={settings.defaultPlaybackSpeed}
              onChange={(v) => void updateSettings({ defaultPlaybackSpeed: v })}
            />
          }
        />
        <Row
          label="When the next surah isn’t downloaded"
          sub="Behaviour during sequential play when a surah hasn’t been downloaded yet."
          control={
            <SegmentedControl
              options={AUTO_ADVANCE.map((o) => ({ value: o.value, label: o.label }))}
              value={settings.autoAdvanceMode}
              onChange={(v) => void updateSettings({ autoAdvanceMode: v })}
            />
          }
        />
      </Section>

      <Section title="Storage">
        <Row
          label="Downloads folder"
          sub="Audio files for offline playback."
          control={
            <div className="flex items-center gap-2">
              <code
                className="max-w-[260px] truncate rounded-md bg-bg-elev px-3 py-1.5 font-mono text-xs text-muted"
                title={appInfo?.audioDir}
              >
                {appInfo?.audioDir ?? '—'}
              </code>
              <button
                onClick={() => globalThis.api.revealDownloadsFolder()}
                className="rounded-md border border-border bg-bg-elev px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg"
              >
                Show in Explorer
              </button>
            </div>
          }
        />
        <Row
          label="Refresh library"
          sub={
            manifestStatus.lastError
              ? `Last refresh failed: ${manifestStatus.lastError.userMessage}`
              : `Check for newly added reciters.`
          }
          control={
            <button
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          }
        />
        <Row
          label="Delete all downloads"
          sub="Remove every downloaded, queued, and unfinished surah from this device."
          control={
            <button
              onClick={() => setDeleteAllOpen(true)}
              className="rounded-full bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20"
            >
              Delete all
            </button>
          }
        />
      </Section>

      <Section title="About">
        <Row
          label="Version"
          control={<span className="font-mono text-xs text-muted">{appInfo?.version ?? '—'}</span>}
        />
        <UpdateRow />
        <Row
          label="Library last updated"
          control={
            <span className="text-xs text-muted">
              {manifestStatus.cachedAt ? (
                <>
                  {formatAbsoluteDate(new Date(manifestStatus.cachedAt).toISOString())}
                  <span className="ml-2 text-faint">
                    ({formatRelativeTime(manifestStatus.cachedAt)})
                  </span>
                </>
              ) : (
                '—'
              )}
            </span>
          }
        />
      </Section>

      <Section title="Troubleshooting">
        <Row
          label="Export diagnostics"
          sub={
            diagnosticsSaved
              ? 'Diagnostics saved. Attach the JSON file to your bug report.'
              : 'Save a privacy-safe report containing app state and recent errors.'
          }
          control={
            <button
              onClick={() => void onExportDiagnostics()}
              disabled={exportingDiagnostics}
              className="rounded-md border border-border bg-bg-elev px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60"
            >
              {exportingDiagnostics ? 'Exporting…' : 'Export diagnostics'}
            </button>
          }
        />
      </Section>
      <ConfirmationDialog
        open={deleteAllOpen}
        title="Delete all downloads?"
        description="This removes every downloaded, queued, failed, and unfinished surah from this device. Your settings and playback position are preserved."
        confirmLabel="Delete all downloads"
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => {
          prepareAllDownloadsForDeletion()
          return globalThis.api.deleteAllDownloads()
        }}
      />
    </div>
  )
}

function UpdateRow(): React.JSX.Element {
  const status = useUpdaterStore((s) => s.status)
  const [checking, setChecking] = useState(false)

  const onCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await globalThis.api.checkForUpdates()
    } finally {
      setChecking(false)
    }
  }

  const subtitle = (() => {
    switch (status.status) {
      case 'up-to-date':
        return "You're on the latest version."
      case 'available':
        return `Version ${status.version} found — downloading…`
      case 'downloading':
        return `Downloading update… ${Math.round(status.percent)}%`
      case 'ready':
        return `Version ${status.version} is ready. Restart to install.`
      case 'error':
        return `Couldn't check for updates: ${status.message}`
    }
  })()

  return (
    <Row
      label="Updates"
      sub={subtitle}
      control={
        status.status === 'ready' ? (
          <button
            onClick={() => globalThis.api.installUpdateOnQuit()}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Restart to install
          </button>
        ) : (
          <button
            onClick={() => void onCheck()}
            disabled={checking || status.status === 'downloading'}
            className="rounded-full border border-border bg-bg-elev px-4 py-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        )
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  children
}: Readonly<{
  title: string
  children: React.ReactNode
}>): React.JSX.Element {
  return (
    <section className="mt-6">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
        {title}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-bg-elev">
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  sub,
  control
}: Readonly<{
  label: string
  sub?: string
  control: React.ReactNode
}>): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="font-semibold text-fg">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange
}: Readonly<{
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}>): React.JSX.Element {
  return (
    <div className="flex rounded-full bg-bg p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-fg'
            ].join(' ')}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
