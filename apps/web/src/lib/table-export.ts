import { downloadFile, toCsv } from './csv';
import { initials, type Letterhead } from './letterhead';
import { printDoc } from './print';

/**
 * Saves or prints a table in the format the user picks from a Download menu.
 * Excel and PDF libraries are loaded only when used, so pages stay light.
 *
 * PDF, Excel and Print start with the letterhead (farm name, address,
 * contacts). CSV, TSV, JSON and Copy stay plain data, so a CSV can still be
 * imported again.
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

/** One list: a heading and its rows. */
export type ExportSection = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: unknown[][];
};

/** One table, e.g. the Batches list. */
export type ExportTable = ExportSection & {
  /** File name without extension, e.g. "batches"; the date is added. */
  filename: string;
  /** Company block on top; the Download menu fills it in from the farm. */
  letterhead?: Letterhead;
};

/** Several tables in one file, e.g. a whole module (one Excel sheet per list). */
export type ExportDoc = {
  filename: string;
  title: string;
  subtitle?: string;
  letterhead?: Letterhead;
  sections: ExportSection[];
};

/** A single table is a document with one section. */
export const toDoc = (t: ExportTable | ExportDoc): ExportDoc =>
  'sections' in t ? t : { filename: t.filename, title: t.title, subtitle: t.subtitle, letterhead: t.letterhead, sections: [t] };

export const rowCount = (t: ExportTable | ExportDoc) => toDoc(t).sections.reduce((n, s) => n + s.rows.length, 0);

const stamp = () => new Date().toISOString().slice(0, 10);
const generatedAt = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const text = (value: unknown) => (value == null ? '' : String(value));

// Brand colours (HerdSphere green).
const GREEN = '#166534';
const GREEN_DARK = '#14532d';
const GREEN_TINT = '#f0fdf4';
const GREY = '#6b7280';
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

// ─── Excel ───────────────────────────────────────────────────────

/** Numbers stay numbers in Excel (so they can be summed); everything else is text. */
const excelCell = (value: unknown) => {
  if (typeof value === 'number') return { value, type: Number };
  const s = text(value);
  return /^-?\d+(\.\d+)?$/.test(s) && s.length < 16 && !/^0\d/.test(s) ? { value: Number(s), type: Number } : { value: s, type: String };
};

/** A cell stretched over the whole table width (the rest of the row is null). */
const wide = (width: number, cell: Record<string, unknown>) => [{ type: String, columnSpan: width, ...cell }, ...Array(width - 1).fill(null)];

