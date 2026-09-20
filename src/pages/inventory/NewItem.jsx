import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Field, inputClass, btnPrimary, btnSecondary } from '../../components/ui';
import StyleSearchSelect from '../../components/StyleSearchSelect';
import { ITEM_TYPES, COMMON_UNITS, ACCESSORY_NAME_SUGGESTIONS } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// A "new item" in this factory's world IS the act of placing an order
// against a running style — for yarn that's a dyeing order (composition
// and colour come straight from the style, since that's already decided
// at style creation, not re-typed here); for accessories it's a simple
// order. There is no "opening stock" — stock only ever enters the system
// through a real receipt against a real order.
export default function NewItem() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [styleId, setStyleId] = useState('');
  const [style, setStyle] = useState(null);
  const [type, setType] = useState('yarn');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [supplier, setSupplier] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleStyleChange(id, styleDoc) {
    setStyleId(id);
    setStyle(styleDoc || null);
    // Suggest a sensible default name so the user rarely has to type one:
    // for yarn, the style's own composition (e.g. "100% Acrylic"); for
    // accessories, leave blank (picked from the suggestion list instead).
    if (type === 'yarn' && styleDoc?.yarnComposition) {
      setName(`${styleDoc.yarnComposition}${styleDoc.colour ? ' — ' + styleDoc.colour : ''}`);
    }
  }

  function handleTypeChange(next) {
    setType(next);
    setUnit(next === 'yarn' ? 'lb' : 'pcs');
    if (next === 'yarn' && style?.yarnComposition) {
      setName(`${style.yarnComposition}${style.colour ? ' — ' + style.colour : ''}`);
    } else {
      setName('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!styleId) {
      setError(t('আগে একটি স্টাইল সার্চ করে নির্বাচন করুন।', 'Search and select a style first.'));
      return;
    }
    if (!name.trim()) {
      setError(t('আইটেমের নাম দিন।', 'Enter an item name.'));
      return;
    }
    if (!qty || Number(qty) <= 0) {
      setError(t('অর্ডার কোয়ান্টিটি দিন।', 'Enter an order quantity.'));
      return;
    }
    setBusy(true);
    try {
      const enteredBy = profile?.name || user?.email;
      const styleLabel = `${style.styleNo}${style.styleName ? ' — ' + style.styleName : ''}`;

      // 1) Create the catalog entry (name/type/unit only — no opening
      // stock, no reorder level; those belong on Item Detail if ever
      // needed later, not at order time).
      const itemRef = await addDoc(collection(db, 'inventoryItems'), {
        name: name.trim(),
        type,
        unit,
        spec: type === 'yarn' ? `${style.yarnComposition || ''}${style.colour ? ' — ' + style.colour : ''}` : '',
        supplier: supplier || '',
        reorderLevel: 0,
        currentStock: 0,
        createdAt: serverTimestamp(),
        createdBy: enteredBy,
      });

      // 2) Immediately place the order against the selected style.
      if (type === 'yarn') {
        await addDoc(collection(db, 'styles', styleId, 'yarnLedger'), {
          type: 'dyeingOrder',
          yarnItemId: itemRef.id,
          yarnItemName: name.trim(),
          styleNo: style.styleNo,
          styleLabel,
          qty: Number(qty),
          supplier: supplier || '',
          date,
          notes: notes || '',
          enteredBy,
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'styles', styleId, 'accessoryLedger'), {
          type: 'order',
          itemId: itemRef.id,
          itemName: name.trim(),
          unit,
          styleNo: style.styleNo,
          styleLabel,
          qty: Number(qty),
          supplier: supplier || '',
          date,
          notes: notes || '',
          enteredBy,
          createdAt: serverTimestamp(),
        });
      }

      navigate(type === 'yarn' ? '/inventory/yarn-tracking' : '/inventory/accessory-tracking');
    } catch (err) {
      setError(t('অর্ডার তৈরি করা যায়নি, আবার চেষ্টা করুন।', 'Could not create the order, please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('নতুন অর্ডার (ইয়ার্ন / এক্সেসরিজ)', 'New Order (Yarn / Accessory)')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'একটি স্টাইল সার্চ করুন, তারপর সেই স্টাইলের বিপরীতে ইয়ার্নের ডাইং অর্ডার অথবা এক্সেসরিজের অর্ডার দিন। ইয়ার্নের কম্পোজিশন ও কালার স্টাইল থেকেই স্বয়ংক্রিয়ভাবে আসবে।',
            "Search a style, then place a yarn dyeing order or accessory order against it. Yarn composition and colour are pulled automatically from the style."
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-6">
        <Field label={t('স্টাইল সার্চ করুন *', 'Search a Style *')}>
          <StyleSearchSelect value={styleId} onChange={handleStyleChange} />
        </Field>

        {style && (
          <div className="rounded-md border border-line bg-paper p-3 text-xs text-ink-soft">
            <p className="font-medium text-ink">{style.styleNo} {style.styleName && `— ${style.styleName}`}</p>
            <p>{style.buyer} {style.poNo && `· PO: ${style.poNo}`}</p>
            {style.yarnComposition && <p>{t('কম্পোজিশন', 'Composition')}: {style.yarnComposition}</p>}
            {style.colour && <p>{t('কালার', 'Colour')}: {style.colour}</p>}
          </div>
        )}

        <Field label={t('ধরন', 'Type')}>
          <div className="flex gap-2">
            {ITEM_TYPES.map((tp) => (
              <button
                key={tp.key}
                type="button"
                onClick={() => handleTypeChange(tp.key)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  type === tp.key ? 'border-indigo bg-indigo-soft text-indigo' : 'border-line bg-surface text-ink-soft hover:bg-paper'
                }`}
              >
                {t(tp.label, tp.labelEn)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('নাম *', 'Name *')}>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              list={type === 'accessory' ? 'accessory-name-suggestions' : undefined}
              placeholder={type === 'accessory' ? t('যেমন: মেইন লেবেল', 'e.g. Main Label') : ''}
            />
            {type === 'accessory' && (
              <datalist id="accessory-name-suggestions">
                {ACCESSORY_NAME_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </Field>
          <Field label={t('একক', 'Unit')}>
            {type === 'yarn' ? (
              <input className={`${inputClass} bg-paper`} value="lb" disabled />
            ) : (
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('সাপ্লায়ার', 'Supplier')}>
            <input className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          <Field label={type === 'yarn' ? t('ডাইং অর্ডার কোয়ান্টিটি (lb) *', 'Dyeing Order Quantity (lb) *') : t('অর্ডার কোয়ান্টিটি *', 'Order Quantity *')}>
            <input type="number" min="0" step="0.01" className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label={t('অর্ডার তারিখ', 'Order Date')}>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('নোট', 'Notes')}>
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-sm text-red">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t('তৈরি হচ্ছে…', 'Creating…') : t('অর্ডার সেভ করুন', 'Save Order')}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            {t('বাতিল', 'Cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
