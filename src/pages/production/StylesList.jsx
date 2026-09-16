import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { btnPrimary, EmptyState, ProgressBar } from '../../components/ui';
import { can } from '../../lib/constants';

export default function StylesList() {
  const { profile } = useAuth();
  const [styles, setStyles] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'styles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">প্রোডাকশন / স্টাইল সমূহ</h1>
          <p className="mt-1 text-sm text-ink-soft">প্রতিটি অর্ডারের স্টেজ-ভিত্তিক অগ্রগতি দেখুন।</p>
        </div>
        {can(profile?.role, 'style:create') && (
          <Link to="/production/new" className={btnPrimary}>
            <Plus size={16} /> নতুন স্টাইল
          </Link>
        )}
      </div>

      {styles === null ? (
        <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
      ) : styles.length === 0 ? (
        <EmptyState title="এখনো কোনো স্টাইল যোগ করা হয়নি" hint="নতুন স্টাইল যোগ করে শুরু করুন।" />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium">স্টাইল নং</th>
                <th className="px-4 py-3 font-medium">বায়ার</th>
                <th className="px-4 py-3 font-medium">অর্ডার কোয়ান্টিটি</th>
                <th className="px-4 py-3 font-medium">শিপমেন্ট ডেট</th>
                <th className="px-4 py-3 font-medium">প্যাকিং অগ্রগতি</th>
              </tr>
            </thead>
            <tbody>
              {styles.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => (window.location.href = `/production/${s.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                >
                  <td className="px-4 py-3">
                    <Link to={`/production/${s.id}`} className="font-medium text-ink">
                      {s.styleNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{s.buyer}</td>
                  <td className="px-4 py-3 text-ink-soft">{Number(s.orderQty).toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.shipDate || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="w-40">
                      <ProgressBar value={s.stages?.packing || 0} max={s.orderQty} tone="green" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
