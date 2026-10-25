import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './council.css'
import './today.css'
import './checkin.css'
import './layout.css'
import './orgchart.css'
import './chat.css'
import './product.css'
import './runner.css'
import './flow.css'
import './agents.css'
import './landing.css'
import './punch.css'
import './team.css'
import './game.css'
import './dash.css'
import './chat2.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

