import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary } from '../../components/ui';
import { emptyStageMap } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { fileToCompressedDataUrl } from '../../lib/imageUtils';
import PoColourEditor, { emptyPo, posSummary } from '../../components/PoColourEditor';

export default function NewStyle() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    orderDate: new Date().toISOString().slice(0, 10),
    buyer: '',
    styleName: '',
    styleNo: '',
    gg: '',
    shipDate: '',
    yarnComposition: '',
    notes: '',
  });
  const [pos, setPos] = useState([emptyPo()]);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 700, 0.75);
      setImageDataUrl(dataUrl);
    } catch {
      setError(t('ছবি আপলোড করা যায়নি।', 'Could not upload image.'));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanPos = pos
      .map((po) => ({
        poNo: po.poNo.trim(),
        colours: po.colours
          .map((c) => ({ colour: c.colour.trim(), qty: Number(c.qty) || 0 }))
          .filter((c) => c.colour && c.qty > 0),
      }))
      .filter((po) => po.poNo && po.colours.length > 0);
    const summary = posSummary(cleanPos);
    if (!form.styleNo || !form.buyer || cleanPos.length === 0 || summary.orderQty <= 0) {
      setError(
        t(
          'স্টাইল নম্বর, বায়ার এবং অন্তত একটি PO-তে কালার-ওয়াইজ কোয়ান্টিটি আবশ্যক।',
          'Style number, buyer, and at least one PO with colour-wise quantity are required.'
        )
      );
      return;
    }
    setBusy(true);
    try {
      const docRef = await addDoc(collection(db, 'styles'), {
        orderDate: form.orderDate || null,
        buyer: form.buyer,
        pos: cleanPos,
        poNo: summary.poNo,
        styleName: form.styleName || '',
        styleNo: form.styleNo,
        gg: form.gg || '',
        shipDate: form.shipDate || null,
        colour: summary.colour,
        yarnComposition: form.yarnComposition || '',
        orderQty: summary.orderQty,
        notes: form.notes || '',
        imageUrl: imageDataUrl || '',
        stages: emptyStageMap(0),
        productionStarted: false,
        createdAt: serverTimestamp(),
        createdBy: profile?.name || user?.email,
      });
      navigate(`/production/${docRef.id}`);
    } catch (err) {
      setError(t('স্টাইল তৈরি করা যায়নি, আবার চেষ্টা করুন।', 'Could not create style, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('নতুন স্টাইল', 'New Style')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('নতুন অর্ডার/স্টাইলের তথ্য দিন।', 'Enter the new order / style details.')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
        <div>
          <span className="mb-2 block text-sm font-medium text-ink">{t('স্টাইলের ছবি', 'Style photo')}</span>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
              {imageDataUrl ? (
                <img src={imageDataUrl} alt="style" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={22} className="text-ink-soft" />
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper">
              {t('ছবি আপলোড করুন', 'Upload photo')}
              <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('তারিখ', 'Date')}>
            <input
              type="date"
              className={inputClass}
              value={form.orderDate}
              onChange={(e) => update('orderDate', e.target.value)}
            />
          </Field>
          <Field label={t('বায়ার *', 'Buyer *')}>
            <input className={inputClass} value={form.buyer} onChange={(e) => update('buyer', e.target.value)} />
          </Field>
          <Field label={t('স্টাইল নাম', 'Style Name')}>
            <input
              className={inputClass}
              value={form.styleName}
              onChange={(e) => update('styleName', e.target.value)}
            />
          </Field>
          <Field label={t('স্টাইল নম্বর *', 'Style Number *')}>
            <input className={inputClass} value={form.styleNo} onChange={(e) => update('styleNo', e.target.value)} />
          </Field>
          <Field label="GG">
            <input className={inputClass} value={form.gg} onChange={(e) => update('gg', e.target.value)} />
          </Field>
          <Field label={t('শিপমেন্ট ডেট', 'Shipment Date')}>
            <input
              type="date"
              className={inputClass}
              value={form.shipDate}
              onChange={(e) => update('shipDate', e.target.value)}
            />
          </Field>
          <Field label={t('ইয়ার্ন কম্পোজিশন', 'Yarn Composition')}>
            <input
              className={inputClass}
              placeholder={t('যেমন: ৭০% অ্যাক্রিলিক ৩০% উল', 'e.g. 70% Acrylic 30% Wool')}
              value={form.yarnComposition}
              onChange={(e) => update('yarnComposition', e.target.value)}
            />
          </Field>
        </div>

        <PoColourEditor pos={pos} onChange={setPos} />

        <Field label={t('নোট', 'Notes')}>
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
            {busy ? t('তৈরি হচ্ছে…', 'Creating…') : t('স্টাইল তৈরি করুন', 'Create Style')}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            {t('বাতিল', 'Cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
