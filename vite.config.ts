import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // vite dev serves the client with HMR; the site server owns /api
    proxy: { '/api': 'http://localhost:4777' },
  },
  build: {
    outDir: 'dist',
    // the 2015-Android floor (§6); real device verification is a CI lane
    target: 'es2017',
  },
})
