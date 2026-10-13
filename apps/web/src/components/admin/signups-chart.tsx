'use client';

import { useState } from 'react';

/** Daily sign-ups as thin bars with a per-bar hover tooltip and an accessible table fallback. */
export function SignupsChart({ data, noun = 'sign-up' }: { data: { date: string; count: number }[]; noun?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const fmt = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const hovered = active !== null ? data[active] : null;

  return (
    <figure className="space-y-2">
      <div className="flex h-5 items-baseline justify-between text-xs text-muted-foreground">
        <span>{hovered ? `${fmt(hovered.date)}: ${hovered.count} ${noun}${hovered.count === 1 ? '' : 's'}` : `Peak ${max} / day`}</span>
      </div>
      <div className="relative h-40 border-b border-border" onMouseLeave={() => setActive(null)} aria-hidden>
        {/* Recessive gridline at the peak value */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => (
            <div
              key={d.date}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setActive(i)}
              title={`${fmt(d.date)}: ${d.count}`}
            >
              <div
                className={`w-full rounded-t-[4px] transition-opacity ${active === null || active === i ? 'opacity-100' : 'opacity-50'} bg-primary`}
                style={{ height: d.count ? `${Math.max(2, (d.count / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{data[0] && fmt(data[0].date)}</span>
        <span>{data.at(-1) && fmt(data.at(-1)!.date)}</span>
      </div>
      <table className="sr-only">
        <caption>{noun}s per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
