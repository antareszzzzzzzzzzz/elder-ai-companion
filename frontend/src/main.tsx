import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MockDataProvider } from './store/MockDataContext'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MockDataProvider>
        <App />
      </MockDataProvider>
    </BrowserRouter>
  </StrictMode>,
)
