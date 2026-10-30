import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyColorMode, applyTheme, cachedColorMode, cachedTheme } from './lib/theme'
import './styles.css'
import './ios.css'

applyTheme(cachedTheme())
applyColorMode(cachedColorMode())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
