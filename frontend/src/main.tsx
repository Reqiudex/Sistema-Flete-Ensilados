import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Fuentes autoalojadas (sin peticiones a Google Fonts que bloqueen el primer pintado)
import '@fontsource-variable/inter'
import '@fontsource-variable/outfit'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
