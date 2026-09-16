import { useEffect, useState } from 'react';
import { collectionGroup, doc, increment, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { WINDING_SECTION, canEnterSection } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

// Reads every styles/{id}/yarnAllocations/{allocId} doc across all styles
// (a Firestore collection-group query) so winding-section staff have one
// single queue instead of hunting through each style individually.
export default function WindingQueue() {
  const { profile } = useAuth();
  const { t } = useLang();
  const [allocations, setAllocations] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const canEnter = canEnterSection(profile, WINDING_SECTION.key) || profile?.role === 'admin' || profile?.role === 'store';

  useEffect(() => {
    const q = query(collectionGroup(db, 'yarnAllocations'));
    const unsub = onSnapshot(q, (snap) =>
      setAllocations(
        snap.docs
          .map((d) => ({
            id: d.id,
            stylePath: d.ref.parent.parent.id,
            styleRefPath: d.ref.path,
            ...d.data(),
          }))
          .filter((a) => Number(a.windingNeededQty || 0) > 0)
      )
    );
    return unsub;
  }, []);

  const pending = (allocations || []).filter((a) => (a.windingNeededQty || 0) - (a.windingDoneQty || 0) > 0.001);
  const completed = (allocations || []).filter((a) => (a.windingNeededQty || 0) - (a.windingDoneQty || 0) <= 0.001);

  async function handleWindingDone(a) {
    setError('');
    const n = Number(qtyInputs[a.id]);
    const remaining = (a.windingNeededQty || 0) - (a.windingDoneQty || 0);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    if (n > remaining + 0.001) {
      setError(t('বাকি থাকা ওয়াইন্ডিং কোয়ান্টিটির চেয়ে বেশি দেওয়া যাবে না।', 'Cannot exceed the remaining winding quantity.'));
      return;
    }
    setBusyId(a.id);
    try {
      await updateDoc(doc(db, a.styleRefPath), { windingDoneQty: increment(n) });
      setQtyInputs((q) => ({ ...q, [a.id]: '' }));
    } finally {
      setBusyId('');
    }
  }

  const exportColumns = [
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'windingNeededQty', label: t('ওয়াইন্ডিং প্রয়োজন (kg)', 'Needs Winding (kg)') },
    { key: 'windingDoneQty', label: t('ওয়াইন্ডিং সম্পন্ন (kg)', 'Winding Done (kg)') },
    {
      key: 'remaining',
      label: t('বাকি (kg)', 'Remaining (kg)'),
      render: (r) => ((r.windingNeededQty || 0) - (r.windingDoneQty || 0)).toFixed(2),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ওয়াইন্ডিং কিউ', 'Winding Queue')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'রিসিভড ইয়ার্নের যে অংশ ওয়াইন্ডিং প্রয়োজন তা এখানে দেখুন। ওয়াইন্ডিং শেষ হলে এন্ট্রি দিন — এরপর সেই ইয়ার্ন নিটিং-এর জন্য প্রস্তুত হয়ে যাবে।',
            'See the portion of received yarn that needs winding. Log completed winding here — once done, that yarn becomes ready for knitting.'
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
        {allocations === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : pending.length === 0 ? (
          <EmptyState title={t('ওয়াইন্ডিংয়ের জন্য কিছু বাকি নেই', 'Nothing pending for winding')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                  <th className="py-2 pr-4 font-medium">{t('প্রয়োজন', 'Needed')}</th>
                  <th className="py-2 pr-4 font-medium">{t('সম্পন্ন', 'Done')}</th>
                  <th className="py-2 pr-4 font-medium">{t('বাকি', 'Remaining')}</th>
                  {canEnter && <th className="py-2 pr-4 font-medium">{t('এন্ট্রি', 'Entry')}</th>}
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => {
                  const remaining = (a.windingNeededQty || 0) - (a.windingDoneQty || 0);
                  return (
                    <tr key={a.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">{a.yarnItemName}</td>
                      <td className="py-2 pr-4 text-ink-soft">{a.windingNeededQty} kg</td>
                      <td className="py-2 pr-4 text-ink-soft">{a.windingDoneQty || 0} kg</td>
                      <td className="py-2 pr-4 text-ink-soft">{remaining.toFixed(2)} kg</td>
                      {canEnter && (
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="kg"
                              className={`${inputClass} !w-24`}
                              value={qtyInputs[a.id] || ''}
                              onChange={(e) => setQtyInputs((q) => ({ ...q, [a.id]: e.target.value }))}
                            />
                            <button
                              onClick={() => handleWindingDone(a)}
                              disabled={busyId === a.id}
                              className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
                            >
                              {t('জমা দিন', 'Submit')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {completed.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('সম্পন্ন হয়েছে', 'Completed')}</h2>
          <div className="space-y-2">
            {completed.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{a.yarnItemName}</span>
                <Pill tone="green">{a.windingDoneQty} kg {t('সম্পন্ন', 'done')}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
