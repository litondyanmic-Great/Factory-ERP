import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SettingsProvider, useSettings } from './lib/settingsContext'
import { LanguageProvider } from './lib/i18n'

function LangFromSettings({ children }) {
  const { settings } = useSettings();
  return <LanguageProvider defaultLang={settings?.defaultLanguage}>{children}</LanguageProvider>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <LangFromSettings>
        <App />
      </LangFromSettings>
    </SettingsProvider>
  </StrictMode>,
)
