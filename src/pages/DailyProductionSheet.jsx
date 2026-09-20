import { useEffect, useMemo, useState, Fragment } from 'react';
import { collection, collectionGroup, onSnapshot, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '../firebase';
import { Field, inputClass, EmptyState } from '../components/ui';
import ExportBar from '../components/ExportBar';
import { STAGES, stageLabel } from '../lib/constants';
import { useLang } from '../lib/i18n';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Matches the factory's own paper "Reports format" sheet: one row per
// style (Buyer, Style, Order Qty, GG), then two columns per production
// stage — that stage's quantity ON the selected date, and its running
// total UP TO AND INCLUDING that date — plus a Remarks column at the end.
export default function DailyProductionSheet() {
  const { t, lang } = useLang();
  const [date, setDate] = useState(todayStr());
  const [buyerFilter, setBuyerFilter] = useState('all');
  const [styles, setStyles] = useState(null);
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'styles'), (snap) => setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'productionEntries')), (snap) =>
      setEntries(snap.docs.map((d) => ({ styleId: d.ref.parent.parent.id, ...d.data() })))
    );
    return unsub;
  }, []);

  const buyers = useMemo(() => {
    const set = new Set((styles || []).map((s) => s.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [styles]);

  const visibleStyles = (styles || []).filter((s) => buyerFilter === 'all' || s.buyer === buyerFilter);

  // For each style, compute {today, total} per stage as of the selected
  // date — total is a proper as-of-date cumulative (summed from dated
  // entries), not just the live all-time stages counter, so picking a
  // past date gives a historically accurate sheet.
  const rows = useMemo(() => {
    if (!entries) return [];
    return visibleStyles.map((style) => {
      const stageData = {};
      STAGES.forEach((s) => {
        stageData[s.key] = { today: 0, total: 0 };
      });
      entries
        .filter((e) => e.styleId === style.id)
        .forEach((e) => {
          if (!stageData[e.stage]) return;
          const q = Number(e.quantity || 0);
          if (e.date === date) stageData[e.stage].today += q;
          if (e.date <= date) stageData[e.stage].total += q;
        });
      return { style, stageData };
    });
  }, [visibleStyles, entries, date]);

  const exportColumns = [
    { key: 'buyer', label: t('বায়ার', 'Buyer') },
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'orderQty', label: t('অর্ডার QTY', 'Order Qty') },
    { key: 'gg', label: 'GG' },
    ...STAGES.flatMap((s) => [
      { key: `${s.key}_today`, label: `${stageLabel(s.key, lang)} — ${t('আজ', 'Today')}` },
      { key: `${s.key}_total`, label: `${stageLabel(s.key, lang)} — ${t('মোট', 'Total')}` },
    ]),
    { key: 'remarks', label: t('মন্তব্য', 'Remarks') },
  ];

  const exportRows = rows.map(({ style, stageData }) => {
    const row = {
      buyer: style.buyer,
      styleLabel: `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}`,
      orderQty: style.orderQty,
      gg: style.gg || '',
      remarks: style.notes || '',
    };
    STAGES.forEach((s) => {
      row[`${s.key}_today`] = stageData[s.key].today;
      row[`${s.key}_total`] = stageData[s.key].total;
    });
    return row;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t('রিপোর্ট সেন্টার', 'Reports Center')}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('দৈনিক প্রোডাকশন শিট', 'Daily Production Sheet')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('প্রতিটি স্টাইলের জন্য প্রতিটি সেকশনের আজকের ও সর্বমোট (নির্বাচিত তারিখ পর্যন্ত) প্রোডাকশন।', "Each style's today's and running-total (up to the selected date) production per section.")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('তারিখ', 'Date')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('বায়ার', 'Buyer')}>
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className={`${inputClass} !w-auto`}>
              <option value="all">{t('সব বায়ার', 'All Buyers')}</option>
              {buyers.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <ExportBar title={t('দৈনিক প্রোডাকশন শিট', 'Daily Production Sheet')} subtitle={date} filename={`daily-production-sheet-${date}`} columns={exportColumns} rows={exportRows} />
        </div>
      </div>

      {styles === null || entries === null ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t('কোনো স্টাইল নেই', 'No styles')} />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 border border-line bg-ink-soft/10 px-3 py-2 text-left font-semibold text-ink">{t('বায়ার', 'BUYER')}</th>
                <th rowSpan={2} className="border border-line bg-ink-soft/10 px-3 py-2 text-left font-semibold text-ink">{t('স্টাইল', 'STYLE')}</th>
                <th rowSpan={2} className="border border-line bg-ink-soft/10 px-3 py-2 text-left font-semibold text-ink">{t('অর্ডার QTY', 'ORDER QTY')}</th>
                <th rowSpan={2} className="border border-line bg-ink-soft/10 px-3 py-2 text-left font-semibold text-ink">GG</th>
                {STAGES.map((s) => (
                  <th key={s.key} colSpan={2} className="border border-line bg-ink-soft/20 px-3 py-2 text-center font-semibold text-ink">
                    {lang === 'en' ? s.labelEn.toUpperCase() : s.label}
                  </th>
                ))}
                <th rowSpan={2} className="border border-line bg-ink-soft/10 px-3 py-2 text-left font-semibold text-ink">{t('মন্তব্য', 'REMARKS')}</th>
              </tr>
              <tr>
                {STAGES.map((s) => (
                  <Fragment key={s.key}>
                    <th className="border border-line bg-ink-soft/10 px-2 py-1.5 text-center font-medium text-ink-soft">{t('আজ', 'TODAY')}</th>
                    <th className="border border-line bg-amber-soft px-2 py-1.5 text-center font-medium text-amber">{t('মোট', 'TOTAL')}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ style, stageData }) => (
                <tr key={style.id} className="hover:bg-paper">
                  <td className="sticky left-0 z-10 border border-line bg-surface px-3 py-2 text-ink">{style.buyer}</td>
                  <td className="border border-line px-3 py-2 text-ink">
                    <Link to={`/production/${style.id}`} className="hover:text-indigo hover:underline">
                      {style.styleNo}{style.styleName ? ` — ${style.styleName}` : ''}
                    </Link>
                  </td>
                  <td className="border border-line px-3 py-2 text-ink-soft">{Number(style.orderQty).toLocaleString('en-US')}</td>
                  <td className="border border-line px-3 py-2 text-ink-soft">{style.gg || '—'}</td>
                  {STAGES.map((s) => (
                    <Fragment key={s.key}>
                      <td className="border border-line px-2 py-2 text-center text-ink-soft">
                        {stageData[s.key].today || '—'}
                      </td>
                      <td className="border border-line bg-amber-soft/30 px-2 py-2 text-center font-medium text-ink">
                        {stageData[s.key].total || '—'}
                      </td>
                    </Fragment>
                  ))}
                  <td className="border border-line px-3 py-2 text-ink-soft">{style.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
