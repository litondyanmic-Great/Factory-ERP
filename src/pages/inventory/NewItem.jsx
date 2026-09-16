import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary } from '../../components/ui';
import { ITEM_TYPES } from '../../lib/constants';

export default function NewItem() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    type: 'yarn',
    unit: 'kg',
    spec: '',
    supplier: '',
    reorderLevel: '',
    openingStock: '0',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.unit) {
      setError('নাম এবং একক আবশ্যক।');
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
          note: 'ওপেনিং স্টক',
          date: new Date().toISOString().slice(0, 10),
          enteredBy: profile?.name || user?.email,
          createdAt: serverTimestamp(),
        });
      }
      navigate(`/inventory/${docRef.id}`);
    } catch (err) {
      setError('আইটেম তৈরি করা যায়নি, আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">নতুন আইটেম</h1>
        <p className="mt-1 text-sm text-ink-soft">ইয়ার্ন অথবা এক্সেসরিজ আইটেম যোগ করুন।</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="নাম *">
            <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="ধরন">
            <select className={inputClass} value={form.type} onChange={(e) => update('type', e.target.value)}>
              {ITEM_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="একক (kg/pcs/cone) *">
            <input className={inputClass} value={form.unit} onChange={(e) => update('unit', e.target.value)} />
          </Field>
          <Field label="কালার / স্পেক">
            <input className={inputClass} value={form.spec} onChange={(e) => update('spec', e.target.value)} />
          </Field>
          <Field label="সাপ্লায়ার">
            <input
              className={inputClass}
              value={form.supplier}
              onChange={(e) => update('supplier', e.target.value)}
            />
          </Field>
          <Field label="রি-অর্ডার লেভেল">
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.reorderLevel}
              onChange={(e) => update('reorderLevel', e.target.value)}
            />
          </Field>
          <Field label="ওপেনিং স্টক">
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
            {busy ? 'তৈরি হচ্ছে…' : 'আইটেম তৈরি করুন'}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            বাতিল
          </button>
        </div>
      </form>
    </div>
  );
}
