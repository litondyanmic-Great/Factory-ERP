import { useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, TrafficLight } from '../../components/ui';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { STAGES, BLOCKS, ALL_STYLE_SENTINEL, ALL_STYLE_LABEL, canEnterSection, qualityTone } from '../../lib/constants';
import { useSectionDefects } from '../../lib/useSectionDefects';
import { useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settingsContext';

export default function QCEntry() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const { settings } = useSettings();

  const allowedSections = useMemo(() => STAGES.filter((s) => canEnterSection(profile, s.key)), [profile]);

  const [styleId, setStyleId] = useState('');
  const [styleLabel, setStyleLabel] = useState('');
  const [block, setBlock] = useState(BLOCKS[0]);
  const [section, setSection] = useState(allowedSections[0]?.key || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkedQty, setCheckedQty] = useState('');
  const [defectValues, setDefectValues] = useState({});
  const [remarks, setRemarks] = useState('');
  const [newDefectLabel, setNewDefectLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { defects: sectionDefects, addCustomDefect } = useSectionDefects(section);

  const totalDefects = Object.values(defectValues).reduce((s, v) => s + (Number(v) || 0), 0);
  const passRate =
    checkedQty && Number(checkedQty) > 0
      ? Math.max(0, ((Number(checkedQty) - totalDefects) / Number(checkedQty)) * 100)
      : null;
  const tone = qualityTone(passRate, settings);

  function updateDefect(key, value) {
    setDefectValues((d) => ({ ...d, [key]: value }));
  }

  async function handleAddCustomDefect() {
    const entry = await addCustomDefect(newDefectLabel);
    if (entry) setNewDefectLabel('');
  }

  function pickStyle(id, style) {
    if (id === ALL_STYLE_SENTINEL) {
      setStyleId(ALL_STYLE_SENTINEL);
      setStyleLabel(t(ALL_STYLE_LABEL.bn, ALL_STYLE_LABEL.en));
    } else {
      setStyleId(id);
      setStyleLabel(style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!styleId) {
      setError(t('একটি স্টাইল নির্বাচন করুন (অথবা "সব স্টাইল" বেছে নিন)।', 'Select a style (or choose "All Style").'));
      return;
    }
    if (!section || !canEnterSection(profile, section)) {
      setError(t('এই সেকশনে এন্ট্রি দেওয়ার অনুমতি নেই।', 'You are not permitted to enter data for this section.'));
      return;
    }
    const n = Number(checkedQty);
    if (!n || n <= 0) {
      setError(t('সঠিক চেকড কোয়ান্টিটি দিন।', 'Enter a valid checked quantity.'));
      return;
    }
    if (totalDefects > n) {
      setError(t('ডিফেক্ট কোয়ান্টিটি চেকড কোয়ান্টিটির বেশি হতে পারে না।', 'Defect quantity cannot exceed checked quantity.'));
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'qualityChecks'), {
        styleId,
        styleLabel,
        block,
        section,
        date,
        checkedQty: n,
        defectQty: totalDefects,
        passRate: Math.round(((n - totalDefects) / n) * 1000) / 10,
        defects: Object.fromEntries(
          Object.entries(defectValues)
            .filter(([, v]) => Number(v) > 0)
            .map(([k, v]) => [k, Number(v)])
        ),
        defectLabels: Object.fromEntries(sectionDefects.map((d) => [d.key, d.label])),
        remarks: remarks || '',
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      setSuccess(t('QC এন্ট্রি সেভ হয়েছে।', 'QC entry saved.'));
      setCheckedQty('');
      setDefectValues({});
      setRemarks('');
    } catch (err) {
      setError(t('এন্ট্রি সেভ করা যায়নি।', 'Could not save entry.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('দৈনিক কোয়ালিটি চেক এন্ট্রি', 'Daily Quality Check Entry')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('প্রতিটি সেকশনের দৈনিক চেকড ও ডিফেক্ট কোয়ান্টিটি এন্ট্রি দিন — পাস রেট থেকে ট্রাফিক-লাইট স্বয়ংক্রিয়ভাবে হিসাব হবে।', 'Enter daily checked and defect quantities per section — the traffic light is calculated automatically from pass rate.')}
          </p>
        </div>
        <Link to="/quality" className="text-sm font-medium text-indigo hover:underline">
          {t('ড্যাশবোর্ড', 'Dashboard')}
        </Link>
      </div>

      {allowedSections.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-soft">
          {t(
            'আপনাকে এখনো কোনো সেকশন এসাইন করা হয়নি। অ্যাডমিনকে বলুন Admin > User Management থেকে আপনার সেকশন ঠিক করে দিতে।',
            'No section has been assigned to you yet. Ask an admin to set your section under Admin > User Management.'
          )}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('স্টাইল *', 'Style *')}>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => pickStyle(ALL_STYLE_SENTINEL)}
                  className={`w-full rounded-md border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                    styleId === ALL_STYLE_SENTINEL
                      ? 'border-indigo bg-indigo text-white'
                      : 'border-line bg-paper text-ink-soft hover:bg-line/40'
                  }`}
                >
                  {t(ALL_STYLE_LABEL.bn, ALL_STYLE_LABEL.en)} — {t('মিক্সড লট চেক', 'mixed-lot check')}
                </button>
                {styleId !== ALL_STYLE_SENTINEL && (
                  <StyleSearchSelect value={styleId} onChange={pickStyle} />
                )}
              </div>
            </Field>
            <Field label={t('ব্লক', 'Block')}>
              <select value={block} onChange={(e) => setBlock(e.target.value)} className={inputClass}>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {t('ব্লক', 'Block')} {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('সেকশন *', 'Section *')}>
              <select value={section} onChange={(e) => setSection(e.target.value)} className={inputClass}>
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
              <input
                type="number"
                min="1"
                value={checkedQty}
                onChange={(e) => setCheckedQty(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t('ডিফেক্ট ব্রেকডাউন (ঐচ্ছিক)', 'Defect Breakdown (optional)')}</p>
            {sectionDefects.length === 0 ? (
              <p className="text-xs text-ink-soft">{t('এই সেকশনের জন্য এখনো কোনো ডিফেক্ট তালিকা নেই — নিচ থেকে যোগ করুন।', 'No defect list for this section yet — add one below.')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sectionDefects.map((d) => (
                  <Field key={d.key} label={d.label}>
                    <input
                      type="number"
                      min="0"
                      value={defectValues[d.key] || ''}
                      onChange={(e) => updateDefect(d.key, e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
              <Field label={t('নতুন ডিফেক্ট যোগ করুন', 'Add a new defect')}>
                <input
                  value={newDefectLabel}
                  onChange={(e) => setNewDefectLabel(e.target.value)}
                  placeholder={t('যেমন: ওয়াশ কালার ফেইড', 'e.g. Wash Colour Fade')}
                  className={inputClass}
                />
              </Field>
              <button type="button" onClick={handleAddCustomDefect} className={`${btnSecondary} shrink-0`}>
                <Plus size={15} /> {t('যোগ করুন', 'Add')}
              </button>
            </div>
          </div>

          <Field label={t('মন্তব্য', 'Remarks')}>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={inputClass} />
          </Field>

          {checkedQty && (
            <div className="flex items-center gap-3 rounded-md border border-line bg-paper/60 px-4 py-3">
              <TrafficLight tone={tone} size={14} />
              <span className="text-sm text-ink">
                {t('পাস রেট', 'Pass Rate')}: <span className="font-semibold">{passRate?.toFixed(1)}%</span>
              </span>
              <span className="text-xs text-ink-soft">
                ({t('মোট ডিফেক্ট', 'Total Defects')}: {totalDefects})
              </span>
            </div>
          )}

          {error && <p className="text-sm text-red">{error}</p>}
          {success && <p className="text-sm text-green">{success}</p>}

          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('QC এন্ট্রি সেভ করুন', 'Save QC Entry')}
          </button>
        </form>
      )}
    </div>
  );
}
