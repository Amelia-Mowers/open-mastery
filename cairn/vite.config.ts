import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `--mode demo` builds the backend-in-the-browser demo (demo.html entry,
// relative base for GitHub Pages, dist-demo/). The normal build never
// references the demo entry, so answer keys never reach real deployments.
export default defineConfig(({ mode }) => ({
  worker: { format: 'es' },
  plugins: [react()],
  base: mode === 'demo' ? './' : '/',
  server: {
    port: 5173,
    // vite dev serves the client with HMR; the site server owns /api
    proxy: { '/api': 'http://localhost:4777' },
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    // the 2015-Android floor (§6); real device verification is a CI lane
    target: 'es2017',
    rollupOptions: mode === 'demo' ? { input: 'demo.html' } : undefined,
  },
}))
