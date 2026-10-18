import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// After an app update the previous build's page bundles are gone, so a tab
// opened before it fails on the first page it had not loaded yet. Reload
// once to pick up the new build; never twice in a row, so a real outage
// cannot loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('pc.reloaded') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('pc.reloaded', String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
