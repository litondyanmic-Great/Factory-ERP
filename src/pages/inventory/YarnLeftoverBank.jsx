import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { ArrowDownCircle, ArrowUpCircle, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState, Pill } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { can, hasAreaAdmin } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// A shared pool that leftover yarn from any style goes into once that
// style is done (or its yarn requirement was reduced) — separate from any
// one style's own ledger, since leftover yarn is explicitly meant to be
// reused across styles later. Every deposit and withdrawal is dated and
// fully recorded, and the whole ledger is downloadable.
export default function YarnLeftoverBank() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const [ledger, setLedger] = useState(null);

  const [depositForm, setDepositForm] = useState({ yarnItemName: '', sourceStyleId: '', qty: '', date: today(), notes: '' });
  const [withdrawForm, setWithdrawForm] = useState({ yarnItemName: '', useStyleId: '', qty: '', date: today(), notes: '' });
  const [error, setError] = useState('');

  const canManage = can(profile?.role, 'inventory:manage');

  useEffect(() => {
    const q = query(collection(db, 'yarnLeftoverLedger'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const balances = useMemo(() => {
    const map = new Map();
    (ledger || []).forEach((e) => {
      if (!map.has(e.yarnItemName)) map.set(e.yarnItemName, { deposited: 0, withdrawn: 0 });
      const b = map.get(e.yarnItemName);
      const q = Number(e.qty || 0);
      if (e.type === 'deposit') b.deposited += q;
      if (e.type === 'withdrawal') b.withdrawn += q;
    });
    return Array.from(map.entries())
      .map(([yarnItemName, b]) => ({ yarnItemName, ...b, balance: b.deposited - b.withdrawn }))
      .filter((b) => b.deposited > 0 || b.withdrawn > 0);
  }, [ledger]);

  async function handleDeposit(e) {
    e.preventDefault();
    setError('');
    const n = Number(depositForm.qty);
    if (!depositForm.yarnItemName.trim() || !n || n <= 0) {
      setError(t('ইয়ার্নের নাম ও কোয়ান্টিটি দিন।', 'Enter yarn name and quantity.'));
      return;
    }
    await addDoc(collection(db, 'yarnLeftoverLedger'), {
      type: 'deposit',
      yarnItemName: depositForm.yarnItemName.trim(),
      sourceStyleId: depositForm.sourceStyleId || '',
      qty: n,
      date: depositForm.date,
      notes: depositForm.notes || '',
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    setDepositForm({ yarnItemName: '', sourceStyleId: '', qty: '', date: today(), notes: '' });
  }

  async function handleWithdraw(e) {
    e.preventDefault();
    setError('');
    const n = Number(withdrawForm.qty);
    if (!withdrawForm.yarnItemName.trim() || !n || n <= 0) {
      setError(t('ইয়ার্নের নাম ও কোয়ান্টিটি দিন।', 'Enter yarn name and quantity.'));
      return;
    }
    const bal = balances.find((b) => b.yarnItemName === withdrawForm.yarnItemName.trim())?.balance || 0;
    if (n > bal + 0.001) {
      setError(
        t(
          `ল্যাপটোভার-এ এই ইয়ার্নের ${bal.toFixed(2)} lb আছে, এর বেশি নেওয়া যাবে না।`,
          `Only ${bal.toFixed(2)} lb of this yarn is in the leftover bank — cannot withdraw more.`
        )
      );
      return;
    }
    await addDoc(collection(db, 'yarnLeftoverLedger'), {
      type: 'withdrawal',
      yarnItemName: withdrawForm.yarnItemName.trim(),
      useStyleId: withdrawForm.useStyleId || '',
      qty: n,
      date: withdrawForm.date,
      notes: withdrawForm.notes || '',
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    setWithdrawForm({ yarnItemName: '', useStyleId: '', qty: '', date: today(), notes: '' });
  }

  async function handleDelete(entry) {
    const ok = window.confirm(t('এই এন্ট্রিটি মুছে ফেলতে চান?', 'Delete this entry?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'yarnLeftoverLedger', entry.id));
  }

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'type', label: t('ধরন', 'Type'), render: (r) => (r.type === 'deposit' ? t('জমা', 'Deposit') : t('উত্তোলন', 'Withdrawal')) },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'qty', label: t('কোয়ান্টিটি (lb)', 'Quantity (lb)') },
    { key: 'notes', label: t('নোট', 'Notes') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ল্যাপটোভার ইয়ার্ন ব্যাংক', 'Leftover Yarn Bank')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'কোনো স্টাইলের কাজ শেষে বা কমে গেলে অবশিষ্ট ইয়ার্ন এখানে জমা রাখুন — এটি নির্দিষ্ট কোনো স্টাইলের সাথে বাঁধা নয়, পরে যেকোনো স্টাইলের কাজে ব্যবহার করা যাবে। প্রতিটি জমা ও উত্তোলন তারিখসহ রেকর্ড থাকবে।',
            "Deposit leftover yarn here once a style's work is done or reduced — it isn't tied to any one style and can be used for any style later. Every deposit and withdrawal is dated and recorded."
          )}
        </p>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}

      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={handleDeposit} className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <ArrowDownCircle size={15} className="text-green" /> {t('জমা করুন (ডিপোজিট)', 'Deposit')}
            </h2>
            <Field label={t('ইয়ার্নের নাম *', 'Yarn Name *')}>
              <input className={inputClass} value={depositForm.yarnItemName} onChange={(e) => setDepositForm((f) => ({ ...f, yarnItemName: e.target.value }))} />
            </Field>
            <Field label={t('কোন স্টাইল থেকে এলো (ঐচ্ছিক)', 'Source Style (optional)')}>
              <StyleSearchSelect value={depositForm.sourceStyleId} onChange={(id) => setDepositForm((f) => ({ ...f, sourceStyleId: id || '' }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('কোয়ান্টিটি (lb) *', 'Quantity (lb) *')}>
                <input type="number" min="0" step="0.01" className={inputClass} value={depositForm.qty} onChange={(e) => setDepositForm((f) => ({ ...f, qty: e.target.value }))} />
              </Field>
              <Field label={t('তারিখ', 'Date')}>
                <input type="date" className={inputClass} value={depositForm.date} onChange={(e) => setDepositForm((f) => ({ ...f, date: e.target.value }))} />
              </Field>
            </div>
            <Field label={t('নোট', 'Notes')}>
              <input className={inputClass} value={depositForm.notes} onChange={(e) => setDepositForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
            <button type="submit" className={`${btnPrimary} w-full`}>{t('জমা সেভ করুন', 'Save Deposit')}</button>
          </form>

          <form onSubmit={handleWithdraw} className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <ArrowUpCircle size={15} className="text-amber" /> {t('উত্তোলন করুন (ব্যবহার)', 'Withdraw (Use)')}
            </h2>
            <Field label={t('ইয়ার্নের নাম *', 'Yarn Name *')}>
              <input className={inputClass} list="leftover-yarn-names" value={withdrawForm.yarnItemName} onChange={(e) => setWithdrawForm((f) => ({ ...f, yarnItemName: e.target.value }))} />
              <datalist id="leftover-yarn-names">
                {balances.map((b) => (
                  <option key={b.yarnItemName} value={b.yarnItemName} />
                ))}
              </datalist>
            </Field>
            <Field label={t('কোন স্টাইলে ব্যবহার হবে (ঐচ্ছিক)', 'Use For Style (optional)')}>
              <StyleSearchSelect value={withdrawForm.useStyleId} onChange={(id) => setWithdrawForm((f) => ({ ...f, useStyleId: id || '' }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('কোয়ান্টিটি (lb) *', 'Quantity (lb) *')}>
                <input type="number" min="0" step="0.01" className={inputClass} value={withdrawForm.qty} onChange={(e) => setWithdrawForm((f) => ({ ...f, qty: e.target.value }))} />
              </Field>
              <Field label={t('তারিখ', 'Date')}>
                <input type="date" className={inputClass} value={withdrawForm.date} onChange={(e) => setWithdrawForm((f) => ({ ...f, date: e.target.value }))} />
              </Field>
            </div>
            <Field label={t('নোট', 'Notes')}>
              <input className={inputClass} value={withdrawForm.notes} onChange={(e) => setWithdrawForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
            <button type="submit" className={`${btnPrimary} w-full`}>{t('উত্তোলন সেভ করুন', 'Save Withdrawal')}</button>
          </form>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('বর্তমান ব্যালেন্স', 'Current Balance')}</h2>
        {balances.length === 0 ? (
          <EmptyState title={t('ব্যাংকে এখনো কিছু নেই', 'Bank is empty')} />
        ) : (
          <div className="space-y-2">
            {balances.map((b) => (
              <div key={b.yarnItemName} className="flex items-center justify-between text-sm">
                <span className="text-ink">{b.yarnItemName}</span>
                <Pill tone={b.balance > 0 ? 'green' : 'amber'}>{b.balance.toFixed(2)} lb</Pill>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">{t('লেজার ইতিহাস', 'Ledger History')}</h2>
          <ExportBar small title={t('ল্যাপটোভার ইয়ার্ন ব্যাংক', 'Leftover Yarn Bank')} filename="yarn-leftover-bank" columns={exportColumns} rows={ledger || []} />
        </div>
        {ledger === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : ledger.length === 0 ? (
          <EmptyState title={t('এখনো কোনো এন্ট্রি নেই', 'No entries yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium"></th>
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('নোট', 'Notes')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4">
                      {e.type === 'deposit' ? <ArrowDownCircle size={15} className="text-green" /> : <ArrowUpCircle size={15} className="text-amber" />}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                    <td className="py-2 pr-4 text-ink">{e.yarnItemName}</td>
                    <td className="py-2 pr-4 text-ink-soft">{e.type === 'deposit' ? '+' : '−'}{e.qty} lb</td>
                    <td className="py-2 pr-4 text-ink-soft">{e.notes}</td>
                    <td className="py-2 pr-4">
                      {hasAreaAdmin(profile, 'inventory') && (
                        <button onClick={() => handleDelete(e)} className="text-red hover:opacity-70">
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
