export function StatCard({ label, value, sub, tone = 'ink' }) {
  const toneClass = {
    ink: 'text-ink',
    amber: 'text-amber',
    green: 'text-green',
    red: 'text-red',
  }[tone];
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'indigo' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barClass = { indigo: 'bg-indigo', green: 'bg-green', amber: 'bg-amber' }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-ink-soft">{pct}%</span>
    </div>
  );
}

export function Pill({ children, tone = 'indigo' }) {
  const cls = {
    indigo: 'bg-indigo-soft text-indigo',
    green: 'bg-green-soft text-green',
    amber: 'bg-amber-soft text-amber',
    red: 'bg-red-soft text-red',
    grey: 'bg-line/60 text-ink-soft',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

// Traffic-light dot used across Quality screens: green/amber/red/grey.
export function TrafficLight({ tone = 'grey', size = 10 }) {
  const cls = {
    green: 'bg-green',
    amber: 'bg-amber',
    red: 'bg-red',
    grey: 'bg-line',
  }[tone];
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${cls}`}
      style={{ width: size, height: size }}
    />
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <p className="font-display text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-indigo focus:ring-1 focus:ring-indigo';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-deep disabled:opacity-50';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-md border border-red/30 bg-red-soft px-4 py-2 text-sm font-medium text-red transition-colors hover:bg-red/10';

export const iconBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors';

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full max-w-sm">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pl-3`}
      />
    </div>
  );
}

// Small modal used for edit forms across the app (style edit, item edit,
// user edit, etc). Click outside or Escape closes it via onClose.
export function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
