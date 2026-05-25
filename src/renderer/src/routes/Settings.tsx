import { useThemeStore } from '../stores/theme'
import type { ThemePreference } from '@shared/api'

export default function Settings(): React.JSX.Element {
  const { preference, setPreference } = useThemeStore()
  const options: ThemePreference[] = ['system', 'light', 'dark']

  return (
    <div className="px-10 py-8">
      <div className="app-drag pb-4">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <section className="mt-6">
        <div className="mb-2 text-[10px] font-semibold tracking-widest text-faint">APPEARANCE</div>
        <div className="rounded-xl border border-border bg-bg-elev px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">Theme</div>
              <div className="text-sm text-muted">
                System follows your OS preference. Defaults to your operating system on first launch.
              </div>
            </div>
            <div className="flex rounded-full bg-bg p-1">
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setPreference(opt)}
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                    preference === opt
                      ? 'bg-primary text-white'
                      : 'text-muted hover:text-fg'
                  ].join(' ')}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 text-[10px] font-semibold tracking-widest text-faint">PLAYBACK</div>
        <div className="rounded-xl border border-border bg-bg-elev px-5 py-4 text-sm text-muted">
          Playback settings (default reciter, default speed, auto-advance behaviour) land here in
          the settings phase.
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 text-[10px] font-semibold tracking-widest text-faint">STORAGE</div>
        <div className="rounded-xl border border-border bg-bg-elev px-5 py-4 text-sm text-muted">
          Downloads folder and library refresh land here once the manifest + downloader phases are
          complete.
        </div>
      </section>
    </div>
  )
}
