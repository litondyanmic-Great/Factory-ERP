import { useAuth } from '../context/AuthContext';
import { btnSecondary } from '../components/ui';
import { useNavigate } from 'react-router-dom';

export default function PendingApproval() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-sm rounded-lg border border-line bg-surface p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">অনুমোদনের অপেক্ষায়</p>
        <p className="mt-2 text-sm text-ink-soft">
          {profile?.name ? `${profile.name}, ` : ''}আপনার অ্যাকাউন্টটি তৈরি হয়েছে কিন্তু এখনো
          অ্যাডমিনের অনুমোদন পায়নি। অনুমোদনের পর আপনি নির্দিষ্ট ডিপার্টমেন্টের অ্যাক্সেস পাবেন।
        </p>
        <button onClick={handleLogout} className={`${btnSecondary} mt-6`}>
          লগ আউট
        </button>
      </div>
    </div>
  );
}
