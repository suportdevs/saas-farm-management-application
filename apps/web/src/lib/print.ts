import { initials } from './letterhead';
import { criteriaText, type ExportDoc } from './table-export';

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const STYLES = `
  @page{margin:12mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:11px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827;margin:0}
  .sheet{break-after:page}.sheet:last-child{break-after:auto}
  .lh{text-align:center;padding-top:4px}
  .badge{width:42px;height:42px;margin:0 auto 10px;border-radius:8px;background:#14532d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
  .lh h1{margin:0;font-size:20px;color:#14532d;letter-spacing:.08em;text-transform:uppercase}
  .lh .tag{margin:3px 0 0;color:#6b7280;font-style:italic;font-size:10px}
  .lh .line{margin:2px 0 0;color:#6b7280;font-size:9.5px}
  .double{border-top:2px solid #14532d;border-bottom:.5px solid #14532d;height:4px;margin:12px 0 16px}
  .doc{text-align:center;padding-bottom:10px;margin-bottom:14px;border-bottom:1px solid #d1d5db}
  .doc h2{margin:0;font-size:15px;letter-spacing:.06em}
  .doc .meta{margin:4px 0 0;color:#6b7280;font-size:10px}
  .doc .criteria{margin:4px 0 0;font-style:italic;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#166534;color:#fff;font-weight:600}
  tbody tr:nth-child(even) td{background:#f0fdf4}
  thead{display:table-header-group}tr{break-inside:avoid}
  .empty{text-align:center;color:#888}
  footer{margin-top:14px;padding-top:6px;border-top:1px solid #d1d5db;color:#6b7280;font-size:9px;display:flex;justify-content:space-between}
`;

/** "Batches" → "BATCHES REPORT"; a module document keeps its own title. */
const reportTitle = (title: string) => title.toUpperCase() + (/report|lists/i.test(title) ? '' : ' REPORT');

/**
 * Prints a document through a hidden iframe — no popup, so it works after an
 * async fetch, and the app's own layout never ends up on paper. Each list
 * starts on a new sheet: centred letterhead, double rule, report title with
 * date, record count and filters, then the table.
 */
export function printDoc(doc: ExportDoc, generatedAt: string) {
  const lh = doc.letterhead;
  const letterhead = lh
    ? `<header class="lh"><div class="badge">${escape(initials(lh.name))}</div><h1>${escape(lh.name)}</h1>
        ${lh.tagline ? `<p class="tag">${escape(lh.tagline)}</p>` : ''}${lh.lines.map((l) => `<p class="line">${escape(l)}</p>`).join('')}</header>
        <div class="double"></div>`
    : '';
  const many = doc.sections.length > 1;
  const sheets = doc.sections
    .map((s) => {
      const title = many ? `${doc.title} — ${s.title}` : s.title;
      const criteria = s.criteria ?? doc.criteria;
      const body = s.rows.length
        ? s.rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="empty" colspan="${Math.max(s.headers.length, 1)}">No records</td></tr>`;
      return `<section class="sheet">${letterhead}
        <div class="doc"><h2>${escape(reportTitle(title))}</h2>
          <p class="meta">Generated ${escape(generatedAt)} &nbsp;·&nbsp; ${s.rows.length.toLocaleString()} record${s.rows.length === 1 ? '' : 's'}${s.subtitle ? ` &nbsp;·&nbsp; ${escape(s.subtitle)}` : ''}</p>
          ${criteria ? `<p class="criteria">Filters applied: ${escape(criteriaText(criteria))}</p>` : ''}</div>
        <table><thead><tr>${s.headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
        <footer><span>${escape([lh?.name, doc.title].filter(Boolean).join('  ·  '))}</span><span>Generated ${escape(generatedAt)}</span></footer></section>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>${STYLES}</style></head><body>${sheets}</body></html>`;

  const frame = Object.assign(document.createElement('iframe'), { srcdoc: html });
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove());
    frame.contentWindow?.print();
  };
  document.body.append(frame);
}

/** One table, without a letterhead (kept for older callers). */
export function printTable({ title, subtitle, headers, rows }: { title: string; subtitle?: string; headers: string[]; rows: unknown[][] }) {
  printDoc({ filename: title, title, sections: [{ title, subtitle, headers, rows }] }, new Date().toLocaleString());
}
