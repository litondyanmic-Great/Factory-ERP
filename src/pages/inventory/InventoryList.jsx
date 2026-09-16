import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { btnPrimary, EmptyState, Pill } from '../../components/ui';
import { can, ITEM_TYPES } from '../../lib/constants';

export default function InventoryList() {
  const { profile } = useAuth();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const visible = (items || []).filter((i) => filter === 'all' || i.type === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">ইনভেন্টরি</h1>
          <p className="mt-1 text-sm text-ink-soft">ইয়ার্ন ও এক্সেসরিজের স্টক পরিস্থিতি।</p>
        </div>
        {can(profile?.role, 'inventory:manage') && (
          <Link to="/inventory/new" className={btnPrimary}>
            <Plus size={16} /> নতুন আইটেম
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        {[{ key: 'all', label: 'সব' }, ...ITEM_TYPES].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === t.key ? 'bg-indigo text-white' : 'bg-surface text-ink-soft border border-line'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
      ) : visible.length === 0 ? (
        <EmptyState title="কোনো আইটেম নেই" hint="নতুন আইটেম যোগ করে শুরু করুন।" />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium">নাম</th>
                <th className="px-4 py-3 font-medium">ধরন</th>
                <th className="px-4 py-3 font-medium">সাপ্লায়ার</th>
                <th className="px-4 py-3 font-medium">বর্তমান স্টক</th>
                <th className="px-4 py-3 font-medium">অবস্থা</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const low = Number(i.currentStock) <= Number(i.reorderLevel);
                return (
                  <tr
                    key={i.id}
                    onClick={() => (window.location.href = `/inventory/${i.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                  >
                    <td className="px-4 py-3">
                      <Link to={`/inventory/${i.id}`} className="font-medium text-ink">
                        {i.name}
                      </Link>
                      {i.spec && <p className="text-xs text-ink-soft">{i.spec}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {ITEM_TYPES.find((t) => t.key === i.type)?.label}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{i.supplier || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {i.currentStock} {i.unit}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={low ? 'red' : 'green'}>{low ? 'রি-অর্ডার করুন' : 'পর্যাপ্ত'}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
