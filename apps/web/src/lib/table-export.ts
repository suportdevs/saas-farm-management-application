import { downloadFile, toCsv } from './csv';
import { initials, type Letterhead } from './letterhead';
import { printDoc } from './print';

/**
 * Saves or prints a table in the format the user picks from a Download menu.
 * Excel and PDF libraries are loaded only when used, so pages stay light.
 *
 * PDF, Excel and Print are "documents": letterhead (farm name, address,
 * contacts), title, when it was made, how many records and the filters that
 * were applied. CSV, TSV, JSON and Copy stay plain data, so a CSV can still be
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

/** One applied search or filter, e.g. { label: 'Status', value: 'Active' }. */
export type ExportCriterion = { label: string; value: string };

/** One list: a heading and its rows. */
export type ExportSection = {
  title: string;
  subtitle?: string;
  headers: string[];
  /** Column names as the table shows them, when `headers` differ (e.g. CSV import keys). Used to leave out hidden columns. */
  labels?: string[];
  rows: unknown[][];
  /** The search and filters behind these rows; [] = none (all records). Left out = not shown. */
  criteria?: ExportCriterion[];
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
  /** Filters for the whole document, shown once under its title (a section's own criteria win). */
  criteria?: ExportCriterion[];
};

/** A single table is a document with one section. */
export const toDoc = (t: ExportTable | ExportDoc): ExportDoc =>
  'sections' in t ? t : { filename: t.filename, title: t.title, subtitle: t.subtitle, letterhead: t.letterhead, sections: [t] };

export const rowCount = (t: ExportTable | ExportDoc) => toDoc(t).sections.reduce((n, s) => n + s.rows.length, 0);

/** "Search: “B-1”   •   Status: Active", or "None — all records". */
export const criteriaText = (criteria: ExportCriterion[]) =>
  criteria.length ? criteria.map((c) => `${c.label}: ${c.value}`).join('   •   ') : 'None — all records';

const stamp = () => new Date().toISOString().slice(0, 10);
const generatedAt = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const text = (value: unknown) => (value == null ? '' : String(value));
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// Brand colours (HerdSphere green) for a formal, centred letterhead.
const BRAND = '#14532d'; // name, rules, monogram
const GREEN = '#166534'; // table heading
const GREEN_TINT = '#f0fdf4'; // striped rows
const INK = '#111827';
const GREY = '#6b7280';
const RULE = '#d1d5db';
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** "Batches" → "BATCHES REPORT"; a module document ("Herd — all lists") keeps its own title. */
const reportTitle = (title: string) => title.toUpperCase() + (/report|lists/i.test(title) ? '' : ' REPORT');

// ─── Excel ───────────────────────────────────────────────────────

/** Numbers stay numbers in Excel (so they can be summed); everything else is text. */
const excelCell = (value: unknown) => {
  if (typeof value === 'number') return { value, type: Number };
  const s = text(value);
  return /^-?\d+(\.\d+)?$/.test(s) && s.length < 16 && !/^0\d/.test(s) ? { value: Number(s), type: Number } : { value: s, type: String };
};

/** A centred cell stretched over the whole table width (the rest of the row is null). */
const wide = (width: number, cell: Record<string, unknown>) => [{ type: String, columnSpan: width, align: 'center', ...cell }, ...Array(width - 1).fill(null)];
/** A row of empty cells with a line under it. */
const rule = (width: number, style: string, color: string) =>
  Array.from({ length: width }, () => ({ value: '', type: String, height: 6, bottomBorderStyle: style, bottomBorderColor: color }));

