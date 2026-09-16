import { FileSpreadsheet, FileText } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { useSettings } from '../lib/settingsContext';
import { exportToExcel, exportToPDF } from '../lib/exportUtils';

// Drop this into any list/report screen: <ExportBar title="..." filename="..." columns={...} rows={...} />
// columns: [{ key, label, render?(row) }]
export default function ExportBar({ title, subtitle, filename, columns, rows, small }) {
  const { t, lang } = useLang();
  const { settings } = useSettings();

  function handleExcel() {
    exportToExcel({ filename: filename || 'report', title, subtitle, columns, rows, settings, lang });
  }
  function handlePdf() {
    exportToPDF({ filename: filename || 'report', title, subtitle, columns, rows, settings, lang });
  }

  const base = small
    ? 'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink'
    : 'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handleExcel} className={base} disabled={!rows || rows.length === 0}>
        <FileSpreadsheet size={small ? 14 : 16} /> Excel
      </button>
      <button type="button" onClick={handlePdf} className={base} disabled={!rows || rows.length === 0}>
        <FileText size={small ? 14 : 16} /> PDF
      </button>
    </div>
  );
}
