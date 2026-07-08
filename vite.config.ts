import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app's release version, read from package.json at build time and exposed as
// the __APP_VERSION__ global (declared in src/vite-env.d.ts). Sourcing it from
// the single package.json field keeps the login-page version in sync with the
// release, with nothing to bump by hand.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// Dev server proxies /v1 to a live OpenBao so local development avoids CORS.
// You MUST set BAO_ADDR to point at your instance; there is deliberately no
// default so `npm run dev` never silently proxies to a production OpenBao
// (audit M5). The server binds to localhost only.
const target = process.env.BAO_ADDR

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: target
      ? {
          '/v1': {
            target,
            changeOrigin: true,
            // Internal step-ca certs aren't in Node's trust store; dev only.
            // Never point this at production over an untrusted network.
            secure: false,
          },
        }
      : undefined,
  },
})
