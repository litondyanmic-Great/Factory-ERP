import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, inputClass, btnPrimary } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।');
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
          <h1 className="font-display text-xl font-semibold text-ink">ওয়ার্মলুম ইআরপি</h1>
          <p className="mt-1 text-sm text-ink-soft">সোয়েটার ফ্যাক্টরি ম্যানেজমেন্ট</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <Field label="ইমেইল">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@factory.com"
            />
          </Field>
          <Field label="পাসওয়ার্ড">
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
            {busy ? 'লগইন হচ্ছে…' : 'লগইন করুন'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-soft">
          নতুন অ্যাকাউন্ট দরকার?{' '}
          <Link to="/signup" className="font-medium text-indigo">
            সাইন আপ করুন
          </Link>
        </p>
      </div>
    </div>
  );
}
