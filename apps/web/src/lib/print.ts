const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Prints a table through a hidden iframe — no popup, so it works after an
 * async fetch, and the app's own layout never ends up on paper.
 */
export function printTable({
  title,
  subtitle,
  headers,
  rows,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: unknown[][];
}) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
    body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px}
    h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#555}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f3f4f6}tr{break-inside:avoid}
  </style></head><body>
    <h1>${escape(title)}</h1>${subtitle ? `<p>${escape(subtitle)}</p>` : ''}
    <table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`;

  const frame = Object.assign(document.createElement('iframe'), { srcdoc: html });
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove());
    frame.contentWindow?.print();
  };
  document.body.append(frame);
}
