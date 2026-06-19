import { useEffect, useState } from 'react'
import type { AppInfo, AutoAdvanceMode, PlaybackSpeed, ThemePreference } from '@shared/api'
import { useSettingsStore, updateSettings } from '../stores/settings'
import { formatAbsoluteDate, formatRelativeTime } from '../utils/format'
import ConfirmationDialog from '../components/ConfirmationDialog'
import SegmentedControl from '../components/SegmentedControl'
import { prepareAllDownloadsForDeletion } from '../audioEngine'

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5]

const AUTO_ADVANCE: Array<{ value: AutoAdvanceMode; label: string }> = [
  { value: 'stop', label: 'Stop' },
  { value: 'download-then-play', label: 'Auto-download' }
]

export default function Settings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false)
  const [diagnosticsSaved, setDiagnosticsSaved] = useState(false)

  const loadManifestStatus = async (): Promise<void> => {
    const status = await globalThis.api.getManifestStatus()
    setCachedAt(status.cachedAt)
  }

  useEffect(() => {
    globalThis.api
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadManifestStatus().catch(() => undefined)
    return globalThis.api.on(
      'manifest:updated',
      () => void loadManifestStatus().catch(() => undefined)
    )
  }, [])

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true)
    setRefreshFailed(false)
    try {
      const result = await globalThis.api.refreshManifest()
      setRefreshFailed(!result.ok)
      await loadManifestStatus()
    } catch {
      setRefreshFailed(true)
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
          sub="System follows your device setting."
          stacked
          control={
            <SegmentedControl
              options={THEMES}
              value={settings.theme}
              onChange={(value) => void updateSettings({ theme: value })}
            />
          }
        />
      </Section>

      <Section title="Playback">
        <Row
          label="Default speed"
          sub="Used the next time you start a recitation."
          stacked
          control={
            <SegmentedControl
              options={SPEEDS.map((speed) => ({
                value: speed,
                label: `${speed.toFixed(2).replace(/\.?0+$/, '')}x`
              }))}
              value={settings.defaultPlaybackSpeed}
              onChange={(value) => void updateSettings({ defaultPlaybackSpeed: value })}
            />
          }
        />
        <Row
          label="When the next surah isn't downloaded"
          sub={
            settings.autoAdvanceMode === 'stop'
              ? 'Sequential play pauses at the first missing surah.'
              : 'Fetch the missing surah, then continue.'
          }
          stacked
          control={
            <SegmentedControl
              options={AUTO_ADVANCE}
              value={settings.autoAdvanceMode}
              onChange={(value) => void updateSettings({ autoAdvanceMode: value })}
            />
          }
        />
      </Section>

      <Section title="Library">
        <Row
          label="Catalog"
          sub={
            refreshFailed
              ? 'Could not refresh the catalog. Please try again.'
              : cachedAt
                ? `Last updated ${formatRelativeTime(cachedAt)}.`
                : 'Catalog has never been fetched.'
          }
          control={
            <button
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          }
        />
      </Section>

      <Section title="Storage">
        <Row
          label="Delete all downloads"
          sub="Remove every downloaded, queued, and unfinished surah from this device."
          control={
            <button
              onClick={() => setDeleteAllOpen(true)}
              className="rounded-full bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20"
            >
              Delete
            </button>
          }
        />
      </Section>

      <Section title="Support">
        <Row
          label="Export diagnostics"
          sub={
            diagnosticsSaved
              ? 'Diagnostics saved. Attach the JSON file to your bug report.'
              : 'Save a privacy-safe report to help diagnose problems.'
          }
          control={
            <button
              onClick={() => void onExportDiagnostics()}
              disabled={exportingDiagnostics}
              className="rounded-full border border-border bg-bg px-4 py-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60"
            >
              {exportingDiagnostics ? 'Exporting...' : 'Export'}
            </button>
          }
        />
      </Section>

      <Section title="About">
        <Row
          label="App version"
          control={<span className="font-mono text-xs text-muted">{appInfo?.version ?? '-'}</span>}
        />
        <Row
          label="Library refreshed"
          control={
            <span className="text-xs text-muted">
              {cachedAt ? formatAbsoluteDate(new Date(cachedAt).toISOString()) : '-'}
            </span>
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
  control,
  stacked = false
}: Readonly<{
  label: string
  sub?: string
  control: React.ReactNode
  stacked?: boolean
}>): React.JSX.Element {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col items-start gap-3 px-5 py-4'
          : 'flex items-center justify-between gap-6 px-5 py-4'
      }
    >
      <div className="min-w-0">
        <div className="font-semibold text-fg">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      <div className={stacked ? 'w-full' : 'shrink-0'}>{control}</div>
    </div>
  )
}
