import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

/**
 * Base path for the emitted asset URLs.
 * GitHub Pages serves this repo as a project page (`/<repo>/`), so the deploy
 * workflow passes `VITE_BASE` explicitly; the `homepage` field in package.json
 * is the fallback for local builds and for a custom/user domain served at `/`.
 */
function resolveBase() {
  if (process.env.VITE_BASE) return process.env.VITE_BASE
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    if (pkg.homepage) return new URL(pkg.homepage).pathname || '/'
  } catch { /* keep default */ }
  return '/'
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
})
