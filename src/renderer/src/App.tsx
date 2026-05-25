import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import PlayerBar from './components/PlayerBar'
import AudioEngine from './components/AudioEngine'
import Reciters from './routes/Reciters'
import ReciterDetail from './routes/ReciterDetail'
import Downloads from './routes/Downloads'
import Settings from './routes/Settings'
import Welcome from './routes/Welcome'

type Gate =
  | { kind: 'checking' }
  | { kind: 'welcome' } // first launch, no cached manifest yet
  | { kind: 'app' } // returning user OR welcome dismissed

/**
 * Decides whether to show the Welcome splash or the main app shell. The
 * decision is made once on mount based on whether main has a cached manifest.
 */
export default function App(): React.JSX.Element {
  const [gate, setGate] = useState<Gate>({ kind: 'checking' })

  useEffect(() => {
    window.api
      .getManifestStatus()
      .then((s) => setGate({ kind: s.cachedAt !== null ? 'app' : 'welcome' }))
      .catch(() => setGate({ kind: 'welcome' }))
  }, [])

  if (gate.kind === 'checking') {
    // Briefly blank — we don't want to flash Welcome on returning launches.
    return <div className="h-full w-full bg-bg" />
  }

  if (gate.kind === 'welcome') {
    return <Welcome onContinue={() => setGate({ kind: 'app' })} />
  }

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/reciters" replace />} />
            <Route path="/reciters" element={<Reciters />} />
            <Route path="/reciter/:id" element={<ReciterDetail />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/reciters" replace />} />
          </Routes>
        </main>
      </div>
      <PlayerBar />
      <AudioEngine />
    </div>
  )
}
