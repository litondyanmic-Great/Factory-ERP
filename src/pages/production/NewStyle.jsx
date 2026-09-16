import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary } from '../../components/ui';
import { emptyStageMap } from '../../lib/constants';

export default function NewStyle() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ styleNo: '', buyer: '', orderQty: '', shipDate: '', gsm: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.styleNo || !form.buyer || !form.orderQty) {
      setError('স্টাইল নং, বায়ার এবং অর্ডার কোয়ান্টিটি আবশ্যক।');
      return;
    }
    setBusy(true);
    try {
      const docRef = await addDoc(collection(db, 'styles'), {
        styleNo: form.styleNo,
        buyer: form.buyer,
        orderQty: Number(form.orderQty),
        shipDate: form.shipDate || null,
        gsm: form.gsm || null,
        notes: form.notes || '',
        stages: emptyStageMap(0),
        createdAt: serverTimestamp(),
        createdBy: profile?.name || user?.email,
      });
      navigate(`/production/${docRef.id}`);
    } catch (err) {
      setError('স্টাইল তৈরি করা যায়নি, আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">নতুন স্টাইল</h1>
        <p className="mt-1 text-sm text-ink-soft">নতুন অর্ডার/স্টাইলের তথ্য দিন।</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="স্টাইল নং *">
            <input
              className={inputClass}
              value={form.styleNo}
              onChange={(e) => update('styleNo', e.target.value)}
            />
          </Field>
          <Field label="বায়ার *">
            <input className={inputClass} value={form.buyer} onChange={(e) => update('buyer', e.target.value)} />
          </Field>
          <Field label="অর্ডার কোয়ান্টিটি (পিস) *">
            <input
              type="number"
              min="1"
              className={inputClass}
              value={form.orderQty}
              onChange={(e) => update('orderQty', e.target.value)}
            />
          </Field>
          <Field label="শিপমেন্ট ডেট">
            <input
              type="date"
              className={inputClass}
              value={form.shipDate}
              onChange={(e) => update('shipDate', e.target.value)}
            />
          </Field>
          <Field label="GSM / ইয়ার্ন কাউন্ট">
            <input className={inputClass} value={form.gsm} onChange={(e) => update('gsm', e.target.value)} />
          </Field>
        </div>
        <Field label="নোট">
          <textarea
            className={inputClass}
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'তৈরি হচ্ছে…' : 'স্টাইল তৈরি করুন'}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            বাতিল
          </button>
        </div>
      </form>
    </div>
  );
}
