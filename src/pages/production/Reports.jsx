import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { EmptyState, Pill, btnSecondary, inputClass } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { STAGES, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// One place to pull: production by section, yarn stock/usage, accessory
// status, current WIP and over-production — for one style or across every
// running style, over any date range. Everything here is downloadable.
export default function Reports() {
  const { t, lang } = useLang();

  const [styles, setStyles] = useState(null);
  const [entries, setEntries] = useState(null); // productionEntries (collection group)
  const [yarnLedger, setYarnLedger] = useState(null); // yarnLedger (collection group)
  const [accessoryLedger, setAccessoryLedger] = useState(null); // accessoryLedger (collection group)

  const [styleFilterId, setStyleFilterId] = useState('');
  const [rangeFrom, setRangeFrom] = useState(addDays(todayStr(), -29));
  const [rangeTo, setRangeTo] = useState(todayStr());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'styles'), (snap) =>
      setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'productionEntries')), (snap) =>
      setEntries(snap.docs.map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() })))
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
      setAccessoryLedger(snap.docs.map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() })))
    );
    return unsub;
  }, []);

  function applyPreset(preset) {
    const to = todayStr();
    if (preset === 'today') setRangeFrom(to);
    else if (preset === 'week') setRangeFrom(addDays(to, -6));
    else if (preset === 'month') setRangeFrom(addDays(to, -29));
    else if (preset === 'year') setRangeFrom(addDays(to, -364));
    setRangeTo(to);
  }

  const stylesInScope = useMemo(() => {
    if (!styles) return [];
    return styleFilterId ? styles.filter((s) => s.id === styleFilterId) : styles;
  }, [styles, styleFilterId]);
  const scopeIds = new Set(stylesInScope.map((s) => s.id));

  const entriesInRange = (entries || []).filter(
    (e) => scopeIds.has(e.styleId) && e.date >= rangeFrom && e.date <= rangeTo
  );
  const yarnInRange = (yarnLedger || []).filter(
    (e) => scopeIds.has(e.styleId) && e.date >= rangeFrom && e.date <= rangeTo
  );
  const accInRange = (accessoryLedger || []).filter(
    (e) => scopeIds.has(e.styleId) && e.date >= rangeFrom && e.date <= rangeTo
  );

  // 1. Production by section (within range) + current WIP / over-production
  // (WIP and over-production are always "as of now", not range-limited —
  // they describe the current state of the floor, not a period total).
  const productionRows = useMemo(() => {
    const rangeByStyleStage = new Map();
    entriesInRange.forEach((e) => {
      const key = `${e.styleId}__${e.stage}`;
      rangeByStyleStage.set(key, (rangeByStyleStage.get(key) || 0) + Number(e.quantity || 0));
    });
    const rows = [];
    stylesInScope.forEach((s) => {
      STAGES.forEach((st, i) => {
        const periodQty = rangeByStyleStage.get(`${s.id}__${st.key}`) || 0;
        const cumulative = s.stages?.[st.key] || 0;
        const prevKey = i > 0 ? s.stagePrerequisites?.[st.key] || STAGES[i - 1].key : null;
        const prevCumulative = i > 0 ? s.stages?.[prevKey] || 0 : null;
        const wip = i > 0 ? Math.max(0, prevCumulative - cumulative) : null;
        const overQty = Math.max(0, cumulative - Number(s.orderQty || 0));
        const overPct = s.orderQty > 0 && overQty > 0 ? Math.round((overQty / s.orderQty) * 100) : 0;
        if (periodQty > 0 || cumulative > 0) {
          rows.push({
            styleNo: s.styleNo,
            styleLabel: `${s.styleNo}${s.styleName ? ' — ' + s.styleName : ''}`,
            buyer: s.buyer,
            stage: stageLabel(st.key, lang),
            periodQty,
            cumulative,
            orderQty: s.orderQty,
            wip,
            overPct,
          });
        }
      });
    });
    return rows;
  }, [entriesInRange, stylesInScope, lang]);

  // 2. Yarn stock / usage summary (within range, per style + yarn item)
  const yarnRows = useMemo(() => {
    const map = new Map();
    yarnInRange.forEach((e) => {
      const key = `${e.styleId}__${e.yarnItemId}`;
      if (!map.has(key)) {
        const style = stylesInScope.find((s) => s.id === e.styleId);
        map.set(key, {
          styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : e.styleLabel,
          yarnItemName: e.yarnItemName,
          ordered: 0,
          received: 0,
          consumed: 0,
        });
      }
      const r = map.get(key);
      const q = Number(e.qty || 0);
      if (e.type === 'dyeingOrder') r.ordered += q;
      if (e.type === 'receipt') r.received += q;
      if (e.type === 'consumption') r.consumed += q;
    });
    return Array.from(map.values()).map((r) => ({ ...r, balance: r.received - r.consumed }));
  }, [yarnInRange, stylesInScope]);

  // 3. Accessory "in-house" status summary (within range, per style + item)
  const accessoryRows = useMemo(() => {
    const map = new Map();
    accInRange.forEach((e) => {
      const key = `${e.styleId}__${e.itemId}`;
      if (!map.has(key)) {
        const style = stylesInScope.find((s) => s.id === e.styleId);
        map.set(key, {
          styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : e.styleLabel,
          itemName: e.itemName,
          unit: e.unit,
          received: 0,
          issued: 0,
        });
      }
      const r = map.get(key);
      const q = Number(e.qty || 0);
      if (e.type === 'receipt') r.received += q;
      if (e.type === 'issue') r.issued += q;
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      balance: r.received - r.issued,
      inHouse: r.received > 0,
    }));
  }, [accInRange, stylesInScope]);

  const productionCols = [
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'buyer', label: t('বায়ার', 'Buyer') },
    { key: 'stage', label: t('সেকশন', 'Section') },
    { key: 'periodQty', label: t('এই সময়ে প্রোডাকশন', 'Production This Period') },
    { key: 'cumulative', label: t('সর্বমোট', 'Cumulative') },
    { key: 'orderQty', label: t('অর্ডার কোয়ান্টিটি', 'Order Qty') },
    { key: 'wip', label: t('WIP (ব্যালেন্স)', 'WIP (Balance)'), render: (r) => (r.wip === null ? '—' : r.wip) },
    { key: 'overPct', label: t('বেশি উৎপাদন %', 'Over-production %'), render: (r) => (r.overPct ? `+${r.overPct}%` : '—') },
  ];
  const yarnCols = [
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'ordered', label: t('ডাইং অর্ডার (lb)', 'Dyeing Order (lb)') },
    { key: 'received', label: t('রিসিভড (lb)', 'Received (lb)') },
    { key: 'consumed', label: t('ব্যবহৃত (lb)', 'Used (lb)') },
    { key: 'balance', label: t('বাকি (lb)', 'Balance (lb)') },
  ];
  const accessoryCols = [
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'itemName', label: t('আইটেম', 'Item') },
    { key: 'received', label: t('রিসিভড', 'Received') },
    { key: 'issued', label: t('ইস্যু হয়েছে', 'Issued') },
    { key: 'balance', label: t('বাকি', 'Balance') },
    { key: 'inHouse', label: t('ইন-হাউজ?', 'In-house?'), render: (r) => (r.inHouse ? t('হ্যাঁ', 'Yes') : t('না', 'No')) },
  ];

  const loading = styles === null || entries === null || yarnLedger === null || accessoryLedger === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('রিপোর্ট', 'Reports')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'প্রোডাকশন, ইয়ার্ন ও এক্সেসরিজের সব তথ্য একসাথে — দৈনিক, সাপ্তাহিক, মাসিক, বাৎসরিক অথবা নির্দিষ্ট তারিখ অনুযায়ী, একটি স্টাইল অথবা সব স্টাইল একসাথে।',
            'Production, yarn and accessory data together — daily, weekly, monthly, yearly, or a custom date range, for one style or every style at once.'
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="min-w-[240px] flex-1">
          <p className="mb-1 text-xs font-medium text-ink-soft">{t('স্টাইল', 'Style')}</p>
          <StyleSearchSelect value={styleFilterId} onChange={(id) => setStyleFilterId(id || '')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'today', label: t('আজ', 'Today') },
            { key: 'week', label: t('সাপ্তাহিক', 'Weekly') },
            { key: 'month', label: t('মাসিক', 'Monthly') },
            { key: 'year', label: t('বাৎসরিক', 'Yearly') },
          ].map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)} className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}>
              {p.label}
            </button>
          ))}
          <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={`${inputClass} !w-36 !py-1.5 text-xs`} />
          <span className="text-xs text-ink-soft">{t('থেকে', 'to')}</span>
          <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={`${inputClass} !w-36 !py-1.5 text-xs`} />
        </div>
        {styleFilterId && (
          <button onClick={() => setStyleFilterId('')} className="text-xs font-medium text-indigo hover:underline">
            {t('সব স্টাইল দেখুন', 'View all styles')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : (
        <>
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('প্রোডাকশন — সেকশন-ভিত্তিক', 'Production — By Section')}</h2>
              <ExportBar small title={t('প্রোডাকশন রিপোর্ট', 'Production Report')} filename="production-report" columns={productionCols} rows={productionRows} />
            </div>
            {productionRows.length === 0 ? (
              <EmptyState title={t('এই সময়সীমায় কোনো ডেটা নেই', 'No data in this range')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      {productionCols.map((c) => (
                        <th key={c.key} className="py-2 pr-4 font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productionRows.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{r.styleLabel}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.buyer}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.stage}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.periodQty.toLocaleString('en-US')}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.cumulative.toLocaleString('en-US')}</td>
                        <td className="py-2 pr-4 text-ink-soft">{Number(r.orderQty).toLocaleString('en-US')}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.wip === null ? '—' : r.wip}</td>
                        <td className="py-2 pr-4">{r.overPct > 0 ? <Pill tone="red">+{r.overPct}%</Pill> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('ইয়ার্ন — স্টক ও ব্যবহার', 'Yarn — Stock & Usage')}</h2>
              <ExportBar small title={t('ইয়ার্ন রিপোর্ট', 'Yarn Report')} filename="yarn-report" columns={yarnCols} rows={yarnRows} />
            </div>
            {yarnRows.length === 0 ? (
              <EmptyState title={t('এই সময়সীমায় কোনো ডেটা নেই', 'No data in this range')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      {yarnCols.map((c) => (
                        <th key={c.key} className="py-2 pr-4 font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {yarnRows.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{r.styleLabel}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.yarnItemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.ordered.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.received.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.consumed.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('এক্সেসরিজ — ইন-হাউজ স্ট্যাটাস', 'Accessories — In-house Status')}</h2>
              <ExportBar small title={t('এক্সেসরিজ রিপোর্ট', 'Accessory Report')} filename="accessory-report" columns={accessoryCols} rows={accessoryRows} />
            </div>
            {accessoryRows.length === 0 ? (
              <EmptyState title={t('এই সময়সীমায় কোনো ডেটা নেই', 'No data in this range')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      {accessoryCols.map((c) => (
                        <th key={c.key} className="py-2 pr-4 font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {accessoryRows.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{r.styleLabel}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.itemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.received} {r.unit}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.issued} {r.unit}</td>
                        <td className="py-2 pr-4 text-ink-soft">{r.balance} {r.unit}</td>
                        <td className="py-2 pr-4">
                          <Pill tone={r.inHouse ? 'green' : 'red'}>{r.inHouse ? t('হ্যাঁ', 'Yes') : t('না', 'No')}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
