import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

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
  build: {
    rollupOptions: {
      // The site, and the radar's Wix dashboard page (wix/radar.html → /wix/radar, src/wix/):
      // its own small entry, so a Wix store's dashboard never loads the whole site.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        wixRadar: fileURLToPath(new URL('./wix/radar.html', import.meta.url)),
      },
    },
  },
})
