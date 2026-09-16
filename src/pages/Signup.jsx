import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, inputClass, btnPrimary } from '../components/ui';

export default function Signup() {
  const { signup } = useAuth();
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
          ? 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে।'
          : 'সাইন আপ করা যায়নি, আবার চেষ্টা করুন।'
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
          <h1 className="font-display text-xl font-semibold text-ink">নতুন অ্যাকাউন্ট</h1>
          <p className="mt-1 text-sm text-ink-soft">
            প্রথম অ্যাকাউন্টটি নিজে থেকেই অ্যাডমিন হয়ে যাবে। এরপর প্রতিটি নতুন অ্যাকাউন্ট অ্যাডমিনের
            অনুমোদনের অপেক্ষায় থাকবে।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <Field label="নাম">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="ইমেইল">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="পাসওয়ার্ড">
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
            {busy ? 'তৈরি হচ্ছে…' : 'অ্যাকাউন্ট তৈরি করুন'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-soft">
          অ্যাকাউন্ট আছে?{' '}
          <Link to="/login" className="font-medium text-indigo">
            লগইন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}