function excelSheet(section: ExportSection, letterhead: Letterhead | undefined) {
  const width = Math.max(section.headers.length, 1);
  const top: unknown[][] = [];
  if (letterhead) {
    top.push(wide(width, { value: letterhead.name, fontWeight: 'bold', fontSize: 18, textColor: GREEN_DARK, height: 28, alignVertical: 'center' }));
    if (letterhead.tagline) top.push(wide(width, { value: letterhead.tagline, fontStyle: 'italic', textColor: GREY }));
    for (const line of letterhead.lines) top.push(wide(width, { value: line, fontSize: 9, textColor: GREY }));
    // Green rule under the letterhead.
    top.push(Array.from({ length: width }, () => ({ value: '', type: String, height: 6, bottomBorderStyle: 'medium', bottomBorderColor: GREEN })));
  }
  top.push(wide(width, { value: section.title, fontWeight: 'bold', fontSize: 13, height: 24, alignVertical: 'bottom' }));
  top.push(wide(width, { value: [section.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  '), fontSize: 9, textColor: GREY }));

  const head = section.headers.map((h) => ({ value: h, type: String, fontWeight: 'bold', textColor: '#ffffff', backgroundColor: GREEN, height: 20, alignVertical: 'center' }));
  // Light stripes make long sheets easier to read.
  const body = section.rows.map((r, i) => r.map((v) => ({ ...excelCell(v), ...(i % 2 ? { backgroundColor: GREEN_TINT } : {}) })));
  const columns = section.headers.map((h, i) => ({
    width: Math.min(50, Math.max(h.length, 10, ...section.rows.slice(0, 200).map((r) => text(r[i]).length)) + 2),
  }));
  // Letterhead, title and the column headings stay in view while scrolling.
  return { data: [...top, head, ...body], columns, stickyRowsCount: top.length + 1 };
}

async function saveExcel(doc: ExportDoc) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const used = new Set<string>();
  // Sheet names: max 31 chars, unique, no []:*?/\ characters.
  const sheetName = (title: string) => {
    let name = title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
    for (let n = 2; used.has(name); n++) name = `${name.slice(0, 28)} ${n}`;
    used.add(name);
    return name;
  };
  const sheets = doc.sections.map((s) => ({ ...excelSheet(s, doc.letterhead), sheet: sheetName(s.title) }));
  // Library types don't describe every style option; the shapes follow its README.
  await (writeXlsxFile as unknown as (s: unknown) => { toFile: (n: string) => Promise<void> })(sheets).toFile(`${doc.filename}-${stamp()}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────

/** Height of the letterhead block; tables start below it on every page. */
const PDF_HEAD = 104;

async function savePdf(doc: ExportDoc) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const wideTable = doc.sections.some((s) => s.headers.length > 5);
  const pdf = new jsPDF({ orientation: wideTable ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 40;
  const lh = doc.letterhead;
  const top = lh ? PDF_HEAD : 40;

  /** The letterhead, drawn on every page like printed company paper. */
  const drawLetterhead = () => {
    if (!lh) return;
    pdf.setFillColor(...rgb(GREEN)).rect(0, 0, W, 6, 'F');
    // Monogram badge.
    pdf.setFillColor(...rgb(GREEN)).roundedRect(M, 24, 42, 42, 8, 8, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(15).setTextColor(255);
    pdf.text(initials(lh.name), M + 21, 50, { align: 'center' });
    // Name and tagline.
    pdf.setFontSize(17).setTextColor(...rgb(GREEN_DARK)).text(lh.name, M + 56, 42);
    if (lh.tagline) pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...rgb(GREY)).text(lh.tagline, M + 56, 57);
    // Address and contacts, right aligned.
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...rgb(GREY));
    lh.lines.forEach((line, i) => pdf.text(line, W - M, 34 + i * 12, { align: 'right', maxWidth: W / 2 - M }));
    pdf.setDrawColor(...rgb(GREEN)).setLineWidth(1.2).line(M, 80, W - M, 80);
    pdf.setDrawColor(220).setLineWidth(0.4).line(M, 83, W - M, 83);
  };

  /** A list heading: title in bold, subtitle in grey. Returns where the table starts. */
  const drawHeading = (y: number, title: string, subtitle: string | undefined, size: number) => {
    pdf.setFont('helvetica', 'bold').setFontSize(size).setTextColor(20).text(title, M, y);
    if (!subtitle) return y + 10;
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...rgb(GREY)).text(subtitle, M, y + 13);
    return y + 22;
  };

  let y = top;
  const many = doc.sections.length > 1;
  if (many) {
    y = drawHeading(y, doc.title, [doc.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  '), 15) + 10;
  }

  doc.sections.forEach((s, i) => {
    // Start a list on a new page when little room is left.
    if (i > 0 && y > H - 140) {
      pdf.addPage();
      y = top;
    }
    const subtitle = many ? s.subtitle : [s.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  ');
    y = drawHeading(y, s.title, subtitle, many ? 12 : 15);
    autoTable(pdf, {
      head: [s.headers],
      body: s.rows.length ? s.rows.map((r) => r.map(text)) : [[{ content: 'No rows', colSpan: Math.max(s.headers.length, 1), styles: { halign: 'center', textColor: 120 } }]],
      startY: y,
      margin: { top: top, left: M, right: M, bottom: 44 },
      styles: { fontSize: 8, cellPadding: 4, lineColor: 230, lineWidth: 0.4 },
      headStyles: { fillColor: rgb(GREEN), textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: rgb(GREEN_TINT) },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  });

  // Letterhead and footer on every page (drawn once each, after the tables).
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    drawLetterhead();
    pdf.setDrawColor(220).setLineWidth(0.4).line(M, H - 32, W - M, H - 32);
    pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...rgb(GREY));
    pdf.text([lh?.name, doc.title, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  '), M, H - 20);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - 20, { align: 'right' });
  }
  pdf.save(`${doc.filename}-${stamp()}.pdf`);
}

// ─── Text formats ────────────────────────────────────────────────

/** One object per row, keyed by the column headings. Several lists → one key per list. */
const toJson = (doc: ExportDoc) => {
  const objects = (s: ExportSection) => s.rows.map((r) => Object.fromEntries(s.headers.map((h, i) => [h, r[i] ?? null])));
  return JSON.stringify(doc.sections.length === 1 ? objects(doc.sections[0]!) : Object.fromEntries(doc.sections.map((s) => [s.title, objects(s)])), null, 2);
};

/** Tab-separated, so pasting into Excel / Google Sheets fills the cells. */
const toTsv = ({ headers, rows }: ExportSection) => {
  const clean = (v: unknown) => text(v).replace(/[\t\r\n]+/g, ' ');
  return [headers, ...rows].map((r) => r.map(clean).join('\t')).join('\n');
};

/** One list stays exactly as before (importable); several lists get a title line and a blank line between them. */
const joined = (doc: ExportDoc, one: (s: ExportSection) => string) =>
  doc.sections.length === 1 ? one(doc.sections[0]!) : doc.sections.map((s) => `${s.title}\n${one(s)}`).join('\n\n');

export async function exportTable(format: ExportFormat, table: ExportTable | ExportDoc) {
  const doc = toDoc(table);
  const name = `${doc.filename}-${stamp()}`;
  switch (format) {
    case 'csv':
      return downloadFile(`${name}.csv`, joined(doc, (s) => toCsv(s.headers, s.rows)));
    case 'excel':
      return saveExcel(doc);
    case 'pdf':
      return savePdf(doc);
    case 'tsv':
      return downloadFile(`${name}.tsv`, joined(doc, toTsv));
    case 'json':
      return downloadFile(`${name}.json`, toJson(doc), 'application/json;charset=utf-8');
    case 'print':
      return printDoc(doc, generatedAt());
    case 'copy':
      return navigator.clipboard.writeText(joined(doc, toTsv));
  }
}
