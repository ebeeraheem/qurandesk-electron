import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import PlayerBar from './components/PlayerBar'
import Reciters from './routes/Reciters'
import Downloads from './routes/Downloads'
import Settings from './routes/Settings'

function App(): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/reciters" replace />} />
            <Route path="/reciters" element={<Reciters />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/reciters" replace />} />
          </Routes>
        </main>
      </div>
      <PlayerBar />
    </div>
  )
}

export default App
