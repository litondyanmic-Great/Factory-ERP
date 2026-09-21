import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2, ImageOff } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { btnPrimary, EmptyState, ProgressBar, inputClass } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { can, stageLabel, FINAL_STAGE_KEY } from '../../lib/constants';
import { deleteStyleCascade } from '../../lib/deleteStyleCascade';
import { useLang } from '../../lib/i18n';

export default function StylesList() {
  const { profile } = useAuth();
  const { t, lang } = useLang();
  const [styles, setStyles] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'styles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!styles) return [];
    const s = search.trim().toLowerCase();
    if (!s) return styles;
    return styles.filter((st) =>
      [st.poNo, st.styleName, st.styleNo, st.buyer].some((v) => (v || '').toLowerCase().includes(s))
    );
  }, [styles, search]);

  async function handleDelete(e, id, label) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      t(
        `⚠️ "${label}" স্টাইলটি মুছে ফেললে এর সাথে যুক্ত সব ইয়ার্ন লেজার, এক্সেসরিজ লেজার ও প্রোডাকশন এন্ট্রিও স্থায়ীভাবে মুছে যাবে — কোথাও অবশিষ্ট থাকবে না। এই কাজ ফিরিয়ে আনা যাবে না। নিশ্চিত?`,
        `⚠️ Deleting style "${label}" also permanently deletes all its yarn ledger, accessory ledger and production entries — nothing will remain anywhere. This cannot be undone. Are you sure?`
      )
    );
    if (!ok) return;
    await deleteStyleCascade(id);
  }

  const exportColumns = [
    { key: 'poNo', label: t('PO নং', 'PO No.') },
    { key: 'styleName', label: t('স্টাইল নাম', 'Style Name') },
    { key: 'styleNo', label: t('স্টাইল নং', 'Style No.') },
    { key: 'buyer', label: t('বায়ার', 'Buyer') },
    { key: 'orderQty', label: t('অর্ডার কোয়ান্টিটি', 'Order Qty') },
    { key: 'shipDate', label: t('শিপমেন্ট ডেট', 'Ship Date') },
    {
      key: 'packing',
      label: stageLabel(FINAL_STAGE_KEY, lang),
      render: (r) => r.stages?.[FINAL_STAGE_KEY] || 0,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('প্রোডাকশন / স্টাইল সমূহ', 'Production / Styles')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('প্রতিটি অর্ডারের স্টেজ-ভিত্তিক অগ্রগতি দেখুন।', 'View stage-wise progress for every order.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportBar
            title={t('স্টাইল তালিকা', 'Styles List')}
            filename="styles-list"
            columns={exportColumns}
            rows={filtered}
          />
          {can(profile?.role, 'style:create') && (
            <Link to="/production/new" className={btnPrimary}>
              <Plus size={16} /> {t('নতুন স্টাইল', 'New Style')}
            </Link>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('PO নং, স্টাইল নাম বা স্টাইল নং দিয়ে সার্চ করুন…', 'Search by PO no, style name or style number…')}
          className={`${inputClass} pl-9`}
        />
      </div>

      {styles === null ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t('কোনো স্টাইল পাওয়া যায়নি', 'No styles found')}
          hint={search ? t('অন্য কিছু দিয়ে সার্চ করে দেখুন।', 'Try a different search.') : t('নতুন স্টাইল যোগ করে শুরু করুন।', 'Add a new style to get started.')}
        />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">{t('PO নং', 'PO No.')}</th>
                <th className="px-4 py-3 font-medium">{t('স্টাইল নং', 'Style No.')}</th>
                <th className="px-4 py-3 font-medium">{t('বায়ার', 'Buyer')}</th>
                <th className="px-4 py-3 font-medium">{t('অর্ডার কোয়ান্টিটি', 'Order Qty')}</th>
                <th className="px-4 py-3 font-medium">{t('শিপমেন্ট ডেট', 'Ship Date')}</th>
                <th className="px-4 py-3 font-medium">{stageLabel(FINAL_STAGE_KEY, lang)} {t('অগ্রগতি', 'progress')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => (window.location.href = `/production/${s.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                >
                  <td className="px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-line bg-paper">
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff size={14} className="text-ink-soft" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{s.poNo || '—'}</td>
                  <td className="px-4 py-3">
                    <Link to={`/production/${s.id}`} className="font-medium text-ink">
                      {s.styleNo}
                    </Link>
                    {s.styleName && <p className="text-xs text-ink-soft">{s.styleName}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{s.buyer}</td>
                  <td className="px-4 py-3 text-ink-soft">{Number(s.orderQty).toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.shipDate || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="w-40">
                      <ProgressBar value={s.stages?.[FINAL_STAGE_KEY] || 0} max={s.orderQty} tone="green" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {profile?.role === 'admin' && (
                      <button
                        onClick={(e) => handleDelete(e, s.id, s.styleNo)}
                        className="text-red hover:opacity-70"
                      >
                        <Trash2 size={15} />
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
  );
}
