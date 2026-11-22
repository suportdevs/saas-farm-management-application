import { initials } from './letterhead';
import type { ExportDoc } from './table-export';

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const STYLES = `
  @page{margin:14mm 12mm}
  *{box-sizing:border-box}
  body{font:11px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;margin:0}
  .sheet{break-after:page}.sheet:last-child{break-after:auto}
  .lh{display:flex;align-items:center;gap:14px;padding-top:6px;border-top:5px solid #166534}
  .badge{width:46px;height:46px;border-radius:10px;background:#166534;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex:none}
  .who{flex:1;min-width:0}.who h1{margin:0;font-size:20px;color:#14532d;letter-spacing:-.01em}.who p{margin:2px 0 0;color:#6b7280;font-style:italic}
  .contact{text-align:right;color:#6b7280;font-size:10px;max-width:50%}.contact div{margin:1px 0}
  .rule{height:0;border-top:1.5px solid #166534;border-bottom:.5px solid #ddd;padding-top:2px;margin:12px 0 16px}
  h2{font-size:15px;margin:0}.sub{margin:3px 0 12px;color:#6b7280;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#166534;color:#fff;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tbody tr:nth-child(even) td{background:#f0fdf4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group}tr{break-inside:avoid}
  .badge,.lh{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .empty{text-align:center;color:#888}
`;

/**
 * Prints a document through a hidden iframe — no popup, so it works after an
 * async fetch, and the app's own layout never ends up on paper. Each list
 * starts on a new sheet under the letterhead.
 */
export function printDoc(doc: ExportDoc, generatedAt: string) {
  const lh = doc.letterhead;
  const letterhead = lh
    ? `<header class="lh"><div class="badge">${escape(initials(lh.name))}</div>
        <div class="who"><h1>${escape(lh.name)}</h1>${lh.tagline ? `<p>${escape(lh.tagline)}</p>` : ''}</div>
        <div class="contact">${lh.lines.map((l) => `<div>${escape(l)}</div>`).join('')}</div></header><div class="rule"></div>`
    : '';
  const sheets = doc.sections
    .map((s) => {
      const sub = [doc.sections.length > 1 ? doc.title : null, s.subtitle, `Generated ${generatedAt}`].filter(Boolean).join('  ·  ');
      const body = s.rows.length
        ? s.rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="empty" colspan="${Math.max(s.headers.length, 1)}">No rows</td></tr>`;
      return `<section class="sheet">${letterhead}<h2>${escape(s.title)}</h2><p class="sub">${escape(sub)}</p>
        <table><thead><tr>${s.headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`;
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
