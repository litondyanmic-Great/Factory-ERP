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
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
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
