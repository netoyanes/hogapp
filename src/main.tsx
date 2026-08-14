import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme-v2.css' // v2 tokens — override the legacy :root values
import App from './App.tsx'
import { registerSW } from './lib/sw'
import { initTheme } from './lib/theme'
import { TENANT } from './config/tenant'

// Antes de renderizar: si se aplicara después, la app parpadearía en oscuro
// un frame antes de pasar a claro
initTheme()
registerSW()
document.title = TENANT.appName

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
