import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import { runPrecheck } from './server/precheck.ts'

const STT = process.env.INTENTCRAFT_STT_URL ?? 'http://127.0.0.1:8797'

const MAX_BODY = 200_000

/**
 * /api is for this app's own page only. Browsers mark cross-site requests (Sec-Fetch-Site), so another
 * website open in the same browser cannot make this machine transcribe audio or run the agent pre-check.
 */
const sameOriginOnly: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith('/api/')) return next()
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin') {
    res.statusCode = 403
    return res.end(JSON.stringify({ error: 'cross-site request refused' }))
  }
  next()
}

// Local helpers served next to the app (dev and preview): POST /api/precheck. Speech goes to the STT service via proxy.
function localServices(): Plugin {
  const precheck: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/precheck' || req.method !== 'POST') return next()
    res.setHeader('content-type', 'application/json; charset=utf-8')
    if (!req.headers['content-type']?.startsWith('application/json')) {
      res.statusCode = 415 // also forces a CORS preflight for any cross-origin caller without Sec-Fetch-Site
      return res.end(JSON.stringify({ error: 'application/json required' }))
    }
    let body = ''
    req.on('data', (c: Buffer) => {
      body += c
      if (body.length > MAX_BODY) {
        res.statusCode = 413
        res.end(JSON.stringify({ error: 'request too large' }))
        req.destroy()
      }
    })
    req.on('end', async () => {
      if (res.writableEnded) return
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
  const install = (m: Connect.Server) => {
    m.use(sameOriginOnly)
    m.use(precheck)
  }
  return {
    name: 'intentcraft-local-services',
    // Added before Vite's own middlewares, so the guard also covers the /api/stt proxy.
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  }
}

const proxy = { '/api/stt': { target: STT, rewrite: (p: string) => p.replace(/^\/api/, '') }, '/api/health/stt': { target: STT, rewrite: () => '/health' } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localServices()],
  server: { proxy },
  preview: { proxy },
})
