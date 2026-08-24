import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function lookerDevPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'looker-dev',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('LOOKER_') || key === 'ALLOWED_EMAIL_DOMAINS') {
          process.env[key] ??= value
        }
      }
      const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        if (!url.startsWith('/.netlify/functions/looker') && !url.startsWith('/api/looker')) {
          next()
          return
        }
        try {
          const mod = await server.ssrLoadModule('/src/lib/lookerApi.ts')
          const origin = `http://${req.headers.host ?? 'localhost'}`
          const headers = new Headers()
          const auth = req.headers.authorization
          if (auth) headers.set('Authorization', Array.isArray(auth) ? auth[0] : auth)
          const request = new Request(new URL(url, origin).toString(), { method: req.method, headers })
          const response = await mod.handleLookerRequest(request) as Response
          const body = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json')
          res.end(body)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ empty: true, emptyReason: err instanceof Error ? err.message : 'Looker proxy failed' }))
        }
      }
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), lookerDevPlugin(env)],
  }
})
