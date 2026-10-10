import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Base path for the emitted asset URLs.
 * Production serves from the absolute root `/` (likelink2.vercel.app → Netlify).
 * `VITE_BASE` is the override for the GitHub Pages mirror, published under
 * `/<repo>/` by .github/workflows/deploy-frontend.yml.
 */
function resolveBase() {
  if (process.env.VITE_BASE) return process.env.VITE_BASE
  return '/'
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
})
