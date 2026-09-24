import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileBarChart, ShieldAlert, TrendingUp, PackageCheck } from 'lucide-react';
import { db } from '../../firebase';
import { StatCard, TrafficLight, EmptyState, btnPrimary, btnSecondary } from '../../components/ui';
import { STAGES, stageLabel, qualityTone } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settingsContext';

export default function QualityDashboard() {
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const [checks, setChecks] = useState(null);
  const [zeroThread, setZeroThread] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'qualityChecks'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'zeroThreadReports'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setZeroThread(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const todayChecks = (checks || []).filter((c) => c.date === today);
  const todayZero = (zeroThread || []).filter((z) => z.date === today);

  const todayCheckedTotal = todayChecks.reduce((s, c) => s + Number(c.checkedQty || 0), 0);
  const todayDefectTotal = todayChecks.reduce((s, c) => s + Number(c.defectQty || 0), 0);
  const todayPassRate = todayCheckedTotal > 0 ? ((todayCheckedTotal - todayDefectTotal) / todayCheckedTotal) * 100 : null;

  const zeroThreadRedToday = todayZero.filter((z) => z.status === 'red').length;

  // Traffic-light grid: latest entry per style+section combination (from
  // recent history, not just today) so the grid always shows something
  // useful even on a slow day.
  const grid = useMemo(() => {
    const map = new Map();
    for (const c of checks || []) {
      const key = `${c.styleId}__${c.section}`;
      if (!map.has(key)) map.set(key, c);
    }
    return Array.from(map.values()).sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [checks]);

  const redAlerts = grid.filter((c) => qualityTone(c.passRate, settings) === 'red').slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('কোয়ালিটি', 'Quality')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('প্রতিটি সেকশনের কোয়ালিটি অবস্থা ট্রাফিক-লাইটে দেখুন।', 'See each section\u2019s quality status as a traffic light.')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/quality/entry" className={btnPrimary}>
            <ClipboardCheck size={16} /> {t('QC এন্ট্রি', 'QC Entry')}
          </Link>
          <Link to="/quality/zero-thread" className={btnSecondary}>
            <ShieldAlert size={16} /> {t('জিরো থ্রেড', 'Zero Thread')}
          </Link>
          <Link to="/quality/reports" className={btnSecondary}>
            <FileBarChart size={16} /> {t('রিপোর্ট', 'Reports')}
          </Link>
          <Link to="/quality/trends" className={btnSecondary}>
            <TrendingUp size={16} /> {t('ট্রেন্ড', 'Trends')}
          </Link>
          <Link to="/quality/shipment" className={btnSecondary}>
            <PackageCheck size={16} /> {t('শিপমেন্ট', 'Shipment')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label={t('আজকের পাস রেট', "Today's Pass Rate")}
          value={todayPassRate === null ? '—' : `${todayPassRate.toFixed(1)}%`}
          tone={todayPassRate === null ? 'ink' : qualityTone(todayPassRate, settings) === 'red' ? 'red' : todayPassRate < 100 ? 'amber' : 'green'}
        />
        <StatCard label={t('আজ চেক করা হয়েছে', 'Checked Today')} value={todayCheckedTotal.toLocaleString('en-US')} />
        <StatCard label={t('আজকের ডিফেক্ট', "Today's Defects")} value={todayDefectTotal.toLocaleString('en-US')} tone={todayDefectTotal > 0 ? 'amber' : 'ink'} />
        <StatCard
          label={t('জিরো থ্রেড — রেড (আজ)', 'Zero Thread — Red (Today)')}
          value={zeroThreadRedToday}
          tone={zeroThreadRedToday > 0 ? 'red' : 'green'}
        />
      </div>

      {redAlerts.length > 0 && (
        <div className="rounded-lg border border-red/30 bg-red-soft/40 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-red">
            <ShieldAlert size={16} /> {t('রেড অ্যালার্ট — মনোযোগ প্রয়োজন', 'Red Alerts — Needs Attention')}
          </h2>
          <div className="space-y-2">
            {redAlerts.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {c.styleLabel} · {stageLabel(c.section, lang)}
                </span>
                <span className="font-medium text-red">{c.passRate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          {t('সেকশন-ভিত্তিক ট্রাফিক-লাইট (সর্বশেষ এন্ট্রি)', 'Section-wise Traffic Light (latest entry)')}
        </h2>
        {checks === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : grid.length === 0 ? (
          <EmptyState title={t('এখনো কোনো QC এন্ট্রি নেই', 'No QC entries yet')} hint={t('QC এন্ট্রি পাতা থেকে শুরু করুন।', 'Start from the QC Entry page.')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium"></th>
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('সেকশন', 'Section')}</th>
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('পাস রেট', 'Pass Rate')}</th>
                </tr>
              </thead>
              <tbody>
                {grid.slice(0, 40).map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4"><TrafficLight tone={qualityTone(c.passRate, settings)} /></td>
                    <td className="py-2 pr-4 text-ink">{c.styleLabel}</td>
                    <td className="py-2 pr-4 text-ink-soft">{stageLabel(c.section, lang)}</td>
                    <td className="py-2 pr-4 text-ink-soft">{c.date}</td>
                    <td className="py-2 pr-4 font-medium text-ink">{c.passRate}%</td>
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
