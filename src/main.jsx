import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Ultra-Luxury Minimalist Theme (2026) — imported into the bundle so the
// redesign ships with every production build. Keep in sync with the
// /public/luxury.css copy that index.html & login.html also load via <link>.
import './luxury.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
