import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // VITE_BASE_PATH is set to '/Images-downloader/' when building for GitHub Pages.
  // On Vercel it is left unset so the app deploys at the root /.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
