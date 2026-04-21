import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { logFrontend } from './api'

// Forward uncaught errors to the Go logger so they show up in
// ~/.goprofiler/app.log even when running inside the Wails WebView where
// devtools aren't accessible.
window.addEventListener("error", (e) => {
  logFrontend("error", `uncaught: ${e.message} @ ${e.filename}:${e.lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack}` : String(e.reason);
  logFrontend("error", `unhandled promise rejection: ${reason}`);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
