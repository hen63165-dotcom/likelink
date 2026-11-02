import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import heeboMediumFont from './assets/fonts/Heebo-Medium.ttf?url'
import heeboExtraBoldFont from './assets/fonts/Heebo-ExtraBold.ttf?url'
// Ultra-Luxury Minimalist Theme (2026) — imported into the bundle so the
// redesign ships with every production build. Keep in sync with the
// /public/luxury.css copy that index.html & login.html also load via <link>.
import './luxury.css'
// LikeLink2 Studio — dark premium command-center surface (2026 redesign).
import './studio.css'
import './studio-home.css'
// LikeLink2 public site — editorial commerce design system (scoped to .lx).
import './public.css'
// Auto-Heal runtime — catches errors, repairs corrupt storage, and keeps
// the app booting cleanly on every visit (self-updating, self-repairing).
import { installGlobalErrorHealing } from './lib/autoHeal.js'
// PWA layer — Service Worker (offline-first), install prompt,
// share-target capture and push subscription plumbing.
import './lib/pwa.js'
// Referral tracking — reads ?ref=<slug> from the URL on load and stores it
// in sessionStorage so the marketeer signup flow can attach it.
import { initReferral } from './lib/referral.js'

for (const href of [heeboMediumFont, heeboExtraBoldFont]) {
  const preload = document.createElement('link')
  preload.rel = 'preload'
  preload.as = 'font'
  preload.type = 'font/ttf'
  preload.crossOrigin = 'anonymous'
  preload.href = href
  document.head.append(preload)
}

installGlobalErrorHealing();
initReferral();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
