import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Trash2, Pencil } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { can } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function StyleYarnTracking() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [yarnItems, setYarnItems] = useState([]);
  const [allocations, setAllocations] = useState(null);
  const [editingAlloc, setEditingAlloc] = useState(null);

  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      yarnItemId: '',
      yarnItemName: '',
      dyeingOrderQty: '',
      receivedQty: '',
      windingNeededQty: '0',
      directToKnittingQty: '0',
      supplier: '',
      chalanNo: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    };
  }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventoryItems'), (snap) =>
      setYarnItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.type === 'yarn'))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!styleId) {
      setStyle(null);
      setAllocations(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'styles', styleId), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [styleId]);

  useEffect(() => {
    if (!styleId) return;
    const q = query(collection(db, 'styles', styleId, 'yarnAllocations'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setAllocations(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  function update(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'yarnItemId') {
        next.yarnItemName = yarnItems.find((y) => y.id === value)?.name || '';
      }
      return next;
    });
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.yarnItemId || !form.dyeingOrderQty) return;
    await addDoc(collection(db, 'styles', styleId, 'yarnAllocations'), {
      yarnItemId: form.yarnItemId,
      yarnItemName: form.yarnItemName,
      dyeingOrderQty: Number(form.dyeingOrderQty),
      receivedQty: Number(form.receivedQty || 0),
      windingNeededQty: Number(form.windingNeededQty || 0),
      windingDoneQty: 0,
      directToKnittingQty: Number(form.directToKnittingQty || 0),
      supplier: form.supplier || '',
      chalanNo: form.chalanNo || '',
      date: form.date,
      notes: form.notes || '',
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    // Receiving yarn against this style also adds it to overall inventory stock.
    if (Number(form.receivedQty) > 0) {
      await addDoc(collection(db, 'inventoryItems', form.yarnItemId, 'transactions'), {
        type: 'in',
        quantity: Number(form.receivedQty),
        note: t(`স্টাইল ${style?.styleNo} — চালান: ${form.chalanNo || '—'}`, `Style ${style?.styleNo} — Chalan: ${form.chalanNo || '—'}`),
        date: form.date,
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'inventoryItems', form.yarnItemId), { currentStock: increment(Number(form.receivedQty)) });
    }
    setForm(emptyForm());
  }

  async function handleDelete(a) {
    const ok = window.confirm(t('এই ইয়ার্ন অ্যালোকেশন মুছে ফেলতে চান?', 'Delete this yarn allocation?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', styleId, 'yarnAllocations', a.id));
  }

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'dyeingOrderQty', label: t('ডাইং অর্ডার (kg)', 'Dyeing Order (kg)') },
    { key: 'receivedQty', label: t('রিসিভড (kg)', 'Received (kg)') },
    {
      key: 'balance',
      label: t('ব্যালেন্স (kg)', 'Balance (kg)'),
      render: (r) => (Number(r.dyeingOrderQty) - Number(r.receivedQty)).toFixed(2),
    },
    { key: 'windingNeededQty', label: t('ওয়াইন্ডিং প্রয়োজন (kg)', 'Winding Needed (kg)') },
    { key: 'windingDoneQty', label: t('ওয়াইন্ডিং সম্পন্ন (kg)', 'Winding Done (kg)') },
    { key: 'directToKnittingQty', label: t('সরাসরি নিটিং (kg)', 'Direct to Knitting (kg)') },
    { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
    { key: 'chalanNo', label: t('চালান নং', 'Chalan No.') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং', 'Style-wise Yarn Tracking')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'একটি স্টাইল সার্চ করে সেই স্টাইলের বিপরীতে ডাইং অর্ডার, রিসিভড, ব্যালেন্স, সাপ্লায়ার ও চালান নং ট্র্যাক করুন। রিসিভড ইয়ার্ন ওয়াইন্ডিং প্রয়োজন নাকি সরাসরি নিটিং-এ যাবে তা এখানেই ভাগ করে দিন।',
            'Search a style, then track dyeing order, received, balance, supplier and chalan no against it. Split received yarn into what needs winding vs what goes straight to knitting.'
          )}
        </p>
      </div>

      <div className="max-w-md">
        <StyleSearchSelect value={styleId} onChange={(id) => setStyleId(id)} />
      </div>

      {style && (
        <>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="font-medium text-ink">{style.styleNo} {style.styleName && `— ${style.styleName}`}</p>
            <p className="text-xs text-ink-soft">{style.buyer} {style.poNo && `· PO: ${style.poNo}`}</p>
          </div>

          {can(profile?.role, 'inventory:manage') && (
            <form onSubmit={handleAdd} className="space-y-4 rounded-lg border border-line bg-surface p-6">
              <h2 className="font-display text-sm font-semibold text-ink">{t('নতুন ইয়ার্ন অ্যালোকেশন যোগ করুন', 'Add New Yarn Allocation')}</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={form.yarnItemId} onChange={(e) => update('yarnItemId', e.target.value)} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {yarnItems.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('তারিখ', 'Date')}>
                  <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('ডাইং অর্ডার কোয়ান্টিটি (kg) *', 'Dyeing Order Qty (kg) *')}>
                  <input type="number" min="0" step="0.01" value={form.dyeingOrderQty} onChange={(e) => update('dyeingOrderQty', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('রিসিভড কোয়ান্টিটি (kg)', 'Received Qty (kg)')}>
                  <input type="number" min="0" step="0.01" value={form.receivedQty} onChange={(e) => update('receivedQty', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('ওয়াইন্ডিং প্রয়োজন (kg)', 'Needs Winding (kg)')}>
                  <input type="number" min="0" step="0.01" value={form.windingNeededQty} onChange={(e) => update('windingNeededQty', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('সরাসরি নিটিং-এ (kg)', 'Direct to Knitting (kg)')}>
                  <input type="number" min="0" step="0.01" value={form.directToKnittingQty} onChange={(e) => update('directToKnittingQty', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('সাপ্লায়ার', 'Supplier')}>
                  <input value={form.supplier} onChange={(e) => update('supplier', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('চালান নং', 'Chalan No.')}>
                  <input value={form.chalanNo} onChange={(e) => update('chalanNo', e.target.value)} className={inputClass} />
                </Field>
                <Field label={t('নোট', 'Notes')}>
                  <input value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} />
                </Field>
              </div>
              <p className="text-xs text-ink-soft">
                {t('রিসিভড কোয়ান্টিটি স্বয়ংক্রিয়ভাবে ইয়ার্ন আইটেমের সামগ্রিক ইনভেন্টরি স্টকে যোগ হবে।', 'Received quantity is automatically added to the yarn item\u2019s overall inventory stock.')}
              </p>
              <button type="submit" className={btnPrimary}>
                {t('অ্যালোকেশন যোগ করুন', 'Add Allocation')}
              </button>
            </form>
          )}

          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('ইয়ার্ন অ্যালোকেশন সমূহ', 'Yarn Allocations')}</h2>
              <ExportBar
                small
                title={t('স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং', 'Style-wise Yarn Tracking')}
                subtitle={`${style.styleNo} · ${style.buyer}`}
                filename={`yarn-tracking-${style.styleNo}`}
                columns={exportColumns}
                rows={allocations || []}
              />
            </div>
            {allocations === null ? (
              <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
            ) : allocations.length === 0 ? (
              <EmptyState title={t('এখনো কোনো অ্যালোকেশন নেই', 'No allocation yet')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ডাইং অর্ডার', 'Dyeing Order')}</th>
                      <th className="py-2 pr-4 font-medium">{t('রিসিভড', 'Received')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ব্যালেন্স', 'Balance')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ওয়াইন্ডিং', 'Winding')}</th>
                      <th className="py-2 pr-4 font-medium">{t('সাপ্লায়ার', 'Supplier')}</th>
                      <th className="py-2 pr-4 font-medium">{t('চালান', 'Chalan')}</th>
                      <th className="py-2 pr-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{a.yarnItemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{a.dyeingOrderQty} kg</td>
                        <td className="py-2 pr-4 text-ink-soft">{a.receivedQty} kg</td>
                        <td className="py-2 pr-4 text-ink-soft">{(a.dyeingOrderQty - a.receivedQty).toFixed(2)} kg</td>
                        <td className="py-2 pr-4 text-ink-soft">
                          {a.windingDoneQty || 0}/{a.windingNeededQty || 0} kg
                        </td>
                        <td className="py-2 pr-4 text-ink-soft">{a.supplier || '—'}</td>
                        <td className="py-2 pr-4 text-ink-soft">{a.chalanNo || '—'}</td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            {can(profile?.role, 'inventory:manage') && (
                              <button onClick={() => setEditingAlloc(a)} className="text-indigo hover:opacity-70">
                                <Pencil size={14} />
                              </button>
                            )}
                            {profile?.role === 'admin' && (
                              <button onClick={() => handleDelete(a)} className="text-red hover:opacity-70">
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
        </>
      )}

      {editingAlloc && (
        <EditAllocationModal
          styleId={styleId}
          allocation={editingAlloc}
          onClose={() => setEditingAlloc(null)}
        />
      )}
    </div>
  );
}

function EditAllocationModal({ styleId, allocation, onClose }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    dyeingOrderQty: allocation.dyeingOrderQty,
    receivedQty: allocation.receivedQty,
    windingNeededQty: allocation.windingNeededQty || 0,
    directToKnittingQty: allocation.directToKnittingQty || 0,
    supplier: allocation.supplier || '',
    chalanNo: allocation.chalanNo || '',
  });
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', styleId, 'yarnAllocations', allocation.id), {
        dyeingOrderQty: Number(form.dyeingOrderQty),
        receivedQty: Number(form.receivedQty),
        windingNeededQty: Number(form.windingNeededQty),
        directToKnittingQty: Number(form.directToKnittingQty),
        supplier: form.supplier,
        chalanNo: form.chalanNo,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('অ্যালোকেশন এডিট করুন', 'Edit Allocation')} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('ডাইং অর্ডার (kg)', 'Dyeing Order (kg)')}>
            <input type="number" step="0.01" className={inputClass} value={form.dyeingOrderQty} onChange={(e) => update('dyeingOrderQty', e.target.value)} />
          </Field>
          <Field label={t('রিসিভড (kg)', 'Received (kg)')}>
            <input type="number" step="0.01" className={inputClass} value={form.receivedQty} onChange={(e) => update('receivedQty', e.target.value)} />
          </Field>
          <Field label={t('ওয়াইন্ডিং প্রয়োজন (kg)', 'Needs Winding (kg)')}>
            <input type="number" step="0.01" className={inputClass} value={form.windingNeededQty} onChange={(e) => update('windingNeededQty', e.target.value)} />
          </Field>
          <Field label={t('সরাসরি নিটিং (kg)', 'Direct to Knitting (kg)')}>
            <input type="number" step="0.01" className={inputClass} value={form.directToKnittingQty} onChange={(e) => update('directToKnittingQty', e.target.value)} />
          </Field>
          <Field label={t('সাপ্লায়ার', 'Supplier')}>
            <input className={inputClass} value={form.supplier} onChange={(e) => update('supplier', e.target.value)} />
          </Field>
          <Field label={t('চালান নং', 'Chalan No.')}>
            <input className={inputClass} value={form.chalanNo} onChange={(e) => update('chalanNo', e.target.value)} />
          </Field>
        </div>
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
