import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Upload, Save } from 'lucide-react';
import { db } from '../../firebase';
import { useSettings } from '../../lib/settingsContext';
import { useLang } from '../../lib/i18n';
import { fileToCompressedDataUrl } from '../../lib/imageUtils';
import { Field, inputClass, btnPrimary } from '../../components/ui';

export default function Settings() {
  const { settings } = useSettings();
  const { t } = useLang();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function handleLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 300, 0.85);
      update('logoDataUrl', dataUrl);
    } catch {
      setError(t('লোগো আপলোড করা যায়নি।', 'Could not upload logo.'));
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await setDoc(
        doc(db, 'settings', 'company'),
        {
          companyName: form.companyName || '',
          companyNameEn: form.companyNameEn || '',
          address: form.address || '',
          phone: form.phone || '',
          logoDataUrl: form.logoDataUrl || '',
          defaultLanguage: form.defaultLanguage || 'bn',
          qualityGreenThreshold: Number(form.qualityGreenThreshold ?? 95),
          qualityYellowThreshold: Number(form.qualityYellowThreshold ?? 90),
        },
        { merge: true }
      );
      setSaved(true);
    } catch (err) {
      setError(t('সেভ করা যায়নি, আবার চেষ্টা করুন।', 'Could not save, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('সেটিংস', 'Settings')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'কোম্পানির নাম, লোগো, ভাষা এবং কোয়ালিটির থ্রেশহোল্ড এখান থেকে কাস্টমাইজ করুন — সব রিপোর্টের হেডলাইনে এই তথ্যই ব্যবহার হবে।',
            'Customize your company name, logo, language and quality thresholds here — every report headline uses this information.'
          )}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5 rounded-lg border border-line bg-surface p-6">
        <div>
          <span className="mb-2 block text-sm font-medium text-ink">{t('লোগো', 'Logo')}</span>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
              {form?.logoDataUrl ? (
                <img src={form.logoDataUrl} alt="logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-ink-soft">{t('নেই', 'None')}</span>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper">
              <Upload size={15} /> {t('লোগো আপলোড করুন', 'Upload logo')}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('কোম্পানির নাম (বাংলা)', 'Company name (Bangla)')}>
            <input
              className={inputClass}
              value={form?.companyName || ''}
              onChange={(e) => update('companyName', e.target.value)}
            />
          </Field>
          <Field label={t('কোম্পানির নাম (English)', 'Company name (English)')}>
            <input
              className={inputClass}
              value={form?.companyNameEn || ''}
              onChange={(e) => update('companyNameEn', e.target.value)}
            />
          </Field>
          <Field label={t('ঠিকানা', 'Address')}>
            <input
              className={inputClass}
              value={form?.address || ''}
              onChange={(e) => update('address', e.target.value)}
            />
          </Field>
          <Field label={t('ফোন', 'Phone')}>
            <input
              className={inputClass}
              value={form?.phone || ''}
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field label={t('প্রধান ভাষা (ডিফল্ট)', 'Main language (default)')}>
            <select
              className={inputClass}
              value={form?.defaultLanguage || 'bn'}
              onChange={(e) => update('defaultLanguage', e.target.value)}
            >
              <option value="bn">বাংলা (Bangla)</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-medium text-ink">
            {t('কোয়ালিটি ট্রাফিক-লাইট থ্রেশহোল্ড (%)', 'Quality traffic-light thresholds (%)')}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('সবুজ (এই বা বেশি পাস রেট)', 'Green (pass rate at or above)')}>
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={form?.qualityGreenThreshold ?? 95}
                onChange={(e) => update('qualityGreenThreshold', e.target.value)}
              />
            </Field>
            <Field label={t('হলুদ (এই বা বেশি পাস রেট)', 'Yellow (pass rate at or above)')}>
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={form?.qualityYellowThreshold ?? 90}
                onChange={(e) => update('qualityYellowThreshold', e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {t(
              'এর নিচের পাস রেট লাল হিসেবে দেখানো হবে।',
              'Pass rates below the yellow threshold are shown as red.'
            )}
          </p>
        </div>

        {error && <p className="text-sm text-red">{error}</p>}
        {saved && <p className="text-sm text-green">{t('সেভ হয়েছে।', 'Saved.')}</p>}

        <button type="submit" disabled={busy} className={btnPrimary}>
          <Save size={16} /> {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('সেভ করুন', 'Save')}
        </button>
      </form>

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-sm font-semibold text-ink">{t('ডেটা ক্লিনআপ', 'Data Cleanup')}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'ডিলিট হওয়া স্টাইলের কোনো পুরনো ডেটা (ইয়ার্ন/এক্সেসরিজ লেজার, প্রোডাকশন এন্ট্রি) এখনো ডাটাবেজে থেকে গেলে সেগুলো খুঁজে মুছে ফেলুন।',
            'Find and remove any leftover data (yarn/accessory ledger, production entries) from styles that were deleted.'
          )}
        </p>
        <Link to="/admin/data-cleanup" className="mt-3 inline-block text-sm font-medium text-indigo hover:underline">
          {t('ডেটা ক্লিনআপ পাতায় যান →', 'Go to Data Cleanup →')}
        </Link>
      </div>
    </div>
  );
}
