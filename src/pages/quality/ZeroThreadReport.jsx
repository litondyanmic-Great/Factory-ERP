import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { STAGES, canEnterSection } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { can } from '../../lib/constants';

// "Zero Thread" is a buyer-mandated zero-tolerance checkpoint (loose thread
// / needle / contamination check) run before packing. Each check is a
// simple pass/fail against a checked quantity, with the count of pieces
// where a thread/contamination issue was found.
export default function ZeroThreadReport() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();

  const allowedSections = useMemo(() => STAGES.filter((s) => canEnterSection(profile, s.key)), [profile]);

  const [styleId, setStyleId] = useState('');
  const [styleLabel, setStyleLabel] = useState('');
  const [section, setSection] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkedQty, setCheckedQty] = useState('');
  const [threadFoundQty, setThreadFoundQty] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [reports, setReports] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'zeroThreadReports'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!styleId) {
      setError(t('একটি স্টাইল নির্বাচন করুন।', 'Select a style.'));
      return;
    }
    const n = Number(checkedQty);
    const found = Number(threadFoundQty || 0);
    if (!n || n <= 0) {
      setError(t('সঠিক চেকড কোয়ান্টিটি দিন।', 'Enter a valid checked quantity.'));
      return;
    }
    if (found > n) {
      setError(t('থ্রেড পাওয়া কোয়ান্টিটি চেকড কোয়ান্টিটির বেশি হতে পারে না।', 'Thread-found quantity cannot exceed checked quantity.'));
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'zeroThreadReports'), {
        styleId,
        styleLabel,
        section: section || 'packing',
        date,
        checkedQty: n,
        threadFoundQty: found,
        status: found === 0 ? 'pass' : 'fail',
        remarks: remarks || '',
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      setCheckedQty('');
      setThreadFoundQty('0');
      setRemarks('');
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(r) {
    const ok = window.confirm(t('এই রিপোর্টটি মুছে ফেলতে চান?', 'Delete this report?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'zeroThreadReports', r.id));
  }

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'section', label: t('সেকশন', 'Section') },
    { key: 'checkedQty', label: t('চেকড কোয়ান্টিটি', 'Checked Qty') },
    { key: 'threadFoundQty', label: t('থ্রেড পাওয়া গেছে', 'Thread Found') },
    { key: 'status', label: t('অবস্থা', 'Status'), render: (r) => (r.status === 'pass' ? t('পাস', 'Pass') : t('ফেইল', 'Fail')) },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('জিরো থ্রেড রিপোর্ট', 'Zero Thread Report')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('প্যাকিং-পূর্ব জিরো-টলারেন্স থ্রেড/কন্টামিনেশন চেক — যেকোনো থ্রেড পাওয়া গেলে সেই এন্ট্রি ফেইল হিসেবে চিহ্নিত হবে।', 'Pre-packing zero-tolerance thread/contamination check — any thread found marks the entry as a fail.')}
          </p>
        </div>
        <Link to="/quality" className="text-sm font-medium text-indigo hover:underline">
          {t('ড্যাশবোর্ড', 'Dashboard')}
        </Link>
      </div>

      {can(profile?.role, 'quality:entry') && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('স্টাইল *', 'Style *')}>
              <StyleSearchSelect
                value={styleId}
                onChange={(id, style) => {
                  setStyleId(id);
                  setStyleLabel(style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '');
                }}
              />
            </Field>
            <Field label={t('সেকশন', 'Section')}>
              <select value={section} onChange={(e) => setSection(e.target.value)} className={inputClass}>
                <option value="">{t('প্যাকিং (ডিফল্ট)', 'Packing (default)')}</option>
                {allowedSections.map((s) => (
                  <option key={s.key} value={s.key}>
                    {lang === 'en' ? s.labelEn : s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('তারিখ', 'Date')}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('মোট চেকড কোয়ান্টিটি *', 'Total Checked Quantity *')}>
              <input type="number" min="1" value={checkedQty} onChange={(e) => setCheckedQty(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('থ্রেড/দূষণ পাওয়া গেছে (পিস)', 'Thread/Contamination Found (pcs)')}>
              <input type="number" min="0" value={threadFoundQty} onChange={(e) => setThreadFoundQty(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label={t('মন্তব্য', 'Remarks')}>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
          </Field>
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('রিপোর্ট সেভ করুন', 'Save Report')}
          </button>
        </form>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সব রিপোর্ট', 'All Reports')}</h2>
          <ExportBar
            small
            title={t('জিরো থ্রেড রিপোর্ট', 'Zero Thread Report')}
            filename="zero-thread-report"
            columns={exportColumns}
            rows={reports || []}
          />
        </div>
        {reports === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : reports.length === 0 ? (
          <EmptyState title={t('এখনো কোনো রিপোর্ট নেই', 'No reports yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('চেকড', 'Checked')}</th>
                  <th className="py-2 pr-4 font-medium">{t('থ্রেড পাওয়া গেছে', 'Thread Found')}</th>
                  <th className="py-2 pr-4 font-medium">{t('অবস্থা', 'Status')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{r.date}</td>
                    <td className="py-2 pr-4 text-ink">{r.styleLabel}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.checkedQty}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.threadFoundQty}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={r.status === 'pass' ? 'green' : 'red'}>
                        {r.status === 'pass' ? t('পাস', 'Pass') : t('ফেইল', 'Fail')}
                      </Pill>
                    </td>
                    <td className="py-2 pr-4">
                      {profile?.role === 'admin' && (
                        <button onClick={() => handleDelete(r)} className="text-red hover:opacity-70">
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
    </div>
  );
}
