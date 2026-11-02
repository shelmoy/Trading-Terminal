import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './mobile.css'
import { installMobileTerminal } from '@/lib/mobileTerminal'
const disposeMobileTerminal = installMobileTerminal()
if (import.meta.hot) import.meta.hot.dispose(disposeMobileTerminal)
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { installGlobalErrorReporter } from '@/utils/errorReporter'
import App from './App.tsx'

installGlobalErrorReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
