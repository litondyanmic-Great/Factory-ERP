import { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const SettingsContext = createContext(null);

const DEFAULTS = {
  companyName: 'ফ্যাক্টরি ইআরপি',
  companyNameEn: 'Factory ERP',
  address: '',
  phone: '',
  logoDataUrl: '', // base64 data URL, uploaded manually by admin
  defaultLanguage: 'bn',
  qualityGreenThreshold: 95, // pass % >= this => green
  qualityYellowThreshold: 90, // pass % >= this (and < green) => yellow, below => red
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'company'),
      (snap) => {
        setSettings(snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return unsub;
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
