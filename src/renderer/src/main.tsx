import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initTheme } from './stores/theme'
import { initDownloadsBridge } from './stores/downloads'
import { initSettings } from './stores/settings'
import { initPendingTrackBridge, restoreLastPlayback } from './audioEngine'
import { initUpdaterBridge } from './stores/updater'
import { initToastsBridge } from './stores/toasts'

// Resolve persisted theme before first paint so we don't flash the wrong palette.
initTheme()
initDownloadsBridge()
initUpdaterBridge()
initToastsBridge()

// Settings → restore-last-playback. The order matters: the player consults
// `settings.defaultPlaybackSpeed` while restoring.
void initSettings().then(() => {
  initPendingTrackBridge()
  void restoreLastPlayback()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
