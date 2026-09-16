import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { ArrowLeft, Pencil, Trash2, ImagePlus, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, btnDanger, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { STAGES, can, canEnterSection, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { fileToCompressedDataUrl } from '../../lib/imageUtils';

export default function StyleDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [style, setStyle] = useState(undefined);
  const [entries, setEntries] = useState(null);
  const [yarnItems, setYarnItems] = useState([]);

  const allowedStages = useMemo(() => STAGES.filter((s) => canEnterSection(profile, s.key)), [profile]);
  const [stage, setStage] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [yarnItemId, setYarnItemId] = useState('');
  const [yarnQty, setYarnQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingStyle, setEditingStyle] = useState(false);

  useEffect(() => {
    if (allowedStages.length && !stage) setStage(allowedStages[0].key);
  }, [allowedStages, stage]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'styles', id), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'styles', id, 'productionEntries'), orderBy('date', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventoryItems'), (snap) =>
      setYarnItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.type === 'yarn'))
    );
    return unsub;
  }, []);

  async function handleAddEntry(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    if (!canEnterSection(profile, stage)) {
      setError(t('এই সেকশনে এন্ট্রি দেওয়ার অনুমতি নেই।', 'You are not permitted to enter data for this section.'));
      return;
    }
    if (stage === 'knitting' && yarnItemId && !yarnQty) {
      setError(t('ইয়ার্ন কোয়ান্টিটি দিন অথবা ইয়ার্ন সিলেকশন খালি রাখুন।', 'Enter yarn quantity or clear the yarn selection.'));
      return;
    }
    setBusy(true);
    try {
      const entryData = {
        stage,
        quantity: n,
        note: note || '',
        date: entryDate,
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      };
      if (stage === 'knitting' && yarnItemId) {
        entryData.yarnItemId = yarnItemId;
        entryData.yarnItemName = yarnItems.find((y) => y.id === yarnItemId)?.name || '';
        entryData.yarnQty = Number(yarnQty);
      }
      await addDoc(collection(db, 'styles', id, 'productionEntries'), entryData);
      await updateDoc(doc(db, 'styles', id), { [`stages.${stage}`]: increment(n) });
      if (entryData.yarnItemId) {
        await updateDoc(doc(db, 'inventoryItems', entryData.yarnItemId), {
          currentStock: increment(-entryData.yarnQty),
        });
      }
      setQty('');
      setNote('');
      setYarnItemId('');
      setYarnQty('');
    } catch (err) {
      setError(t('এন্ট্রি যোগ করা যায়নি।', 'Could not add entry.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(entry) {
    const ok = window.confirm(t('এই এন্ট্রিটি মুছে ফেলতে চান?', 'Delete this entry?'));
    if (!ok) return;
    await updateDoc(doc(db, 'styles', id), { [`stages.${entry.stage}`]: increment(-entry.quantity) });
    if (entry.yarnItemId) {
      await updateDoc(doc(db, 'inventoryItems', entry.yarnItemId), {
        currentStock: increment(entry.yarnQty || 0),
      });
    }
    await deleteDoc(doc(db, 'styles', id, 'productionEntries', entry.id));
  }

  async function handleDeleteStyle() {
    const ok = window.confirm(
      t(`"${style.styleNo}" স্টাইলটি এবং এর সব এন্ট্রি স্থায়ীভাবে মুছে ফেলতে চান?`, `Permanently delete style "${style.styleNo}" and all its entries?`)
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', id));
    navigate('/production');
  }

  if (style === undefined) return <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>;
  if (style === null) return <EmptyState title={t('স্টাইল পাওয়া যায়নি', 'Style not found')} />;

  const canEditStyle = can(profile?.role, 'style:edit');

  // Yarn consumption report (per yarn item) for this style's knitting entries.
  const yarnConsumption = (entries || [])
    .filter((e) => e.yarnItemId)
    .reduce((acc, e) => {
      const k = e.yarnItemId;
      acc[k] = acc[k] || { name: e.yarnItemName, qty: 0 };
      acc[k].qty += Number(e.yarnQty || 0);
      return acc;
    }, {});
  const yarnConsumptionRows = Object.values(yarnConsumption);

  const entryExportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'stage', label: t('স্টেজ', 'Stage'), render: (r) => stageLabel(r.stage, lang) },
    { key: 'quantity', label: t('কোয়ান্টিটি', 'Quantity') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'yarnQty', label: t('ইয়ার্ন খরচ (kg)', 'Yarn Used (kg)') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/production" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t('সব স্টাইল', 'All Styles')}
      </Link>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
              {style.imageUrl ? (
                <img src={style.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={20} className="text-ink-soft" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-ink">{style.styleNo}</h1>
              {style.styleName && <p className="text-sm text-ink">{style.styleName}</p>}
              <p className="text-sm text-ink-soft">{style.buyer}</p>
              <p className="text-xs text-ink-soft">
                {style.poNo && <>PO: {style.poNo} · </>}
                {style.colour && <>{t('কালার', 'Colour')}: {style.colour} · </>}
                {style.gg && <>GG: {style.gg}</>}
              </p>
              {style.yarnComposition && (
                <p className="mt-1 text-xs text-ink-soft">{t('কম্পোজিশন', 'Composition')}: {style.yarnComposition}</p>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p>{t('অর্ডার', 'Order')}: {Number(style.orderQty).toLocaleString('en-US')} {t('পিস', 'pcs')}</p>
            {style.orderDate && <p>{t('তারিখ', 'Date')}: {style.orderDate}</p>}
            {style.shipDate && <p>{t('শিপমেন্ট', 'Shipment')}: {style.shipDate}</p>}
            <div className="mt-2 flex justify-end gap-3">
              {canEditStyle && (
                <button
                  onClick={() => setEditingStyle(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline"
                >
                  <Pencil size={13} /> {t('এডিট', 'Edit')}
                </button>
              )}
              {profile?.role === 'admin' && (
                <button
                  onClick={handleDeleteStyle}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red hover:underline"
                >
                  <Trash2 size={13} /> {t('ডিলিট', 'Delete')}
                </button>
              )}
            </div>
          </div>
        </div>
        {style.notes && <p className="mt-3 text-sm text-ink-soft">{style.notes}</p>}
      </div>

      {editingStyle && (
        <EditStyleModal style={style} onClose={() => setEditingStyle(false)} />
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('স্টেজ-ভিত্তিক অগ্রগতি', 'Stage-wise Progress')}</h2>
        <div className="space-y-4">
          {STAGES.map((s) => {
            const done = style.stages?.[s.key] || 0;
            const pct = style.orderQty > 0 ? Math.min(100, Math.round((done / style.orderQty) * 100)) : 0;
            return (
              <div key={s.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{lang === 'en' ? s.labelEn : s.label}</span>
                  <span className="text-ink-soft">
                    {done.toLocaleString('en-US')} / {Number(style.orderQty).toLocaleString('en-US')}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-indigo" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {can(profile?.role, 'production:entry') && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('প্রোডাকশন এন্ট্রি', 'Production Entry')}</h2>
          {allowedStages.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {t(
                'আপনাকে এখনো কোনো সেকশন এসাইন করা হয়নি। অ্যাডমিনকে বলুন Admin > User Management থেকে আপনার সেকশন ঠিক করে দিতে।',
                'No section has been assigned to you yet. Ask an admin to set your section under Admin > User Management.'
              )}
            </p>
          ) : (
            <form onSubmit={handleAddEntry} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label={t('তারিখ', 'Date')}>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('স্টেজ', 'Stage')}>
                  <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                    {allowedStages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {lang === 'en' ? s.labelEn : s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('কোয়ান্টিটি', 'Quantity')}>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('নোট (ঐচ্ছিক)', 'Note (optional)')}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
                </Field>
              </div>

              {stage === 'knitting' && (
                <div className="grid gap-4 rounded-md border border-line bg-paper/50 p-3 sm:grid-cols-2">
                  <Field label={t('কোন ইয়ার্নের বিপরীতে (ঐচ্ছিক)', 'Against which yarn (optional)')}>
                    <select value={yarnItemId} onChange={(e) => setYarnItemId(e.target.value)} className={inputClass}>
                      <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                      {yarnItems.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name} ({Number(y.currentStock).toLocaleString('en-US')} kg {t('স্টকে', 'in stock')})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('ইয়ার্ন খরচ (kg)', 'Yarn Used (kg)')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={yarnQty}
                      onChange={(e) => setYarnQty(e.target.value)}
                      className={inputClass}
                      disabled={!yarnItemId}
                    />
                  </Field>
                </div>
              )}

              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? t('যোগ হচ্ছে…', 'Adding…') : t('এন্ট্রি যোগ করুন', 'Add Entry')}
              </button>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </div>
      )}

      {yarnConsumptionRows.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('নিটিং — ইয়ার্ন খরচের রিপোর্ট', 'Knitting — Yarn Consumption Report')}</h2>
            <ExportBar
              small
              title={t('ইয়ার্ন খরচের রিপোর্ট', 'Yarn Consumption Report')}
              subtitle={`${style.styleNo} · ${style.buyer}`}
              filename={`yarn-consumption-${style.styleNo}`}
              columns={[
                { key: 'name', label: t('ইয়ার্ন', 'Yarn') },
                { key: 'qty', label: t('মোট খরচ (kg)', 'Total Used (kg)') },
              ]}
              rows={yarnConsumptionRows}
            />
          </div>
          <table className="w-full text-sm">
            <tbody>
              {yarnConsumptionRows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 text-ink">{r.name}</td>
                  <td className="py-2 text-ink-soft">{r.qty.toLocaleString('en-US')} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সাম্প্রতিক এন্ট্রি', 'Recent Entries')}</h2>
          <ExportBar
            small
            title={t('প্রোডাকশন এন্ট্রি', 'Production Entries')}
            subtitle={`${style.styleNo} · ${style.buyer}`}
            filename={`production-entries-${style.styleNo}`}
            columns={entryExportColumns}
            rows={entries || []}
          />
        </div>
        {entries === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : entries.length === 0 ? (
          <EmptyState title={t('এখনো কোনো এন্ট্রি নেই', 'No entries yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('স্টেজ', 'Stage')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('এন্ট্রি করেছেন', 'Entered By')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                    <td className="py-2 pr-4 text-ink">{stageLabel(e.stage, lang)}</td>
                    <td className="py-2 pr-4 text-ink-soft">
                      {e.quantity}
                      {e.yarnItemName && (
                        <span className="ml-1 text-xs text-ink-soft">
                          ({e.yarnItemName}: {e.yarnQty}kg)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{e.enteredBy}</td>
                    <td className="py-2 pr-4">
                      {profile?.role === 'admin' && (
                        <button onClick={() => handleDeleteEntry(e)} className="text-red hover:opacity-70">
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

function EditStyleModal({ style, onClose }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    orderDate: style.orderDate || '',
    buyer: style.buyer || '',
    poNo: style.poNo || '',
    styleName: style.styleName || '',
    styleNo: style.styleNo || '',
    gg: style.gg || '',
    shipDate: style.shipDate || '',
    colour: style.colour || '',
    yarnComposition: style.yarnComposition || '',
    orderQty: style.orderQty || '',
    notes: style.notes || '',
  });
  const [imageDataUrl, setImageDataUrl] = useState(style.imageUrl || '');
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

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!form.styleNo || !form.buyer || !form.orderQty) {
      setError(t('স্টাইল নম্বর, বায়ার এবং অর্ডার কোয়ান্টিটি আবশ্যক।', 'Style number, buyer and order quantity are required.'));
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', style.id), {
        orderDate: form.orderDate || null,
        buyer: form.buyer,
        poNo: form.poNo || '',
        styleName: form.styleName || '',
        styleNo: form.styleNo,
        gg: form.gg || '',
        shipDate: form.shipDate || null,
        colour: form.colour || '',
        yarnComposition: form.yarnComposition || '',
        orderQty: Number(form.orderQty),
        notes: form.notes || '',
        imageUrl: imageDataUrl || '',
      });
      onClose();
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('স্টাইল এডিট করুন', 'Edit Style')} onClose={onClose} wide>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={18} className="text-ink-soft" />
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('ছবি পরিবর্তন করুন', 'Change photo')}
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </label>
          {imageDataUrl && (
            <button type="button" onClick={() => setImageDataUrl('')} className="text-ink-soft hover:text-ink">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('তারিখ', 'Date')}>
            <input type="date" className={inputClass} value={form.orderDate} onChange={(e) => update('orderDate', e.target.value)} />
          </Field>
          <Field label={t('বায়ার *', 'Buyer *')}>
            <input className={inputClass} value={form.buyer} onChange={(e) => update('buyer', e.target.value)} />
          </Field>
          <Field label={t('PO নম্বর', 'PO No.')}>
            <input className={inputClass} value={form.poNo} onChange={(e) => update('poNo', e.target.value)} />
          </Field>
          <Field label={t('স্টাইল নাম', 'Style Name')}>
            <input className={inputClass} value={form.styleName} onChange={(e) => update('styleName', e.target.value)} />
          </Field>
          <Field label={t('স্টাইল নম্বর *', 'Style Number *')}>
            <input className={inputClass} value={form.styleNo} onChange={(e) => update('styleNo', e.target.value)} />
          </Field>
          <Field label="GG">
            <input className={inputClass} value={form.gg} onChange={(e) => update('gg', e.target.value)} />
          </Field>
          <Field label={t('শিপমেন্ট ডেট', 'Shipment Date')}>
            <input type="date" className={inputClass} value={form.shipDate} onChange={(e) => update('shipDate', e.target.value)} />
          </Field>
          <Field label={t('কালার', 'Colour')}>
            <input className={inputClass} value={form.colour} onChange={(e) => update('colour', e.target.value)} />
          </Field>
          <Field label={t('ইয়ার্ন কম্পোজিশন', 'Yarn Composition')}>
            <input className={inputClass} value={form.yarnComposition} onChange={(e) => update('yarnComposition', e.target.value)} />
          </Field>
          <Field label={t('অর্ডার কোয়ান্টিটি (পিস) *', 'Order Quantity (pcs) *')}>
            <input type="number" min="1" className={inputClass} value={form.orderQty} onChange={(e) => update('orderQty', e.target.value)} />
          </Field>
        </div>
        <Field label={t('নোট', 'Notes')}>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
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
