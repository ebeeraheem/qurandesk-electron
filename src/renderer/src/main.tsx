import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initTheme } from './stores/theme'
import { initDownloadsBridge } from './stores/downloads'

// Resolve the persisted theme preference before first paint so we don't flash the wrong palette.
initTheme()
// Subscribe to download events from main so any open page sees live updates.
initDownloadsBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
