import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { PackageCheck, Trash2, Pencil } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { can, hasAreaAdmin } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

const RESULTS = [
  { key: 'pass', bn: 'পাস', en: 'Pass' },
  { key: 'conditional', bn: 'কন্ডিশনাল পাস', en: 'Conditional Pass' },
  { key: 'fail', bn: 'ফেইল', en: 'Fail' },
];

function resultLabel(key, t) {
  const r = RESULTS.find((x) => x.key === key);
  return r ? t(r.bn, r.en) : key;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// GPQ logs final inspection + shipment here, per style (optionally per PO
// and/or colour). Every record lives at styles/{id}/shipments, mirroring
// the yarnLedger/accessoryLedger/productionEntries pattern — so it's easy
// to see just one style's shipment history, AND (via the collectionGroup
// query below) get one combined report across every style at once.
export default function ShipmentTracking() {
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [shipments, setShipments] = useState(null);
  const [allShipments, setAllShipments] = useState(null);

  const [form, setForm] = useState({
    poNo: '',
    colour: '',
    shippedQty: '',
    finalInspectionDate: today(),
    result: 'pass',
    shipDate: today(),
    notes: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const [buyerFilter, setBuyerFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const canEnter = can(profile?.role, 'shipment:entry') || hasAreaAdmin(profile, 'quality') || hasAreaAdmin(profile, 'production');

  useEffect(() => {
    if (!styleId) {
      setStyle(null);
      setShipments(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'styles', styleId), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [styleId]);

  useEffect(() => {
    if (!styleId) return;
    const q = query(collection(db, 'styles', styleId, 'shipments'), orderBy('shipDate', 'desc'));
    const unsub = onSnapshot(q, (snap) => setShipments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [styleId]);

  // Cross-style report: every shipment record, from every style, in one
  // place — this is the "all styles" report the factory asked for.
  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'shipments'), orderBy('shipDate', 'desc')), (snap) =>
      setAllShipments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  const buyers = useMemo(() => {
    const set = new Set((allShipments || []).map((s) => s.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [allShipments]);

  const filteredAllShipments = (allShipments || []).filter(
    (s) =>
      (buyerFilter === 'all' || s.buyer === buyerFilter) &&
      (!from || s.shipDate >= from) &&
      (!to || s.shipDate <= to)
  );

  const totalShippedForStyle = (shipments || []).reduce((sum, s) => sum + Number(s.shippedQty || 0), 0);
  const remainingForStyle = style ? Number(style.orderQty || 0) - totalShippedForStyle : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const qty = Number(form.shippedQty);
    if (!qty || qty <= 0) {
      setError(t('সঠিক শিপড কোয়ান্টিটি দিন।', 'Enter a valid shipped quantity.'));
      return;
    }
    if (!form.finalInspectionDate || !form.shipDate) {
      setError(t('ফাইনাল ইন্সপেকশন ও শিপমেন্ট তারিখ দিন।', 'Enter final inspection and shipment dates.'));
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'styles', styleId, 'shipments'), {
        styleNo: style?.styleNo || '',
        styleName: style?.styleName || '',
        buyer: style?.buyer || '',
        poNo: form.poNo || '',
        colour: form.colour || '',
        shippedQty: qty,
        finalInspectionDate: form.finalInspectionDate,
        result: form.result,
        shipDate: form.shipDate,
        notes: form.notes || '',
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      });
      setForm({ poNo: '', colour: '', shippedQty: '', finalInspectionDate: today(), result: 'pass', shipDate: today(), notes: '' });
    } catch (err) {
      setError(t('সেভ করা যায়নি, আবার চেষ্টা করুন।', 'Could not save, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry) {
    const ok = window.confirm(t('এই শিপমেন্ট এন্ট্রি মুছে ফেলতে চান?', 'Delete this shipment entry?'));
    if (!ok) return;
    await deleteDoc(doc(db, 'styles', entry.styleId || styleId, 'shipments', entry.id));
  }

  const styleColumns = [
    { key: 'shipDate', label: t('শিপমেন্ট তারিখ', 'Ship Date') },
    { key: 'poNo', label: 'PO' },
    { key: 'colour', label: t('কালার', 'Colour') },
    { key: 'shippedQty', label: t('শিপড কোয়ান্টিটি', 'Shipped Qty') },
    { key: 'finalInspectionDate', label: t('ফাইনাল ইন্সপেকশন তারিখ', 'Final Inspection Date') },
    { key: 'result', label: t('ফলাফল', 'Result'), render: (r) => resultLabel(r.result, t) },
    { key: 'notes', label: t('নোট', 'Notes') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  const allColumns = [
    { key: 'styleNo', label: t('স্টাইল', 'Style') },
    { key: 'buyer', label: t('বায়ার', 'Buyer') },
    { key: 'poNo', label: 'PO' },
    { key: 'colour', label: t('কালার', 'Colour') },
    { key: 'shippedQty', label: t('শিপড কোয়ান্টিটি', 'Shipped Qty') },
    { key: 'finalInspectionDate', label: t('ফাইনাল ইন্সপেকশন তারিখ', 'Final Inspection Date') },
    { key: 'result', label: t('ফলাফল', 'Result'), render: (r) => resultLabel(r.result, t) },
    { key: 'shipDate', label: t('শিপমেন্ট তারিখ', 'Ship Date') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {t('ফাইনাল ইন্সপেকশন ও শিপমেন্ট ট্র্যাকিং', 'Final Inspection & Shipment Tracking')}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'ফাইনাল ইন্সপেকশনের পর প্রোডাক্ট শিপমেন্ট হওয়ার এন্ট্রি দিন এবং সব স্টাইল বা নির্দিষ্ট স্টাইলের শিপমেন্ট রিপোর্ট দেখুন/ডাউনলোড করুন।',
            'Log the shipment after final inspection, and view/download shipment reports for one style or every style.'
          )}
        </p>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-ink">
          <PackageCheck size={16} /> {t('নির্দিষ্ট স্টাইলের জন্য এন্ট্রি', 'Log Entry for a Style')}
        </h2>
        <div className="max-w-md">
          <StyleSearchSelect value={styleId} onChange={(id) => setStyleId(id)} />
        </div>

        {style && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper p-3 text-sm">
              <span className="font-medium text-ink">
                {style.styleNo} {style.styleName && `— ${style.styleName}`} · {style.buyer}
              </span>
              <span className="text-ink-soft">
                {t('অর্ডার', 'Order')}: {Number(style.orderQty || 0).toLocaleString('en-US')} ·{' '}
                {t('শিপড', 'Shipped')}: {totalShippedForStyle.toLocaleString('en-US')} ·{' '}
                {t('বাকি', 'Remaining')}: {remainingForStyle.toLocaleString('en-US')}
              </span>
            </div>

            {canEnter && (
              <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-paper/50 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {Array.isArray(style.pos) && style.pos.length > 0 ? (
                    <>
                      <Field label="PO">
                        <select
                          value={form.poNo}
                          onChange={(e) => setForm((f) => ({ ...f, poNo: e.target.value, colour: '' }))}
                          className={inputClass}
                        >
                          <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                          {style.pos.map((po, i) => (
                            <option key={i} value={po.poNo}>{po.poNo}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('কালার', 'Colour')}>
                        <select
                          value={form.colour}
                          onChange={(e) => setForm((f) => ({ ...f, colour: e.target.value }))}
                          className={inputClass}
                          disabled={!form.poNo}
                        >
                          <option value="">{t('সব কালার', 'All colours')}</option>
                          {(style.pos.find((po) => po.poNo === form.poNo)?.colours || []).map((c, i) => (
                            <option key={i} value={c.colour}>{c.colour}</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <Field label="PO">
                      <input value={form.poNo} onChange={(e) => setForm((f) => ({ ...f, poNo: e.target.value }))} className={inputClass} placeholder={style.poNo || ''} />
                    </Field>
                  )}
                  <Field label={t('শিপড কোয়ান্টিটি *', 'Shipped Quantity *')}>
                    <input
                      type="number"
                      min="1"
                      value={form.shippedQty}
                      onChange={(e) => setForm((f) => ({ ...f, shippedQty: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('ফাইনাল ইন্সপেকশন তারিখ *', 'Final Inspection Date *')}>
                    <input
                      type="date"
                      value={form.finalInspectionDate}
                      onChange={(e) => setForm((f) => ({ ...f, finalInspectionDate: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t('ফলাফল', 'Result')}>
                    <select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} className={inputClass}>
                      {RESULTS.map((r) => (
                        <option key={r.key} value={r.key}>{t(r.bn, r.en)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('শিপমেন্ট তারিখ *', 'Shipment Date *')}>
                    <input
                      type="date"
                      value={form.shipDate}
                      onChange={(e) => setForm((f) => ({ ...f, shipDate: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label={t('নোট (ঐচ্ছিক)', 'Notes (optional)')}>
                  <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputClass} />
                </Field>
                {error && <p className="text-sm text-red">{error}</p>}
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? t('সেভ হচ্ছে…', 'Saving…') : t('শিপমেন্ট এন্ট্রি সেভ করুন', 'Save Shipment Entry')}
                </button>
              </form>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {t('এই স্টাইলের শিপমেন্ট ইতিহাস', 'This Style\'s Shipment History')}
                </h3>
                <ExportBar
                  small
                  title={t('শিপমেন্ট রিপোর্ট', 'Shipment Report')}
                  subtitle={`${style.styleNo} · ${style.buyer}`}
                  filename={`shipment-report-${style.styleNo}`}
                  columns={styleColumns}
                  rows={shipments || []}
                />
              </div>
              {shipments === null ? (
                <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
              ) : shipments.length === 0 ? (
                <EmptyState title={t('এখনো কোনো শিপমেন্ট এন্ট্রি নেই', 'No shipment entries yet')} />
              ) : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-ink-soft">
                        <th className="py-2 pr-4 font-medium">{t('শিপমেন্ট তারিখ', 'Ship Date')}</th>
                        <th className="py-2 pr-4 font-medium">PO / {t('কালার', 'Colour')}</th>
                        <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Qty')}</th>
                        <th className="py-2 pr-4 font-medium">{t('ফলাফল', 'Result')}</th>
                        <th className="py-2 pr-4 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.map((s) => (
                        <tr key={s.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-4 text-ink-soft">{s.shipDate}</td>
                          <td className="py-2 pr-4 text-ink-soft">{s.poNo}{s.poNo && s.colour ? ' / ' : ''}{s.colour}</td>
                          <td className="py-2 pr-4 text-ink">{s.shippedQty}</td>
                          <td className="py-2 pr-4 text-ink-soft">{resultLabel(s.result, t)}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              {canEnter && (
                                <button onClick={() => setEditingEntry({ ...s, styleId })} className="text-indigo hover:opacity-70">
                                  <Pencil size={14} />
                                </button>
                              )}
                              {hasAreaAdmin(profile, 'quality') && (
                                <button onClick={() => handleDelete({ ...s, styleId })} className="text-red hover:opacity-70">
                                  <Trash2 size={14} />
                                </button>
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
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সব স্টাইলের শিপমেন্ট রিপোর্ট', 'All-Styles Shipment Report')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className={`${inputClass} !w-auto text-xs`}>
              <option value="all">{t('সব বায়ার', 'All Buyers')}</option>
              {buyers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} !w-auto text-xs`} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} !w-auto text-xs`} />
            <ExportBar
              small
              title={t('সব স্টাইলের শিপমেন্ট রিপোর্ট', 'All-Styles Shipment Report')}
              filename="all-styles-shipment-report"
              columns={allColumns}
              rows={filteredAllShipments}
            />
          </div>
        </div>
        {allShipments === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : filteredAllShipments.length === 0 ? (
          <EmptyState title={t('এখনো কোনো শিপমেন্ট ডেটা নেই', 'No shipment data yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('স্টাইল', 'Style')}</th>
                  <th className="py-2 pr-4 font-medium">{t('বায়ার', 'Buyer')}</th>
                  <th className="py-2 pr-4 font-medium">PO / {t('কালার', 'Colour')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Qty')}</th>
                  <th className="py-2 pr-4 font-medium">{t('ফলাফল', 'Result')}</th>
                  <th className="py-2 pr-4 font-medium">{t('শিপমেন্ট তারিখ', 'Ship Date')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllShipments.slice(0, 200).map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{s.styleNo}</td>
                    <td className="py-2 pr-4 text-ink-soft">{s.buyer}</td>
                    <td className="py-2 pr-4 text-ink-soft">{s.poNo}{s.poNo && s.colour ? ' / ' : ''}{s.colour}</td>
                    <td className="py-2 pr-4 text-ink-soft">{s.shippedQty}</td>
                    <td className="py-2 pr-4 text-ink-soft">{resultLabel(s.result, t)}</td>
                    <td className="py-2 pr-4 text-ink-soft">{s.shipDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingEntry && <EditShipmentModal entry={editingEntry} onClose={() => setEditingEntry(null)} />}
    </div>
  );
}

function EditShipmentModal({ entry, onClose }) {
  const { t } = useLang();
  const [shippedQty, setShippedQty] = useState(String(entry.shippedQty));
  const [finalInspectionDate, setFinalInspectionDate] = useState(entry.finalInspectionDate);
  const [result, setResult] = useState(entry.result);
  const [shipDate, setShipDate] = useState(entry.shipDate);
  const [notes, setNotes] = useState(entry.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const n = Number(shippedQty);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', entry.styleId, 'shipments', entry.id), {
        shippedQty: n,
        finalInspectionDate,
        result,
        shipDate,
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
    <Modal title={t('শিপমেন্ট এন্ট্রি এডিট করুন', 'Edit Shipment Entry')} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('শিপড কোয়ান্টিটি *', 'Shipped Quantity *')}>
            <input type="number" min="1" className={inputClass} value={shippedQty} onChange={(e) => setShippedQty(e.target.value)} />
          </Field>
          <Field label={t('ফলাফল', 'Result')}>
            <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value)}>
              {RESULTS.map((r) => (
                <option key={r.key} value={r.key}>{t(r.bn, r.en)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('ফাইনাল ইন্সপেকশন তারিখ', 'Final Inspection Date')}>
            <input type="date" className={inputClass} value={finalInspectionDate} onChange={(e) => setFinalInspectionDate(e.target.value)} />
          </Field>
          <Field label={t('শিপমেন্ট তারিখ', 'Shipment Date')}>
            <input type="date" className={inputClass} value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
          </Field>
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
