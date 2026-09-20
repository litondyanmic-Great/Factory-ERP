import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '../../firebase';
import { EmptyState } from '../../components/ui';
import ExportBar from '../../components/ExportBar';
import { STAGES, stageLabel } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

const YARN_TYPE_LABEL = {
  dyeingOrder: { bn: 'ডাইং অর্ডার', en: 'Dyeing Order' },
  receipt: { bn: 'রিসিভড', en: 'Received' },
  issueToWinding: { bn: 'ওয়াইন্ডিং-এ ইস্যু', en: 'Issued to Winding' },
  issueToKnitting: { bn: 'সরাসরি নিটিং-এ ইস্যু', en: 'Issued to Knitting' },
  windingToKnitting: { bn: 'ওয়াইন্ডিং থেকে নিটিং', en: 'Winding to Knitting' },
  consumption: { bn: 'নিটিং-এ খরচ', en: 'Consumed in Knitting' },
};

// Everything there is to know about one style, in one place: when its
// dyeing order was placed, when yarn was received, how much/when went to
// knitting, winding's status, current production per section, and every
// accessory's status — pulled together as a single multi-section sheet
// that downloads as one Excel/PDF with the factory's letterhead.
export default function StyleFullReport() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const [style, setStyle] = useState(undefined);
  const [yarnLedger, setYarnLedger] = useState(null);
  const [accLedger, setAccLedger] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'styles', id), (snap) => setStyle(snap.exists() ? { id: snap.id, ...snap.data() } : null));
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'styles', id, 'yarnLedger'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => setYarnLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'styles', id, 'accessoryLedger'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => setAccLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [id]);

  const yarnBalances = useMemo(() => {
    const map = new Map();
    (yarnLedger || []).forEach((e) => {
      if (!map.has(e.yarnItemId)) {
        map.set(e.yarnItemId, { name: e.yarnItemName, ordered: 0, received: 0, issuedWinding: 0, issuedKnitting: 0, windingToKnitting: 0, consumed: 0 });
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
    return Array.from(map.values()).map((b) => ({
      ...b,
      atStore: b.received - b.issuedWinding - b.issuedKnitting,
      atWinding: b.issuedWinding - b.windingToKnitting,
      readyForKnitting: b.issuedKnitting + b.windingToKnitting - b.consumed,
    }));
  }, [yarnLedger]);

  const accBalances = useMemo(() => {
    const map = new Map();
    (accLedger || []).forEach((e) => {
      if (!map.has(e.itemId)) map.set(e.itemId, { name: e.itemName, unit: e.unit, ordered: 0, received: 0, issued: 0 });
      const b = map.get(e.itemId);
      const q = Number(e.qty || 0);
      if (e.type === 'order') b.ordered += q;
      if (e.type === 'receipt') b.received += q;
      if (e.type === 'issue') b.issued += q;
    });
    return Array.from(map.values()).map((b) => ({ ...b, atStore: b.received - b.issued }));
  }, [accLedger]);

  const stageRows = useMemo(() => {
    if (!style) return [];
    return STAGES.map((s, i) => {
      const done = style.stages?.[s.key] || 0;
      const prevDone = i > 0 ? style.stages?.[STAGES[i - 1].key] || 0 : done;
      const wip = i > 0 ? Math.max(0, prevDone - done) : 0;
      const overQty = Math.max(0, done - Number(style.orderQty || 0));
      const overPct = style.orderQty > 0 ? Math.round((overQty / style.orderQty) * 100) : 0;
      return { label: stageLabel(s.key, lang), done, wip, overPct };
    });
  }, [style, lang]);

  if (style === undefined) return <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>;
  if (style === null) return <EmptyState title={t('স্টাইল পাওয়া যায়নি', 'Style not found')} />;

  const scopeLabel = `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}`;

  const sections = [
    {
      heading: t('স্টাইল তথ্য', 'Style Info'),
      columns: [
        { key: 'label', label: t('বিষয়', 'Field') },
        { key: 'value', label: t('মান', 'Value') },
      ],
      rows: [
        { label: t('বায়ার', 'Buyer'), value: style.buyer },
        { label: t('PO নং', 'PO No.'), value: style.poNo },
        { label: t('স্টাইল নং', 'Style No.'), value: style.styleNo },
        { label: t('স্টাইল নাম', 'Style Name'), value: style.styleName },
        { label: 'GG', value: style.gg },
        { label: t('অর্ডার কোয়ান্টিটি', 'Order Quantity'), value: style.orderQty },
        { label: t('শিপমেন্ট ডেট', 'Ship Date'), value: style.shipDate },
        { label: t('কালার', 'Colour'), value: style.colour },
        { label: t('ইয়ার্ন কম্পোজিশন', 'Yarn Composition'), value: style.yarnComposition },
      ],
    },
    {
      heading: t('স্টেজ-ভিত্তিক প্রোডাকশন স্ট্যাটাস', 'Stage-wise Production Status'),
      columns: [
        { key: 'label', label: t('স্টেজ', 'Stage') },
        { key: 'done', label: t('সম্পন্ন', 'Done') },
        { key: 'wip', label: t('WIP (ব্যালেন্স)', 'WIP (Balance)') },
        { key: 'overPct', label: t('অতিরিক্ত %', 'Over %'), render: (r) => (r.overPct > 0 ? `+${r.overPct}%` : '—') },
      ],
      rows: stageRows,
    },
    {
      heading: t('ইয়ার্ন ব্যালেন্স সামারি', 'Yarn Balance Summary'),
      columns: [
        { key: 'name', label: t('ইয়ার্ন', 'Yarn') },
        { key: 'ordered', label: t('ডাইং অর্ডার (lb)', 'Dyeing Order (lb)') },
        { key: 'received', label: t('রিসিভড (lb)', 'Received (lb)') },
        { key: 'atStore', label: t('স্টোরে (lb)', 'At Store (lb)') },
        { key: 'atWinding', label: t('ওয়াইন্ডিং-এ (lb)', 'At Winding (lb)') },
        { key: 'readyForKnitting', label: t('নিটিং-প্রস্তুত (lb)', 'Ready for Knitting (lb)') },
        { key: 'consumed', label: t('খরচ হয়েছে (lb)', 'Consumed (lb)') },
      ],
      rows: yarnBalances,
      emptyLabel: t('কোনো ইয়ার্ন ডেটা নেই', 'No yarn data'),
    },
    {
      heading: t('ইয়ার্ন লেজার (সম্পূর্ণ ইতিহাস)', 'Yarn Ledger (Full History)'),
      columns: [
        { key: 'date', label: t('তারিখ', 'Date') },
        { key: 'type', label: t('ধরন', 'Type'), render: (r) => t(YARN_TYPE_LABEL[r.type]?.bn, YARN_TYPE_LABEL[r.type]?.en) },
        { key: 'yarnItemName', label: t('ইয়ার্ন', 'Yarn') },
        { key: 'qty', label: t('কোয়ান্টিটি (lb)', 'Quantity (lb)') },
        { key: 'block', label: t('ব্লক', 'Block') },
        { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
        { key: 'chalanNo', label: t('চালান', 'Chalan') },
      ],
      rows: yarnLedger || [],
      emptyLabel: t('কোনো এন্ট্রি নেই', 'No entries'),
    },
    {
      heading: t('এক্সেসরিজ ব্যালেন্স সামারি', 'Accessory Balance Summary'),
      columns: [
        { key: 'name', label: t('আইটেম', 'Item') },
        { key: 'ordered', label: t('অর্ডার', 'Ordered') },
        { key: 'received', label: t('রিসিভড', 'Received') },
        { key: 'issued', label: t('ইস্যু', 'Issued') },
        { key: 'atStore', label: t('স্টোরে', 'At Store') },
      ],
      rows: accBalances,
      emptyLabel: t('কোনো এক্সেসরিজ ডেটা নেই', 'No accessory data'),
    },
    {
      heading: t('এক্সেসরিজ লেজার (সম্পূর্ণ ইতিহাস)', 'Accessory Ledger (Full History)'),
      columns: [
        { key: 'date', label: t('তারিখ', 'Date') },
        { key: 'type', label: t('ধরন', 'Type'), render: (r) => (r.type === 'order' ? t('অর্ডার', 'Ordered') : r.type === 'receipt' ? t('রিসিভড', 'Received') : t('ইস্যু', 'Issued')) },
        { key: 'itemName', label: t('আইটেম', 'Item') },
        { key: 'qty', label: t('কোয়ান্টিটি', 'Quantity') },
        { key: 'section', label: t('সেকশন', 'Section'), render: (r) => (r.section ? stageLabel(r.section, lang) : '') },
        { key: 'supplier', label: t('সাপ্লায়ার', 'Supplier') },
      ],
      rows: accLedger || [],
      emptyLabel: t('কোনো এন্ট্রি নেই', 'No entries'),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to={`/production/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t('স্টাইল পাতায় ফিরে যান', 'Back to Style Page')}
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t('সম্পূর্ণ স্টাইল রিপোর্ট', 'Full Style Report')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{scopeLabel} · {style.buyer}</p>
        </div>
        <ExportBar title={t('সম্পূর্ণ স্টাইল রিপোর্ট', 'Full Style Report')} subtitle={`${scopeLabel} · ${style.buyer}`} filename={`style-full-report-${style.styleNo}`} sections={sections} />
      </div>

      {sections.map((s) => (
        <div key={s.heading} className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">{s.heading}</h2>
          {s.rows.length === 0 ? (
            <EmptyState title={s.emptyLabel || t('কোনো ডেটা নেই', 'No data')} />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-soft">
                    {s.columns.map((c) => (
                      <th key={c.key} className="py-2 pr-4 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {s.columns.map((c) => (
                        <td key={c.key} className="py-2 pr-4 text-ink-soft">{c.render ? c.render(r) : r[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
