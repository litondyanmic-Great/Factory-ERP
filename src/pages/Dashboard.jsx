import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { StatCard, ProgressBar, Pill, EmptyState } from '../components/ui';
import { STAGE_KEYS, STAGES, can } from '../lib/constants';

export default function Dashboard() {
  const { profile } = useAuth();
  const [styles, setStyles] = useState(null);
  const [items, setItems] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'styles')), (snap) =>
      setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!can(profile?.role, 'inventory:view')) return;
    const unsub = onSnapshot(query(collection(db, 'inventoryItems')), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [profile]);

  const loading = styles === null;
  const activeStyles = (styles || []).filter((s) => (s.stages?.packing || 0) < s.orderQty);
  const totalOrderQty = (styles || []).reduce((sum, s) => sum + Number(s.orderQty || 0), 0);
  const totalPacked = (styles || []).reduce((sum, s) => sum + Number(s.stages?.packing || 0), 0);
  const lowStock = (items || []).filter((i) => Number(i.currentStock) <= Number(i.reorderLevel));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">ড্যাশবোর্ড</h1>
        <p className="mt-1 text-sm text-ink-soft">ফ্যাক্টরির সার্বিক অবস্থা এক নজরে।</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="চলমান স্টাইল" value={loading ? '—' : activeStyles.length} />
        <StatCard
          label="মোট অর্ডার কোয়ান্টিটি"
          value={loading ? '—' : totalOrderQty.toLocaleString('en-US')}
        />
        <StatCard
          label="মোট প্যাকড"
          value={loading ? '—' : totalPacked.toLocaleString('en-US')}
          tone="green"
        />
        {can(profile?.role, 'inventory:view') && (
          <StatCard
            label="লো-স্টক আইটেম"
            value={items === null ? '—' : lowStock.length}
            tone={lowStock.length > 0 ? 'red' : 'ink'}
          />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">চলমান স্টাইল সমূহ</h2>
            <Link to="/production" className="text-xs font-medium text-indigo">
              সব দেখুন
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
          ) : activeStyles.length === 0 ? (
            <EmptyState title="কোনো চলমান স্টাইল নেই" hint="নতুন স্টাইল যোগ করে শুরু করুন।" />
          ) : (
            <div className="space-y-4">
              {activeStyles.slice(0, 5).map((s) => (
                <Link to={`/production/${s.id}`} key={s.id} className="block">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{s.styleNo}</span>
                    <span className="text-ink-soft">{s.buyer}</span>
                  </div>
                  <ProgressBar value={s.stages?.packing || 0} max={s.orderQty} tone="green" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {can(profile?.role, 'inventory:view') && (
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">লো-স্টক এলার্ট</h2>
              <Link to="/inventory" className="text-xs font-medium text-indigo">
                সব দেখুন
              </Link>
            </div>
            {items === null ? (
              <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
            ) : lowStock.length === 0 ? (
              <EmptyState title="সব আইটেমের স্টক পর্যাপ্ত" />
            ) : (
              <div className="space-y-3">
                {lowStock.slice(0, 6).map((i) => (
                  <Link
                    to={`/inventory/${i.id}`}
                    key={i.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">{i.name}</span>
                    <Pill tone="red">
                      {i.currentStock} {i.unit} বাকি
                    </Pill>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
