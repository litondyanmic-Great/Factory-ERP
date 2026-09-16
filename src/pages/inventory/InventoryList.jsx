import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Boxes, Wind } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { btnPrimary, btnSecondary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, ITEM_TYPES } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function InventoryList() {
  const { profile } = useAuth();
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const visible = (items || []).filter((i) => filter === 'all' || i.type === filter);

  async function handleDelete(e, id, name) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(t(`"${name}" আইটেমটি মুছে ফেলতে চান?`, `Delete item "${name}"?`));
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
    { key: 'currentStock', label: t('বর্তমান স্টক', 'Current Stock') },
    { key: 'unit', label: t('একক', 'Unit') },
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

      {items === null ? (
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
                <th className="px-4 py-3 font-medium">{t('বর্তমান স্টক', 'Current Stock')}</th>
                <th className="px-4 py-3 font-medium">{t('অবস্থা', 'Status')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const low = Number(i.currentStock) <= Number(i.reorderLevel);
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
                      {i.currentStock} {i.unit}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={low ? 'red' : 'green'}>{low ? t('রি-অর্ডার করুন', 'Reorder') : t('পর্যাপ্ত', 'Sufficient')}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      {profile?.role === 'admin' && (
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
