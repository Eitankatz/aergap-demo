import { defineConfig, loadEnv } from 'vite'

// Proxy /api (HTTP + WebSocket) to the hermes dashboard so the browser talks
// same-origin to Vite — sidesteps CORS and the dashboard's loopback host/origin
// checks. Override the target with DASHBOARD_URL (or VITE_DASHBOARD_URL).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.DASHBOARD_URL || env.VITE_DASHBOARD_URL || 'http://127.0.0.1:9119'

  return {
    server: {
      port: Number(env.PORT || 5180),
      proxy: {
        '/api': {
          target,
          changeOrigin: true, // rewrite Host -> target (passes loopback host check)
          ws: true,
          configure: (proxy) => {
            // Rewrite Origin to the target so the dashboard's WS/HTTP origin
            // guard accepts the proxied request.
            proxy.on('proxyReq', (r) => { try { r.setHeader('origin', target) } catch {} })
            proxy.on('proxyReqWs', (r) => { try { r.setHeader('origin', target) } catch {} })
          },
        },
        // Proxy the dashboard's ROOT index (which injects __HERMES_SESSION_TOKEN__
        // in loopback mode) so the UI can auto-scrape the token. '/' itself
        // serves this Vite app, so we expose the dashboard index under /__dash/.
        '/__dash': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/__dash/, '') || '/',
          configure: (proxy) => {
            proxy.on('proxyReq', (r) => { try { r.setHeader('origin', target) } catch {} })
          },
        },
      },
    },
  }
})
