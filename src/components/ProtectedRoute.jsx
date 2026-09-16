import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can } from '../lib/constants';

export default function ProtectedRoute({ children, permission }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-soft">
        লোড হচ্ছে…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile || profile.status !== 'active') return <Navigate to="/pending" replace />;
  if (permission && !can(profile.role, permission)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-ink-soft">
        <p className="font-display text-lg text-ink">অনুমতি নেই</p>
        <p className="text-sm">এই অংশটি দেখার অনুমতি আপনার অ্যাকাউন্টে নেই।</p>
      </div>
    );
  }
  return children;
}
