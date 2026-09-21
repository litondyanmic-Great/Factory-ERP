import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, collectionGroup, onSnapshot, query, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { WINDING_SECTION, canEnterSection } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

// Reads every styles/{id}/yarnLedger/{entryId} doc across all styles (a
// Firestore collection-group query) and nets issueToWinding against
// windingToKnitting per (style, yarn) so winding-section staff have one
// single cross-style queue instead of hunting through each style page.
export default function WindingQueue() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const [entries, setEntries] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const canEnter = canEnterSection(profile, WINDING_SECTION.key) || profile?.role === 'admin' || profile?.role === 'store';

  useEffect(() => {
    const q = query(collectionGroup(db, 'yarnLedger'));
    const unsub = onSnapshot(q, (snap) =>
      setEntries(
        snap.docs
          .map((d) => ({ id: d.id, styleId: d.ref.parent.parent.id, ...d.data() }))
          .filter((e) => e.type === 'issueToWinding' || e.type === 'windingToKnitting')
      )
    );
    return unsub;
  }, []);

  const rows = useMemo(() => {
    const map = new Map();
    (entries || []).forEach((e) => {
      const key = `${e.styleId}__${e.yarnItemId}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          styleId: e.styleId,
          styleLabel: e.styleLabel || e.styleNo,
          yarnItemId: e.yarnItemId,
          yarnItemName: e.yarnItemName,
          issued: 0,
          done: 0,
        });
      }
      const r = map.get(key);
      const q = Number(e.qty || 0);
      if (e.type === 'issueToWinding') r.issued += q;
      if (e.type === 'windingToKnitting') r.done += q;
    });
    return Array.from(map.values()).map((r) => ({ ...r, remaining: r.issued - r.done }));
  }, [entries]);

  const pending = rows.filter((r) => r.remaining > 0.001);
  const completed = rows.filter((r) => r.remaining <= 0.001 && r.issued > 0);

  async function handleWindingDone(row) {
    setError('');
    const n = Number(qtyInputs[row.key]);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    if (n > row.remaining + 0.001) {
      setError(t('বাকি থাকা ওয়াইন্ডিং কোয়ান্টিটির চেয়ে বেশি দেওয়া যাবে না।', 'Cannot exceed the remaining winding quantity.'));
      return;
    }
    setBusyKey(row.key);
    try {
      await addDoc(collection(db, 'styles', row.styleId, 'yarnLedger'), {
        type: 'windingToKnitting',
        yarnItemId: row.yarnItemId,
        yarnItemName: row.yarnItemName,
        styleLabel: row.styleLabel,
        qty: n,
        date: new Date().toISOString().slice(0, 10),
        notes: '',
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      setQtyInputs((q) => ({ ...q, [row.key]: '' }));
    } finally {
      setBusyKey('');
    }
  }

  const exportColumns = [
    { key: 'styleLabel', label: t('স্টাইল', 'Style') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'issued', label: t('ওয়াইন্ডিং-এ ইস্যু হয়েছে (lb)', 'Issued to Winding (lb)') },
    { key: 'done', label: t('ওয়াইন্ডিং সম্পন্ন (lb)', 'Winding Done (lb)') },
    { key: 'remaining', label: t('বাকি (lb)', 'Remaining (lb)') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ওয়াইন্ডিং কিউ', 'Winding Queue')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'ইয়ার্ন স্টোর থেকে ওয়াইন্ডিং-এ ইস্যু হওয়া ইয়ার্নের তালিকা এখানে দেখুন। ওয়াইন্ডিং শেষ হলে এন্ট্রি দিন — সাথে সাথে সেই ইয়ার্ন নিটিং-এর জন্য প্রস্তুত হয়ে যাবে (স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং পাতায় দেখা যাবে)। সব হিসাব পাউন্ড (lb)-এ।',
            'See yarn issued from the Yarn Store to Winding here. Log completed winding — that yarn instantly becomes ready for knitting (visible on the Style Yarn Tracking page). Everything in pounds (lb).'
          )}
        </p>
      </div>

      {!canEnter && (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-soft">
          {t('এই পাতা শুধু দেখার অনুমতি আছে।', 'You have view-only access to this page.')}
        </p>
      )}

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('বাকি আছে', 'Pending')}</h2>
          <ExportBar small title={t('ওয়াইন্ডিং কিউ', 'Winding Queue')} filename="winding-queue" columns={exportColumns} rows={pending} />
        </div>
        {entries === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : pending.length === 0 ? (
          <EmptyState title={t('ওয়াইন্ডিংয়ের জন্য কিছু বাকি নেই', 'Nothing pending for winding')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ইস্যু হয়েছে', 'Issued')}</th>
                  <th className="py-2 pr-4 font-medium">{t('সম্পন্ন', 'Done')}</th>
                  <th className="py-2 pr-4 font-medium">{t('বাকি', 'Remaining')}</th>
                  {canEnter && <th className="py-2 pr-4 font-medium">{t('এন্ট্রি', 'Entry')}</th>}
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.key} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{row.styleLabel}</td>
                    <td className="py-2 pr-4 text-ink-soft">{row.yarnItemName}</td>
                    <td className="py-2 pr-4 text-ink-soft">{row.issued.toFixed(2)} lb</td>
                    <td className="py-2 pr-4 text-ink-soft">{row.done.toFixed(2)} lb</td>
                    <td className="py-2 pr-4 text-ink-soft">{row.remaining.toFixed(2)} lb</td>
                    {canEnter && (
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="lb"
                            className={`${inputClass} !w-24`}
                            value={qtyInputs[row.key] || ''}
                            onChange={(e) => setQtyInputs((q) => ({ ...q, [row.key]: e.target.value }))}
                          />
                          <button
                            onClick={() => handleWindingDone(row)}
                            disabled={busyKey === row.key}
                            className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
                          >
                            {t('জমা দিন', 'Submit')}
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="py-2 pr-4">
                      <Link
                        to={`/inventory/yarn-tracking?style=${row.styleId}`}
                        className="text-xs font-medium text-indigo hover:underline"
                      >
                        {t('এডিট/ডিলিট →', 'Edit/Delete →')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {completed.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('সম্পন্ন হয়েছে', 'Completed')}</h2>
          <div className="space-y-2">
            {completed.map((row) => (
              <div key={row.key} className="flex items-center justify-between text-sm">
                <span className="text-ink">{row.styleLabel} — {row.yarnItemName}</span>
                <div className="flex items-center gap-3">
                  <Pill tone="green">{row.done.toFixed(2)} lb {t('সম্পন্ন', 'done')}</Pill>
                  <Link to={`/inventory/yarn-tracking?style=${row.styleId}`} className="text-xs font-medium text-indigo hover:underline">
                    {t('এডিট/ডিলিট →', 'Edit/Delete →')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
