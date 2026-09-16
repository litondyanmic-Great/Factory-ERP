import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Search } from 'lucide-react';
import { db } from '../firebase';
import { inputClass } from './ui';
import { useLang } from '../lib/i18n';

// A search-as-you-type style picker: search by PO no / style name / style
// number / buyer, then pick one. Used anywhere a screen needs to "attach"
// data to a specific running style (Quality entry, Zero Thread report,
// Style-Yarn tracking, Winding queue).
export default function StyleSearchSelect({ value, onChange }) {
  const { t } = useLang();
  const [styles, setStyles] = useState(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'styles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setStyles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!styles) return [];
    const s = search.trim().toLowerCase();
    if (!s) return styles.slice(0, 20);
    return styles
      .filter((st) => [st.poNo, st.styleName, st.styleNo, st.buyer].some((v) => (v || '').toLowerCase().includes(s)))
      .slice(0, 20);
  }, [styles, search]);

  const selected = styles?.find((s) => s.id === value);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          className={`${inputClass} pl-8`}
          placeholder={t('PO নং, স্টাইল নাম বা নং দিয়ে খুঁজুন…', 'Search by PO no, style name or number…')}
          value={open ? search : selected ? `${selected.styleNo}${selected.styleName ? ' — ' + selected.styleName : ''}` : search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="scroll-thin absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-soft">{t('কোনো স্টাইল পাওয়া যায়নি', 'No styles found')}</p>
            ) : (
              filtered.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    onChange(s.id, s);
                    setSearch('');
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
                >
                  <span className="font-medium text-ink">{s.styleNo}</span>
                  {s.styleName && <span className="text-ink-soft"> — {s.styleName}</span>}
                  <span className="block text-xs text-ink-soft">
                    {s.buyer} {s.poNo ? `· PO: ${s.poNo}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
