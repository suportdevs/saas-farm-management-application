import { downloadFile, toCsv } from './csv';
import { printTable } from './print';

/**
 * Saves or prints a table in the format the user picks from a Download menu.
 * Excel and PDF libraries are loaded only when used, so pages stay light.
 */

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'tsv' | 'json' | 'print' | 'copy';

export const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'excel', label: 'Excel', hint: '.xlsx spreadsheet' },
  { value: 'csv', label: 'CSV', hint: 'Plain text, opens anywhere' },
  { value: 'pdf', label: 'PDF', hint: 'Ready to share or archive' },
  { value: 'tsv', label: 'TSV', hint: 'Tab-separated text' },
  { value: 'json', label: 'JSON', hint: 'For developers and other apps' },
  { value: 'print', label: 'Print', hint: 'Send to a printer' },
  { value: 'copy', label: 'Copy', hint: 'Paste into a spreadsheet' },
];

export type ExportTable = {
  /** File name without extension, e.g. "batches"; the date is added. */
  filename: string;
  /** Heading on PDF and printouts. */
  title: string;
  subtitle?: string;
  headers: string[];
  rows: unknown[][];
};

const stamp = () => new Date().toISOString().slice(0, 10);
const text = (value: unknown) => (value == null ? '' : String(value));

/** Numbers stay numbers in Excel (so they can be summed); everything else is text. */
const excelCell = (value: unknown) => {
  if (typeof value === 'number') return { value, type: Number };
  const s = text(value);
  return /^-?\d+(\.\d+)?$/.test(s) && s.length < 16 && !/^0\d/.test(s) ? { value: Number(s), type: Number } : { value: s, type: String };
};

async function saveExcel({ filename, title, headers, rows }: ExportTable) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = headers.map((h) => ({ value: h, type: String, fontWeight: 'bold' as const }));
  const body = rows.map((r) => r.map(excelCell));
  const widths = headers.map((h, i) => ({ width: Math.min(50, Math.max(h.length, ...rows.slice(0, 200).map((r) => text(r[i]).length)) + 2) }));
  await writeXlsxFile([head, ...body], { sheet: title.slice(0, 31), columns: widths, stickyRowsCount: 1 }).toFile(`${filename}-${stamp()}.xlsx`);
}

async function savePdf({ filename, title, subtitle, headers, rows }: ExportTable) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // Wide tables go landscape.
  const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt' });
  doc.setFontSize(14).text(title, 40, 40);
  if (subtitle) doc.setFontSize(9).setTextColor(100).text(subtitle, 40, 56);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map(text)),
    startY: 68,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [243, 244, 246], textColor: 20 },
    // Page numbers in the footer.
    didDrawPage: () => {
      doc.setFontSize(8).setTextColor(120).text(`Page ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 20);
    },
  });
  doc.save(`${filename}-${stamp()}.pdf`);
}

/** One object per row, keyed by the column headings. */
const toJson = ({ headers, rows }: ExportTable) =>
  JSON.stringify(rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null]))), null, 2);

/** Tab-separated, so pasting into Excel / Google Sheets fills the cells. */
const toTsv = ({ headers, rows }: ExportTable) => {
  const clean = (v: unknown) => text(v).replace(/[\t\r\n]+/g, ' ');
  return [headers, ...rows].map((r) => r.map(clean).join('\t')).join('\n');
};

async function copyTable(table: ExportTable) {
  await navigator.clipboard.writeText(toTsv(table));
}

export async function exportTable(format: ExportFormat, table: ExportTable) {
  switch (format) {
    case 'csv':
      return downloadFile(`${table.filename}-${stamp()}.csv`, toCsv(table.headers, table.rows));
    case 'excel':
      return saveExcel(table);
    case 'pdf':
      return savePdf(table);
    case 'tsv':
      return downloadFile(`${table.filename}-${stamp()}.tsv`, toTsv(table));
    case 'json':
      return downloadFile(`${table.filename}-${stamp()}.json`, toJson(table), 'application/json;charset=utf-8');
    case 'print':
      return printTable(table);
    case 'copy':
      return copyTable(table);
  }
}
