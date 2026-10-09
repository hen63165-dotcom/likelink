import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Base path for the emitted asset URLs.
 * Production serves from the absolute root `/` on the premium custom domain
 * (https://likelink.to); there is no nested repo folder, no "github" text.
 * `VITE_BASE` stays as an override for secondary mirrors (the GitHub Pages
 * copy of the site is still published under `/<repo>/`).
 */
function resolveBase() {
  if (process.env.VITE_BASE) return process.env.VITE_BASE
  return '/'
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
})
