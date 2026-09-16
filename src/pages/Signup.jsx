import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, inputClass, btnPrimary } from '../components/ui';
import { useLang } from '../lib/i18n';

export default function Signup() {
  const { signup } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const profile = await signup(name, email, password);
      navigate(profile.status === 'active' ? '/' : '/pending');
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? t('এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে।', 'An account already exists with this email.')
          : t('সাইন আপ করা যায়নি, আবার চেষ্টা করুন।', 'Could not sign up, please try again.')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded bg-indigo-deep font-display text-base font-bold text-white">
            ও
          </div>
          <h1 className="font-display text-xl font-semibold text-ink">{t('নতুন অ্যাকাউন্ট', 'New Account')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t(
              'প্রথম অ্যাকাউন্টটি নিজে থেকেই অ্যাডমিন হয়ে যাবে। এরপর প্রতিটি নতুন অ্যাকাউন্ট অ্যাডমিনের অনুমোদনের অপেক্ষায় থাকবে।',
              'The very first account automatically becomes admin. Every account after that waits for admin approval.'
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <Field label={t('নাম', 'Name')}>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('ইমেইল', 'Email')}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t('পাসওয়ার্ড', 'Password')}>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t('তৈরি হচ্ছে…', 'Creating…') : t('অ্যাকাউন্ট তৈরি করুন', 'Create Account')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-soft">
          {t('অ্যাকাউন্ট আছে?', 'Already have an account?')}{' '}
          <Link to="/login" className="font-medium text-indigo">
            {t('লগইন করুন', 'Log in')}
          </Link>
        </p>
      </div>
    </div>
  );
}
