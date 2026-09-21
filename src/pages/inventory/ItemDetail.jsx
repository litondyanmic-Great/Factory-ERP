import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { collectionGroup, doc, onSnapshot, query, updateDoc, deleteDoc } from 'firebase/firestore';
import { ArrowLeft, Pencil, Trash2, MapPin } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Pill, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, hasAreaAdmin, ITEM_TYPES, COMMON_UNITS, YARN_UNIT } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

// Stock for an item is now ALWAYS derived live from the same style-scoped
// ledgers that Style Yarn/Accessory Tracking write to (yarnLedger /
// accessoryLedger) — there is no separate stored counter to keep in sync,
// so deleting or correcting an entry anywhere is reflected here
// immediately and automatically, with nothing to "forget" to update.
export default function ItemDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [item, setItem] = useState(undefined);
  const [yarnEntries, setYarnEntries] = useState(null);
  const [accEntries, setAccEntries] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'inventoryItems', id), (snap) =>
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'yarnLedger')), (snap) =>
      setYarnEntries(
        snap.docs
          .map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() }))
          .filter((e) => e.yarnItemId === id)
      )
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'accessoryLedger')), (snap) =>
      setAccEntries(
        snap.docs
          .map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() }))
          .filter((e) => e.itemId === id)
      )
    );
    return unsub;
  }, [id]);

  const isYarn = item?.type === 'yarn';
  const entries = isYarn ? yarnEntries : accEntries;

  // Total stock physically at the store right now, summed across every
  // style this item has ever been ordered against.
  const totalAtStore = useMemo(() => {
    if (!entries) return 0;
    let received = 0, issued = 0;
    entries.forEach((e) => {
      const q = Number(e.qty || 0);
      if (e.type === 'receipt' || e.type === 'blockAdjustIn') received += q;
      if (isYarn ? e.type === 'issueToWinding' || e.type === 'issueToKnitting' || e.type === 'blockAdjustOut' : e.type === 'issue') issued += q;
    });
    return received - issued;
  }, [entries, isYarn]);

  // Per-block breakdown (yarn only) — net stock still sitting in each
  // storage block for this item, across every style.
  const blockBreakdown = useMemo(() => {
    if (!isYarn || !entries) return [];
    const map = new Map();
    entries.forEach((e) => {
      if (!e.block) return;
      const q = Number(e.qty || 0);
      const delta =
        e.type === 'receipt' || e.type === 'blockAdjustIn'
          ? q
          : e.type === 'issueToWinding' || e.type === 'issueToKnitting' || e.type === 'blockAdjustOut'
            ? -q
            : 0;
      map.set(e.block, (map.get(e.block) || 0) + delta);
    });
    return Array.from(map.entries())
      .map(([block, qty]) => ({ block, qty }))
      .filter((b) => Math.abs(b.qty) > 0.001)
      .sort((a, b) => a.block.localeCompare(b.block));
  }, [entries, isYarn]);

  // Per-style breakdown — which styles this item's stock currently sits
  // against, so "where did this come from / where is it going" is a
  // one-glance answer.
  const styleBreakdown = useMemo(() => {
    if (!entries) return [];
    const map = new Map();
    entries.forEach((e) => {
      const q = Number(e.qty || 0);
      const key = e.styleLabel || e.styleNo || e.styleId;
      if (!map.has(key)) map.set(key, { styleId: e.styleId, label: key, received: 0, issued: 0 });
      const b = map.get(key);
      if (e.type === 'receipt' || e.type === 'blockAdjustIn') b.received += q;
      if (isYarn ? e.type === 'issueToWinding' || e.type === 'issueToKnitting' || e.type === 'blockAdjustOut' : e.type === 'issue') b.issued += q;
    });
    return Array.from(map.values()).map((b) => ({ ...b, balance: b.received - b.issued }));
  }, [entries, isYarn]);

  async function handleDeleteItem() {
    const ok = window.confirm(
      t(
        `"${item.name}" আইটেমটি মুছে ফেলতে চান? এটি শুধু ক্যাটালগ এন্ট্রি মুছবে — কোনো স্টাইলের লেজার (অর্ডার/রিসিভ/ইস্যু) ইতিহাস মুছবে না।`,
        `Delete item "${item.name}"? This only removes the catalog entry — it will NOT delete any style's ledger (order/receive/issue) history.`
      )
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'inventoryItems', id));
    navigate('/inventory');
  }

  if (item === undefined) return <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>;
  if (item === null) return <EmptyState title={t('আইটেম পাওয়া যায়নি', 'Item not found')} />;

  const low = totalAtStore <= Number(item.reorderLevel || 0);
  const unit = isYarn ? YARN_UNIT : item.unit;

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
              {entries === null ? '…' : totalAtStore.toFixed(isYarn ? 2 : 0)}{' '}
              <span className="text-sm font-normal text-ink-soft">{unit}</span>
            </p>
            <p className="text-[11px] text-ink-soft">{t('সব স্টাইল মিলিয়ে স্টোরে (লাইভ)', 'At store, all styles combined (live)')}</p>
            <Pill tone={low ? 'red' : 'green'}>{low ? t('রি-অর্ডার করুন', 'Reorder') : t('পর্যাপ্ত স্টক', 'Sufficient stock')}</Pill>
            <div className="mt-2 flex justify-end gap-3">
              {can(profile?.role, 'inventory:manage') && (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline">
                  <Pencil size={13} /> {t('এডিট', 'Edit')}
                </button>
              )}
              {hasAreaAdmin(profile, 'inventory') && (
                <button onClick={handleDeleteItem} className="inline-flex items-center gap-1 text-xs font-medium text-red hover:underline">
                  <Trash2 size={13} /> {t('ডিলিট', 'Delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && <EditItemModal item={item} onClose={() => setEditing(false)} />}

      <p className="rounded-md border border-line bg-paper p-3 text-xs text-ink-soft">
        {t(
          'এই আইটেমের সব স্টক-মুভমেন্ট এখন স্টাইল-ভিত্তিক ট্র্যাকিং থেকেই হয় — সরাসরি এখান থেকে স্টক ইন/আউট করার আলাদা কোনো সিস্টেম নেই, যাতে দুই জায়গার হিসাব কখনো আলাদা হয়ে না যায়। নতুন এন্ট্রির জন্য একটি স্টাইল খুঁজে Style Yarn/Accessory Tracking পাতায় যান।',
          "All of this item's stock movement now happens through style-based tracking — there's no separate stock in/out system directly here, so the two never drift out of sync. For a new entry, find a style on the Style Yarn/Accessory Tracking page."
        )}{' '}
        <Link to={isYarn ? '/inventory/yarn-tracking' : '/inventory/accessory-tracking'} className="font-medium text-indigo hover:underline">
          {isYarn ? t('ইয়ার্ন ট্র্যাকিংয়ে যান →', 'Go to Yarn Tracking →') : t('এক্সেসরিজ ট্র্যাকিংয়ে যান →', 'Go to Accessory Tracking →')}
        </Link>
      </p>

      {isYarn && blockBreakdown.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <MapPin size={15} /> {t('ব্লক অনুযায়ী স্টক (লাইভ)', 'Stock by Block (live)')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {blockBreakdown.map((b) => (
              <Pill key={b.block}>
                {t('ব্লক', 'Block')} {b.block}: {b.qty.toFixed(2)} {YARN_UNIT}
              </Pill>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('স্টাইল অনুযায়ী ব্যালেন্স (লাইভ)', 'Balance by Style (live)')}</h2>
          <ExportBar
            small
            title={t('স্টাইল অনুযায়ী ব্যালেন্স', 'Balance by Style')}
            subtitle={item.name}
            filename={`item-balance-${item.name}`}
            columns={[
              { key: 'label', label: t('স্টাইল', 'Style') },
              { key: 'received', label: t('রিসিভড', 'Received') },
              { key: 'issued', label: t('ইস্যু', 'Issued') },
              { key: 'balance', label: t('ব্যালেন্স', 'Balance') },
            ]}
            rows={styleBreakdown}
          />
        </div>
        {entries === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : styleBreakdown.length === 0 ? (
          <EmptyState title={t('এখনো কোনো স্টাইলের বিপরীতে অর্ডার নেই', 'No orders against any style yet')} />
        ) : (
          <div className="space-y-2">
            {styleBreakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between text-sm">
                <Link to={`/production/${b.styleId}`} className="text-ink hover:text-indigo hover:underline">
                  {b.label}
                </Link>
                <span className="text-ink-soft">
                  {b.balance.toFixed(isYarn ? 2 : 0)} {unit} {t('স্টোরে', 'at store')}
                </span>
              </div>
            ))}
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
        // Yarn is ALWAYS tracked in lb, never pcs — this is enforced here
        // regardless of what's selected, so an older item can't drift
        // back to the wrong unit through an edit.
        unit: form.type === 'yarn' ? YARN_UNIT : form.unit,
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
              <input className={`${inputClass} bg-paper`} value={YARN_UNIT} disabled />
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
