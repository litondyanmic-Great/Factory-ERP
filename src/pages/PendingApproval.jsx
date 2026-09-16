import { useAuth } from '../context/AuthContext';
import { btnSecondary } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n';

export default function PendingApproval() {
  const { profile, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-sm rounded-lg border border-line bg-surface p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">{t('অনুমোদনের অপেক্ষায়', 'Awaiting Approval')}</p>
        <p className="mt-2 text-sm text-ink-soft">
          {profile?.name ? `${profile.name}, ` : ''}
          {t(
            'আপনার অ্যাকাউন্টটি তৈরি হয়েছে কিন্তু এখনো অ্যাডমিনের অনুমোদন পায়নি। অনুমোদনের পর আপনি নির্দিষ্ট ডিপার্টমেন্টের অ্যাক্সেস পাবেন।',
            'Your account has been created but is not yet approved by an admin. Once approved, you will get access to your specific department.'
          )}
        </p>
        <button onClick={handleLogout} className={`${btnSecondary} mt-6`}>
          {t('লগ আউট', 'Log out')}
        </button>
      </div>
    </div>
  );
}
