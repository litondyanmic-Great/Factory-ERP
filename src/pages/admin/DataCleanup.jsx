import { useState } from 'react';
import { collection, collectionGroup, getDocs, query, writeBatch } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { btnPrimary, btnDanger, EmptyState } from '../../components/ui';
import { useLang } from '../../lib/i18n';

const SUBCOLLECTIONS = [
  { key: 'yarnLedger', bn: 'ইয়ার্ন লেজার', en: 'Yarn Ledger' },
  { key: 'accessoryLedger', bn: 'এক্সেসরিজ লেজার', en: 'Accessory Ledger' },
  { key: 'productionEntries', bn: 'প্রোডাকশন এন্ট্রি', en: 'Production Entries' },
];

// Firestore never deletes a subcollection just because its parent
// document was deleted — so any style that was ever deleted BEFORE the
// app's own cascade-delete existed (or deleted directly in the Firebase
// Console, which never cascades) leaves its yarnLedger/accessoryLedger/
// productionEntries docs behind forever. Those orphaned docs still match
// every collectionGroup() query the app runs (Winding Queue, Yarn Block
// Manager, Reports Center, Dashboard), so they keep showing up as if the
// style still existed. This page finds every such orphan (by checking
// which styleIds no longer have a parent style doc) and deletes them.
export default function DataCleanup() {
  const { t } = useLang();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [orphans, setOrphans] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');

  async function handleScan() {
    setScanning(true);
    setScanned(false);
    setError('');
    setOrphans([]);
    try {
      const styleSnap = await getDocs(collection(db, 'styles'));
      const validStyleIds = new Set(styleSnap.docs.map((d) => d.id));

      const found = [];
      for (const sub of SUBCOLLECTIONS) {
        const snap = await getDocs(query(collectionGroup(db, sub.key)));
        snap.docs.forEach((d) => {
          const styleId = d.ref.parent.parent?.id;
          if (styleId && !validStyleIds.has(styleId)) {
            found.push({
              ref: d.ref,
              subKey: sub.key,
              styleId,
              styleLabel: d.data().styleLabel || d.data().styleNo || styleId,
              date: d.data().date || '',
            });
          }
        });
      }
      setOrphans(found);
      setScanned(true);
    } catch (err) {
      setError(t('স্ক্যান করা যায়নি।', 'Could not scan.'));
    } finally {
      setScanning(false);
    }
  }

  async function handleDeleteAll() {
    const ok = window.confirm(
      t(
        `⚠️ ${orphans.length}টি orphan এন্ট্রি স্থায়ীভাবে মুছে ফেলতে চান? এগুলো এমন স্টাইলের ডেটা যা আর নেই — মোছার পর ফিরিয়ে আনা যাবে না।`,
        `⚠️ Permanently delete ${orphans.length} orphan entries? These belong to styles that no longer exist — this cannot be undone.`
      )
    );
    if (!ok) return;
    setDeleting(true);
    setDone(0);
    try {
      for (let i = 0; i < orphans.length; i += 400) {
        const chunk = orphans.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((o) => batch.delete(o.ref));
        await batch.commit();
        setDone((d) => d + chunk.length);
      }
      setOrphans([]);
      setScanned(true);
    } catch (err) {
      setError(t('মুছে ফেলা যায়নি, আবার চেষ্টা করুন।', 'Could not delete, please try again.'));
    } finally {
      setDeleting(false);
    }
  }

  // Grouped summary for a quick glance before committing to delete.
  const bySub = SUBCOLLECTIONS.map((sub) => ({
    ...sub,
    count: orphans.filter((o) => o.subKey === sub.key).length,
  }));
  const byStyle = Array.from(new Set(orphans.map((o) => o.styleLabel))).slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ডেটা ক্লিনআপ (Orphan ডেটা)', 'Data Cleanup (Orphaned Data)')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'ডিলিট হয়ে যাওয়া স্টাইলের কিছু পুরনো ইয়ার্ন/এক্সেসরিজ লেজার বা প্রোডাকশন এন্ট্রি এখনো ডাটাবেজে থেকে গিয়ে থাকতে পারে (স্টাইলটা নেই কিন্তু তার ডেটা রিপোর্ট/ড্যাশবোর্ডে দেখাচ্ছে)। এখানে স্ক্যান করে সেগুলো খুঁজে বের করে পাকাপাকিভাবে মুছে ফেলুন।',
            "Some yarn/accessory ledger or production entries from deleted styles may still be sitting in the database (the style is gone but its data still shows up in reports/dashboard). Scan here to find and permanently remove them."
          )}
        </p>
      </div>

      <div className="rounded-lg border border-amber bg-amber-soft/30 p-4 text-sm text-ink">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle size={16} className="text-amber" />
          {t('এটা শুধু তখনই দরকার', 'This is only needed for')}
        </p>
        <p className="mt-1 text-ink-soft">
          {t(
            'যেসব স্টাইল খুব আগে (এই অ্যাপের নিজস্ব cascade-delete চালু হওয়ার আগে) মুছে ফেলা হয়েছিল, অথবা সরাসরি Firebase Console থেকে মোছা হয়েছিল। এখন থেকে অ্যাপের মধ্যে থেকে স্টাইল মুছলে এই সমস্যা হবে না — সব সাব-কালেকশন স্বয়ংক্রিয়ভাবে মুছে যায়।',
            "styles that were deleted a while ago (before this app had its own cascade-delete), or deleted directly from the Firebase Console. Deleting a style from within the app now already cleans up everything automatically."
          )}
        </p>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="rounded-lg border border-line bg-surface p-5">
        <button onClick={handleScan} disabled={scanning || deleting} className={btnPrimary}>
          <Search size={16} /> {scanning ? t('স্ক্যান হচ্ছে…', 'Scanning…') : t('স্ক্যান করুন', 'Scan for Orphaned Data')}
        </button>

        {scanned && (
          <div className="mt-5">
            {orphans.length === 0 ? (
              <EmptyState title={t('কোনো orphan ডেটা পাওয়া যায়নি — সব পরিষ্কার!', 'No orphaned data found — everything is clean!')} />
            ) : (
              <>
                <p className="mb-3 text-sm text-ink">
                  {t(`মোট ${orphans.length}টি orphan এন্ট্রি পাওয়া গেছে:`, `Found ${orphans.length} orphaned entries in total:`)}
                </p>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  {bySub.map((s) => (
                    <div key={s.key} className="rounded-md border border-line bg-paper p-3 text-center">
                      <p className="font-display text-lg font-semibold text-ink">{s.count}</p>
                      <p className="text-xs text-ink-soft">{t(s.bn, s.en)}</p>
                    </div>
                  ))}
                </div>
                {byStyle.length > 0 && (
                  <div className="mb-4 rounded-md border border-line bg-paper p-3">
                    <p className="mb-1 text-xs font-medium text-ink-soft">
                      {t('যেসব (আর-অস্তিত্বহীন) স্টাইলের ডেটা পাওয়া গেছে:', 'Data found for these (no-longer-existing) styles:')}
                    </p>
                    <p className="text-xs text-ink-soft">{byStyle.join(', ')}{orphans.length > byStyle.length ? '…' : ''}</p>
                  </div>
                )}
                <button onClick={handleDeleteAll} disabled={deleting} className={btnDanger}>
                  <Trash2 size={16} />
                  {deleting ? t(`মুছে ফেলা হচ্ছে… (${done}/${orphans.length})`, `Deleting… (${done}/${orphans.length})`) : t('সব orphan এন্ট্রি মুছে ফেলুন', 'Delete All Orphaned Entries')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Link to="/admin/settings" className="inline-block text-sm font-medium text-indigo hover:underline">
        ← {t('সেটিংসে ফিরে যান', 'Back to Settings')}
      </Link>
    </div>
  );
}
