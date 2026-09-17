import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { EmptyState, TrafficLight } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { STAGES, stageLabel, qualityTone } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settingsContext';

const RANGES = [
  { key: 'today', bn: 'আজ (ঘণ্টাভিত্তিক)', en: 'Today (Hourly)' },
  { key: 'daily', bn: 'দৈনিক (৩০ দিন)', en: 'Daily (30 days)' },
  { key: 'weekly', bn: 'সাপ্তাহিক (১২ সপ্তাহ)', en: 'Weekly (12 weeks)' },
  { key: 'monthly', bn: 'মাসিক (১২ মাস)', en: 'Monthly (12 months)' },
  { key: 'yearly', bn: 'বার্ষিক', en: 'Yearly' },
];

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

function last(n, unit) {
  const arr = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (unit === 'day') d.setDate(now.getDate() - i);
    if (unit === 'week') d.setDate(now.getDate() - i * 7);
    if (unit === 'month') d.setMonth(now.getMonth() - i);
    if (unit === 'year') d.setFullYear(now.getFullYear() - i);
    arr.push(d);
  }
  return arr;
}

export default function QualityTrends() {
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const [checks, setChecks] = useState(null);
  const [range, setRange] = useState('daily');
  const [sectionFilter, setSectionFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'qualityChecks'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const scoped = useMemo(
    () => (checks || []).filter((c) => sectionFilter === 'all' || c.section === sectionFilter),
    [checks, sectionFilter]
  );

  const today = new Date().toISOString().slice(0, 10);

  // Build the time-bucketed series for the chosen range.
  const series = useMemo(() => {
    if (range === 'today') {
      const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, checked: 0, defect: 0 }));
      scoped
        .filter((c) => c.date === today)
        .forEach((c) => {
          const h = c.createdAt?.toDate ? c.createdAt.toDate().getHours() : 0;
          buckets[h].checked += Number(c.checkedQty || 0);
          buckets[h].defect += Number(c.defectQty || 0);
        });
      return buckets;
    }
    if (range === 'daily') {
      const days = last(30, 'day').map((d) => d.toISOString().slice(0, 10));
      const map = new Map(days.map((d) => [d, { label: d.slice(5), checked: 0, defect: 0 }]));
      scoped.forEach((c) => {
        if (map.has(c.date)) {
          map.get(c.date).checked += Number(c.checkedQty || 0);
          map.get(c.date).defect += Number(c.defectQty || 0);
        }
      });
      return Array.from(map.values());
    }
    if (range === 'weekly') {
      const weeks = last(12, 'week').map((d) => isoWeekKey(d.toISOString().slice(0, 10)));
      const uniqueWeeks = Array.from(new Set(weeks));
      const map = new Map(uniqueWeeks.map((w) => [w, { label: w.slice(5), checked: 0, defect: 0 }]));
      scoped.forEach((c) => {
        const wk = isoWeekKey(c.date);
        if (map.has(wk)) {
          map.get(wk).checked += Number(c.checkedQty || 0);
          map.get(wk).defect += Number(c.defectQty || 0);
        }
      });
      return Array.from(map.values());
    }
    if (range === 'monthly') {
      const months = last(12, 'month').map((d) => d.toISOString().slice(0, 7));
      const map = new Map(months.map((m) => [m, { label: m, checked: 0, defect: 0 }]));
      scoped.forEach((c) => {
        const m = (c.date || '').slice(0, 7);
        if (map.has(m)) {
          map.get(m).checked += Number(c.checkedQty || 0);
          map.get(m).defect += Number(c.defectQty || 0);
        }
      });
      return Array.from(map.values());
    }
    // yearly
    const years = Array.from(new Set(scoped.map((c) => (c.date || '').slice(0, 4)))).sort();
    const list = years.length ? years : [String(new Date().getFullYear())];
    const map = new Map(list.map((y) => [y, { label: y, checked: 0, defect: 0 }]));
    scoped.forEach((c) => {
      const y = (c.date || '').slice(0, 4);
      if (map.has(y)) {
        map.get(y).checked += Number(c.checkedQty || 0);
        map.get(y).defect += Number(c.defectQty || 0);
      }
    });
    return Array.from(map.values());
  }, [scoped, range, today]);

  const seriesWithRate = series.map((s) => ({
    ...s,
    passRate: s.checked > 0 ? Math.round(((s.checked - s.defect) / s.checked) * 1000) / 10 : null,
  }));

  // Top 5 defects across the whole filtered scope (all time within section
  // filter) — separate from the time-bucketed series above.
  const defectTotals = useMemo(() => {
    const totals = new Map();
    scoped.forEach((c) => {
      Object.entries(c.defects || {}).forEach(([k, v]) => {
        const label = (c.defectLabels && c.defectLabels[k]) || k;
        totals.set(label, (totals.get(label) || 0) + Number(v || 0));
      });
    });
    return Array.from(totals.entries())
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [scoped]);

  // Per-section summary across the whole filtered scope.
  const sectionSummary = useMemo(() => {
    const map = new Map();
    (checks || []).forEach((c) => {
      if (!map.has(c.section)) map.set(c.section, { checked: 0, defect: 0 });
      const rec = map.get(c.section);
      rec.checked += Number(c.checkedQty || 0);
      rec.defect += Number(c.defectQty || 0);
    });
    return STAGES.map((s) => {
      const rec = map.get(s.key) || { checked: 0, defect: 0 };
      const passRate = rec.checked > 0 ? Math.round(((rec.checked - rec.defect) / rec.checked) * 1000) / 10 : null;
      return { section: s.key, label: lang === 'en' ? s.labelEn : s.label, ...rec, passRate };
    });
  }, [checks, lang]);

  const maxDefectQty = Math.max(1, ...defectTotals.map((d) => d.qty));
  const maxChecked = Math.max(1, ...seriesWithRate.map((s) => s.checked));

  const defectExportColumns = [
    { key: 'label', label: t('ডিফেক্ট', 'Defect') },
    { key: 'qty', label: t('মোট কোয়ান্টিটি', 'Total Qty') },
  ];
  const sectionExportColumns = [
    { key: 'label', label: t('সেকশন', 'Section') },
    { key: 'checked', label: t('মোট চেকড', 'Total Checked') },
    { key: 'defect', label: t('মোট ডিফেক্ট', 'Total Defects') },
    { key: 'passRate', label: t('পাস রেট %', 'Pass Rate %'), render: (r) => (r.passRate === null ? '—' : r.passRate) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('কোয়ালিটি ট্রেন্ড ও অ্যানালিটিক্স', 'Quality Trends & Analytics')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('ঘণ্টাভিত্তিক থেকে বার্ষিক পর্যন্ত — টপ ৫ ডিফেক্ট ও সেকশন-ভিত্তিক সারসংক্ষেপ।', 'From hourly to yearly — top 5 defects and section-wise summary.')}</p>
        </div>
        <Link to="/quality" className="text-sm font-medium text-indigo hover:underline">
          {t('ড্যাশবোর্ড', 'Dashboard')}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              range === r.key ? 'bg-indigo text-white' : 'border border-line bg-surface text-ink-soft hover:bg-paper'
            }`}
          >
            {t(r.bn, r.en)}
          </button>
        ))}
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="ml-auto rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        >
          <option value="all">{t('সব সেকশন', 'All sections')}</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {lang === 'en' ? s.labelEn : s.label}
            </option>
          ))}
        </select>
      </div>

      {checks === null ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : (
        <>
          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-sm font-semibold text-ink">
              {t(RANGES.find((r) => r.key === range)?.bn, RANGES.find((r) => r.key === range)?.en)} —{' '}
              {t('চেকড বনাম ডিফেক্ট', 'Checked vs Defects')}
            </h2>
            {seriesWithRate.every((s) => s.checked === 0) ? (
              <EmptyState title={t('এই সময়সীমায় কোনো ডেটা নেই', 'No data in this range')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <svg
                  viewBox={`0 0 ${Math.max(600, seriesWithRate.length * 44)} 220`}
                  className="h-56 w-full"
                  style={{ minWidth: seriesWithRate.length * 40 }}
                >
                  {seriesWithRate.map((s, i) => {
                    const barW = 14;
                    const gap = 44;
                    const x = i * gap + 20;
                    const checkedH = (s.checked / maxChecked) * 150;
                    const defectH = s.checked > 0 ? (s.defect / maxChecked) * 150 : 0;
                    const tone = qualityTone(s.passRate, settings);
                    const toneColor = { green: '#2F9E5B', amber: '#C08A1E', red: '#C0392B', grey: '#B9BEC7' }[tone];
                    return (
                      <g key={i}>
                        <rect x={x} y={170 - checkedH} width={barW} height={checkedH} fill="#C9D0DC" rx="2" />
                        <rect x={x} y={170 - defectH} width={barW} height={defectH} fill={toneColor} rx="2" />
                        <text x={x + barW / 2} y={188} fontSize="9" textAnchor="middle" fill="#5B5F68">
                          {s.label}
                        </text>
                        {s.passRate !== null && (
                          <text x={x + barW / 2} y={200} fontSize="8" textAnchor="middle" fill="#1C1E22">
                            {s.passRate}%
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#C9D0DC]" /> {t('মোট চেকড', 'Total Checked')}</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#C0392B]" /> {t('ডিফেক্ট (রঙ পাস রেট অনুযায়ী)', 'Defects (colour = pass rate)')}</span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-ink">{t('টপ ৫ ডিফেক্ট', 'Top 5 Defects')}</h2>
                <ExportBar small title={t('টপ ৫ ডিফেক্ট', 'Top 5 Defects')} filename="top-defects" columns={defectExportColumns} rows={defectTotals} />
              </div>
              {defectTotals.length === 0 ? (
                <EmptyState title={t('কোনো ডিফেক্ট ডেটা নেই', 'No defect data')} />
              ) : (
                <div className="space-y-3">
                  {defectTotals.map((d, i) => (
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
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-ink">{t('সেকশন-ভিত্তিক সারসংক্ষেপ', 'Section-wise Summary')}</h2>
                <ExportBar small title={t('সেকশন-ভিত্তিক সারসংক্ষেপ', 'Section-wise Summary')} filename="section-summary" columns={sectionExportColumns} rows={sectionSummary} />
              </div>
              <div className="scroll-thin max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {sectionSummary.map((s) => (
                      <tr key={s.section} className="border-b border-line last:border-0">
                        <td className="py-1.5 pr-2"><TrafficLight tone={qualityTone(s.passRate, settings)} size={8} /></td>
                        <td className="py-1.5 pr-2 text-ink">{s.label}</td>
                        <td className="py-1.5 pr-2 text-ink-soft">{s.checked}</td>
                        <td className="py-1.5 text-right font-medium text-ink">{s.passRate === null ? '—' : `${s.passRate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
