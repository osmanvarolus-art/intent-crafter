import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import { runPrecheck } from './server/precheck.ts'

const STT = process.env.INTENTCRAFT_STT_URL ?? 'http://127.0.0.1:8797'

// Local helpers served next to the app (dev and preview): POST /api/precheck. Speech goes to the STT service via proxy.
function localServices(): Plugin {
  const precheck: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/precheck' || req.method !== 'POST') return next()
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      try {
        const { draft, lang } = JSON.parse(body) as { draft?: unknown; lang?: unknown }
        if (typeof draft !== 'string' || !draft.trim() || draft.length > 50_000) throw new Error('draft text required')
        res.end(JSON.stringify(await runPrecheck(draft, lang === 'en' ? 'en' : 'tr')))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
      }
    })
  }
  return {
    name: 'intentcraft-local-services',
    configureServer: (server) => void server.middlewares.use(precheck),
    configurePreviewServer: (server) => void server.middlewares.use(precheck),
  }
}

const proxy = { '/api/stt': { target: STT, rewrite: (p: string) => p.replace(/^\/api/, '') }, '/api/health/stt': { target: STT, rewrite: () => '/health' } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localServices()],
  server: { proxy },
  preview: { proxy },
})
