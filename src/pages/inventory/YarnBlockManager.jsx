import { useEffect, useMemo, useState } from 'react';
import { collectionGroup, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { BLOCKS, can } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

// Every "receipt" ledger entry (yarn received from a supplier, against a
// style's dyeing order) shows up here so the Yarn Manager can record which
// storage block (A through M) that lot was put in — and anyone can look a
// block up later to find what yarn is stored where.
export default function YarnBlockManager() {
  const { profile } = useAuth();
  const { t } = useLang();
  const [receipts, setReceipts] = useState(null);
  const [blockFilter, setBlockFilter] = useState('');
  const [busyId, setBusyId] = useState('');

  const canManage = can(profile?.role, 'inventory:manage');

  useEffect(() => {
    const q = query(collectionGroup(db, 'yarnLedger'), where('type', '==', 'receipt'));
    const unsub = onSnapshot(q, (snap) =>
      setReceipts(
        snap.docs
          .map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ref: d.ref, ...d.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      )
    );
    return unsub;
  }, []);

  const unassigned = (receipts || []).filter((r) => !r.block);
  const assigned = (receipts || []).filter((r) => r.block);
  const visible = blockFilter ? assigned.filter((r) => r.block === blockFilter) : assigned;

  const blockCounts = useMemo(() => {
    const map = Object.fromEntries(BLOCKS.map((b) => [b, 0]));
    assigned.forEach((r) => {
      map[r.block] = (map[r.block] || 0) + Number(r.qty || 0);
    });
    return map;
  }, [assigned]);

  async function assignBlock(entry, block) {
    setBusyId(entry.ref.path);
    try {
      await updateDoc(doc(db, entry.ref.path), { block });
    } finally {
      setBusyId('');
    }
  }

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'qty', label: t('কোয়ান্টিটি (lb)', 'Quantity (lb)') },
    { key: 'chalanNo', label: t('চালান নং', 'Chalan No.') },
    { key: 'block', label: t('ব্লক', 'Block') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('ইয়ার্ন ম্যানেজার — ব্লক অ্যাসাইনমেন্ট', 'Yarn Manager — Block Assignment')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t(
              'ইয়ার্ন কন্ট্রোলার রিসিভ এন্ট্রি দিলে এখানে চলে আসবে। কোন ব্লকে (A–M) রাখা হয়েছে তা এখানে সেট করুন, যাতে পরে সহজে খুঁজে পাওয়া যায়।',
              'Every yarn receipt entered by the Yarn Controller shows up here. Set which block (A–M) it was stored in, so it can be found easily later.'
            )}
          </p>
        </div>
        <Link to="/inventory/yarn-tracking" className="text-sm font-medium text-indigo hover:underline">
          {t('স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং', 'Style Yarn Tracking')}
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-13">
        {BLOCKS.map((b) => (
          <button
            key={b}
            onClick={() => setBlockFilter(blockFilter === b ? '' : b)}
            className={`rounded-lg border p-2 text-center transition-colors ${
              blockFilter === b ? 'border-indigo bg-indigo-soft' : 'border-line bg-surface hover:bg-paper'
            }`}
          >
            <p className="font-display text-sm font-semibold text-ink">{b}</p>
            <p className="text-[10px] text-ink-soft">{(blockCounts[b] || 0).toFixed(0)} lb</p>
          </button>
        ))}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber bg-amber-soft/40 p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">
            {t('ব্লক নির্ধারণ বাকি', 'Block Not Assigned Yet')} ({unassigned.length})
          </h2>
          <div className="space-y-2">
            {unassigned.map((r) => (
              <div key={r.ref.path} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface p-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{r.styleLabel} — {r.yarnItemName}</p>
                  <p className="text-xs text-ink-soft">
                    {r.date} · {r.qty} lb {r.chalanNo && `· ${t('চালান', 'Chalan')}: ${r.chalanNo}`}
                  </p>
                </div>
                {canManage && (
                  <select
                    className={`${inputClass} !w-28`}
                    disabled={busyId === r.ref.path}
                    value=""
                    onChange={(e) => e.target.value && assignBlock(r, e.target.value)}
                  >
                    <option value="">{t('ব্লক দিন', 'Set block')}</option>
                    {BLOCKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <MapPin size={15} />
            {blockFilter ? t(`ব্লক ${blockFilter}`, `Block ${blockFilter}`) : t('সব ব্লক', 'All Blocks')}
          </h2>
          <ExportBar small title={t('ইয়ার্ন ব্লক রিপোর্ট', 'Yarn Block Report')} filename="yarn-block-report" columns={exportColumns} rows={visible} />
        </div>
        {receipts === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : visible.length === 0 ? (
          <EmptyState title={t('কোনো এন্ট্রি নেই', 'No entries')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ব্লক', 'Block')}</th>
                  {canManage && <th className="py-2 pr-4 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.ref.path} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{r.date}</td>
                    <td className="py-2 pr-4 text-ink">{r.styleLabel}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.yarnItemName}</td>
                    <td className="py-2 pr-4 text-ink-soft">{r.qty} lb</td>
                    <td className="py-2 pr-4"><Pill>{r.block}</Pill></td>
                    {canManage && (
                      <td className="py-2 pr-4">
                        <select
                          className={`${inputClass} !w-24 !py-1 text-xs`}
                          disabled={busyId === r.ref.path}
                          value={r.block}
                          onChange={(e) => assignBlock(r, e.target.value)}
                        >
                          {BLOCKS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </td>
                    )}
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
