import { useEffect, useState } from 'react';
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
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Pill, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, ITEM_TYPES, COMMON_UNITS, YARN_UNIT } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function ItemDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [item, setItem] = useState(undefined);
  const [txns, setTxns] = useState(null);
  const [txType, setTxType] = useState('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'inventoryItems', id), (snap) =>
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems', id, 'transactions'), orderBy('date', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  async function handleAddTxn(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    if (txType === 'out' && item && n > Number(item.currentStock)) {
      setError(t('বর্তমান স্টকের চেয়ে বেশি ইস্যু করা যাবে না।', 'Cannot issue more than current stock.'));
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'inventoryItems', id, 'transactions'), {
        type: txType,
        quantity: n,
        note: note || '',
        date: new Date().toISOString().slice(0, 10),
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'inventoryItems', id), {
        currentStock: increment(txType === 'in' ? n : -n),
      });
      setQty('');
      setNote('');
    } catch (err) {
      setError(t('এন্ট্রি যোগ করা যায়নি।', 'Could not add entry.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTxn(txn) {
    const ok = window.confirm(t('এই লেনদেনটি মুছে ফেলতে চান?', 'Delete this transaction?'));
    if (!ok) return;
    await updateDoc(doc(db, 'inventoryItems', id), {
      currentStock: increment(txn.type === 'in' ? -txn.quantity : txn.quantity),
    });
    await deleteDoc(doc(db, 'inventoryItems', id, 'transactions', txn.id));
  }

  async function handleDeleteItem() {
    const ok = window.confirm(t(`"${item.name}" আইটেমটি মুছে ফেলতে চান?`, `Delete item "${item.name}"?`));
    if (!ok) return;
    await deleteDoc(doc(db, 'inventoryItems', id));
    navigate('/inventory');
  }

  if (item === undefined) return <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>;
  if (item === null) return <EmptyState title={t('আইটেম পাওয়া যায়নি', 'Item not found')} />;

  const low = Number(item.currentStock) <= Number(item.reorderLevel);

  const txnExportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'type', label: t('ধরন', 'Type'), render: (r) => (r.type === 'in' ? t('ইন', 'In') : t('আউট', 'Out')) },
    { key: 'quantity', label: t('কোয়ান্টিটি', 'Quantity') },
    { key: 'note', label: t('নোট', 'Note') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t('সব আইটেম', 'All Items')}
      </Link>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">{item.name}</h1>
            <p className="text-sm text-ink-soft">
              {t(ITEM_TYPES.find((tp) => tp.key === item.type)?.label, ITEM_TYPES.find((tp) => tp.key === item.type)?.labelEn)}
              {item.spec ? ` · ${item.spec}` : ''}
              {item.supplier ? ` · ${item.supplier}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold text-ink">
              {item.currentStock} <span className="text-sm font-normal text-ink-soft">{item.unit}</span>
            </p>
            <Pill tone={low ? 'red' : 'green'}>{low ? t('রি-অর্ডার করুন', 'Reorder') : t('পর্যাপ্ত স্টক', 'Sufficient stock')}</Pill>
            <div className="mt-2 flex justify-end gap-3">
              {can(profile?.role, 'inventory:manage') && (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline">
                  <Pencil size={13} /> {t('এডিট', 'Edit')}
                </button>
              )}
              {profile?.role === 'admin' && (
                <button onClick={handleDeleteItem} className="inline-flex items-center gap-1 text-xs font-medium text-red hover:underline">
                  <Trash2 size={13} /> {t('ডিলিট', 'Delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && <EditItemModal item={item} onClose={() => setEditing(false)} />}

      {can(profile?.role, 'inventory:manage') && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('স্টক ইন / আউট', 'Stock In / Out')}</h2>
          <form onSubmit={handleAddTxn} className="grid gap-4 sm:grid-cols-4">
            <Field label={t('ধরন', 'Type')}>
              <select value={txType} onChange={(e) => setTxType(e.target.value)} className={inputClass}>
                <option value="in">{t('স্টক ইন (রিসিভ)', 'Stock In (Receive)')}</option>
                <option value="out">{t('স্টক আউট (ইস্যু)', 'Stock Out (Issue)')}</option>
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
            <Field label={t('রেফারেন্স / নোট', 'Reference / Note')}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('যেমন: স্টাইল নং বা PO', 'e.g. style number or PO')}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? t('যোগ হচ্ছে…', 'Adding…') : t('এন্ট্রি যোগ করুন', 'Add Entry')}
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('লেনদেনের ইতিহাস', 'Transaction History')}</h2>
          <ExportBar
            small
            title={t('লেনদেনের ইতিহাস', 'Transaction History')}
            subtitle={item.name}
            filename={`transactions-${item.name}`}
            columns={txnExportColumns}
            rows={txns || []}
          />
        </div>
        {txns === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : txns.length === 0 ? (
          <EmptyState title={t('এখনো কোনো লেনদেন নেই', 'No transactions yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ধরন', 'Type')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('নোট', 'Note')}</th>
                  <th className="py-2 pr-4 font-medium">{t('এন্ট্রি করেছেন', 'Entered By')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx) => (
                  <tr key={tx.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{tx.date}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={tx.type === 'in' ? 'green' : 'amber'}>{tx.type === 'in' ? t('ইন', 'In') : t('আউট', 'Out')}</Pill>
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{tx.quantity}</td>
                    <td className="py-2 pr-4 text-ink-soft">{tx.note || '—'}</td>
                    <td className="py-2 pr-4 text-ink-soft">{tx.enteredBy}</td>
                    <td className="py-2 pr-4">
                      {profile?.role === 'admin' && (
                        <button onClick={() => handleDeleteTxn(tx)} className="text-red hover:opacity-70">
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

function EditItemModal({ item, onClose }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: item.name || '',
    type: item.type || 'yarn',
    unit: item.unit || YARN_UNIT,
    spec: item.spec || '',
    supplier: item.supplier || '',
    reorderLevel: item.reorderLevel ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name || !form.unit) {
      setError(t('নাম এবং একক আবশ্যক।', 'Name and unit are required.'));
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'inventoryItems', item.id), {
        name: form.name,
        type: form.type,
        unit: form.unit,
        spec: form.spec || '',
        supplier: form.supplier || '',
        reorderLevel: Number(form.reorderLevel || 0),
      });
      onClose();
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('আইটেম এডিট করুন', 'Edit Item')} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <Field label={t('নাম *', 'Name *')}>
          <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('ধরন', 'Type')}>
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => update('type', e.target.value)}
            >
              {ITEM_TYPES.map((tp) => (
                <option key={tp.key} value={tp.key}>
                  {t(tp.label, tp.labelEn)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('একক', 'Unit')}>
            {form.type === 'yarn' ? (
              <input className={`${inputClass} bg-paper`} value="kg" disabled />
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
        </div>
        <Field label={t('কালার / স্পেক', 'Colour / Spec')}>
          <input className={inputClass} value={form.spec} onChange={(e) => update('spec', e.target.value)} />
        </Field>
        <Field label={t('সাপ্লায়ার', 'Supplier')}>
          <input className={inputClass} value={form.supplier} onChange={(e) => update('supplier', e.target.value)} />
        </Field>
        <Field label={t('রি-অর্ডার লেভেল', 'Reorder Level')}>
          <input type="number" min="0" className={inputClass} value={form.reorderLevel} onChange={(e) => update('reorderLevel', e.target.value)} />
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
