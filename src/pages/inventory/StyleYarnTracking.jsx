import { useEffect, useMemo, useState } from 'react';
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
import { Trash2, Package, Truck, Send } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { can, hasAreaAdmin } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

const LEDGER_LABELS = {
  dyeingOrder: { bn: 'ডাইং অর্ডার', en: 'Dyeing Order' },
  receipt: { bn: 'রিসিভড (চালান)', en: 'Received (Chalan)' },
  issueToWinding: { bn: 'ওয়াইন্ডিং-এ ইস্যু', en: 'Issued to Winding' },
  issueToKnitting: { bn: 'সরাসরি নিটিং-এ ইস্যু', en: 'Issued Direct to Knitting' },
  windingToKnitting: { bn: 'ওয়াইন্ডিং থেকে নিটিং', en: 'Winding to Knitting' },
  consumption: { bn: 'নিটিং-এ খরচ হয়েছে', en: 'Consumed in Knitting' },
};

export default function StyleYarnTracking() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [yarnItems, setYarnItems] = useState([]);
  const [ledger, setLedger] = useState(null);

  const [orderForm, setOrderForm] = useState({ yarnItemId: '', supplier: '', qty: '', date: today(), notes: '' });
  const [receiveForm, setReceiveForm] = useState({ yarnItemId: '', qty: '', chalanNo: '', date: today(), notes: '' });
  const [issueForm, setIssueForm] = useState({ yarnItemId: '', destination: 'winding', block: '', qty: '', date: today(), notes: '' });
  const [error, setError] = useState('');

  function today() {
    return new Date().toISOString().slice(0, 10);
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
      setLedger(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'styles', styleId), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [styleId]);

  useEffect(() => {
    if (!styleId) return;
    const q = query(collection(db, 'styles', styleId, 'yarnLedger'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  // Per-yarn-item running balances, derived entirely from the ledger so
  // deleting a wrong entry always keeps everything consistent.
  const balances = useMemo(() => {
    const map = new Map();
    (ledger || []).forEach((e) => {
      if (!map.has(e.yarnItemId)) {
        map.set(e.yarnItemId, {
          yarnItemName: e.yarnItemName,
          ordered: 0,
          received: 0,
          issuedWinding: 0,
          issuedKnitting: 0,
          windingToKnitting: 0,
          consumed: 0,
        });
      }
      const b = map.get(e.yarnItemId);
      const q = Number(e.qty || 0);
      if (e.type === 'dyeingOrder') b.ordered += q;
      if (e.type === 'receipt') b.received += q;
      if (e.type === 'issueToWinding') b.issuedWinding += q;
      if (e.type === 'issueToKnitting') b.issuedKnitting += q;
      if (e.type === 'windingToKnitting') b.windingToKnitting += q;
      if (e.type === 'consumption') b.consumed += q;
    });
    return Array.from(map.entries()).map(([yarnItemId, b]) => ({
      yarnItemId,
      ...b,
      balanceToReceive: b.ordered - b.received,
      atStore: b.received - b.issuedWinding - b.issuedKnitting,
      atWinding: b.issuedWinding - b.windingToKnitting,
      readyForKnitting: b.issuedKnitting + b.windingToKnitting - b.consumed,
    }));
  }, [ledger]);

  // Per-block balance for a given yarn item: how much of THIS style's yarn
  // is physically sitting in each block right now (received into that
  // block, minus whatever's already been issued out of that same block).
  // This is what makes "issue" draw down a specific block instead of just
  // a generic store total.
  const blockBalancesFor = (yarnItemId) => {
    const map = new Map();
    (ledger || [])
      .filter((e) => e.yarnItemId === yarnItemId)
      .forEach((e) => {
        const q = Number(e.qty || 0);
        if (e.type === 'receipt' && e.block) {
          map.set(e.block, (map.get(e.block) || 0) + q);
        }
        if ((e.type === 'issueToWinding' || e.type === 'issueToKnitting') && e.block) {
          map.set(e.block, (map.get(e.block) || 0) - q);
        }
      });
    return Array.from(map.entries())
      .map(([block, qty]) => ({ block, qty }))
      .filter((b) => b.qty > 0.001);
  };

  const canManage = can(profile?.role, 'inventory:manage');

  async function addLedgerEntry(type, data) {
    await addDoc(collection(db, 'styles', styleId, 'yarnLedger'), {
      type,
      styleNo: style?.styleNo || '',
      styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '',
      ...data,
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
  }

  async function handleOrder(e) {
    e.preventDefault();
    setError('');
    const item = yarnItems.find((y) => y.id === orderForm.yarnItemId);
    if (!item || !orderForm.qty) {
      setError(t('ইয়ার্ন ও কোয়ান্টিটি দিন।', 'Select yarn and enter quantity.'));
      return;
    }
    await addLedgerEntry('dyeingOrder', {
      yarnItemId: item.id,
      yarnItemName: item.name,
      qty: Number(orderForm.qty),
      supplier: orderForm.supplier || '',
      date: orderForm.date,
      notes: orderForm.notes || '',
    });
    setOrderForm({ yarnItemId: '', supplier: '', qty: '', date: today(), notes: '' });
  }

  async function handleReceive(e) {
    e.preventDefault();
    setError('');
    const item = yarnItems.find((y) => y.id === receiveForm.yarnItemId);
    if (!item || !receiveForm.qty) {
      setError(t('ইয়ার্ন ও কোয়ান্টিটি দিন।', 'Select yarn and enter quantity.'));
      return;
    }
    const n = Number(receiveForm.qty);
    await addLedgerEntry('receipt', {
      yarnItemId: item.id,
      yarnItemName: item.name,
      qty: n,
      chalanNo: receiveForm.chalanNo || '',
      date: receiveForm.date,
      notes: receiveForm.notes || '',
    });
    // Receiving yarn adds it to the item's overall inventory stock too.
    await addDoc(collection(db, 'inventoryItems', item.id, 'transactions'), {
      type: 'in',
      quantity: n,
      note: t(`স্টাইল ${style?.styleNo} — চালান: ${receiveForm.chalanNo || '—'}`, `Style ${style?.styleNo} — Chalan: ${receiveForm.chalanNo || '—'}`),
      date: receiveForm.date,
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'inventoryItems', item.id), { currentStock: increment(n) });
    setReceiveForm({ yarnItemId: '', qty: '', chalanNo: '', date: today(), notes: '' });
  }

  async function handleIssue(e) {
    e.preventDefault();
    setError('');
    const item = yarnItems.find((y) => y.id === issueForm.yarnItemId);
    const n = Number(issueForm.qty);
    if (!item || !n) {
      setError(t('ইয়ার্ন ও কোয়ান্টিটি দিন।', 'Select yarn and enter quantity.'));
      return;
    }
    if (!issueForm.block) {
      setError(t('কোন ব্লক থেকে ইয়ার্ন নেওয়া হচ্ছে তা নির্বাচন করুন।', 'Select which block this yarn is being taken from.'));
      return;
    }
    const blockBal = blockBalancesFor(item.id).find((b) => b.block === issueForm.block)?.qty || 0;
    if (n > blockBal + 0.001) {
      setError(
        t(
          `ব্লক ${issueForm.block}-এ বর্তমানে ${blockBal.toFixed(2)} lb আছে, এর বেশি ইস্যু করা যাবে না।`,
          `Block ${issueForm.block} currently has ${blockBal.toFixed(2)} lb — cannot issue more than that.`
        )
      );
      return;
    }
    await addLedgerEntry(issueForm.destination === 'winding' ? 'issueToWinding' : 'issueToKnitting', {
      yarnItemId: item.id,
      yarnItemName: item.name,
      qty: n,
      block: issueForm.block,
      date: issueForm.date,
      notes: issueForm.notes || '',
    });
    // Issuing from the Yarn Store must reduce the store's visible stock —
    // this is the master inventoryItems.currentStock figure (receipts add
    // to it, issues subtract from it), separate from the style-scoped
    // "atStore" ledger balance shown in the table below.
    await updateDoc(doc(db, 'inventoryItems', item.id), { currentStock: increment(-n) });
    setIssueForm({ yarnItemId: '', destination: 'winding', block: '', qty: '', date: today(), notes: '' });
  }

  async function handleDeleteEntry(entry) {
    const ok = window.confirm(
      t(
        `⚠️ সতর্কতা: এই এন্ট্রি মুছে ফেললে এই ইয়ার্নের সব ব্যালেন্স (স্টোর, ওয়াইন্ডিং, নিটিং-প্রস্তুত, ব্লক) স্বয়ংক্রিয়ভাবে পুনরায় হিসাব হবে — অন্য কোনো এন্ট্রি এই মুছে ফেলা এন্ট্রির উপর ভিত্তি করে দেওয়া হয়ে থাকলে ব্যালেন্স ঋণাত্মক (নেগেটিভ) দেখাতে পারে। তারপরও মুছে ফেলতে চান?`,
        `⚠️ Warning: deleting this entry recalculates ALL balances for this yarn (store, winding, ready-for-knitting, block) automatically — if any later entry depended on this one, a balance may now show negative. Still delete?`
      )
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', styleId, 'yarnLedger', entry.id));
    // Receipts pushed stock into overall inventory — reverse that too.
    if (entry.type === 'receipt') {
      await updateDoc(doc(db, 'inventoryItems', entry.yarnItemId), { currentStock: increment(-entry.qty) });
    }
    // Issues (to winding or direct to knitting) pulled stock OUT of the
    // store — deleting a wrong issue entry must give that stock back.
    if (entry.type === 'issueToWinding' || entry.type === 'issueToKnitting') {
      await updateDoc(doc(db, 'inventoryItems', entry.yarnItemId), { currentStock: increment(entry.qty) });
    }
  }

  const ledgerExportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'type', label: t('ধরন', 'Type'), render: (r) => t(LEDGER_LABELS[r.type]?.bn, LEDGER_LABELS[r.type]?.en) },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'qty', label: t('কোয়ান্টিটি (lb)', 'Quantity (lb)') },
    { key: 'block', label: t('ব্লক', 'Block') },
    { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
    { key: 'chalanNo', label: t('চালান নং', 'Chalan No.') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  const balanceExportColumns = [
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'ordered', label: t('ডাইং অর্ডার (lb)', 'Dyeing Order (lb)') },
    { key: 'received', label: t('রিসিভড (lb)', 'Received (lb)') },
    { key: 'balanceToReceive', label: t('বাকি রিসিভ করতে হবে (lb)', 'Balance to Receive (lb)') },
    { key: 'atStore', label: t('স্টোরে আছে (lb)', 'At Store (lb)') },
    { key: 'atWinding', label: t('ওয়াইন্ডিং-এ আছে (lb)', 'At Winding (lb)') },
    { key: 'readyForKnitting', label: t('নিটিং-এর জন্য প্রস্তুত (lb)', 'Ready for Knitting (lb)') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং', 'Style-wise Yarn Tracking')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'একটি স্টাইল সার্চ করুন, তারপর ধাপে ধাপে ট্র্যাক করুন: ডাইং অর্ডার → সাপ্লায়ার থেকে রিসিভ (চালানসহ) → ইয়ার্ন স্টোর থেকে ওয়াইন্ডিং বা সরাসরি নিটিং-এ ইস্যু। সব হিসাব পাউন্ড (lb)-এ।',
            'Search a style, then track it step by step: Dyeing Order → Receive from Supplier (with chalan) → Yarn Store issues to Winding or directly to Knitting. Everything in pounds (lb).'
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

          {error && <p className="text-sm text-red">{error}</p>}

          {canManage && (
            <div className="grid gap-4 lg:grid-cols-3">
              <form onSubmit={handleOrder} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Package size={15} /> {t('১. ডাইং অর্ডার', '1. Dyeing Order')}
                </h2>
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={orderForm.yarnItemId} onChange={(e) => setOrderForm((f) => ({ ...f, yarnItemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {yarnItems.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('সাপ্লায়ার', 'Supplier')}>
                  <input value={orderForm.supplier} onChange={(e) => setOrderForm((f) => ({ ...f, supplier: e.target.value }))} className={inputClass} />
                </Field>
                <Field label={t('অর্ডার কোয়ান্টিটি (lb) *', 'Order Quantity (lb) *')}>
                  <input type="number" min="0" step="0.01" value={orderForm.qty} onChange={(e) => setOrderForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                </Field>
                <Field label={t('তারিখ', 'Date')}>
                  <input type="date" value={orderForm.date} onChange={(e) => setOrderForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                </Field>
                <button type="submit" className={`${btnPrimary} w-full`}>{t('অর্ডার সেভ করুন', 'Save Order')}</button>
              </form>

              <form onSubmit={handleReceive} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Truck size={15} /> {t('২. সাপ্লায়ার থেকে রিসিভ', '2. Receive from Supplier')}
                </h2>
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={receiveForm.yarnItemId} onChange={(e) => setReceiveForm((f) => ({ ...f, yarnItemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {yarnItems.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('রিসিভড কোয়ান্টিটি (lb) *', 'Received Quantity (lb) *')}>
                  <input type="number" min="0" step="0.01" value={receiveForm.qty} onChange={(e) => setReceiveForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                </Field>
                <Field label={t('চালান নং', 'Chalan No.')}>
                  <input value={receiveForm.chalanNo} onChange={(e) => setReceiveForm((f) => ({ ...f, chalanNo: e.target.value }))} className={inputClass} />
                </Field>
                <Field label={t('তারিখ', 'Date')}>
                  <input type="date" value={receiveForm.date} onChange={(e) => setReceiveForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                </Field>
                <button type="submit" className={`${btnPrimary} w-full`}>{t('রিসিভ সেভ করুন', 'Save Receipt')}</button>
              </form>

              <form onSubmit={handleIssue} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Send size={15} /> {t('৩. ইয়ার্ন স্টোর থেকে ইস্যু', '3. Issue from Yarn Store')}
                </h2>
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={issueForm.yarnItemId} onChange={(e) => setIssueForm((f) => ({ ...f, yarnItemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {yarnItems.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('কোথায় ইস্যু হবে', 'Issue To')}>
                  <select value={issueForm.destination} onChange={(e) => setIssueForm((f) => ({ ...f, destination: e.target.value }))} className={inputClass}>
                    <option value="winding">{t('ওয়াইন্ডিং সেকশন', 'Winding Section')}</option>
                    <option value="knitting">{t('সরাসরি নিটিং সেকশন', 'Direct to Knitting Section')}</option>
                  </select>
                </Field>
                <Field label={t('কোন ব্লক থেকে *', 'From Which Block *')}>
                  <select value={issueForm.block} onChange={(e) => setIssueForm((f) => ({ ...f, block: e.target.value }))} className={inputClass} disabled={!issueForm.yarnItemId}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {issueForm.yarnItemId &&
                      blockBalancesFor(issueForm.yarnItemId).map((b) => (
                        <option key={b.block} value={b.block}>
                          {t(`ব্লক ${b.block}`, `Block ${b.block}`)} — {b.qty.toFixed(2)} lb
                        </option>
                      ))}
                  </select>
                  {issueForm.yarnItemId && blockBalancesFor(issueForm.yarnItemId).length === 0 && (
                    <p className="mt-1 text-xs text-red">
                      {t(
                        'এই ইয়ার্নের কোনো ব্লক এখনো নির্ধারণ করা হয়নি (Inventory > ইয়ার্ন ব্লক পাতায় গিয়ে ব্লক দিন)।',
                        'No block has been assigned for this yarn yet (set one on Inventory > Yarn Blocks).'
                      )}
                    </p>
                  )}
                </Field>
                <Field label={t('ইস্যু কোয়ান্টিটি (lb) *', 'Issue Quantity (lb) *')}>
                  <input type="number" min="0" step="0.01" value={issueForm.qty} onChange={(e) => setIssueForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                </Field>
                <Field label={t('তারিখ', 'Date')}>
                  <input type="date" value={issueForm.date} onChange={(e) => setIssueForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                </Field>
                <button type="submit" className={`${btnPrimary} w-full`}>{t('ইস্যু সেভ করুন', 'Save Issue')}</button>
              </form>
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('ইয়ার্ন-ভিত্তিক ব্যালেন্স', 'Yarn-wise Balance')}</h2>
              <ExportBar
                small
                title={t('ইয়ার্ন-ভিত্তিক ব্যালেন্স', 'Yarn-wise Balance')}
                subtitle={`${style.styleNo} · ${style.buyer}`}
                filename={`yarn-balance-${style.styleNo}`}
                columns={balanceExportColumns}
                rows={balances}
              />
            </div>
            {balances.length === 0 ? (
              <EmptyState title={t('এখনো কোনো ডেটা নেই', 'No data yet')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                      <th className="py-2 pr-4 font-medium">{t('অর্ডার', 'Ordered')}</th>
                      <th className="py-2 pr-4 font-medium">{t('রিসিভড', 'Received')}</th>
                      <th className="py-2 pr-4 font-medium">{t('বাকি রিসিভ', 'To Receive')}</th>
                      <th className="py-2 pr-4 font-medium">{t('স্টোরে', 'At Store')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ওয়াইন্ডিং-এ', 'At Winding')}</th>
                      <th className="py-2 pr-4 font-medium">{t('নিটিং-প্রস্তুত', 'Knitting-Ready')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.yarnItemId} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{b.yarnItemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{b.ordered.toFixed(2)} lb</td>
                        <td className="py-2 pr-4 text-ink-soft">{b.received.toFixed(2)} lb</td>
                        <td className="py-2 pr-4 text-ink-soft">{b.balanceToReceive.toFixed(2)} lb</td>
                        <td className="py-2 pr-4 text-ink-soft">{b.atStore.toFixed(2)} lb</td>
                        <td className="py-2 pr-4 text-ink-soft">{b.atWinding.toFixed(2)} lb</td>
                        <td className="py-2 pr-4 font-medium text-ink">{b.readyForKnitting.toFixed(2)} lb</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('লেজার ইতিহাস', 'Ledger History')}</h2>
              <ExportBar
                small
                title={t('ইয়ার্ন লেজার', 'Yarn Ledger')}
                subtitle={`${style.styleNo} · ${style.buyer}`}
                filename={`yarn-ledger-${style.styleNo}`}
                columns={ledgerExportColumns}
                rows={ledger || []}
              />
            </div>
            {ledger === null ? (
              <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
            ) : ledger.length === 0 ? (
              <EmptyState title={t('এখনো কোনো এন্ট্রি নেই', 'No entries yet')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ধরন', 'Type')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ইয়ার্ন', 'Yarn')}</th>
                      <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                      <th className="py-2 pr-4 font-medium">{t('বিস্তারিত', 'Detail')}</th>
                      <th className="py-2 pr-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e) => (
                      <tr key={e.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                        <td className="py-2 pr-4 text-ink">{t(LEDGER_LABELS[e.type]?.bn, LEDGER_LABELS[e.type]?.en)}</td>
                        <td className="py-2 pr-4 text-ink-soft">{e.yarnItemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{e.qty} lb</td>
                        <td className="py-2 pr-4 text-ink-soft">
                          {e.block && `${t('ব্লক', 'Block')}: ${e.block} `}
                          {e.supplier && `${t('সাপ্লায়ার', 'Supplier')}: ${e.supplier} `}
                          {e.chalanNo && `${t('চালান', 'Chalan')}: ${e.chalanNo}`}
                          {e.notes}
                        </td>
                        <td className="py-2 pr-4">
                          {hasAreaAdmin(profile, 'inventory') && (
                            <button onClick={() => handleDeleteEntry(e)} className="text-red hover:opacity-70">
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
        </>
      )}
    </div>
  );
}
