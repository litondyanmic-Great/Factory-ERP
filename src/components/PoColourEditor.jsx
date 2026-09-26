import { Plus, Trash2 } from 'lucide-react';
import { inputClass, btnSecondary } from './ui';
import { useLang } from '../lib/i18n';

// Shared PO + colour-wise order-qty builder used by New Style and Style
// Edit. A style can have multiple POs; each PO can have multiple colours,
// each with its own qty. Total order qty = sum of every colour qty across
// every PO. This is purely a controlled-component UI over a `pos` array:
//   pos = [{ poNo, colours: [{ colour, qty }] }]
// The caller owns the state and just passes `pos` + `onChange`.

export function emptyPo() {
  return { poNo: '', colours: [{ colour: '', qty: '' }] };
}

export function poSubtotal(po) {
  return (po.colours || []).reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
}

export function posTotal(pos) {
  return (pos || []).reduce((sum, po) => sum + poSubtotal(po), 0);
}

// Backward-compatible summary strings, kept in sync onto the style doc so
// every screen that only knows the old single poNo/colour/orderQty fields
// (lists, reports, cascade delete, etc.) keeps working untouched.
export function posSummary(pos) {
  const poNos = (pos || []).map((p) => p.poNo).filter(Boolean);
  const colours = Array.from(
    new Set((pos || []).flatMap((p) => (p.colours || []).map((c) => c.colour).filter(Boolean)))
  );
  return {
    poNo: poNos.join(', '),
    colour: colours.join(', '),
    orderQty: posTotal(pos),
  };
}

export default function PoColourEditor({ pos, onChange }) {
  const { t } = useLang();

  function updatePo(idx, patch) {
    const next = pos.map((po, i) => (i === idx ? { ...po, ...patch } : po));
    onChange(next);
  }
  function updateColour(poIdx, colIdx, patch) {
    const next = pos.map((po, i) => {
      if (i !== poIdx) return po;
      const colours = po.colours.map((c, j) => (j === colIdx ? { ...c, ...patch } : c));
      return { ...po, colours };
    });
    onChange(next);
  }
  function addPo() {
    onChange([...pos, emptyPo()]);
  }
  function removePo(idx) {
    onChange(pos.filter((_, i) => i !== idx));
  }
  function addColour(poIdx) {
    const next = pos.map((po, i) =>
      i === poIdx ? { ...po, colours: [...po.colours, { colour: '', qty: '' }] } : po
    );
    onChange(next);
  }
  function removeColour(poIdx, colIdx) {
    const next = pos.map((po, i) =>
      i === poIdx ? { ...po, colours: po.colours.filter((_, j) => j !== colIdx) } : po
    );
    onChange(next);
  }

  const grandTotal = posTotal(pos);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{t('PO ও কালার-ওয়াইজ অর্ডার কোয়ান্টিটি *', 'PO & Colour-wise Order Quantity *')}</span>
        <button type="button" onClick={addPo} className={`${btnSecondary} !px-2.5 !py-1 text-xs`}>
          <Plus size={14} /> {t('নতুন PO যোগ করুন', 'Add PO')}
        </button>
      </div>

      <div className="space-y-3">
        {pos.map((po, poIdx) => (
          <div key={poIdx} className="rounded-md border border-line bg-paper p-3">
            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-medium text-ink-soft">{t('PO নম্বর', 'PO No.')}</span>
                <input
                  className={`${inputClass} text-base text-ink sm:text-sm`}
                  value={po.poNo}
                  onChange={(e) => updatePo(poIdx, { poNo: e.target.value })}
                  placeholder={t('যেমন: PO-1001', 'e.g. PO-1001')}
                />
              </label>
              {pos.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePo(poIdx)}
                  className="mb-0.5 rounded-md border border-red/30 bg-red-soft p-2 text-red hover:bg-red/10"
                  title={t('এই PO মুছুন', 'Remove this PO')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2">
              <span className="block text-xs font-medium text-ink-soft">{t('কালার অনুযায়ী কোয়ান্টিটি', 'Colour-wise Quantity')}</span>
              {po.colours.map((c, colIdx) => (
                <div key={colIdx} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                  <input
                    type="text"
                    autoComplete="off"
                    className={`${inputClass} min-w-0 text-base text-ink sm:text-sm`}
                    placeholder={t('কালার (যেমন: Red)', 'Colour (e.g. Red)')}
                    value={c.colour}
                    onChange={(e) => updateColour(poIdx, colIdx, { colour: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    autoComplete="off"
                    className={`${inputClass} min-w-0 text-base text-ink sm:text-sm`}
                    placeholder={t('কোয়ান্টিটি', 'Qty')}
                    value={c.qty}
                    onChange={(e) => updateColour(poIdx, colIdx, { qty: e.target.value })}
                  />
                  {po.colours.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeColour(poIdx, colIdx)}
                      className="rounded-md p-2 text-ink-soft hover:bg-line/50 hover:text-red"
                      title={t('মুছুন', 'Remove')}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <span className="w-[30px]" />
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addColour(poIdx)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:text-indigo-deep"
              >
                <Plus size={13} /> {t('কালার যোগ করুন', 'Add colour')}
              </button>
            </div>

            <p className="mt-2 text-right text-xs text-ink-soft">
              {t('এই PO-র সাবটোটাল', 'PO subtotal')}: <span className="font-semibold text-ink">{poSubtotal(po).toLocaleString('en-US')}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-indigo/30 bg-indigo-soft px-4 py-2.5 text-right">
        <span className="text-sm text-ink-soft">{t('মোট অর্ডার কোয়ান্টিটি', 'Total Order Quantity')}: </span>
        <span className="font-display text-lg font-semibold text-indigo">{grandTotal.toLocaleString('en-US')} {t('পিস', 'pcs')}</span>
      </div>
    </div>
  );
}
