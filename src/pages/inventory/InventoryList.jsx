import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Boxes, Wind, MapPin, PiggyBank } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { btnPrimary, btnSecondary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, hasAreaAdmin, ITEM_TYPES, YARN_UNIT } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function InventoryList() {
  const { profile } = useAuth();
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [yarnLedger, setYarnLedger] = useState(null);
  const [accLedger, setAccLedger] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  // Two single collectionGroup queries (not one per item) — this is what
  // stock is now always computed from, live, so the list here can never
  // drift from what Style Yarn/Accessory Tracking or Item Detail show.
  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'yarnLedger')), (snap) => setYarnLedger(snap.docs.map((d) => d.data())));
    return unsub;
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'accessoryLedger')), (snap) => setAccLedger(snap.docs.map((d) => d.data())));
    return unsub;
  }, []);

  const stockByItemId = useMemo(() => {
    const map = new Map();
    (yarnLedger || []).forEach((e) => {
      const cur = map.get(e.yarnItemId) || 0;
      const q = Number(e.qty || 0);
      if (e.type === 'receipt') map.set(e.yarnItemId, cur + q);
      if (e.type === 'issueToWinding' || e.type === 'issueToKnitting') map.set(e.yarnItemId, cur - q);
    });
    (accLedger || []).forEach((e) => {
      const cur = map.get(e.itemId) || 0;
      const q = Number(e.qty || 0);
      if (e.type === 'receipt') map.set(e.itemId, cur + q);
      if (e.type === 'issue') map.set(e.itemId, cur - q);
    });
    return map;
  }, [yarnLedger, accLedger]);

  const stockReady = yarnLedger !== null && accLedger !== null;
  const visible = (items || []).filter((i) => filter === 'all' || i.type === filter);

  async function handleDelete(e, id, name) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      t(
        `"${name}" আইটেমটি মুছে ফেলতে চান? এটি শুধু ক্যাটালগ এন্ট্রি মুছবে — কোনো স্টাইলের লেজার ইতিহাস মুছবে না।`,
        `Delete item "${name}"? This only removes the catalog entry — it will NOT delete any style's ledger history.`
      )
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'inventoryItems', id));
  }

  const exportColumns = [
    { key: 'name', label: t('নাম', 'Name') },
    {
      key: 'type',
      label: t('ধরন', 'Type'),
      render: (r) => {
        const it = ITEM_TYPES.find((tp) => tp.key === r.type);
        return t(it?.label, it?.labelEn);
      },
    },
    { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
    { key: 'currentStock', label: t('বর্তমান স্টক (লাইভ)', 'Current Stock (live)'), render: (r) => (stockByItemId.get(r.id) || 0).toFixed(r.type === 'yarn' ? 2 : 0) },
    { key: 'unit', label: t('একক', 'Unit'), render: (r) => (r.type === 'yarn' ? YARN_UNIT : r.unit) },
    { key: 'reorderLevel', label: t('রি-অর্ডার লেভেল', 'Reorder Level') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('ইনভেন্টরি', 'Inventory')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('ইয়ার্ন ও এক্সেসরিজের স্টক পরিস্থিতি।', 'Yarn and accessories stock overview.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportBar title={t('ইনভেন্টরি তালিকা', 'Inventory List')} filename="inventory-list" columns={exportColumns} rows={visible} />
          <Link to="/inventory/yarn-tracking" className={btnSecondary}>
            <Boxes size={16} /> {t('স্টাইল-ভিত্তিক ইয়ার্ন', 'Style Yarn Tracking')}
          </Link>
          <Link to="/inventory/winding" className={btnSecondary}>
            <Wind size={16} /> {t('ওয়াইন্ডিং কিউ', 'Winding Queue')}
          </Link>
          <Link to="/inventory/accessory-tracking" className={btnSecondary}>
            <Boxes size={16} /> {t('স্টাইল-ভিত্তিক এক্সেসরিজ', 'Style Accessory Tracking')}
          </Link>
          <Link to="/inventory/yarn-blocks" className={btnSecondary}>
            <MapPin size={16} /> {t('ইয়ার্ন ব্লক', 'Yarn Blocks')}
          </Link>
          <Link to="/inventory/yarn-leftover" className={btnSecondary}>
            <PiggyBank size={16} /> {t('ল্যাপটোভার ব্যাংক', 'Leftover Bank')}
          </Link>
          {can(profile?.role, 'inventory:manage') && (
            <Link to="/inventory/new" className={btnPrimary}>
              <Plus size={16} /> {t('নতুন আইটেম', 'New Item')}
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {[{ key: 'all', label: t('সব', 'All'), labelEn: 'All' }, ...ITEM_TYPES].map((tp) => (
          <button
            key={tp.key}
            onClick={() => setFilter(tp.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === tp.key ? 'bg-indigo text-white' : 'bg-surface text-ink-soft border border-line'
            }`}
          >
            {t(tp.label, tp.labelEn)}
          </button>
        ))}
      </div>

      {items === null || !stockReady ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : visible.length === 0 ? (
        <EmptyState title={t('কোনো আইটেম নেই', 'No items')} hint={t('নতুন আইটেম যোগ করে শুরু করুন।', 'Add a new item to get started.')} />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium">{t('নাম', 'Name')}</th>
                <th className="px-4 py-3 font-medium">{t('ধরন', 'Type')}</th>
                <th className="px-4 py-3 font-medium">{t('সাপ্লায়ার', 'Supplier')}</th>
                <th className="px-4 py-3 font-medium">{t('বর্তমান স্টক (লাইভ)', 'Current Stock (live)')}</th>
                <th className="px-4 py-3 font-medium">{t('অবস্থা', 'Status')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const stock = stockByItemId.get(i.id) || 0;
                const unit = i.type === 'yarn' ? YARN_UNIT : i.unit;
                const low = stock <= Number(i.reorderLevel || 0);
                return (
                  <tr
                    key={i.id}
                    onClick={() => (window.location.href = `/inventory/${i.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                  >
                    <td className="px-4 py-3">
                      <Link to={`/inventory/${i.id}`} className="font-medium text-ink">
                        {i.name}
                      </Link>
                      {i.spec && <p className="text-xs text-ink-soft">{i.spec}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {t(ITEM_TYPES.find((tp) => tp.key === i.type)?.label, ITEM_TYPES.find((tp) => tp.key === i.type)?.labelEn)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{i.supplier || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {stock.toFixed(i.type === 'yarn' ? 2 : 0)} {unit}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={low ? 'red' : 'green'}>{low ? t('রি-অর্ডার করুন', 'Reorder') : t('পর্যাপ্ত', 'Sufficient')}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      {hasAreaAdmin(profile, 'inventory') && (
                        <button onClick={(e) => handleDelete(e, i.id, i.name)} className="text-red hover:opacity-70">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
