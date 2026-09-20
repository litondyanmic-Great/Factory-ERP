import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, doc, onSnapshot, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { Field, inputClass, btnSecondary, EmptyState } from '../components/ui';
import ExportBar from '../components/ExportBar';
import StyleSearchSelect from '../components/StyleSearchSelect';
import { STAGES, stageLabel } from '../lib/constants';
import { useLang } from '../lib/i18n';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function yearStartStr() {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

// One page that answers "how much of X happened between date A and B, for
// this style or for everything" — pulling from the same productionEntries
// and yarnLedger collections every other screen writes to, via
// collectionGroup queries so it can look across every style at once.
export default function ReportsCenter() {
  const { t, lang } = useLang();
  const [styleId, setStyleId] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [allStyles, setAllStyles] = useState([]);
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());

  const [prodEntries, setProdEntries] = useState(null);
  const [yarnLedger, setYarnLedger] = useState(null);
  const [accLedger, setAccLedger] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'styles'), (snap) =>
      setAllStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!styleId) {
      setSelectedStyle(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'styles', styleId), (snap) => setSelectedStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null));
    return unsub;
  }, [styleId]);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'productionEntries')), (snap) =>
      setProdEntries(snap.docs.map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() })))
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'yarnLedger')), (snap) =>
      setYarnLedger(snap.docs.map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() })))
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'accessoryLedger')), (snap) =>
      setAccLedger(snap.docs.map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() })))
    );
    return unsub;
  }, []);

  function inRange(dateStr) {
    return (!from || dateStr >= from) && (!to || dateStr <= to);
  }
  function matchesStyle(entryStyleId) {
    return !styleId || entryStyleId === styleId;
  }

  const filteredProd = (prodEntries || []).filter((e) => inRange(e.date) && matchesStyle(e.styleId));
  const filteredYarn = (yarnLedger || []).filter((e) => inRange(e.date) && matchesStyle(e.styleId));
  const filteredAcc = (accLedger || []).filter((e) => inRange(e.date) && matchesStyle(e.styleId));

  // --- Production by stage (within date range) ------------------------
  const productionByStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.key, 0]));
    filteredProd.forEach((e) => {
      map[e.stage] = (map[e.stage] || 0) + Number(e.quantity || 0);
    });
    return STAGES.map((s) => ({ stage: s.key, label: stageLabel(s.key, lang), qty: map[s.key] || 0 }));
  }, [filteredProd, lang]);

  // --- Yarn summary (within date range) --------------------------------
  const yarnSummary = useMemo(() => {
    let ordered = 0, received = 0, issuedWinding = 0, issuedKnitting = 0, windingToKnitting = 0, consumed = 0;
    filteredYarn.forEach((e) => {
      const q = Number(e.qty || 0);
      if (e.type === 'dyeingOrder') ordered += q;
      if (e.type === 'receipt') received += q;
      if (e.type === 'issueToWinding') issuedWinding += q;
      if (e.type === 'issueToKnitting') issuedKnitting += q;
      if (e.type === 'windingToKnitting') windingToKnitting += q;
      if (e.type === 'consumption') consumed += q;
    });
    return { ordered, received, issuedWinding, issuedKnitting, windingToKnitting, consumed };
  }, [filteredYarn]);

  // --- Accessory summary (within date range) ---------------------------
  const accessorySummary = useMemo(() => {
    let received = 0, issued = 0;
    filteredAcc.forEach((e) => {
      const q = Number(e.qty || 0);
      if (e.type === 'receipt') received += q;
      if (e.type === 'issue') issued += q;
    });
    return { received, issued };
  }, [filteredAcc]);

  // --- Current WIP snapshot (all-time, not date-bound) — only meaningful
  // when a single style is selected, since WIP is "as of right now", not
  // "within this period".
  const wipRows = useMemo(() => {
    if (!selectedStyle) return [];
    return STAGES.map((s, i) => {
      const done = selectedStyle.stages?.[s.key] || 0;
      const prevDone = i > 0 ? selectedStyle.stages?.[STAGES[i - 1].key] || 0 : done;
      const wip = i > 0 ? Math.max(0, prevDone - done) : 0;
      const overQty = Math.max(0, done - Number(selectedStyle.orderQty || 0));
      const overPct = selectedStyle.orderQty > 0 ? Math.round((overQty / selectedStyle.orderQty) * 100) : 0;
      return { stage: s.key, label: stageLabel(s.key, lang), done, wip, overQty, overPct };
    });
  }, [selectedStyle, lang]);

  // --- Over-production across ALL styles (when no style selected) ------
  const overProductionAll = useMemo(() => {
    if (styleId) return [];
    return allStyles
      .map((s) => {
        const packed = s.stages?.packing || 0;
        const overQty = packed - Number(s.orderQty || 0);
        const overPct = s.orderQty > 0 ? Math.round((overQty / s.orderQty) * 100) : 0;
        return { styleNo: s.styleNo, buyer: s.buyer, orderQty: s.orderQty, packed, overQty, overPct };
      })
      .filter((r) => r.overQty > 0)
      .sort((a, b) => b.overPct - a.overPct);
  }, [allStyles, styleId]);

  function setPreset(preset) {
    if (preset === 'today') { setFrom(todayStr()); setTo(todayStr()); }
    if (preset === 'week') { setFrom(daysAgoStr(6)); setTo(todayStr()); }
    if (preset === 'month') { setFrom(monthStartStr()); setTo(todayStr()); }
    if (preset === 'year') { setFrom(yearStartStr()); setTo(todayStr()); }
  }

  const scopeLabel = selectedStyle
    ? `${selectedStyle.styleNo}${selectedStyle.styleName ? ' — ' + selectedStyle.styleName : ''}`
    : t('সব স্টাইল', 'All Styles');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('রিপোর্ট সেন্টার', 'Reports Center')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t(
              'নির্দিষ্ট তারিখ বা রেঞ্জ অনুযায়ী ইয়ার্ন, প্রোডাকশন ও WIP-এর সম্পূর্ণ রিপোর্ট — একটি স্টাইলের জন্য অথবা সব স্টাইল একসাথে।',
              'A complete yarn, production and WIP report for any date or range — for one style, or all styles combined.'
            )}
          </p>
        </div>
        <Link to="/reports/daily-sheet" className={btnSecondary}>
          {t('দৈনিক প্রোডাকশন শিট (ম্যাট্রিক্স)', 'Daily Production Sheet (Matrix)')}
        </Link>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('স্টাইল (ঐচ্ছিক — খালি রাখলে সব স্টাইল)', 'Style (optional — leave blank for all styles)')}>
            <StyleSearchSelect value={styleId} onChange={(id) => setStyleId(id || '')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('শুরু', 'From')}>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('শেষ', 'To')}>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setPreset('today')} className={`${btnSecondary} !px-3 !py-1.5 text-xs`}>{t('আজ', 'Today')}</button>
          <button onClick={() => setPreset('week')} className={`${btnSecondary} !px-3 !py-1.5 text-xs`}>{t('এই সপ্তাহ', 'This Week')}</button>
          <button onClick={() => setPreset('month')} className={`${btnSecondary} !px-3 !py-1.5 text-xs`}>{t('এই মাস', 'This Month')}</button>
          <button onClick={() => setPreset('year')} className={`${btnSecondary} !px-3 !py-1.5 text-xs`}>{t('এই বছর', 'This Year')}</button>
        </div>
        {styleId && selectedStyle && (
          <p className="mt-3 text-xs text-ink-soft">
            {t('স্কোপ', 'Scope')}: <span className="font-medium text-ink">{scopeLabel}</span> · {selectedStyle.buyer}
          </p>
        )}
      </div>

      {/* Production by stage */}
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('স্টেজ-ভিত্তিক প্রোডাকশন', 'Production by Stage')} ({from} – {to})</h2>
          <ExportBar
            small
            title={t('স্টেজ-ভিত্তিক প্রোডাকশন', 'Production by Stage')}
            subtitle={`${scopeLabel} · ${from} – ${to}`}
            filename="production-by-stage"
            columns={[
              { key: 'label', label: t('স্টেজ', 'Stage') },
              { key: 'qty', label: t('কোয়ান্টিটি', 'Quantity') },
            ]}
            rows={productionByStage}
          />
        </div>
        {prodEntries === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {productionByStage.map((r) => (
                  <tr key={r.stage} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{r.label}</td>
                    <td className="py-2 text-ink-soft">{r.qty.toLocaleString('en-US')} {t('পিস', 'pcs')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* WIP snapshot — only when a style is selected */}
      {selectedStyle && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('বর্তমান WIP / ব্যালেন্স (এখন পর্যন্ত সর্বমোট)', 'Current WIP / Balance (all-time total)')}</h2>
            <ExportBar
              small
              title={t('WIP রিপোর্ট', 'WIP Report')}
              subtitle={scopeLabel}
              filename={`wip-${selectedStyle.styleNo}`}
              columns={[
                { key: 'label', label: t('স্টেজ', 'Stage') },
                { key: 'done', label: t('সম্পন্ন', 'Done') },
                { key: 'wip', label: t('WIP (ব্যালেন্স)', 'WIP (Balance)') },
                { key: 'overQty', label: t('অতিরিক্ত', 'Over Qty') },
                { key: 'overPct', label: t('অতিরিক্ত %', 'Over %') },
              ]}
              rows={wipRows}
            />
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('স্টেজ', 'Stage')}</th>
                  <th className="py-2 pr-4 font-medium">{t('সম্পন্ন', 'Done')}</th>
                  <th className="py-2 pr-4 font-medium">{t('WIP', 'WIP')}</th>
                  <th className="py-2 pr-4 font-medium">{t('অতিরিক্ত', 'Over')}</th>
                </tr>
              </thead>
              <tbody>
                {wipRows.map((r) => (
                  <tr key={r.stage} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{r.label}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.done.toLocaleString('en-US')}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.wip > 0 ? r.wip.toLocaleString('en-US') : '—'}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.overPct > 0 ? `+${r.overPct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Over-production across all styles */}
      {!styleId && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('অতিরিক্ত উৎপাদন (সব স্টাইল)', 'Over-Production (All Styles)')}</h2>
            <ExportBar
              small
              title={t('অতিরিক্ত উৎপাদন রিপোর্ট', 'Over-Production Report')}
              filename="over-production"
              columns={[
                { key: 'styleNo', label: t('স্টাইল', 'Style') },
                { key: 'buyer', label: t('বায়ার', 'Buyer') },
                { key: 'orderQty', label: t('অর্ডার', 'Order') },
                { key: 'packed', label: t('প্যাকড', 'Packed') },
                { key: 'overQty', label: t('অতিরিক্ত পিস', 'Over Qty') },
                { key: 'overPct', label: t('অতিরিক্ত %', 'Over %') },
              ]}
              rows={overProductionAll}
            />
          </div>
          {overProductionAll.length === 0 ? (
            <EmptyState title={t('কোনো স্টাইলে অতিরিক্ত উৎপাদন নেই', 'No style is over-produced')} />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-soft">
                    <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                    <th className="py-2 pr-4 font-medium">{t('অর্ডার', 'Order')}</th>
                    <th className="py-2 pr-4 font-medium">{t('প্যাকড', 'Packed')}</th>
                    <th className="py-2 pr-4 font-medium">{t('অতিরিক্ত', 'Over')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overProductionAll.map((r) => (
                    <tr key={r.styleNo} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">{r.styleNo} <span className="text-xs text-ink-soft">({r.buyer})</span></td>
                      <td className="py-2 pr-4 text-ink-soft">{r.orderQty}</td>
                      <td className="py-2 pr-4 text-ink-soft">{r.packed}</td>
                      <td className="py-2 pr-4 font-medium text-red">+{r.overPct}% ({r.overQty})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Yarn + Accessory summary */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('ইয়ার্ন সামারি', 'Yarn Summary')}</h2>
            <ExportBar
              small
              title={t('ইয়ার্ন সামারি', 'Yarn Summary')}
              subtitle={`${scopeLabel} · ${from} – ${to}`}
              filename="yarn-summary"
              columns={[
                { key: 'label', label: t('আইটেম', 'Item') },
                { key: 'value', label: t('পরিমাণ (lb)', 'Quantity (lb)') },
              ]}
              rows={[
                { label: t('ডাইং অর্ডার', 'Dyeing Order'), value: yarnSummary.ordered.toFixed(2) },
                { label: t('রিসিভড', 'Received'), value: yarnSummary.received.toFixed(2) },
                { label: t('ওয়াইন্ডিং-এ ইস্যু', 'Issued to Winding'), value: yarnSummary.issuedWinding.toFixed(2) },
                { label: t('সরাসরি নিটিং-এ ইস্যু', 'Issued Direct to Knitting'), value: yarnSummary.issuedKnitting.toFixed(2) },
                { label: t('ওয়াইন্ডিং থেকে নিটিং', 'Winding to Knitting'), value: yarnSummary.windingToKnitting.toFixed(2) },
                { label: t('নিটিং-এ খরচ', 'Consumed in Knitting'), value: yarnSummary.consumed.toFixed(2) },
              ]}
            />
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-line"><td className="py-2 pr-4 text-ink">{t('ডাইং অর্ডার', 'Dyeing Order')}</td><td className="py-2 text-ink-soft">{yarnSummary.ordered.toFixed(2)} lb</td></tr>
              <tr className="border-b border-line"><td className="py-2 pr-4 text-ink">{t('রিসিভড', 'Received')}</td><td className="py-2 text-ink-soft">{yarnSummary.received.toFixed(2)} lb</td></tr>
              <tr className="border-b border-line"><td className="py-2 pr-4 text-ink">{t('ইস্যু (ওয়াইন্ডিং+নিটিং)', 'Issued (winding+knitting)')}</td><td className="py-2 text-ink-soft">{(yarnSummary.issuedWinding + yarnSummary.issuedKnitting).toFixed(2)} lb</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-ink">{t('নিটিং-এ খরচ', 'Consumed in Knitting')}</td><td className="py-2 font-medium text-ink">{yarnSummary.consumed.toFixed(2)} lb</td></tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('এক্সেসরিজ সামারি', 'Accessories Summary')}</h2>
            <ExportBar
              small
              title={t('এক্সেসরিজ সামারি', 'Accessories Summary')}
              subtitle={`${scopeLabel} · ${from} – ${to}`}
              filename="accessory-summary"
              columns={[
                { key: 'label', label: t('আইটেম', 'Item') },
                { key: 'value', label: t('পরিমাণ', 'Quantity') },
              ]}
              rows={[
                { label: t('রিসিভড', 'Received'), value: accessorySummary.received },
                { label: t('ইস্যু হয়েছে', 'Issued'), value: accessorySummary.issued },
              ]}
            />
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-line"><td className="py-2 pr-4 text-ink">{t('রিসিভড', 'Received')}</td><td className="py-2 text-ink-soft">{accessorySummary.received}</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-ink">{t('ইস্যু হয়েছে (সেকশনে)', 'Issued (to sections)')}</td><td className="py-2 font-medium text-ink">{accessorySummary.issued}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
