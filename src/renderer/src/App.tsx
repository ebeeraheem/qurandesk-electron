import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import PlayerBar from './components/PlayerBar'
import AudioEngine from './components/AudioEngine'
import Reciters from './routes/Reciters'
import ReciterDetail from './routes/ReciterDetail'
import Downloads from './routes/Downloads'
import Settings from './routes/Settings'
import Welcome from './routes/Welcome'
import NowPlaying from './routes/NowPlaying'
import UpdateBanner from './components/UpdateBanner'

type Gate = { kind: 'checking' } | { kind: 'welcome' } | { kind: 'app' }

export default function App(): React.JSX.Element {
  const [gate, setGate] = useState<Gate>({ kind: 'checking' })

  useEffect(() => {
    globalThis.api
      .getManifestStatus()
      .then((s: { cachedAt: null }) => setGate({ kind: s.cachedAt === null ? 'welcome' : 'app' }))
      .catch(() => setGate({ kind: 'welcome' }))
  }, [])

  if (gate.kind === 'checking') {
    return <div className="h-full w-full bg-bg" />
  }

  if (gate.kind === 'welcome') {
    return <Welcome onContinue={() => setGate({ kind: 'app' })} />
  }

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/reciters" replace />} />
            <Route path="/reciters" element={<Reciters />} />
            <Route path="/reciter/:id" element={<ReciterDetail />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/now-playing" element={<NowPlaying />} />
            <Route path="*" element={<Navigate to="/reciters" replace />} />
          </Routes>
        </main>
      </div>
      <BottomBar />
      <AudioEngine />
    </div>
  )
}

/** PlayerBar is suppressed while the Now Playing route is active. */
function BottomBar(): React.JSX.Element | null {
  const { pathname } = useLocation()
  if (pathname === '/now-playing') return null
  return <PlayerBar />
}
