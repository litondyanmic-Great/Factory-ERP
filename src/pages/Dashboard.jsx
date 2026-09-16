import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, onSnapshot, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { StatCard, ProgressBar, EmptyState, Field, inputClass } from '../components/ui';
import { can, FINAL_STAGE_KEY } from '../lib/constants';
import { useLang } from '../lib/i18n';

export default function Dashboard() {
  const { profile } = useAuth();
  const { t } = useLang();
  const [styles, setStyles] = useState(null);
  const [entries, setEntries] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('all');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'styles')), (snap) =>
      setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  // Collection-group query across every style's productionEntries, used to
  // compute "packed in range" for the selected date range.
  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'productionEntries')), (snap) =>
      setEntries(snap.docs.map((d) => d.data()))
    );
    return unsub;
  }, []);

  const loading = styles === null;
  const buyers = useMemo(() => {
    const set = new Set((styles || []).map((s) => s.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [styles]);

  const activeStyles = (styles || []).filter((s) => (s.stages?.[FINAL_STAGE_KEY] || 0) < s.orderQty);
  const filteredActiveStyles = activeStyles.filter((s) => buyerFilter === 'all' || s.buyer === buyerFilter);

  const totalOrderQty = (styles || []).reduce((sum, s) => sum + Number(s.orderQty || 0), 0);
  const totalPacked = (styles || []).reduce((sum, s) => sum + Number(s.stages?.[FINAL_STAGE_KEY] || 0), 0);

  const packedInRange = (entries || [])
    .filter((e) => e.stage === FINAL_STAGE_KEY)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((sum, e) => sum + Number(e.quantity || 0), 0);

  const rangeActive = Boolean(from || to);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ড্যাশবোর্ড', 'Dashboard')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('ফ্যাক্টরির সার্বিক অবস্থা এক নজরে।', "Your factory's overall status at a glance.")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <Field label={t('থেকে', 'From')}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('পর্যন্ত', 'To')}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </Field>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="pb-2 text-xs font-medium text-indigo hover:underline"
          >
            {t('রিসেট', 'Reset')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t('চলমান স্টাইল', 'Running Styles')} value={loading ? '—' : activeStyles.length} />
        <StatCard label={t('মোট অর্ডার কোয়ান্টিটি', 'Total Order Quantity')} value={loading ? '—' : totalOrderQty.toLocaleString('en-US')} />
        <StatCard label={t('মোট প্যাকড (সর্বমোট)', 'Total Packed (all time)')} value={loading ? '—' : totalPacked.toLocaleString('en-US')} tone="green" />
        <StatCard
          label={rangeActive ? t('প্যাকড (নির্বাচিত রেঞ্জ)', 'Packed (selected range)') : t('প্যাকড (আজ পর্যন্ত সব)', 'Packed (all dates)')}
          value={entries === null ? '—' : packedInRange.toLocaleString('en-US')}
          tone="amber"
        />
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">{t('চলমান স্টাইল সমূহ', 'Running Styles')}</h2>
          <div className="flex items-center gap-2">
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className={`${inputClass} !w-auto text-xs`}>
              <option value="all">{t('সব বায়ার', 'All Buyers')}</option>
              {buyers.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <Link to="/production" className="text-xs font-medium text-indigo">
              {t('সব দেখুন', 'View All')}
            </Link>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : filteredActiveStyles.length === 0 ? (
          <EmptyState title={t('কোনো চলমান স্টাইল নেই', 'No running styles')} hint={t('নতুন স্টাইল যোগ করে শুরু করুন।', 'Add a new style to get started.')} />
        ) : (
          <div className="space-y-4">
            {filteredActiveStyles.slice(0, 8).map((s) => (
              <Link to={`/production/${s.id}`} key={s.id} className="block">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">
                    {s.styleNo} {s.styleName && <span className="text-ink-soft">— {s.styleName}</span>}
                  </span>
                  <span className="text-ink-soft">{s.buyer}</span>
                </div>
                <ProgressBar value={s.stages?.[FINAL_STAGE_KEY] || 0} max={s.orderQty} tone="green" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
