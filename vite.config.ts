import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is set for the GitHub Pages project page; '/' is correct for local dev and for a
// root-level (username.github.io) page.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
})
