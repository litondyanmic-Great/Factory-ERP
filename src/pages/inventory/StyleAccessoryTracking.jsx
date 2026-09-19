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
import { Trash2, PackageCheck, Send } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, EmptyState } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { ALL_SECTIONS, ACCESSORIES_SECTION, canEnterSection, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function StyleAccessoryTracking() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [accessoryItems, setAccessoryItems] = useState([]);
  const [ledger, setLedger] = useState(null);

  const [receiveForm, setReceiveForm] = useState({ itemId: '', qty: '', chalanNo: '', supplier: '', date: today(), notes: '' });
  const [issueForm, setIssueForm] = useState({ itemId: '', section: '', qty: '', date: today(), notes: '' });
  const [error, setError] = useState('');

  const canEnter = canEnterSection(profile, ACCESSORIES_SECTION.key) || profile?.role === 'admin' || profile?.role === 'store';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventoryItems'), (snap) =>
      setAccessoryItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.type === 'accessory'))
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
    const q = query(collection(db, 'styles', styleId, 'accessoryLedger'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  const balances = useMemo(() => {
    const map = new Map();
    (ledger || []).forEach((e) => {
      if (!map.has(e.itemId)) map.set(e.itemId, { itemName: e.itemName, unit: e.unit, received: 0, issued: 0 });
      const b = map.get(e.itemId);
      const q = Number(e.qty || 0);
      if (e.type === 'receipt') b.received += q;
      if (e.type === 'issue') b.issued += q;
    });
    return Array.from(map.entries()).map(([itemId, b]) => ({ itemId, ...b, balance: b.received - b.issued }));
  }, [ledger]);

  async function handleReceive(e) {
    e.preventDefault();
    setError('');
    const item = accessoryItems.find((i) => i.id === receiveForm.itemId);
    if (!item || !receiveForm.qty) {
      setError(t('আইটেম ও কোয়ান্টিটি দিন।', 'Select item and enter quantity.'));
      return;
    }
    const n = Number(receiveForm.qty);
    await addDoc(collection(db, 'styles', styleId, 'accessoryLedger'), {
      type: 'receipt',
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      qty: n,
      chalanNo: receiveForm.chalanNo || '',
      supplier: receiveForm.supplier || '',
      date: receiveForm.date,
      notes: receiveForm.notes || '',
      styleNo: style?.styleNo || '',
      styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '',
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'inventoryItems', item.id), { currentStock: increment(n) });
    await addDoc(collection(db, 'inventoryItems', item.id, 'transactions'), {
      type: 'in',
      quantity: n,
      note: t(`স্টাইল ${style?.styleNo} — চালান: ${receiveForm.chalanNo || '—'}`, `Style ${style?.styleNo} — Chalan: ${receiveForm.chalanNo || '—'}`),
      date: receiveForm.date,
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    setReceiveForm({ itemId: '', qty: '', chalanNo: '', supplier: '', date: today(), notes: '' });
  }

  async function handleIssue(e) {
    e.preventDefault();
    setError('');
    const item = accessoryItems.find((i) => i.id === issueForm.itemId);
    const n = Number(issueForm.qty);
    if (!item || !n || !issueForm.section) {
      setError(t('আইটেম, সেকশন ও কোয়ান্টিটি দিন।', 'Select item, section and enter quantity.'));
      return;
    }
    const bal = balances.find((b) => b.itemId === item.id)?.balance || 0;
    if (n > bal + 0.001) {
      setError(t(`স্টোরে বর্তমানে ${bal} ${item.unit} আছে, এর বেশি ইস্যু করা যাবে না।`, `Only ${bal} ${item.unit} available — cannot issue more.`));
      return;
    }
    await addDoc(collection(db, 'styles', styleId, 'accessoryLedger'), {
      type: 'issue',
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      qty: n,
      section: issueForm.section,
      date: issueForm.date,
      notes: issueForm.notes || '',
      styleNo: style?.styleNo || '',
      styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '',
      enteredBy: profile?.name || user?.email,
      createdAt: serverTimestamp(),
    });
    // Issuing to a production section must reduce the store's visible
    // stock, same as yarn issues do.
    await updateDoc(doc(db, 'inventoryItems', item.id), { currentStock: increment(-n) });
    setIssueForm({ itemId: '', section: '', qty: '', date: today(), notes: '' });
  }

  async function handleDelete(entry) {
    const ok = window.confirm(t('এই এন্ট্রিটি মুছে ফেলতে চান?', 'Delete this entry?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', styleId, 'accessoryLedger', entry.id));
    if (entry.type === 'receipt') {
      await updateDoc(doc(db, 'inventoryItems', entry.itemId), { currentStock: increment(-entry.qty) });
    }
    if (entry.type === 'issue') {
      await updateDoc(doc(db, 'inventoryItems', entry.itemId), { currentStock: increment(entry.qty) });
    }
  }

  const exportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'type', label: t('ধরন', 'Type'), render: (r) => (r.type === 'receipt' ? t('রিসিভড', 'Received') : t('ইস্যু', 'Issued')) },
    { key: 'itemName', label: t('আইটেম', 'Item') },
    { key: 'qty', label: t('কোয়ান্টিটি', 'Quantity') },
    { key: 'section', label: t('সেকশন', 'Section'), render: (r) => (r.section ? stageLabel(r.section, lang) : '') },
    { key: 'chalanNo', label: t('চালান নং', 'Chalan No.') },
    { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('স্টাইল-ভিত্তিক এক্সেসরিজ ট্র্যাকিং', 'Style-wise Accessory Tracking')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'একটি স্টাইল সার্চ করুন, তারপর এক্সেসরিজ স্টোর থেকে সেই স্টাইলের বিপরীতে আইটেম রিসিভ করুন (চালান/সাপ্লায়ারসহ), এরপর নির্দিষ্ট সেকশনে ইস্যু করুন — মেইন লেবেল, কেয়ার লেবেল, সাইজ লেবেল, প্রাইস স্টিকার, পলি স্টিকার, হ্যাংট্যাগ, পলিব্যাগ ইত্যাদি।',
            'Search a style, then receive items from the Accessories Store against it (with chalan/supplier), then issue to a specific section — main label, care label, size label, price sticker, poly sticker, hangtag, polybag, etc.'
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

          {canEnter && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={handleReceive} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <PackageCheck size={15} /> {t('আইটেম রিসিভ করুন', 'Receive Item')}
                </h2>
                <Field label={t('আইটেম *', 'Item *')}>
                  <select value={receiveForm.itemId} onChange={(e) => setReceiveForm((f) => ({ ...f, itemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {accessoryItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('কোয়ান্টিটি *', 'Quantity *')}>
                    <input type="number" min="0" step="0.01" value={receiveForm.qty} onChange={(e) => setReceiveForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('তারিখ', 'Date')}>
                    <input type="date" value={receiveForm.date} onChange={(e) => setReceiveForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('চালান নং', 'Chalan No.')}>
                    <input value={receiveForm.chalanNo} onChange={(e) => setReceiveForm((f) => ({ ...f, chalanNo: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('সাপ্লায়ার', 'Supplier')}>
                    <input value={receiveForm.supplier} onChange={(e) => setReceiveForm((f) => ({ ...f, supplier: e.target.value }))} className={inputClass} />
                  </Field>
                </div>
                <button type="submit" className={`${btnPrimary} w-full`}>{t('রিসিভ সেভ করুন', 'Save Receipt')}</button>
              </form>

              <form onSubmit={handleIssue} className="space-y-3 rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Send size={15} /> {t('সেকশনে ইস্যু করুন', 'Issue to Section')}
                </h2>
                <Field label={t('আইটেম *', 'Item *')}>
                  <select value={issueForm.itemId} onChange={(e) => setIssueForm((f) => ({ ...f, itemId: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {accessoryItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('সেকশন *', 'Section *')}>
                  <select value={issueForm.section} onChange={(e) => setIssueForm((f) => ({ ...f, section: e.target.value }))} className={inputClass}>
                    <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                    {ALL_SECTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : s.label}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('কোয়ান্টিটি *', 'Quantity *')}>
                    <input type="number" min="0" step="0.01" value={issueForm.qty} onChange={(e) => setIssueForm((f) => ({ ...f, qty: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label={t('তারিখ', 'Date')}>
                    <input type="date" value={issueForm.date} onChange={(e) => setIssueForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                  </Field>
                </div>
                <button type="submit" className={`${btnPrimary} w-full`}>{t('ইস্যু সেভ করুন', 'Save Issue')}</button>
              </form>
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('আইটেম-ভিত্তিক ব্যালেন্স', 'Item-wise Balance')}</h2>
            {balances.length === 0 ? (
              <EmptyState title={t('এখনো কোনো ডেটা নেই', 'No data yet')} />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.itemId} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">{b.itemName}</td>
                      <td className="py-2 pr-4 text-ink-soft">{t('রিসিভড', 'Received')}: {b.received} {b.unit}</td>
                      <td className="py-2 pr-4 text-ink-soft">{t('ইস্যু', 'Issued')}: {b.issued} {b.unit}</td>
                      <td className="py-2 pr-4 font-medium text-ink">{t('স্টোরে আছে', 'At Store')}: {b.balance} {b.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{t('লেজার ইতিহাস', 'Ledger History')}</h2>
              <ExportBar
                small
                title={t('এক্সেসরিজ লেজার', 'Accessory Ledger')}
                subtitle={`${style.styleNo} · ${style.buyer}`}
                filename={`accessory-ledger-${style.styleNo}`}
                columns={exportColumns}
                rows={ledger || []}
              />
            </div>
            {ledger === null ? (
              <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
            ) : ledger.length === 0 ? (
              <EmptyState title={t('এখনো কোনো এন্ট্রি নেই', 'No entries yet')} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                      <th className="py-2 pr-4 font-medium">{t('ধরন', 'Type')}</th>
                      <th className="py-2 pr-4 font-medium">{t('আইটেম', 'Item')}</th>
                      <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                      <th className="py-2 pr-4 font-medium">{t('বিস্তারিত', 'Detail')}</th>
                      <th className="py-2 pr-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e) => (
                      <tr key={e.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                        <td className="py-2 pr-4 text-ink">{e.type === 'receipt' ? t('রিসিভড', 'Received') : t('ইস্যু', 'Issued')}</td>
                        <td className="py-2 pr-4 text-ink-soft">{e.itemName}</td>
                        <td className="py-2 pr-4 text-ink-soft">{e.qty} {e.unit}</td>
                        <td className="py-2 pr-4 text-ink-soft">
                          {e.section && `${stageLabel(e.section, lang)} `}
                          {e.chalanNo && `${t('চালান', 'Chalan')}: ${e.chalanNo} `}
                          {e.supplier}
                        </td>
                        <td className="py-2 pr-4">
                          {profile?.role === 'admin' && (
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
        </>
      )}
    </div>
  );
}
