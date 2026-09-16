import { createContext, useContext, useEffect, useState } from 'react';

const LangContext = createContext(null);

// Simple inline-translation system: every call site passes both the Bangla
// and English text, e.g. t('ড্যাশবোর্ড', 'Dashboard'). The active language is
// stored in localStorage (per-browser) and defaults to the factory's
// configured default language (see Settings > company defaultLanguage),
// falling back to Bangla.
export function LanguageProvider({ children, defaultLang }) {
  const [lang, setLang] = useState(() => localStorage.getItem('erp_lang') || defaultLang || 'bn');

  useEffect(() => {
    const stored = localStorage.getItem('erp_lang');
    if (!stored && defaultLang) setLang(defaultLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLang]);

  useEffect(() => {
    localStorage.setItem('erp_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  function t(bn, en) {
    return lang === 'en' ? en ?? bn : bn;
  }

  function toggle() {
    setLang((l) => (l === 'bn' ? 'en' : 'bn'));
  }

  return <LangContext.Provider value={{ lang, setLang, toggle, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
