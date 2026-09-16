import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState, Pill } from '../../components/ui';
import { can, ITEM_TYPES } from '../../lib/constants';

export default function ItemDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const [item, setItem] = useState(undefined);
  const [txns, setTxns] = useState(null);
  const [txType, setTxType] = useState('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'inventoryItems', id), (snap) =>
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems', id, 'transactions'), orderBy('date', 'desc'), limit(30));
    const unsub = onSnapshot(q, (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  async function handleAddTxn(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError('সঠিক কোয়ান্টিটি দিন।');
      return;
    }
    if (txType === 'out' && item && n > Number(item.currentStock)) {
      setError('বর্তমান স্টকের চেয়ে বেশি ইস্যু করা যাবে না।');
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'inventoryItems', id, 'transactions'), {
        type: txType,
        quantity: n,
        note: note || '',
        date: new Date().toISOString().slice(0, 10),
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'inventoryItems', id), {
        currentStock: increment(txType === 'in' ? n : -n),
      });
      setQty('');
      setNote('');
    } catch (err) {
      setError('এন্ট্রি যোগ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  }

  if (item === undefined) return <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>;
  if (item === null) return <EmptyState title="আইটেম পাওয়া যায়নি" />;

  const low = Number(item.currentStock) <= Number(item.reorderLevel);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> সব আইটেম
      </Link>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">{item.name}</h1>
            <p className="text-sm text-ink-soft">
              {ITEM_TYPES.find((t) => t.key === item.type)?.label}
              {item.spec ? ` · ${item.spec}` : ''}
              {item.supplier ? ` · ${item.supplier}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold text-ink">
              {item.currentStock} <span className="text-sm font-normal text-ink-soft">{item.unit}</span>
            </p>
            <Pill tone={low ? 'red' : 'green'}>{low ? 'রি-অর্ডার করুন' : 'পর্যাপ্ত স্টক'}</Pill>
          </div>
        </div>
      </div>

      {can(profile?.role, 'inventory:manage') && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">স্টক ইন / আউট</h2>
          <form onSubmit={handleAddTxn} className="grid gap-4 sm:grid-cols-4">
            <Field label="ধরন">
              <select value={txType} onChange={(e) => setTxType(e.target.value)} className={inputClass}>
                <option value="in">স্টক ইন (রিসিভ)</option>
                <option value="out">স্টক আউট (ইস্যু)</option>
              </select>
            </Field>
            <Field label="কোয়ান্টিটি">
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="রেফারেন্স / নোট">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: স্টাইল নং বা PO"
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? 'যোগ হচ্ছে…' : 'এন্ট্রি যোগ করুন'}
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">লেনদেনের ইতিহাস</h2>
        {txns === null ? (
          <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
        ) : txns.length === 0 ? (
          <EmptyState title="এখনো কোনো লেনদেন নেই" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">তারিখ</th>
                  <th className="py-2 pr-4 font-medium">ধরন</th>
                  <th className="py-2 pr-4 font-medium">কোয়ান্টিটি</th>
                  <th className="py-2 pr-4 font-medium">নোট</th>
                  <th className="py-2 pr-4 font-medium">এন্ট্রি করেছেন</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{t.date}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={t.type === 'in' ? 'green' : 'amber'}>{t.type === 'in' ? 'ইন' : 'আউট'}</Pill>
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{t.quantity}</td>
                    <td className="py-2 pr-4 text-ink-soft">{t.note || '—'}</td>
                    <td className="py-2 pr-4 text-ink-soft">{t.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
