import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Gauge, Trash2, Pencil } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { STAGES, can, hasAreaAdmin, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Efficiency traffic-light — same idea as quality's pass-rate tone, just
// with IE's own thresholds (efficiency is usually judged more loosely than
// quality pass rate).
function efficiencyTone(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'grey';
  if (pct >= 90) return 'green';
  if (pct >= 75) return 'amber';
  return 'red';
}

const TONE_CLASSES = {
  green: 'text-green bg-green-soft',
  amber: 'text-amber bg-amber-soft',
  red: 'text-red bg-red-soft',
  grey: 'text-ink-soft bg-line/40',
};

// IE logs, per style + stage + date: SMV (standard minute value),
// manpower, working hours and a target efficiency % — from which the
// target quantity is calculated. Actual output for that same
// style/stage/date is pulled automatically from Production Entry (already
// being logged by Production anyway), so IE doesn't have to re-type it,
// and the achieved efficiency is calculated and colour-coded immediately.
export default function IEDashboard() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [records, setRecords] = useState(null);
  const [productionEntries, setProductionEntries] = useState([]);
  const [allRecords, setAllRecords] = useState(null);

  const [form, setForm] = useState({
    date: today(),
    stage: 'knitting',
    smv: '',
    manpower: '',
    workingHours: '8',
    targetEfficiencyPct: '80',
    notes: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const [buyerFilter, setBuyerFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const canEnter = can(profile?.role, 'ie:entry') || hasAreaAdmin(profile, 'production');

  useEffect(() => {
    if (!styleId) {
      setStyle(null);
      setRecords(null);
      setProductionEntries([]);
      return;
    }
    const unsub = onSnapshot(doc(db, 'styles', styleId), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [styleId]);

  useEffect(() => {
    if (!styleId) return;
    const q = query(collection(db, 'styles', styleId, 'ieRecords'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  useEffect(() => {
    if (!styleId) return;
    const q = query(collection(db, 'styles', styleId, 'productionEntries'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setProductionEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  // Cross-style report — every IE record from every style, in one place.
  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'ieRecords'), orderBy('date', 'desc')), (snap) =>
      setAllRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  const buyers = useMemo(() => {
    const set = new Set((allRecords || []).map((r) => r.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [allRecords]);

  const filteredAllRecords = (allRecords || []).filter(
    (r) =>
      (buyerFilter === 'all' || r.buyer === buyerFilter) &&
      (stageFilter === 'all' || r.stage === stageFilter) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to)
  );

  // Live actual-output suggestion for whatever the form's stage+date is
  // currently set to, summed from this style's Production Entries.
  const suggestedActual = useMemo(() => {
    return productionEntries
      .filter((e) => e.stage === form.stage && e.date === form.date)
      .reduce((sum, e) => sum + Number(e.quantity || 0), 0);
  }, [productionEntries, form.stage, form.date]);

  const smv = Number(form.smv) || 0;
  const manpower = Number(form.manpower) || 0;
  const workingHours = Number(form.workingHours) || 0;
  const targetEfficiencyPct = Number(form.targetEfficiencyPct) || 0;
  const workingMinutes = manpower * workingHours * 60;
  const standardTargetQty = smv > 0 ? workingMinutes / smv : 0; // at 100% efficiency
  const targetQty = standardTargetQty * (targetEfficiencyPct / 100);
  const achievedEfficiencyPct = smv > 0 && workingMinutes > 0 ? (suggestedActual * smv * 100) / workingMinutes : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!smv || !manpower || !workingHours) {
      setError(t('SMV, জনবল ও কর্মঘণ্টা দিন।', 'Enter SMV, manpower, and working hours.'));
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'styles', styleId, 'ieRecords'), {
        styleNo: style?.styleNo || '',
        styleName: style?.styleName || '',
        buyer: style?.buyer || '',
        date: form.date,
        stage: form.stage,
        smv,
        manpower,
        workingHours,
        targetEfficiencyPct,
        standardTargetQty: Number(standardTargetQty.toFixed(2)),
        targetQty: Number(targetQty.toFixed(2)),
        actualQty: suggestedActual,
        achievedEfficiencyPct: achievedEfficiencyPct === null ? null : Number(achievedEfficiencyPct.toFixed(1)),
        notes: form.notes || '',
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      setForm((f) => ({ ...f, smv: '', manpower: '', notes: '' }));
    } catch (err) {
      setError(t('সেভ করা যায়নি, আবার চেষ্টা করুন।', 'Could not save, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rec) {
    const ok = window.confirm(t('এই IE রেকর্ড মুছে ফেলতে চান?', 'Delete this IE record?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', rec.styleId || styleId, 'ieRecords', rec.id));
  }

  const styleColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'stage', label: t('স্টেজ', 'Stage'), render: (r) => stageLabel(r.stage, lang) },
    { key: 'smv', label: 'SMV' },
    { key: 'manpower', label: t('জনবল', 'Manpower') },
    { key: 'workingHours', label: t('কর্মঘণ্টা', 'Working Hours') },
    { key: 'targetEfficiencyPct', label: t('টার্গেট দক্ষতা %', 'Target Efficiency %') },
    { key: 'targetQty', label: t('টার্গেট কোয়ান্টিটি', 'Target Qty') },
    { key: 'actualQty', label: t('অ্যাকচুয়াল কোয়ান্টিটি', 'Actual Qty') },
    { key: 'achievedEfficiencyPct', label: t('অর্জিত দক্ষতা %', 'Achieved Efficiency %') },
    { key: 'notes', label: t('নোট', 'Notes') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  const allColumns = [
    { key: 'styleNo', label: t('স্টাইল', 'Style') },
    { key: 'buyer', label: t('বায়ার', 'Buyer') },
    { key: 'stage', label: t('স্টেজ', 'Stage'), render: (r) => stageLabel(r.stage, lang) },
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'smv', label: 'SMV' },
    { key: 'targetQty', label: t('টার্গেট', 'Target') },
    { key: 'actualQty', label: t('অ্যাকচুয়াল', 'Actual') },
    { key: 'achievedEfficiencyPct', label: t('দক্ষতা %', 'Efficiency %') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {t('IE — টার্গেট ও দক্ষতা ট্র্যাকিং', 'IE — Target & Efficiency Tracking')}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'প্রতিটা স্টাইলের প্রতিটা স্টেজে SMV, জনবল ও কর্মঘণ্টা দিয়ে টার্গেট বসান — অ্যাকচুয়াল আউটপুট প্রোডাকশন এন্ট্রি থেকে অটো বসবে, দক্ষতা নিজে থেকে ক্যালকুলেট হবে।',
            'Enter SMV, manpower and working hours for any style/stage to set the target — actual output is auto-pulled from Production Entry, and efficiency is calculated automatically.'
          )}
        </p>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-ink">
          <Gauge size={16} /> {t('নির্দিষ্ট স্টাইলের জন্য এন্ট্রি', 'Log Entry for a Style')}
        </h2>
        <div className="max-w-md">
          <StyleSearchSelect value={styleId} onChange={(id) => setStyleId(id)} />
        </div>

        {style && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line bg-paper p-3 text-sm">
              <span className="font-medium text-ink">
                {style.styleNo} {style.styleName && `— ${style.styleName}`} · {style.buyer}
              </span>
            </div>

            {canEnter && (
              <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-paper/50 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('তারিখ', 'Date')}>
                    <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('স্টেজ', 'Stage')}>
                    <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} className={inputClass}>
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>{t(s.label, s.labelEn)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('SMV (মিনিট) *', 'SMV (minutes) *')}>
                    <input type="number" min="0" step="0.01" value={form.smv} onChange={(e) => setForm((f) => ({ ...f, smv: e.target.value }))} className={inputClass} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('জনবল *', 'Manpower *')}>
                    <input type="number" min="0" value={form.manpower} onChange={(e) => setForm((f) => ({ ...f, manpower: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('কর্মঘণ্টা/দিন *', 'Working Hours/Day *')}>
                    <input type="number" min="0" step="0.5" value={form.workingHours} onChange={(e) => setForm((f) => ({ ...f, workingHours: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('টার্গেট দক্ষতা %', 'Target Efficiency %')}>
                    <input type="number" min="0" max="100" value={form.targetEfficiencyPct} onChange={(e) => setForm((f) => ({ ...f, targetEfficiencyPct: e.target.value }))} className={inputClass} />
                  </Field>
                </div>

                {smv > 0 && manpower > 0 && workingHours > 0 && (
                  <div className="grid grid-cols-2 gap-3 rounded-md border border-indigo/30 bg-indigo-soft/40 p-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-ink-soft">{t('স্ট্যান্ডার্ড টার্গেট (১০০%)', 'Standard Target (100%)')}</p>
                      <p className="font-semibold text-ink">{standardTargetQty.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">{t('টার্গেট', 'Target')} ({targetEfficiencyPct}%)</p>
                      <p className="font-semibold text-indigo">{targetQty.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">{t('অ্যাকচুয়াল (অটো)', 'Actual (auto)')}</p>
                      <p className="font-semibold text-ink">{suggestedActual.toLocaleString('en-US')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">{t('অর্জিত দক্ষতা', 'Achieved Efficiency')}</p>
                      <p className={`inline-block rounded px-1.5 font-semibold ${TONE_CLASSES[efficiencyTone(achievedEfficiencyPct)]}`}>
                        {achievedEfficiencyPct === null ? '—' : `${achievedEfficiencyPct.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                )}

                <Field label={t('নোট (ঐচ্ছিক)', 'Notes (optional)')}>
                  <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputClass} />
                </Field>
                {error && <p className="text-sm text-red">{error}</p>}
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('IE এন্ট্রি সেভ করুন', 'Save IE Entry')}
                </button>
              </form>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {t('এই স্টাইলের IE ইতিহাস', "This Style's IE History")}
                </h3>
                <ExportBar
                  small
                  title={t('IE রিপোর্ট', 'IE Report')}
                  subtitle={`${style.styleNo} · ${style.buyer}`}
                  filename={`ie-report-${style.styleNo}`}
                  columns={styleColumns}
                  rows={records || []}
                />
              </div>
              {records === null ? (
                <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
              ) : records.length === 0 ? (
                <EmptyState title={t('এখনো কোনো IE এন্ট্রি নেই', 'No IE entries yet')} />
              ) : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-ink-soft">
                        <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                        <th className="py-2 pr-4 font-medium">{t('স্টেজ', 'Stage')}</th>
                        <th className="py-2 pr-4 font-medium">SMV</th>
                        <th className="py-2 pr-4 font-medium">{t('টার্গেট', 'Target')}</th>
                        <th className="py-2 pr-4 font-medium">{t('অ্যাকচুয়াল', 'Actual')}</th>
                        <th className="py-2 pr-4 font-medium">{t('দক্ষতা', 'Efficiency')}</th>
                        <th className="py-2 pr-4 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-4 text-ink-soft">{r.date}</td>
                          <td className="py-2 pr-4 text-ink">{stageLabel(r.stage, lang)}</td>
                          <td className="py-2 pr-4 text-ink-soft">{r.smv}</td>
                          <td className="py-2 pr-4 text-ink-soft">{r.targetQty}</td>
                          <td className="py-2 pr-4 text-ink-soft">{r.actualQty}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-block rounded px-1.5 text-xs font-semibold ${TONE_CLASSES[efficiencyTone(r.achievedEfficiencyPct)]}`}>
                              {r.achievedEfficiencyPct === null || r.achievedEfficiencyPct === undefined ? '—' : `${r.achievedEfficiencyPct}%`}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              {canEnter && (
                                <button onClick={() => setEditingRecord({ ...r, styleId })} className="text-indigo hover:opacity-70">
                                  <Pencil size={14} />
                                </button>
                              )}
                              {(hasAreaAdmin(profile, 'production') || profile?.role === 'admin') && (
                                <button onClick={() => handleDelete({ ...r, styleId })} className="text-red hover:opacity-70">
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
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সব স্টাইলের IE রিপোর্ট', 'All-Styles IE Report')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className={`${inputClass} !w-auto text-xs`}>
              <option value="all">{t('সব বায়ার', 'All Buyers')}</option>
              {buyers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={`${inputClass} !w-auto text-xs`}>
              <option value="all">{t('সব স্টেজ', 'All Stages')}</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{t(s.label, s.labelEn)}</option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} !w-auto text-xs`} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} !w-auto text-xs`} />
            <ExportBar
              small
              title={t('সব স্টাইলের IE রিপোর্ট', 'All-Styles IE Report')}
              filename="all-styles-ie-report"
              columns={allColumns}
              rows={filteredAllRecords}
            />
          </div>
        </div>
        {allRecords === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : filteredAllRecords.length === 0 ? (
          <EmptyState title={t('এখনো কোনো IE ডেটা নেই', 'No IE data yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('বায়ার', 'Buyer')}</th>
                  <th className="py-2 pr-4 font-medium">{t('স্টেজ', 'Stage')}</th>
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('টার্গেট', 'Target')}</th>
                  <th className="py-2 pr-4 font-medium">{t('অ্যাকচুয়াল', 'Actual')}</th>
                  <th className="py-2 pr-4 font-medium">{t('দক্ষতা', 'Efficiency')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllRecords.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{r.styleNo}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.buyer}</td>
                    <td className="py-2 pr-4 text-ink-soft">{stageLabel(r.stage, lang)}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.date}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.targetQty}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.actualQty}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block rounded px-1.5 text-xs font-semibold ${TONE_CLASSES[efficiencyTone(r.achievedEfficiencyPct)]}`}>
                        {r.achievedEfficiencyPct === null || r.achievedEfficiencyPct === undefined ? '—' : `${r.achievedEfficiencyPct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingRecord && <EditIERecordModal record={editingRecord} onClose={() => setEditingRecord(null)} />}
    </div>
  );
}

function EditIERecordModal({ record, onClose }) {
  const { t } = useLang();
  const [smv, setSmv] = useState(String(record.smv));
  const [manpower, setManpower] = useState(String(record.manpower));
  const [workingHours, setWorkingHours] = useState(String(record.workingHours));
  const [targetEfficiencyPct, setTargetEfficiencyPct] = useState(String(record.targetEfficiencyPct));
  const [actualQty, setActualQty] = useState(String(record.actualQty ?? 0));
  const [notes, setNotes] = useState(record.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const s = Number(smv);
    const m = Number(manpower);
    const wh = Number(workingHours);
    const te = Number(targetEfficiencyPct);
    const a = Number(actualQty);
    if (!s || !m || !wh) {
      setError(t('SMV, জনবল ও কর্মঘণ্টা সঠিকভাবে দিন।', 'Enter SMV, manpower and working hours correctly.'));
      return;
    }
    const workingMinutes = m * wh * 60;
    const standardTargetQty = workingMinutes / s;
    const targetQty = standardTargetQty * (te / 100);
    const achievedEfficiencyPct = workingMinutes > 0 ? (a * s * 100) / workingMinutes : null;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', record.styleId, 'ieRecords', record.id), {
        smv: s,
        manpower: m,
        workingHours: wh,
        targetEfficiencyPct: te,
        standardTargetQty: Number(standardTargetQty.toFixed(2)),
        targetQty: Number(targetQty.toFixed(2)),
        actualQty: a,
        achievedEfficiencyPct: achievedEfficiencyPct === null ? null : Number(achievedEfficiencyPct.toFixed(1)),
        notes,
      });
      onClose();
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('IE রেকর্ড এডিট করুন', 'Edit IE Record')} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="SMV *">
            <input type="number" min="0" step="0.01" className={inputClass} value={smv} onChange={(e) => setSmv(e.target.value)} />
          </Field>
          <Field label={t('জনবল *', 'Manpower *')}>
            <input type="number" min="0" className={inputClass} value={manpower} onChange={(e) => setManpower(e.target.value)} />
          </Field>
          <Field label={t('কর্মঘণ্টা *', 'Working Hours *')}>
            <input type="number" min="0" step="0.5" className={inputClass} value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </Field>
          <Field label={t('টার্গেট দক্ষতা %', 'Target Efficiency %')}>
            <input type="number" min="0" max="100" className={inputClass} value={targetEfficiencyPct} onChange={(e) => setTargetEfficiencyPct(e.target.value)} />
          </Field>
          <Field label={t('অ্যাকচুয়াল কোয়ান্টিটি', 'Actual Quantity')}>
            <input type="number" min="0" className={inputClass} value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
          </Field>
        </div>
        <Field label={t('নোট', 'Notes')}>
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('সেভ করুন', 'Save')}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            {t('বাতিল', 'Cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
