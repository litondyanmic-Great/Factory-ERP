import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, onSnapshot, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { StatCard, ProgressBar, EmptyState, Field, inputClass, TrafficLight } from '../components/ui';
import ExportBar from '../components/ExportBar';
import { can, FINAL_STAGE_KEY, STAGES, qualityTone } from '../lib/constants';
import { useLang } from '../lib/i18n';
import { useSettings } from '../lib/settingsContext';

export default function Dashboard() {
  const { profile } = useAuth();
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const [styles, setStyles] = useState(null);
  const [entries, setEntries] = useState(null);
  const [checks, setChecks] = useState(null);
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

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'qualityChecks')), (snap) =>
      setChecks(snap.docs.map((d) => d.data()))
    );
    return unsub;
  }, []);

  const loading = styles === null;
  const buyers = useMemo(() => {
    const set = new Set((styles || []).map((s) => s.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [styles]);

  const activeStyles = (styles || []).filter((s) => (s.stages?.[FINAL_STAGE_KEY] || 0) < s.orderQty);
  // Styles created with the PO/colour-wise system start life as
  // `productionStarted: false` — they stay off the Running Styles list
  // until the first production entry is logged against them (see
  // StyleDetail's handleAddEntry), and show up instead under "Active
  // Order" below. Styles from before this feature have no
  // `productionStarted` field at all, so `!== false` keeps them exactly
  // where they always were, in Running Styles.
  const runningStyles = activeStyles.filter((s) => s.productionStarted !== false);
  const newOrderStyles = (styles || []).filter((s) => s.productionStarted === false);
  const filteredActiveStyles = runningStyles.filter((s) => buyerFilter === 'all' || s.buyer === buyerFilter);
  const filteredNewOrderStyles = newOrderStyles.filter((s) => buyerFilter === 'all' || s.buyer === buyerFilter);

  const totalOrderQty = (styles || []).reduce((sum, s) => sum + Number(s.orderQty || 0), 0);
  const totalPacked = (styles || []).reduce((sum, s) => sum + Number(s.stages?.[FINAL_STAGE_KEY] || 0), 0);

  const packedInRange = (entries || [])
    .filter((e) => e.stage === FINAL_STAGE_KEY)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((sum, e) => sum + Number(e.quantity || 0), 0);

  const rangeActive = Boolean(from || to);
  const inRange = (dateStr) => (!from || dateStr >= from) && (!to || dateStr <= to);

  // Section working flow: production quantity done per section in the
  // selected range, plus that section's quality pass rate in the same
  // range (traffic light).
  const sectionFlow = useMemo(() => {
    const prodMap = new Map();
    (entries || []).filter((e) => inRange(e.date)).forEach((e) => {
      prodMap.set(e.stage, (prodMap.get(e.stage) || 0) + Number(e.quantity || 0));
    });
    const qualMap = new Map();
    (checks || []).filter((c) => inRange(c.date)).forEach((c) => {
      if (!qualMap.has(c.section)) qualMap.set(c.section, { checked: 0, defect: 0 });
      const rec = qualMap.get(c.section);
      rec.checked += Number(c.checkedQty || 0);
      rec.defect += Number(c.defectQty || 0);
    });
    return STAGES.map((s) => {
      const q = qualMap.get(s.key);
      const passRate = q && q.checked > 0 ? Math.round(((q.checked - q.defect) / q.checked) * 1000) / 10 : null;
      return {
        key: s.key,
        label: lang === 'en' ? s.labelEn : s.label,
        produced: prodMap.get(s.key) || 0,
        passRate,
      };
    });
  }, [entries, checks, from, to, lang]);

  // Top 5 defects across all quality checks in the selected range.
  const topDefects = useMemo(() => {
    const totals = new Map();
    (checks || []).filter((c) => inRange(c.date)).forEach((c) => {
      Object.entries(c.defects || {}).forEach(([k, v]) => {
        const label = (c.defectLabels && c.defectLabels[k]) || k;
        totals.set(label, (totals.get(label) || 0) + Number(v || 0));
      });
    });
    return Array.from(totals.entries())
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [checks, from, to]);
  const maxDefectQty = Math.max(1, ...topDefects.map((d) => d.qty));

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
        <StatCard label={t('চলমান স্টাইল', 'Running Styles')} value={loading ? '—' : runningStyles.length} />
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

      {newOrderStyles.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">{t('অ্যাকটিভ অর্ডার (প্রোডাকশন এখনো শুরু হয়নি)', 'Active Order (production not started yet)')}</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                {t(
                  'নতুন তৈরি করা স্টাইল, যেগুলোতে এখনো কোনো প্রোডাকশন এন্ট্রি দেওয়া হয়নি। প্রথম এন্ট্রি দেওয়ার পর এটি অটোমেটিক "চলমান স্টাইল"-এ চলে যাবে।',
                  'Newly created styles with no production entry yet. Once the first entry is logged, it moves to "Running Styles" automatically.'
                )}
              </p>
            </div>
            <ExportBar
              small
              title={t('অ্যাকটিভ অর্ডার রিপোর্ট', 'Active Order Report')}
              filename="active-order-report"
              columns={[
                { key: 'styleNo', label: t('স্টাইল নম্বর', 'Style No.') },
                { key: 'styleName', label: t('স্টাইল নাম', 'Style Name') },
                { key: 'buyer', label: t('বায়ার', 'Buyer') },
                { key: 'poNo', label: 'PO' },
                { key: 'orderQty', label: t('অর্ডার কোয়ান্টিটি', 'Order Qty') },
                { key: 'orderDate', label: t('তারিখ', 'Date') },
                { key: 'shipDate', label: t('শিপমেন্ট', 'Shipment') },
              ]}
              rows={filteredNewOrderStyles}
            />
          </div>
          <div className="space-y-2">
            {filteredNewOrderStyles.map((s) => (
              <Link
                to={`/production/${s.id}`}
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm hover:border-indigo/40"
              >
                <span className="font-medium text-ink">
                  {s.styleNo} {s.styleName && <span className="text-ink-soft">— {s.styleName}</span>}
                </span>
                <span className="text-ink-soft">{s.buyer} · {t('অর্ডার', 'Order')}: {Number(s.orderQty || 0).toLocaleString('en-US')}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">
              {t('টপ ডিফেক্ট', 'Top Defects')} {rangeActive ? t('(নির্বাচিত রেঞ্জ)', '(selected range)') : t('(সর্বমোট)', '(all time)')}
            </h2>
            <Link to="/quality/trends" className="text-xs font-medium text-indigo">
              {t('বিস্তারিত ট্রেন্ড', 'Detailed Trends')}
            </Link>
          </div>
          {checks === null ? (
            <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
          ) : topDefects.length === 0 ? (
            <EmptyState title={t('এই রেঞ্জে কোনো ডিফেক্ট ডেটা নেই', 'No defect data in this range')} />
          ) : (
            <div className="space-y-3">
              {topDefects.map((d, i) => (
                <div key={i}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink">{d.label}</span>
                    <span className="text-ink-soft">{d.qty}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-red" style={{ width: `${(d.qty / maxDefectQty) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">
              {t('সব সেকশনের কর্মপ্রবাহ', 'All Sections Working Flow')} {rangeActive ? t('(নির্বাচিত রেঞ্জ)', '(selected range)') : t('(সর্বমোট)', '(all time)')}
            </h2>
            <Link to="/quality" className="text-xs font-medium text-indigo">
              {t('কোয়ালিটি', 'Quality')}
            </Link>
          </div>
          <div className="scroll-thin max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th className="py-1.5 pr-2 font-medium"></th>
                  <th className="py-1.5 pr-2 font-medium">{t('সেকশন', 'Section')}</th>
                  <th className="py-1.5 pr-2 font-medium">{t('প্রোডাকশন', 'Produced')}</th>
                  <th className="py-1.5 text-right font-medium">{t('পাস রেট', 'Pass Rate')}</th>
                </tr>
              </thead>
              <tbody>
                {sectionFlow.map((s) => (
                  <tr key={s.key} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2"><TrafficLight tone={qualityTone(s.passRate, settings)} size={8} /></td>
                    <td className="py-1.5 pr-2 text-ink">{s.label}</td>
                    <td className="py-1.5 pr-2 text-ink-soft">{s.produced.toLocaleString('en-US')}</td>
                    <td className="py-1.5 text-right font-medium text-ink">{s.passRate === null ? '—' : `${s.passRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
