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
  updateDoc,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Pill, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, STAGES, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

// Zero Thread is a daily checkpoint done PER SECTION (not tied to any one
// style): a fixed sample (80 pcs by default) is inspected every day, per
// section, for loose-thread and uncut-thread defects. The combined defect
// count decides a traffic-light status for that day + section:
//   0-4  -> green   5-8 -> yellow   9+  -> red
const GREEN_MAX = 4;
const YELLOW_MAX = 8;

function statusFor(total) {
  if (total <= GREEN_MAX) return 'green';
  if (total <= YELLOW_MAX) return 'yellow';
  return 'red';
}

const DOT_CLASS = { green: 'bg-green', yellow: 'bg-amber', red: 'bg-red' };
const STATUS_TONE = { green: 'green', yellow: 'amber', red: 'red' };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dateKey(date, section) {
  return `${date}__${section}`;
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const BLANK = { date: todayStr(), section: STAGES[0].key, checkedQty: '80', looseThreadQty: '0', uncutThreadQty: '0', remarks: '' };

export default function ZeroThreadReport() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();

  const [reports, setReports] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [calendarSection, setCalendarSection] = useState(STAGES[0].key);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [tableSection, setTableSection] = useState('all');

  const canEnter = can(profile?.role, 'quality:entry');

  useEffect(() => {
    const q = query(collection(db, 'zeroThreadReports'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const byKey = useMemo(() => {
    const map = new Map();
    (reports || []).forEach((r) => map.set(dateKey(r.date, r.section || STAGES[0].key), r));
    return map;
  }, [reports]);

  const filtered = useMemo(() => {
    let rows = reports || [];
    if (tableSection !== 'all') rows = rows.filter((r) => (r.section || STAGES[0].key) === tableSection);
    if (rangeFrom || rangeTo) rows = rows.filter((r) => (!rangeFrom || r.date >= rangeFrom) && (!rangeTo || r.date <= rangeTo));
    return rows;
  }, [reports, tableSection, rangeFrom, rangeTo]);

  function openNew(section, dateStr) {
    const existing = byKey.get(dateKey(dateStr, section));
    if (existing) return openEdit(existing);
    setEditingId(null);
    setForm({ ...BLANK, section, date: dateStr || todayStr() });
    setError('');
    setModalOpen(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm({
      date: r.date,
      section: r.section || STAGES[0].key,
      checkedQty: String(r.checkedQty),
      looseThreadQty: String(r.looseThreadQty),
      uncutThreadQty: String(r.uncutThreadQty),
      remarks: r.remarks || '',
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const checkedQty = Number(form.checkedQty);
    const loose = Number(form.looseThreadQty || 0);
    const uncut = Number(form.uncutThreadQty || 0);
    if (!form.date || !form.section) {
      setError(t('তারিখ ও সেকশন দিন।', 'Enter date and section.'));
      return;
    }
    if (!checkedQty || checkedQty <= 0) {
      setError(t('সঠিক চেকড কোয়ান্টিটি দিন।', 'Enter a valid checked quantity.'));
      return;
    }
    if (loose + uncut > checkedQty) {
      setError(t('লুজ থ্রেড + আনকাট থ্রেড মোট চেকড কোয়ান্টিটির বেশি হতে পারে না।', 'Loose + uncut thread total cannot exceed checked quantity.'));
      return;
    }
    const existing = byKey.get(dateKey(form.date, form.section));
    const targetId = editingId || (existing && existing.id) || null;
    const total = loose + uncut;
    const payload = {
      date: form.date,
      section: form.section,
      checkedQty,
      looseThreadQty: loose,
      uncutThreadQty: uncut,
      totalDefectQty: total,
      status: statusFor(total),
      remarks: form.remarks || '',
      enteredBy: profile?.name || user?.email,
    };
    setBusy(true);
    try {
      if (targetId) {
        await updateDoc(doc(db, 'zeroThreadReports', targetId), payload);
      } else {
        await addDoc(collection(db, 'zeroThreadReports'), { ...payload, createdAt: serverTimestamp() });
      }
      setModalOpen(false);
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
    { key: 'section', label: t('সেকশন', 'Section'), render: (r) => stageLabel(r.section || STAGES[0].key, lang) },
    { key: 'checkedQty', label: t('চেকড কোয়ান্টিটি', 'Checked Qty') },
    { key: 'looseThreadQty', label: t('লুজ থ্রেড', 'Loose Thread') },
    { key: 'uncutThreadQty', label: t('আনকাট থ্রেড', 'Uncut Thread') },
    { key: 'totalDefectQty', label: t('মোট', 'Total') },
    { key: 'status', label: t('অবস্থা', 'Status'), render: (r) => ({ green: t('গ্রিন', 'Green'), yellow: t('ইয়েলো', 'Yellow'), red: t('রেড', 'Red') }[r.status]) },
    { key: 'remarks', label: t('মন্তব্য', 'Remarks') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  // --- Calendar grid for the selected month + section ------------------
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = monthCursor.toLocaleDateString(lang === 'en' ? 'en-US' : 'bn-BD', { month: 'long', year: 'numeric' });
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const last14 = lastNDays(14);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('জিরো থ্রেড রিপোর্ট', 'Zero Thread Report')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t(
              'প্রতিটি সেকশনের জন্য আলাদা বোর্ড — প্রতিদিন নির্দিষ্ট সংখ্যক পিস (ডিফল্ট ৮০) চেক করে লুজ থ্রেড ও আনকাট থ্রেড গণনা করা হয়। মোট ৪ বা কম হলে গ্রিন, ৫-৮ হলে ইয়েলো, ৯ বা তার বেশি হলে রেড।',
              'A separate board per section — a fixed sample (default 80 pcs) is checked every day for loose-thread and uncut-thread defects. Total 4 or fewer is green, 5-8 is yellow, 9 or more is red.'
            )}
          </p>
        </div>
        <Link to="/quality" className="text-sm font-medium text-indigo hover:underline">
          {t('ড্যাশবোর্ড', 'Dashboard')}
        </Link>
      </div>

      {/* Per-section boards: compact 14-day colored-circle strips */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((s) => {
          const todayEntry = byKey.get(dateKey(todayStr(), s.key));
          return (
            <div key={s.key} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-ink">{lang === 'en' ? s.labelEn : s.label}</p>
                {canEnter && (
                  <button
                    onClick={() => openNew(s.key, todayStr())}
                    className="text-xs font-medium text-indigo hover:underline"
                  >
                    {todayEntry ? t('আজকেরটা দেখুন', "View today's") : t('আজকেরটা যোগ করুন', 'Log today')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {last14.map((d) => {
                  const entry = byKey.get(dateKey(d, s.key));
                  return (
                    <button
                      key={d}
                      title={`${d}${entry ? ` — ${entry.totalDefectQty} ${t('ডিফেক্ট', 'defects')}` : ''}`}
                      onClick={() => (canEnter ? openNew(s.key, d) : entry && openEdit(entry))}
                      className={`h-4 w-4 rounded-full transition-transform hover:scale-125 ${entry ? DOT_CLASS[entry.status] : 'bg-line'}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed calendar for one section at a time */}
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthCursor(new Date(year, month - 1, 1))} className="rounded-md p-1.5 hover:bg-paper">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-display text-sm font-semibold text-ink">{monthLabel}</h2>
            <button onClick={() => setMonthCursor(new Date(year, month + 1, 1))} className="rounded-md p-1.5 hover:bg-paper">
              <ChevronRight size={18} />
            </button>
          </div>
          <select value={calendarSection} onChange={(e) => setCalendarSection(e.target.value)} className={`${inputClass} !w-auto text-xs`}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : s.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-ink-soft">
          {(lang === 'en' ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি']).map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const entry = byKey.get(dateKey(dateStr, calendarSection));
            return (
              <button
                key={dateStr}
                onClick={() => (canEnter ? openNew(calendarSection, dateStr) : entry && openEdit(entry))}
                title={entry ? `${entry.totalDefectQty} ${t('ডিফেক্ট', 'defects')}` : ''}
                className="flex aspect-square items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-paper"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${entry ? `${DOT_CLASS[entry.status]} text-white` : 'text-ink-soft'}`}>
                  {d}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green" /> {t('গ্রিন: ০-৪', 'Green: 0-4')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber" /> {t('ইয়েলো: ৫-৮', 'Yellow: 5-8')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red" /> {t('রেড: ৯+', 'Red: 9+')}</span>
        </div>
      </div>

      {/* Date range + table */}
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সব রিপোর্ট', 'All Reports')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={tableSection} onChange={(e) => setTableSection(e.target.value)} className={`${inputClass} !w-auto !py-1.5 text-xs`}>
              <option value="all">{t('সব সেকশন', 'All Sections')}</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : s.label}</option>
              ))}
            </select>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={`${inputClass} !w-36 !py-1.5 text-xs`} />
            <span className="text-xs text-ink-soft">{t('থেকে', 'to')}</span>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={`${inputClass} !w-36 !py-1.5 text-xs`} />
            <ExportBar small title={t('জিরো থ্রেড রিপোর্ট', 'Zero Thread Report')} filename="zero-thread-report" columns={exportColumns} rows={filtered} />
          </div>
        </div>
        {reports === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : filtered.length === 0 ? (
          <EmptyState title={t('এখনো কোনো রিপোর্ট নেই', 'No reports yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('সেকশন', 'Section')}</th>
                  <th className="py-2 pr-4 font-medium">{t('চেকড', 'Checked')}</th>
                  <th className="py-2 pr-4 font-medium">{t('লুজ', 'Loose')}</th>
                  <th className="py-2 pr-4 font-medium">{t('আনকাট', 'Uncut')}</th>
                  <th className="py-2 pr-4 font-medium">{t('মোট', 'Total')}</th>
                  <th className="py-2 pr-4 font-medium">{t('অবস্থা', 'Status')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{r.date}</td>
                    <td className="py-2 pr-4 text-ink">{stageLabel(r.section || STAGES[0].key, lang)}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.checkedQty}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.looseThreadQty}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.uncutThreadQty}</td>
                    <td className="py-2 pr-4 font-medium text-ink">{r.totalDefectQty}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={STATUS_TONE[r.status]}>
                        {{ green: t('গ্রিন', 'Green'), yellow: t('ইয়েলো', 'Yellow'), red: t('রেড', 'Red') }[r.status]}
                      </Pill>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        {canEnter && (
                          <button onClick={() => openEdit(r)} className="text-indigo hover:opacity-70">
                            <Pencil size={14} />
                          </button>
                        )}
                        {profile?.role === 'admin' && (
                          <button onClick={() => handleDelete(r)} className="text-red hover:opacity-70">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal title={editingId ? t('এন্ট্রি এডিট করুন', 'Edit Entry') : t('নতুন এন্ট্রি', 'New Entry')} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('সেকশন *', 'Section *')}>
                <select value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} className={inputClass} disabled={!!editingId}>
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('তারিখ *', 'Date *')}>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} disabled={!!editingId} />
              </Field>
              <Field label={t('মোট চেকড কোয়ান্টিটি *', 'Total Checked Quantity *')}>
                <input type="number" min="1" value={form.checkedQty} onChange={(e) => setForm((f) => ({ ...f, checkedQty: e.target.value }))} className={inputClass} />
              </Field>
              <Field label={t('লুজ থ্রেড (পিস)', 'Loose Thread (pcs)')}>
                <input type="number" min="0" value={form.looseThreadQty} onChange={(e) => setForm((f) => ({ ...f, looseThreadQty: e.target.value }))} className={inputClass} />
              </Field>
              <Field label={t('আনকাট থ্রেড (পিস)', 'Uncut Thread (pcs)')}>
                <input type="number" min="0" value={form.uncutThreadQty} onChange={(e) => setForm((f) => ({ ...f, uncutThreadQty: e.target.value }))} className={inputClass} />
              </Field>
            </div>
            <Field label={t('মন্তব্য', 'Remarks')}>
              <input value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={inputClass} />
            </Field>
            {error && <p className="text-sm text-red">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('সেভ করুন', 'Save')}
              </button>
              <button type="button" className={btnSecondary} onClick={() => setModalOpen(false)}>
                {t('বাতিল', 'Cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
