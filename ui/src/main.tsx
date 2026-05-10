import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

// Auto-detect basename when served under /projects/nova-agent on the portfolio
const path = window.location.pathname;
const PREFIX = '/projects/nova-agent';
const basename = path.startsWith(PREFIX) ? PREFIX : '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
