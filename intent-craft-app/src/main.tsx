import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { STRINGS } from './i18n.ts'
import { KEY } from './state/useWorkspace.ts'

/** A render crash shows a way out instead of a blank page; the damaged data is kept as a backup. */
class Guard extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  reset = () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) localStorage.setItem(`${KEY}.damaged-${Date.now()}`, raw)
      localStorage.removeItem(KEY)
    } catch {
      /* storage blocked: reloading still starts clean in memory */
    }
    location.reload()
  }
  render() {
    if (!this.state.error) return this.props.children
    const t = STRINGS[document.documentElement.lang === 'tr' ? 'tr' : 'en']
    return (
      <main className="crash" role="alert">
        <p>{t.crashed}</p>
        <pre className="small muted">{this.state.error.message}</pre>
        <button className="btn primary" onClick={this.reset}>{t.crashedReset}</button>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>
      <App />
    </Guard>
  </StrictMode>,
)
