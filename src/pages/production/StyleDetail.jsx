import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { ArrowLeft, Pencil, Trash2, ImagePlus, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary, btnDanger, EmptyState, Modal } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { STAGES, can, canEnterSection, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';
import { fileToCompressedDataUrl } from '../../lib/imageUtils';
import PoColourEditor, { emptyPo, posSummary, poSubtotal } from '../../components/PoColourEditor';

export default function StyleDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [style, setStyle] = useState(undefined);
  const [entries, setEntries] = useState(null);
  const [entriesStageFilter, setEntriesStageFilter] = useState('all');
  const [yarnItems, setYarnItems] = useState([]);
  const [yarnLedger, setYarnLedger] = useState([]);

  const allowedStages = useMemo(() => STAGES.filter((s) => canEnterSection(profile, s.key)), [profile]);

  // Per-yarn-item "ready for knitting" balance for THIS style, derived from
  // the same style-scoped yarn ledger that Inventory > Style Yarn Tracking
  // uses. Knitting production is gated on this: no yarn received/issued to
  // this style yet => knitting entry is blocked, matching the factory rule
  // that knitting cannot start before the yarn store has released yarn.
  const yarnReadyBalances = useMemo(() => {
    const map = new Map();
    yarnLedger.forEach((e) => {
      if (!map.has(e.yarnItemId)) {
        map.set(e.yarnItemId, { yarnItemId: e.yarnItemId, yarnItemName: e.yarnItemName, issuedKnitting: 0, windingToKnitting: 0, consumed: 0 });
      }
      const b = map.get(e.yarnItemId);
      const q = Number(e.qty || 0);
      if (e.type === 'issueToKnitting') b.issuedKnitting += q;
      if (e.type === 'windingToKnitting') b.windingToKnitting += q;
      if (e.type === 'consumption') b.consumed += q;
    });
    return Array.from(map.values())
      .map((b) => ({ ...b, ready: b.issuedKnitting + b.windingToKnitting - b.consumed }))
      .filter((b) => b.ready > 0.001);
  }, [yarnLedger]);
  const totalYarnReady = yarnReadyBalances.reduce((s, b) => s + b.ready, 0);
  const [stage, setStage] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [yarnItemId, setYarnItemId] = useState('');
  const [yarnQty, setYarnQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingStyle, setEditingStyle] = useState(false);

  useEffect(() => {
    if (allowedStages.length && !stage) setStage(allowedStages[0].key);
  }, [allowedStages, stage]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'styles', id), (snap) =>
      setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'styles', id, 'productionEntries'), orderBy('date', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventoryItems'), (snap) =>
      setYarnItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.type === 'yarn'))
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'styles', id, 'yarnLedger'), (snap) =>
      setYarnLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [id]);

  async function handleAddEntry(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!n || n <= 0) {
      setError(t('সঠিক কোয়ান্টিটি দিন।', 'Enter a valid quantity.'));
      return;
    }
    if (!canEnterSection(profile, stage)) {
      setError(t('এই সেকশনে এন্ট্রি দেওয়ার অনুমতি নেই।', 'You are not permitted to enter data for this section.'));
      return;
    }

    const stageIndex = STAGES.findIndex((s) => s.key === stage);

    if (stage === STAGES[0].key) {
      // Knitting is gated on yarn: the store must have issued/wound yarn
      // for this style before any knitting entry can be logged.
      if (totalYarnReady <= 0) {
        setError(
          t(
            'এই স্টাইলের জন্য এখনো কোনো ইয়ার্ন ইস্যু হয়নি — নিটিং প্রোডাকশন শুরু করার আগে ইয়ার্ন স্টোর থেকে ইয়ার্ন ইস্যু করতে হবে (Inventory > স্টাইল-ভিত্তিক ইয়ার্ন ট্র্যাকিং)।',
            'No yarn has been issued for this style yet — the Yarn Store must issue yarn (Inventory > Style-wise Yarn Tracking) before knitting production can start.'
          )
        );
        return;
      }
      if (!yarnItemId) {
        setError(t('কোন ইয়ার্নের বিপরীতে উৎপাদন হচ্ছে তা নির্বাচন করুন।', 'Select which yarn this production is against.'));
        return;
      }
      const bal = yarnReadyBalances.find((b) => b.yarnItemId === yarnItemId);
      const ready = bal?.ready || 0;
      const usedNow = Number(yarnQty || 0);
      if (!usedNow || usedNow <= 0) {
        setError(t('ইয়ার্ন খরচ (lb) দিন।', 'Enter yarn used (lb).'));
        return;
      }
      if (usedNow > ready + 0.001) {
        setError(
          t(
            `এই ইয়ার্নের জন্য শুধু ${ready.toFixed(2)} lb প্রস্তুত আছে, এর বেশি খরচ দেখানো যাবে না।`,
            `Only ${ready.toFixed(2)} lb of this yarn is ready — cannot log more than that as used.`
          )
        );
        return;
      }
    } else if (stageIndex > 0) {
      // Every later stage is capped by how much WIP the previous stage has
      // actually produced (that stage's cumulative output minus what this
      // stage has already consumed of it) — a stage can't "invent" pieces
      // that were never sent forward from the one before it.
      const prevKey = STAGES[stageIndex - 1].key;
      const available = (style.stages?.[prevKey] || 0) - (style.stages?.[stage] || 0);
      if (n > available + 0.0001) {
        setError(
          t(
            `${stageLabel(STAGES[stageIndex - 1].key, 'bn')} থেকে এখনো এই স্টেজে মাত্র ${available} পিস এসেছে (বাকি), এর বেশি এন্ট্রি দেওয়া যাবে না।`,
            `Only ${available} pcs is currently available from ${stageLabel(STAGES[stageIndex - 1].key, 'en')} — cannot log more than that here.`
          )
        );
        return;
      }
    }

    if (stage === 'knitting' && yarnItemId && !yarnQty) {
      setError(t('ইয়ার্ন কোয়ান্টিটি দিন অথবা ইয়ার্ন সিলেকশন খালি রাখুন।', 'Enter yarn quantity or clear the yarn selection.'));
      return;
    }
    setBusy(true);
    try {
      const entryData = {
        stage,
        quantity: n,
        note: note || '',
        date: entryDate,
        enteredBy: profile?.name || user?.email,
        createdAt: serverTimestamp(),
      };
      if (stage === 'knitting' && yarnItemId) {
        entryData.yarnItemId = yarnItemId;
        entryData.yarnItemName = yarnItems.find((y) => y.id === yarnItemId)?.name || '';
        entryData.yarnQty = Number(yarnQty);
      }
      const entryRef = await addDoc(collection(db, 'styles', id, 'productionEntries'), entryData);
      await updateDoc(doc(db, 'styles', id), { [`stages.${stage}`]: increment(n) });
      if (entryData.yarnItemId) {
        await updateDoc(doc(db, 'inventoryItems', entryData.yarnItemId), {
          currentStock: increment(-entryData.yarnQty),
        });
        // Also record it on this style's yarn ledger, so the "ready for
        // knitting" balance on the Style Yarn Tracking page stays accurate.
        // Keep a back-reference on the production entry so deleting it can
        // clean up the matching ledger row too.
        const ledgerRef = await addDoc(collection(db, 'styles', id, 'yarnLedger'), {
          type: 'consumption',
          yarnItemId: entryData.yarnItemId,
          yarnItemName: entryData.yarnItemName,
          styleNo: style?.styleNo || '',
          styleLabel: style ? `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}` : '',
          qty: entryData.yarnQty,
          date: entryDate,
          notes: t('নিটিং প্রোডাকশন এন্ট্রি থেকে', 'From knitting production entry'),
          enteredBy: profile?.name || user?.email,
          createdAt: serverTimestamp(),
        });
        await updateDoc(entryRef, { yarnLedgerId: ledgerRef.id });
      }
      setQty('');
      setNote('');
      setYarnItemId('');
      setYarnQty('');
    } catch (err) {
      setError(t('এন্ট্রি যোগ করা যায়নি।', 'Could not add entry.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(entry) {
    const ok = window.confirm(t('এই এন্ট্রিটি মুছে ফেলতে চান?', 'Delete this entry?'));
    if (!ok) return;
    await updateDoc(doc(db, 'styles', id), { [`stages.${entry.stage}`]: increment(-entry.quantity) });
    if (entry.yarnItemId && entry.yarnLedgerId) {
      // Deleting the matching yarn-consumption ledger entry is enough —
      // every yarn balance (store/block/winding/ready-for-knitting) is
      // computed live from this ledger, so nothing else needs touching.
      await deleteDoc(doc(db, 'styles', id, 'yarnLedger', entry.yarnLedgerId));
    }
    await deleteDoc(doc(db, 'styles', id, 'productionEntries', entry.id));
  }

  // Firestore never auto-deletes a document's subcollections, so deleting
  // just the style doc would leave its productionEntries/yarnLedger/
  // accessoryLedger documents orphaned — and since Reports, the
  // Dashboard, Yarn Blocks and Item Detail all read those via
  // collectionGroup() queries across every style, an orphaned style's
  // data would keep showing up everywhere forever. This fetches and
  // deletes every subcollection document first, then the style itself.
  async function handleDeleteStyle() {
    const ok = window.confirm(
      t(
        `⚠️ "${style.styleNo}" স্টাইলটি স্থায়ীভাবে মুছে ফেলতে চান? এর সব প্রোডাকশন এন্ট্রি, ইয়ার্ন লেজার এবং এক্সেসরিজ লেজার — সবকিছু মুছে যাবে এবং কোনো রিপোর্টে আর দেখা যাবে না। এটা ফিরিয়ে আনা যাবে না।`,
        `⚠️ Permanently delete style "${style.styleNo}"? All of its production entries, yarn ledger, and accessory ledger will be deleted and will no longer appear in any report. This cannot be undone.`
      )
    );
    if (!ok) return;
    setBusy(true);
    try {
      const subcollections = ['productionEntries', 'yarnLedger', 'accessoryLedger'];
      for (const sub of subcollections) {
        const snap = await getDocs(collection(db, 'styles', id, sub));
        const docs = snap.docs;
        // Firestore batches cap at 500 writes — chunk just in case a
        // style somehow has more entries than that.
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(doc(db, 'styles', id));
      navigate('/production');
    } catch (err) {
      setError(t('স্টাইল মুছে ফেলা যায়নি, আবার চেষ্টা করুন।', 'Could not delete the style, please try again.'));
      setBusy(false);
    }
  }

  if (style === undefined) return <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>;
  if (style === null) return <EmptyState title={t('স্টাইল পাওয়া যায়নি', 'Style not found')} />;

  const canEditStyle = can(profile?.role, 'style:edit');

  // Yarn consumption report (per yarn item) for this style's knitting entries.
  const yarnConsumption = (entries || [])
    .filter((e) => e.yarnItemId)
    .reduce((acc, e) => {
      const k = e.yarnItemId;
      acc[k] = acc[k] || { name: e.yarnItemName, qty: 0 };
      acc[k].qty += Number(e.yarnQty || 0);
      return acc;
    }, {});
  const yarnConsumptionRows = Object.values(yarnConsumption);

  const entryExportColumns = [
    { key: 'date', label: t('তারিখ', 'Date') },
    { key: 'stage', label: t('স্টেজ', 'Stage'), render: (r) => stageLabel(r.stage, lang) },
    { key: 'quantity', label: t('কোয়ান্টিটি', 'Quantity') },
    { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
    { key: 'yarnQty', label: t('ইয়ার্ন খরচ (lb)', 'Yarn Used (lb)') },
    { key: 'enteredBy', label: t('এন্ট্রি করেছেন', 'Entered By') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/production" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft size={16} /> {t('সব স্টাইল', 'All Styles')}
        </Link>
        <Link to={`/production/${id}/report`} className="text-sm font-medium text-indigo hover:underline">
          {t('সম্পূর্ণ রিপোর্ট দেখুন →', 'View Full Report →')}
        </Link>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
              {style.imageUrl ? (
                <img src={style.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={20} className="text-ink-soft" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-ink">{style.styleNo}</h1>
              {style.styleName && <p className="text-sm text-ink">{style.styleName}</p>}
              <p className="text-sm text-ink-soft">{style.buyer}</p>
              <p className="text-xs text-ink-soft">
                {style.poNo && <>PO: {style.poNo} · </>}
                {style.colour && <>{t('কালার', 'Colour')}: {style.colour} · </>}
                {style.gg && <>GG: {style.gg}</>}
              </p>
              {style.yarnComposition && (
                <p className="mt-1 text-xs text-ink-soft">{t('কম্পোজিশন', 'Composition')}: {style.yarnComposition}</p>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p>{t('অর্ডার', 'Order')}: {Number(style.orderQty).toLocaleString('en-US')} {t('পিস', 'pcs')}</p>
            {style.orderDate && <p>{t('তারিখ', 'Date')}: {style.orderDate}</p>}
            {style.shipDate && <p>{t('শিপমেন্ট', 'Shipment')}: {style.shipDate}</p>}
            <div className="mt-2 flex justify-end gap-3">
              {canEditStyle && (
                <button
                  onClick={() => setEditingStyle(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline"
                >
                  <Pencil size={13} /> {t('এডিট', 'Edit')}
                </button>
              )}
              {profile?.role === 'admin' && (
                <button
                  onClick={handleDeleteStyle}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red hover:underline"
                >
                  <Trash2 size={13} /> {t('ডিলিট', 'Delete')}
                </button>
              )}
            </div>
          </div>
        </div>
        {style.notes && <p className="mt-3 text-sm text-ink-soft">{style.notes}</p>}

        {Array.isArray(style.pos) && style.pos.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {t('PO ও কালার-ওয়াইজ ব্রেকডাউন', 'PO & Colour-wise Breakdown')}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {style.pos.map((po, i) => (
                <div key={i} className="rounded-md border border-line bg-paper p-3">
                  <p className="text-sm font-medium text-ink">PO: {po.poNo}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                    {po.colours.map((c, j) => (
                      <li key={j} className="flex justify-between">
                        <span>{c.colour}</span>
                        <span>{Number(c.qty).toLocaleString('en-US')}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 border-t border-line pt-1 text-right text-xs font-semibold text-ink">
                    {t('সাবটোটাল', 'Subtotal')}: {poSubtotal(po).toLocaleString('en-US')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingStyle && (
        <EditStyleModal style={style} onClose={() => setEditingStyle(false)} />
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 font-display text-sm font-semibold text-ink">{t('স্টেজ-ভিত্তিক অগ্রগতি', 'Stage-wise Progress')}</h2>
        <p className="mb-4 text-xs text-ink-soft">
          {t(
            'একটি স্টেজে এন্ট্রি দেওয়া মানেই সেটা পরের স্টেজের জন্য স্বয়ংক্রিয়ভাবে "পাঠানো" হয়ে যায় — যেমন নিটিং ১০০ পিস করলে লিংকিং সর্বোচ্চ ১০০ পিস এন্ট্রি দিতে পারবে, তার বেশি না। "WIP" ব্যাজ দেখায় আগের স্টেজ থেকে কত পিস এখনো এই স্টেজে আসেনি ঢোকানো — অর্থাৎ বাকি আছে।',
            'Logging an entry at one stage automatically "sends" it forward to the next — e.g. once Knitting has done 100 pcs, Linking can log at most 100 pcs, no more. The "WIP" badge shows how much has been sent from the previous stage but not yet entered here.'
          )}
        </p>
        <div className="space-y-4">
          {STAGES.map((s, i) => {
            const done = style.stages?.[s.key] || 0;
            const pct = style.orderQty > 0 ? Math.min(100, Math.round((done / style.orderQty) * 100)) : 0;
            const overQty = done - Number(style.orderQty || 0);
            const overPct = style.orderQty > 0 && overQty > 0 ? Math.round((overQty / style.orderQty) * 100) : 0;
            const prevDone = i > 0 ? style.stages?.[STAGES[i - 1].key] || 0 : null;
            const wip = i > 0 ? Math.max(0, prevDone - done) : null;
            return (
              <div key={s.key}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-sm">
                  <span className="text-ink">{lang === 'en' ? s.labelEn : s.label}</span>
                  <span className="flex items-center gap-2 text-ink-soft">
                    {i > 0 && wip > 0 && (
                      <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                        {t('WIP', 'WIP')}: {wip.toLocaleString('en-US')}
                      </span>
                    )}
                    {overPct > 0 && (
                      <span className="rounded-full bg-red-soft px-2 py-0.5 text-xs font-medium text-red">
                        +{overPct}% {t('বেশি', 'over')}
                      </span>
                    )}
                    <span>
                      {done.toLocaleString('en-US')} / {Number(style.orderQty).toLocaleString('en-US')}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${overPct > 0 ? 'bg-red' : 'bg-indigo'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {can(profile?.role, 'production:entry') && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{t('প্রোডাকশন এন্ট্রি', 'Production Entry')}</h2>
          {allowedStages.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {t(
                'আপনাকে এখনো কোনো সেকশন এসাইন করা হয়নি। অ্যাডমিনকে বলুন Admin > User Management থেকে আপনার সেকশন ঠিক করে দিতে।',
                'No section has been assigned to you yet. Ask an admin to set your section under Admin > User Management.'
              )}
            </p>
          ) : (
            <form onSubmit={handleAddEntry} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label={t('তারিখ', 'Date')}>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('স্টেজ', 'Stage')}>
                  <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                    {allowedStages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {lang === 'en' ? s.labelEn : s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('কোয়ান্টিটি', 'Quantity')}>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('নোট (ঐচ্ছিক)', 'Note (optional)')}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
                </Field>
              </div>

              {stage === 'knitting' && (
                <div className="grid gap-4 rounded-md border border-line bg-paper/50 p-3 sm:grid-cols-2">
                  {totalYarnReady <= 0 ? (
                    <p className="sm:col-span-2 text-sm text-red">
                      {t(
                        'এই স্টাইলের জন্য এখনো কোনো ইয়ার্ন প্রস্তুত নেই — আগে ইয়ার্ন স্টোর থেকে ইস্যু করতে হবে।',
                        'No yarn is ready for this style yet — the Yarn Store must issue yarn first.'
                      )}
                    </p>
                  ) : (
                    <>
                      <Field label={t('কোন ইয়ার্নের বিপরীতে *', 'Against which yarn *')}>
                        <select value={yarnItemId} onChange={(e) => setYarnItemId(e.target.value)} className={inputClass}>
                          <option value="">{t('নির্বাচন করুন', 'Select')}</option>
                          {yarnReadyBalances.map((b) => (
                            <option key={b.yarnItemId} value={b.yarnItemId}>
                              {b.yarnItemName} ({b.ready.toFixed(2)} lb {t('প্রস্তুত', 'ready')})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('ইয়ার্ন খরচ (lb) *', 'Yarn Used (lb) *')}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={yarnQty}
                          onChange={(e) => setYarnQty(e.target.value)}
                          className={inputClass}
                          disabled={!yarnItemId}
                        />
                      </Field>
                    </>
                  )}
                </div>
              )}

              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? t('যোগ হচ্ছে…', 'Adding…') : t('এন্ট্রি যোগ করুন', 'Add Entry')}
              </button>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </div>
      )}

      {yarnConsumptionRows.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">{t('নিটিং — ইয়ার্ন খরচের রিপোর্ট', 'Knitting — Yarn Consumption Report')}</h2>
            <ExportBar
              small
              title={t('ইয়ার্ন খরচের রিপোর্ট', 'Yarn Consumption Report')}
              subtitle={`${style.styleNo} · ${style.buyer}`}
              filename={`yarn-consumption-${style.styleNo}`}
              columns={[
                { key: 'name', label: t('ইয়ার্ন', 'Yarn') },
                { key: 'qty', label: t('মোট খরচ (lb)', 'Total Used (lb)') },
              ]}
              rows={yarnConsumptionRows}
            />
          </div>
          <table className="w-full text-sm">
            <tbody>
              {yarnConsumptionRows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 text-ink">{r.name}</td>
                  <td className="py-2 text-ink-soft">{r.qty.toLocaleString('en-US')} lb</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">{t('সাম্প্রতিক এন্ট্রি (কবে কোন স্টেজে কত)', 'Recent Entries (when, which stage, how much)')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={entriesStageFilter} onChange={(e) => setEntriesStageFilter(e.target.value)} className={`${inputClass} !w-auto !py-1.5 text-xs`}>
              <option value="all">{t('সব স্টেজ', 'All Stages')}</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : s.label}</option>
              ))}
            </select>
            <ExportBar
              small
              title={t('প্রোডাকশন এন্ট্রি', 'Production Entries')}
              subtitle={`${style.styleNo} · ${style.buyer}`}
              filename={`production-entries-${style.styleNo}`}
              columns={entryExportColumns}
              rows={entries || []}
            />
          </div>
        </div>
        {entries === null ? (
          <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
        ) : entries.filter((e) => entriesStageFilter === 'all' || e.stage === entriesStageFilter).length === 0 ? (
          <EmptyState title={t('এখনো কোনো এন্ট্রি নেই', 'No entries yet')} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-4 font-medium">{t('তারিখ', 'Date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('স্টেজ', 'Stage')}</th>
                  <th className="py-2 pr-4 font-medium">{t('কোয়ান্টিটি', 'Quantity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('এন্ট্রি করেছেন', 'Entered By')}</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.filter((e) => entriesStageFilter === 'all' || e.stage === entriesStageFilter).map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-soft">{e.date}</td>
                    <td className="py-2 pr-4 text-ink">{stageLabel(e.stage, lang)}</td>
                    <td className="py-2 pr-4 text-ink-soft">
                      {e.quantity}
                      {e.yarnItemName && (
                        <span className="ml-1 text-xs text-ink-soft">
                          ({e.yarnItemName}: {e.yarnQty}lb)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{e.enteredBy}</td>
                    <td className="py-2 pr-4">
                      {profile?.role === 'admin' && (
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
    </div>
  );
}

function EditStyleModal({ style, onClose }) {
  const { t } = useLang();
  // Styles created before the PO/colour-wise system have no `pos` array —
  // those keep editing via the old single poNo/colour/orderQty fields, per
  // factory's decision to not touch old data. New-format styles (with
  // `pos`) edit via the same PO+colour builder used at creation.
  const isNewFormat = Array.isArray(style.pos) && style.pos.length > 0;
  const [pos, setPos] = useState(isNewFormat ? style.pos.map((po) => ({ ...po, colours: po.colours.map((c) => ({ ...c })) })) : [emptyPo()]);
  const [form, setForm] = useState({
    orderDate: style.orderDate || '',
    buyer: style.buyer || '',
    poNo: style.poNo || '',
    styleName: style.styleName || '',
    styleNo: style.styleNo || '',
    gg: style.gg || '',
    shipDate: style.shipDate || '',
    colour: style.colour || '',
    yarnComposition: style.yarnComposition || '',
    orderQty: style.orderQty || '',
    notes: style.notes || '',
  });
  const [imageDataUrl, setImageDataUrl] = useState(style.imageUrl || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 700, 0.75);
      setImageDataUrl(dataUrl);
    } catch {
      setError(t('ছবি আপলোড করা যায়নি।', 'Could not upload image.'));
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');

    let payload;
    if (isNewFormat) {
      const cleanPos = pos
        .map((po) => ({
          poNo: po.poNo.trim(),
          colours: po.colours
            .map((c) => ({ colour: c.colour.trim(), qty: Number(c.qty) || 0 }))
            .filter((c) => c.colour && c.qty > 0),
        }))
        .filter((po) => po.poNo && po.colours.length > 0);
      const summary = posSummary(cleanPos);
      if (!form.styleNo || !form.buyer || cleanPos.length === 0 || summary.orderQty <= 0) {
        setError(
          t(
            'স্টাইল নম্বর, বায়ার এবং অন্তত একটি PO-তে কালার-ওয়াইজ কোয়ান্টিটি আবশ্যক।',
            'Style number, buyer, and at least one PO with colour-wise quantity are required.'
          )
        );
        return;
      }
      payload = { pos: cleanPos, poNo: summary.poNo, colour: summary.colour, orderQty: summary.orderQty };
    } else {
      if (!form.styleNo || !form.buyer || !form.orderQty) {
        setError(t('স্টাইল নম্বর, বায়ার এবং অর্ডার কোয়ান্টিটি আবশ্যক।', 'Style number, buyer and order quantity are required.'));
        return;
      }
      payload = { poNo: form.poNo || '', colour: form.colour || '', orderQty: Number(form.orderQty) };
    }

    setBusy(true);
    try {
      await updateDoc(doc(db, 'styles', style.id), {
        orderDate: form.orderDate || null,
        buyer: form.buyer,
        styleName: form.styleName || '',
        styleNo: form.styleNo,
        gg: form.gg || '',
        shipDate: form.shipDate || null,
        yarnComposition: form.yarnComposition || '',
        notes: form.notes || '',
        imageUrl: imageDataUrl || '',
        ...payload,
      });
      onClose();
    } catch (err) {
      setError(t('সেভ করা যায়নি।', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('স্টাইল এডিট করুন', 'Edit Style')} onClose={onClose} wide>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={18} className="text-ink-soft" />
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('ছবি পরিবর্তন করুন', 'Change photo')}
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </label>
          {imageDataUrl && (
            <button type="button" onClick={() => setImageDataUrl('')} className="text-ink-soft hover:text-ink">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('তারিখ', 'Date')}>
            <input type="date" className={inputClass} value={form.orderDate} onChange={(e) => update('orderDate', e.target.value)} />
          </Field>
          <Field label={t('বায়ার *', 'Buyer *')}>
            <input className={inputClass} value={form.buyer} onChange={(e) => update('buyer', e.target.value)} />
          </Field>
          {!isNewFormat && (
            <Field label={t('PO নম্বর', 'PO No.')}>
              <input className={inputClass} value={form.poNo} onChange={(e) => update('poNo', e.target.value)} />
            </Field>
          )}
          <Field label={t('স্টাইল নাম', 'Style Name')}>
            <input className={inputClass} value={form.styleName} onChange={(e) => update('styleName', e.target.value)} />
          </Field>
          <Field label={t('স্টাইল নম্বর *', 'Style Number *')}>
            <input className={inputClass} value={form.styleNo} onChange={(e) => update('styleNo', e.target.value)} />
          </Field>
          <Field label="GG">
            <input className={inputClass} value={form.gg} onChange={(e) => update('gg', e.target.value)} />
          </Field>
          <Field label={t('শিপমেন্ট ডেট', 'Shipment Date')}>
            <input type="date" className={inputClass} value={form.shipDate} onChange={(e) => update('shipDate', e.target.value)} />
          </Field>
          {!isNewFormat && (
            <Field label={t('কালার', 'Colour')}>
              <input className={inputClass} value={form.colour} onChange={(e) => update('colour', e.target.value)} />
            </Field>
          )}
          <Field label={t('ইয়ার্ন কম্পোজিশন', 'Yarn Composition')}>
            <input className={inputClass} value={form.yarnComposition} onChange={(e) => update('yarnComposition', e.target.value)} />
          </Field>
          {!isNewFormat && (
            <Field label={t('অর্ডার কোয়ান্টিটি (পিস) *', 'Order Quantity (pcs) *')}>
              <input type="number" min="1" className={inputClass} value={form.orderQty} onChange={(e) => update('orderQty', e.target.value)} />
            </Field>
          )}
        </div>

        {isNewFormat && <PoColourEditor pos={pos} onChange={setPos} />}

        <Field label={t('নোট', 'Notes')}>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
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
