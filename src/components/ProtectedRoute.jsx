import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can } from '../lib/constants';
import { useLang } from '../lib/i18n';

export default function ProtectedRoute({ children, permission }) {
  const { user, profile, loading } = useAuth();
  const { t } = useLang();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-soft">
        {t('লোড হচ্ছে…', 'Loading…')}
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile || profile.status !== 'active') return <Navigate to="/pending" replace />;
  if (permission === 'admin:only' && profile.role !== 'admin') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-ink-soft">
        <p className="font-display text-lg text-ink">{t('অনুমতি নেই', 'No permission')}</p>
        <p className="text-sm">
          {t('এই অংশটি শুধু অ্যাডমিন দেখতে পারবেন।', 'Only an admin can view this section.')}
        </p>
      </div>
    );
  }
  if (permission && permission !== 'admin:only' && !can(profile.role, permission)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-ink-soft">
        <p className="font-display text-lg text-ink">{t('অনুমতি নেই', 'No permission')}</p>
        <p className="text-sm">
          {t('এই অংশটি দেখার অনুমতি আপনার অ্যাকাউন্টে নেই।', 'Your account does not have access to this section.')}
        </p>
      </div>
    );
  }
  return children;
}
