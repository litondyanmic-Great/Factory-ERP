import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, EmptyState, TrafficLight } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { STAGES, BLOCKS, stageLabel, qualityTone } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settingsContext';

export default function QualityReports() {
  const { profile } = useAuth();
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const [checks, setChecks] = useState(null);
  const [sectionFilter, setSectionFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'qualityChecks'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!checks) return [];
    return checks.filter((c) => {
      if (sectionFilter !== 'all' && c.section !== sectionFilter) return false;
      if (blockFilter !== 'all' && c.block !== blockFilter) return false;
      if (from && c.date < from) return false;
      if (to && c.date > to) return false;
      if (search && !(c.styleLabel || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [checks, sectionFilter, blockFilter, from, to, search]);

  async function handleDelete(c) {
    const ok = window.confirm(t('এই এন্ট্রিটি মুছে ফেলতে চান?', 'Delete this entry?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'qualityChecks', c.id));
  }

  const defectLabel = (record, key) => (record.defectLabels && record.defectLabels[key]) || key;

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'section', label: t('সেকশন', 'Section'), render: (r) => stageLabel(r.section, lang) },
    { key: 'checkedQty', label: t('চেকড কোয়ান্টিটি', 'Checked Qty') },
    { key: 'block', label: t('ব্লক', 'Block') },
    { key: 'defectQty', label: t('ডিফেক্ট কোয়ান্টিটি', 'Defect Qty') },
    { key: 'passRate', label: t('পাস রেট %', 'Pass Rate %') },
    {
      key: 'defects',
      label: t('ডিফেক্ট বিস্তারিত', 'Defect Detail'),
      render: (r) => Object.entries(r.defects || {}).map(([k, v]) => `${defectLabel(r, k)}: ${v}`).join(', '),
    },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('কোয়ালিটি রিপোর্ট', 'Quality Reports')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('সব QC এন্ট্রি ফিল্টার ও ডাউনলোড করুন।', 'Filter and download every QC entry.')}</p>
        </div>
        <Link to="/quality" className="text-sm font-medium text-indigo hover:underline">
          {t('ড্যাশবোর্ড', 'Dashboard')}
        </Link>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
        <Field label={t('সেকশন', 'Section')}>
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={inputClass}>
            <option value="all">{t('সব সেকশন', 'All sections')}</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {lang === 'en' ? s.labelEn : s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('ব্লক', 'Block')}>
          <select value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)} className={inputClass}>
            <option value="all">{t('সব ব্লক', 'All blocks')}</option>
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {t('ব্লক', 'Block')} {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('থেকে', 'From')}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('পর্যন্ত', 'To')}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('স্টাইল খুঁজুন', 'Search style')}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="flex justify-end">
        <ExportBar
          title={t('কোয়ালিটি রিপোর্ট', 'Quality Reports')}
          filename="quality-reports"
          columns={exportColumns}
          rows={filtered}
        />
      </div>

      {checks === null ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={t('কোনো এন্ট্রি পাওয়া যায়নি', 'No entries found')} />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">{t('তারিখ', 'Date')}</th>
                <th className="px-4 py-3 font-medium">{t('স্টাইল', 'Style')}</th>
                <th className="px-4 py-3 font-medium">{t('সেকশন', 'Section')}</th>
                <th className="px-4 py-3 font-medium">{t('ব্লক', 'Block')}</th>
                <th className="px-4 py-3 font-medium">{t('চেকড', 'Checked')}</th>
                <th className="px-4 py-3 font-medium">{t('ডিফেক্ট', 'Defects')}</th>
                <th className="px-4 py-3 font-medium">{t('পাস রেট', 'Pass Rate')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><TrafficLight tone={qualityTone(c.passRate, settings)} /></td>
                  <td className="px-4 py-3 text-ink-soft">{c.date}</td>
                  <td className="px-4 py-3 text-ink">{c.styleLabel}</td>
                  <td className="px-4 py-3 text-ink-soft">{stageLabel(c.section, lang)}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.block || '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.checkedQty}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.defectQty}</td>
                  <td className="px-4 py-3 font-medium text-ink">{c.passRate}%</td>
                  <td className="px-4 py-3">
                    {profile?.role === 'admin' && (
                      <button onClick={() => handleDelete(c)} className="text-red hover:opacity-70">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