function excelSheet(section: ExportSection, letterhead: Letterhead | undefined, docTitle: string | undefined) {
  const width = Math.max(section.headers.length, 1);
  const top: unknown[][] = [];
  if (letterhead) {
    // Centred letterhead: NAME, tagline, address / contacts / legal lines, rule.
    top.push(wide(width, { value: letterhead.name.toUpperCase(), fontWeight: 'bold', fontSize: 16, textColor: BRAND, height: 28, alignVertical: 'center' }));
    if (letterhead.tagline) top.push(wide(width, { value: letterhead.tagline, fontStyle: 'italic', fontSize: 9, textColor: GREY }));
    for (const line of letterhead.lines) top.push(wide(width, { value: line, fontSize: 9, textColor: GREY }));
    top.push(rule(width, 'medium', BRAND));
  }
  // Report title and date / records, then a thin rule.
  top.push(wide(width, { value: reportTitle(docTitle ? `${docTitle} — ${section.title}` : section.title), fontWeight: 'bold', fontSize: 13, textColor: INK, height: 26, alignVertical: 'bottom' }));
  top.push(wide(width, { value: `Generated ${generatedAt()}   ·   ${plural(section.rows.length, 'record')}`, fontSize: 9, textColor: GREY }));
  top.push(rule(width, 'thin', RULE));
  top.push(wide(width, { value: '', height: 6 }));

  const headStyle = { type: String, fontWeight: 'bold', textColor: '#ffffff', backgroundColor: GREEN, height: 20, alignVertical: 'center' };
  // "Filters applied" sits right above the column headings, styled like them.
  const filterRow = section.criteria
    ? [wide(width, { ...headStyle, value: `Filters applied:  ${criteriaText(section.criteria)}`, align: 'left', wrap: true, bottomBorderStyle: 'thin', bottomBorderColor: '#ffffff' })]
    : [];
  const head = section.headers.map((h) => ({ ...headStyle, value: h }));
  // Light stripes make long sheets easier to read.
  const body = section.rows.map((r, i) => r.map((v) => ({ ...excelCell(v), ...(i % 2 ? { backgroundColor: GREEN_TINT } : {}) })));
  const columns = section.headers.map((h, i) => ({
    width: Math.min(50, Math.max(h.length, 10, ...section.rows.slice(0, 200).map((r) => text(r[i]).length)) + 2),
  }));
  // Header block and column headings stay in view while scrolling.
  return { data: [...top, ...filterRow, head, ...body], columns, stickyRowsCount: top.length + filterRow.length + 1 };
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
  const many = doc.sections.length > 1;
  const sheets = doc.sections.map((s) => ({ ...excelSheet({ ...s, criteria: s.criteria ?? doc.criteria }, doc.letterhead, many ? doc.title : undefined), sheet: sheetName(s.title) }));
  // Library types don't describe every style option; the shapes follow its README.
  await (writeXlsxFile as unknown as (s: unknown) => { toFile: (n: string) => Promise<void> })(sheets).toFile(`${doc.filename}-${stamp()}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────

/** Height of the small header on the pages after the first. */
const SLIM = 40;

async function savePdf(doc: ExportDoc) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const wideTable = doc.sections.some((s) => s.headers.length > 5);
  const pdf = new jsPDF({ orientation: wideTable ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 40;
  const C = W / 2; // everything in the header is centred
  const lh = doc.letterhead;
  const when = generatedAt();
  const many = doc.sections.length > 1;
  const total = rowCount(doc);

  /** Page 1: monogram, NAME, tagline, address / contacts / legal lines, double rule. Returns the next y. */
  const drawLetterhead = (y: number) => {
    if (!lh) return y;
    pdf.setFillColor(...rgb(BRAND)).roundedRect(C - 20, y, 40, 40, 7, 7, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(15).setTextColor(255).text(initials(lh.name), C, y + 25.5, { align: 'center' });
    y += 62;
    pdf.setFontSize(18).setTextColor(...rgb(BRAND)).text(lh.name.toUpperCase(), C, y, { align: 'center', charSpace: 1.2 });
    if (lh.tagline) {
      y += 14;
      pdf.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...rgb(GREY)).text(lh.tagline, C, y, { align: 'center' });
    }
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...rgb(GREY));
    for (const line of lh.lines) {
      y += 12;
      pdf.text(line, C, y, { align: 'center', maxWidth: W - 2 * M });
    }
    y += 12;
    pdf.setDrawColor(...rgb(BRAND)).setLineWidth(1.4).line(M, y, W - M, y);
    pdf.setLineWidth(0.4).line(M, y + 3, W - M, y + 3);
    return y + 26;
  };

  /** Centred REPORT TITLE and "Generated · records", then a thin rule. Returns the next y. */
  const drawTitleBlock = (y: number, title: string, subtitle?: string) => {
    pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...rgb(INK)).text(reportTitle(title), C, y, { align: 'center', charSpace: 1 });
    y += 15;
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...rgb(GREY)).text(`Generated ${when}   ·   ${plural(total, 'record')}`, C, y, { align: 'center' });
    if (subtitle) {
      y += 12;
      pdf.text(subtitle, C, y, { align: 'center', maxWidth: W - 2 * M });
    }
    y += 12;
    pdf.setDrawColor(...rgb(RULE)).setLineWidth(0.6).line(M, y, W - M, y);
    return y + 18;
  };

  /** Later pages: farm name and document title, centred, over a thin rule. */
  const drawSlim = () => {
    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...rgb(BRAND)).text((lh?.name ?? doc.title).toUpperCase(), C, 22, { align: 'center', charSpace: 0.8 });
    if (lh) pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...rgb(GREY)).text(doc.title, C, 32, { align: 'center' });
    pdf.setDrawColor(...rgb(BRAND)).setLineWidth(0.8).line(M, SLIM - 2, W - M, SLIM - 2);
  };

  /** A list heading inside a multi-list document. */
  const drawSectionHeading = (y: number, s: ExportSection) => {
    pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...rgb(INK)).text(s.title, M, y);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...rgb(GREY)).text(plural(s.rows.length, 'record'), W - M, y, { align: 'right' });
    pdf.setDrawColor(...rgb(RULE)).setLineWidth(0.6).line(M, y + 5, W - M, y + 5);
    return y + 14;
  };

  const later = SLIM + 20;
  let y = drawLetterhead(28);
  const first = many ? { title: doc.title, subtitle: doc.subtitle } : doc.sections[0]!;
  y = drawTitleBlock(y, first.title, first.subtitle);

  doc.sections.forEach((s, i) => {
    if (many) {
      // Start a list on a new page when little room is left.
      if (i > 0 && y > H - 150) {
        pdf.addPage();
        y = later;
      }
      y = drawSectionHeading(y + (i > 0 ? 8 : 12), s);
    }
    // "Filters applied" is the first heading row: right above the column names, same style.
    const criteria = s.criteria ?? doc.criteria;
    const filterRow = criteria ? [[{ content: `Filters applied:  ${criteriaText(criteria)}`, colSpan: Math.max(s.headers.length, 1), styles: { halign: 'left' as const } }]] : [];
    autoTable(pdf, {
      head: [...filterRow, s.headers],
      body: s.rows.length ? s.rows.map((r) => r.map(text)) : [[{ content: 'No records', colSpan: Math.max(s.headers.length, 1), styles: { halign: 'center', textColor: 120 } }]],
      startY: y,
      margin: { top: later, left: M, right: M, bottom: 46 },
      styles: { fontSize: 8, cellPadding: 4.5, lineColor: 230, lineWidth: 0.4, textColor: rgb(INK) },
      headStyles: { fillColor: rgb(GREEN), textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: rgb(GREEN_TINT) },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  });

  // Small header on later pages and the footer on every page (drawn after the tables).
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    if (p > 1) drawSlim();
    pdf.setDrawColor(...rgb(RULE)).setLineWidth(0.6).line(M, H - 34, W - M, H - 34);
    pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...rgb(GREY));
    pdf.text([lh?.name, doc.title, `Generated ${when}`].filter(Boolean).join('   •   '), M, H - 21);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - 21, { align: 'right' });
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
