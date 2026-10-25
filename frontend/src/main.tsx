import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './council.css'
import './today.css'
import './checkin.css'
import './layout.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

