import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary } from '../../components/ui';
import { ITEM_TYPES, COMMON_UNITS, YARN_UNIT, ACCESSORY_NAME_SUGGESTIONS } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function NewItem() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    type: 'yarn',
    unit: YARN_UNIT,
    spec: '',
    supplier: '',
    reorderLevel: '',
    openingStock: '0',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'type') next.unit = value === 'yarn' ? YARN_UNIT : 'pcs';
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.unit) {
      setError(t('নাম এবং একক আবশ্যক।', 'Name and unit are required.'));
      return;
    }
    setBusy(true);
    try {
      const docRef = await addDoc(collection(db, 'inventoryItems'), {
        name: form.name,
        type: form.type,
        unit: form.unit,
        spec: form.spec || '',
        supplier: form.supplier || '',
        reorderLevel: Number(form.reorderLevel || 0),
        currentStock: Number(form.openingStock || 0),
        createdAt: serverTimestamp(),
        createdBy: profile?.name || user?.email,
      });
      if (Number(form.openingStock || 0) > 0) {
        await addDoc(collection(db, 'inventoryItems', docRef.id, 'transactions'), {
          type: 'in',
          quantity: Number(form.openingStock),
          note: t('ওপেনিং স্টক', 'Opening stock'),
          date: new Date().toISOString().slice(0, 10),
          enteredBy: profile?.name || user?.email,
          createdAt: serverTimestamp(),
        });
      }
      navigate(`/inventory/${docRef.id}`);
    } catch (err) {
      setError(t('আইটেম তৈরি করা যায়নি, আবার চেষ্টা করুন।', 'Could not create item, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('নতুন আইটেম', 'New Item')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('ইয়ার্ন অথবা এক্সেসরিজ আইটেম যোগ করুন।', 'Add a yarn or accessory item.')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('নাম *', 'Name *')}>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              list={form.type === 'accessory' ? 'accessory-name-suggestions' : undefined}
              placeholder={form.type === 'accessory' ? t('যেমন: মেইন লেবেল', 'e.g. Main Label') : ''}
            />
            {form.type === 'accessory' && (
              <datalist id="accessory-name-suggestions">
                {ACCESSORY_NAME_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </Field>
          <Field label={t('ধরন', 'Type')}>
            <select className={inputClass} value={form.type} onChange={(e) => update('type', e.target.value)}>
              {ITEM_TYPES.map((tp) => (
                <option key={tp.key} value={tp.key}>
                  {t(tp.label, tp.labelEn)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('একক', 'Unit')}>
            {form.type === 'yarn' ? (
              <input className={`${inputClass} bg-paper`} value="lb" disabled />
            ) : (
              <select className={inputClass} value={form.unit} onChange={(e) => update('unit', e.target.value)}>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('কালার / স্পেক', 'Colour / Spec')}>
            <input className={inputClass} value={form.spec} onChange={(e) => update('spec', e.target.value)} />
          </Field>
          <Field label={t('সাপ্লায়ার', 'Supplier')}>
            <input
              className={inputClass}
              value={form.supplier}
              onChange={(e) => update('supplier', e.target.value)}
            />
          </Field>
          <Field label={t('রি-অর্ডার লেভেল', 'Reorder Level')}>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.reorderLevel}
              onChange={(e) => update('reorderLevel', e.target.value)}
            />
          </Field>
          <Field label={t('ওপেনিং স্টক', 'Opening Stock')}>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.openingStock}
              onChange={(e) => update('openingStock', e.target.value)}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t('তৈরি হচ্ছে…', 'Creating…') : t('আইটেম তৈরি করুন', 'Create Item')}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            {t('বাতিল', 'Cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
