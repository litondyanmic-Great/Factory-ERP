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
import { Field, inputClass, btnPrimary, EmptyState } from '../../components/ui';
import { STAGES, can } from '../../lib/constants';

export default function StyleDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const [style, setStyle] = useState(undefined);
  const [entries, setEntries] = useState(null);
  const [stage, setStage] = useState(STAGES[0].key);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'styles', id), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'styles', id, 'productionEntries'), orderBy('date', 'desc'), limit(30));
    const unsub = onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  async function handleAddEntry(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError('সঠিক কোয়ান্টিটি দিন।');
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'styles', id, 'productionEntries'), {
        stage,
        quantity: n,
        note: note || '',
        date: new Date().toISOString().slice(0, 10),
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'styles', id), { [`stages.${stage}`]: increment(n) });
      setQty('');
      setNote('');
    } catch (err) {
      setError('এন্ট্রি যোগ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  }

  if (style === undefined) return <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>;
  if (style === null) return <EmptyState title="স্টাইল পাওয়া যায়নি" />;

  const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || key;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/production" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> সব স্টাইল
      </Link>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">{style.styleNo}</h1>
            <p className="text-sm text-ink-soft">{style.buyer}</p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p>অর্ডার: {Number(style.orderQty).toLocaleString('en-US')} পিস</p>
            {style.shipDate && <p>শিপমেন্ট: {style.shipDate}</p>}
          </div>
        </div>
        {style.notes && <p className="mt-3 text-sm text-ink-soft">{style.notes}</p>}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">স্টেজ-ভিত্তিক অগ্রগতি</h2>
        <div className="space-y-4">
          {STAGES.map((s) => {
            const done = style.stages?.[s.key] || 0;
            const pct = style.orderQty > 0 ? Math.min(100, Math.round((done / style.orderQty) * 100)) : 0;
            return (
              <div key={s.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{s.label}</span>
                  <span className="text-ink-soft">
                    {done.toLocaleString('en-US')} / {Number(style.orderQty).toLocaleString('en-US')}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-indigo" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {can(profile?.role, 'production:entry') && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">আজকের প্রোডাকশন এন্ট্রি</h2>
          <form onSubmit={handleAddEntry} className="grid gap-4 sm:grid-cols-4">
            <Field label="স্টেজ">
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
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
            <Field label="নোট (ঐচ্ছিক)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
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
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">সাম্প্রতিক এন্ট্রি</h2>
        {entries === null ? (
          <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
        ) : entries.length === 0 ? (
          <EmptyState title="এখনো কোনো এন্ট্রি নেই" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">তারিখ</th>
                  <th className="py-2 pr-4 font-medium">স্টেজ</th>
                  <th className="py-2 pr-4 font-medium">কোয়ান্টিটি</th>
                  <th className="py-2 pr-4 font-medium">এন্ট্রি করেছেন</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                    <td className="py-2 pr-4 text-ink">{stageLabel(e.stage)}</td>
                    <td className="py-2 pr-4 text-ink-soft">{e.quantity}</td>
                    <td className="py-2 pr-4 text-ink-soft">{e.enteredBy}</td>
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
