import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, inputClass, btnPrimary } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useSettings } from '../lib/settingsContext';

export default function Login() {
  const { login } = useAuth();
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const companyName = lang === 'en' ? settings?.companyNameEn || settings?.companyName : settings?.companyName;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(t('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।', 'Incorrect email or password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {settings?.logoDataUrl ? (
            <img src={settings.logoDataUrl} alt="logo" className="mx-auto mb-3 h-10 w-10 rounded object-contain" />
          ) : (
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded bg-indigo-deep font-display text-base font-bold text-white">
              {companyName?.[0] || 'ও'}
            </div>
          )}
          <h1 className="font-display text-xl font-semibold text-ink">{companyName}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('সোয়েটার ফ্যাক্টরি ম্যানেজমেন্ট', 'Sweater Factory Management')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <Field label={t('ইমেইল', 'Email')}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@factory.com"
            />
          </Field>
          <Field label={t('পাসওয়ার্ড', 'Password')}>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t('লগইন হচ্ছে…', 'Logging in…') : t('লগইন করুন', 'Log In')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-soft">
          {t('নতুন অ্যাকাউন্ট দরকার?', 'Need a new account?')}{' '}
          <Link to="/signup" className="font-medium text-indigo">
            {t('সাইন আপ করুন', 'Sign up')}
          </Link>
        </p>
      </div>
    </div>
  );
}
