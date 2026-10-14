/** CSV helpers for import/export (RFC 4180: quoted fields, "" escapes, CRLF or LF). */

const needsQuotes = /[",\r\n]/;

const cell = (value: unknown) => {
  const s = value == null ? '' : String(value);
  return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  // Drop blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Parses a CSV with a header row into objects keyed by the (normalised) header.
 * "Short Name" and "short_name" both become `short_name`.
 */
export function parseCsvObjects(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const [head = [], ...body] = parseCsv(text);
  const headers = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = body.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  );
  return { headers, rows };
}

/** Saves text as a file. CSVs get a BOM so Excel reads UTF-8 correctly. */
export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '\uFEFF' + content : content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
