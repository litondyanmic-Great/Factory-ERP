import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Trash2, Pencil, Truck, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { BLOCKS, can, hasAreaAdmin } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

const LEDGER_LABELS = {
  dyeingOrder: { bn: 'ডাইং অর্ডার', en: 'Dyeing Order' },
  receipt: { bn: 'রিসিভড (চালান)', en: 'Received (Chalan)' },
  issueToWinding: { bn: 'ওয়াইন্ডিং-এ ইস্যু', en: 'Issued to Winding' },
  issueToKnitting: { bn: 'সরাসরি নিটিং-এ ইস্যু', en: 'Issued Direct to Knitting' },
  windingToKnitting: { bn: 'ওয়াইন্ডিং থেকে নিটিং', en: 'Winding to Knitting' },
  consumption: { bn: 'নিটিং-এ খরচ হয়েছে', en: 'Consumed in Knitting' },
  blockAdjustIn: { bn: 'ব্লক সংশোধন (যোগ)', en: 'Block Adjustment (Add)' },
  blockAdjustOut: { bn: 'ব্লক সংশোধন (বিয়োগ)', en: 'Block Adjustment (Remove)' },
};

// This ledger (styles/{id}/yarnLedger) is now the ONLY place yarn stock
// movement is ever recorded — Item Detail and Inventory List both compute
// their "current stock" numbers live from it (and from the equivalent
// accessoryLedger). There used to be a second, separate stock counter on
// the inventoryItems catalog doc that got out of sync with this ledger;
// that's gone now, so there is exactly one source of truth and deleting
// an entry here is immediately and automatically reflected everywhere.
export default function StyleYarnTracking() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const [styleId, setStyleId] = useState(() => searchParams.get('style') || '');
  const [style, setStyle] = useState(null);
  const [yarnItems, setYarnItems] = useState([]);
  const [ledger, setLedger] = useState(null);

  const [receiveForm, setReceiveForm] = useState({ yarnItemId: '', qty: '', chalanNo: '', block: '', date: today(), notes: '' });
  const [issueForm, setIssueForm] = useState({ yarnItemId: '', destination: 'winding', block: '', qty: '', date: today(), notes: '' });
  const [adjustForm, setAdjustForm] = useState({ yarnItemId: '', direction: 'in', block: '', qty: '', date: today(), reason: '' });
  const [error, setError] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);

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
          adjustIn: 0,
          adjustOut: 0,
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
      if (e.type === 'blockAdjustIn') b.adjustIn += q;
      if (e.type === 'blockAdjustOut') b.adjustOut += q;
    });
    return Array.from(map.entries()).map(([yarnItemId, b]) => ({
      yarnItemId,
      ...b,
      balanceToReceive: b.ordered - b.received,
      atStore: b.received + b.adjustIn - b.adjustOut - b.issuedWinding - b.issuedKnitting,
      atWinding: b.issuedWinding - b.windingToKnitting,
      readyForKnitting: b.issuedKnitting + b.windingToKnitting - b.consumed,
    }));
  }, [ledger]);

  // Per-block balance for a given yarn item: how much of THIS style's yarn
  // is physically sitting in each block right now (received into that
  // block, plus/minus manual reconciliation adjustments, minus whatever's
  // already been issued out of that same block).
  const blockBalancesFor = (yarnItemId) => {
    const map = new Map();
    (ledger || [])
      .filter((e) => e.yarnItemId === yarnItemId)
      .forEach((e) => {
        const q = Number(e.qty || 0);
        if ((e.type === 'receipt' || e.type === 'blockAdjustIn') && e.block) {
          map.set(e.block, (map.get(e.block) || 0) + q);
        }
        if ((e.type === 'issueToWinding' || e.type === 'issueToKnitting' || e.type === 'blockAdjustOut') && e.block) {
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

  async function handleReceive(e) {
    e.preventDefault();
    setError('');
    const item = yarnItems.find((y) => y.id === receiveForm.yarnItemId);
    if (!item || !receiveForm.qty) {
      setError(t('ইয়ার্ন ও কোয়ান্টিটি দিন।', 'Select yarn and enter quantity.'));
      return;
    }
    if (!receiveForm.block) {
      setError(t('এই চালান কোন ব্লকে রাখা হবে তা নির্বাচন করুন।', 'Select which block this chalan will be stored in.'));
      return;
    }
    const n = Number(receiveForm.qty);
    // Block is set right here, at receive time, in one step — no separate
    // "assign a block later" page needed for the normal flow anymore.
    await addLedgerEntry('receipt', {
      yarnItemId: item.id,
      yarnItemName: item.name,
      qty: n,
      chalanNo: receiveForm.chalanNo || '',
      block: receiveForm.block,
      date: receiveForm.date,
      notes: receiveForm.notes || '',
    });
    setReceiveForm({ yarnItemId: '', qty: '', chalanNo: '', block: '', date: today(), notes: '' });
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
    setIssueForm({ yarnItemId: '', destination: 'winding', block: '', qty: '', date: today(), notes: '' });
  }

  async function handleAdjust(e) {
    e.preventDefault();
    setError('');
    const item = yarnItems.find((y) => y.id === adjustForm.yarnItemId);
    const n = Number(adjustForm.qty);
    if (!item || !n || n <= 0) {
      setError(t('ইয়ার্ন ও কোয়ান্টিটি দিন।', 'Select yarn and enter quantity.'));
      return;
    }
    if (!adjustForm.block) {
      setError(t('ব্লক নির্বাচন করুন।', 'Select a block.'));
      return;
    }
    if (adjustForm.direction === 'out') {
      const blockBal = blockBalancesFor(item.id).find((b) => b.block === adjustForm.block)?.qty || 0;
      if (n > blockBal + 0.001) {
        setError(
          t(
            `ব্লক ${adjustForm.block}-এ বর্তমানে ${blockBal.toFixed(2)} lb আছে, এর বেশি বিয়োগ করা যাবে না।`,
            `Block ${adjustForm.block} currently has ${blockBal.toFixed(2)} lb — cannot remove more than that.`
          )
        );
        return;
      }
    }
    await addLedgerEntry(adjustForm.direction === 'in' ? 'blockAdjustIn' : 'blockAdjustOut', {
      yarnItemId: item.id,
      yarnItemName: item.name,
      qty: n,
      block: adjustForm.block,
      date: adjustForm.date,
      notes: adjustForm.reason || t('ম্যানুয়াল সংশোধন', 'Manual reconciliation'),
    });
    setAdjustForm({ yarnItemId: '', direction: 'in', block: '', qty: '', date: today(), reason: '' });
  }

  async function handleDeleteEntry(entry) {
    const ok = window.confirm(
      t(
        '⚠️ সতর্কতা: এই এন্ট্রি মুছে ফেললে এই ইয়ার্নের সব ব্যালেন্স (স্টোর, ব্লক, ওয়াইন্ডিং, নিটিং-প্রস্তুত) এবং Inventory-তে দেখানো সামগ্রিক স্টক — সবকিছু স্বয়ংক্রিয়ভাবে পুনরায় হিসাব হবে, কারণ সবই এই একই লেজার থেকে সরাসরি হিসাব হয়। অন্য কোনো এন্ট্রি এটার উপর ভিত্তি করে দেওয়া হয়ে থাকলে ব্যালেন্স ঋণাত্মক দেখাতে পারে। তারপরও মুছে ফেলতে চান?',
        "⚠️ Warning: deleting this entry recalculates EVERYTHING for this yarn automatically — store, block, winding, ready-for-knitting balances, and the overall stock shown in Inventory — since all of it is computed directly from this same ledger. If a later entry depended on this one, a balance may now show negative. Still delete?"
      )
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', styleId, 'yarnLedger', entry.id));
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
            'একটি স্টাইল সার্চ করুন। ডাইং অর্ডার তৈরি হয় Inventory > নতুন আইটেম থেকে — এখান থেকে সাপ্লায়ার থেকে রিসিভ (চালান + ব্লক একসাথে) এবং ইয়ার্ন স্টোর থেকে ওয়াইন্ডিং/নিটিং-এ ইস্যু ট্র্যাক করুন। সব হিসাব পাউন্ড (lb)-এ।',
            "Search a style. Dyeing orders are created from Inventory > New Item — from here, track receiving from supplier (chalan + block together) and the Yarn Store issuing to Winding/Knitting. Everything in pounds (lb)."
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
              <form onSubmit={handleReceive} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Truck size={15} /> {t('সাপ্লায়ার থেকে রিসিভ', 'Receive from Supplier')}
                </h2>
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={receiveForm.yarnItemId} onChange={(e) => setReceiveForm((f) => ({ ...f, yarnItemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {yarnItems.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('রিসিভড কোয়ান্টিটি (lb) *', 'Received Quantity (lb) *')}>
                    <input type="number" min="0" step="0.01" value={receiveForm.qty} onChange={(e) => setReceiveForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('কোন ব্লকে রাখা হবে *', 'Store in Block *')}>
                    <select value={receiveForm.block} onChange={(e) => setReceiveForm((f) => ({ ...f, block: e.target.value }))} className={inputClass}>
                      <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                      {BLOCKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                </div>
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
                  <Send size={15} /> {t('ইয়ার্ন স্টোর থেকে ইস্যু', 'Issue from Yarn Store')}
                </h2>
                <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                  <select value={issueForm.yarnItemId} onChange={(e) => setIssueForm((f) => ({ ...f, yarnItemId: e.target.value, block: '' }))} className={inputClass}>
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
                      {t('এই ইয়ার্নের কোনো ব্লকে এখনো স্টক নেই — আগে রিসিভ করুন।', 'No block has any stock for this yarn yet — receive it first.')}
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

              {hasAreaAdmin(profile, 'inventory') && (
                <form onSubmit={handleAdjust} className="space-y-3 rounded-lg border border-amber bg-amber-soft/30 p-5">
                  <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                    {t('ব্লক সংশোধন (রিকনসিলিয়েশন)', 'Block Adjustment (Reconciliation)')}
                  </h2>
                  <p className="text-xs text-ink-soft">
                    {t(
                      'ভুল এন্ট্রি বা পুরনো ডেটা ঠিক করতে সরাসরি কোনো ব্লকের স্টক যোগ/বিয়োগ করুন — এটা সাধারণ রিসিভ/ইস্যু না, শুধু হিসাব মিলাতে ব্যবহার করুন।',
                      "Directly add/remove stock in a block to fix a mistake or reconcile old data — this isn't a normal receive/issue, use it only to correct the count."
                    )}
                  </p>
                  <Field label={t('ইয়ার্ন *', 'Yarn *')}>
                    <select value={adjustForm.yarnItemId} onChange={(e) => setAdjustForm((f) => ({ ...f, yarnItemId: e.target.value, block: '' }))} className={inputClass}>
                      <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                      {yarnItems.map((y) => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('দিক', 'Direction')}>
                    <select value={adjustForm.direction} onChange={(e) => setAdjustForm((f) => ({ ...f, direction: e.target.value }))} className={inputClass}>
                      <option value="in">{t('যোগ করুন (+)', 'Add (+)')}</option>
                      <option value="out">{t('বিয়োগ করুন (−)', 'Remove (−)')}</option>
                    </select>
                  </Field>
                  <Field label={t('ব্লক *', 'Block *')}>
                    <select value={adjustForm.block} onChange={(e) => setAdjustForm((f) => ({ ...f, block: e.target.value }))} className={inputClass}>
                      <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                      {BLOCKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    {adjustForm.direction === 'out' && adjustForm.yarnItemId && adjustForm.block && (
                      <p className="mt-1 text-xs text-ink-soft">
                        {t('বর্তমানে এই ব্লকে', 'Currently in this block')}:{' '}
                        {(blockBalancesFor(adjustForm.yarnItemId).find((b) => b.block === adjustForm.block)?.qty || 0).toFixed(2)} lb
                      </p>
                    )}
                  </Field>
                  <Field label={t('কোয়ান্টিটি (lb) *', 'Quantity (lb) *')}>
                    <input type="number" min="0" step="0.01" value={adjustForm.qty} onChange={(e) => setAdjustForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('তারিখ', 'Date')}>
                    <input type="date" value={adjustForm.date} onChange={(e) => setAdjustForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('কারণ *', 'Reason *')}>
                    <input value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} className={inputClass} placeholder={t('যেমন: ফিজিক্যাল কাউন্ট মেলাতে', 'e.g. to match physical count')} />
                  </Field>
                  <button type="submit" className={`${btnPrimary} w-full`}>{t('সংশোধন সেভ করুন', 'Save Adjustment')}</button>
                </form>
              )}
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
                          <div className="flex items-center gap-2">
                            {hasAreaAdmin(profile, 'inventory') && (
                              <>
                                <button onClick={() => setEditingEntry(e)} className="text-indigo hover:opacity-70">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => handleDeleteEntry(e)} className="text-red hover:opacity-70">
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
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

      {editingEntry && (
        <EditLedgerEntryModal
          entry={editingEntry}
          styleId={styleId}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}

// Admin/inventory-area-admin can correct a mistaken entry directly (wrong
// quantity, date, chalan number, block, or notes) instead of having to
// delete and re-create it. The entry's `type` never changes here — editing
// what an entry MEANS (receipt vs issue, etc.) would need a delete + new
// entry, since every balance formula depends on type staying fixed.
function EditLedgerEntryModal({ entry, styleId, onClose }) {
  const { t } = useLang();
  const [qty, setQty] = useState(String(entry.qty));
  const [date, setDate] = useState(entry.date);
  const [block, setBlock] = useState(entry.block || '');
  const [chalanNo, setChalanNo] = useState(entry.chalanNo || '');
  const [notes, setNotes] = useState(entry.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const showBlock = ['receipt', 'issueToWinding', 'issueToKnitting', 'blockAdjustIn', 'blockAdjustOut'].includes(entry.type);
  const showChalan = entry.type === 'receipt';

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', styleId, 'yarnLedger', entry.id), {
        qty: n,
        date,
        ...(showBlock ? { block } : {}),
        ...(showChalan ? { chalanNo } : {}),
        notes,
      });
      onClose();
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('এন্ট্রি এডিট করুন', 'Edit Entry')} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-xs text-ink-soft">
          {t(LEDGER_LABELS[entry.type]?.bn, LEDGER_LABELS[entry.type]?.en)} — {entry.yarnItemName}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('কোয়ান্টিটি (lb) *', 'Quantity (lb) *')}>
            <input type="number" min="0" step="0.01" className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label={t('তারিখ', 'Date')}>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {showBlock && (
            <Field label={t('ব্লক', 'Block')}>
              <select className={inputClass} value={block} onChange={(e) => setBlock(e.target.value)}>
                <option value="">{t('কোনোটি না', 'None')}</option>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
          )}
          {showChalan && (
            <Field label={t('চালান নং', 'Chalan No.')}>
              <input className={inputClass} value={chalanNo} onChange={(e) => setChalanNo(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={t('নোট', 'Notes')}>
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
