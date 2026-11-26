'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Braces, ChevronDown, Copy, Download, FileSpreadsheet, FileText, Loader2, Lock, Printer, Sheet, Sparkles, TableProperties } from 'lucide-react';
import { toast } from 'sonner';
import { buttonClasses } from '@/components/ui/button';
import { Menu, menuItemClasses } from '@/components/ui/menu';
import { errorMessage } from '@/lib/api';
import { farmLetterhead, PLATFORM_LETTERHEAD } from '@/lib/letterhead';
import { EXPORT_FORMATS, exportTable, rowCount, type ExportDoc, type ExportFormat, type ExportTable } from '@/lib/table-export';
import { useOptionalFarm } from '@/modules/farms/context';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/provider';

const ICONS = { excel: FileSpreadsheet, csv: Sheet, pdf: FileText, tsv: TableProperties, json: Braces, print: Printer, copy: Copy };

/**
 * "Download" button with a menu of formats (Excel, CSV, PDF, TSV, JSON, Print, Copy).
 * `load` fetches the rows when a format is picked, e.g. every row matching
 * the current filters, or an ExportDoc with several lists. Pass `formats` to
 * offer only some of them. PDF, Excel and Print get the farm's letterhead
 * (HerdSphere's on admin pages) unless `load` sets its own.
 *
 * `locked` (the plan has no data export) keeps the button visible with a lock;
 * its menu explains why and links to the plans.
 */
export function ExportMenu({
  load,
  formats,
  disabled,
  locked,
  label = 'Download',
}: {
  load: (format: ExportFormat) => Promise<ExportTable | ExportDoc>;
  formats?: ExportFormat[];
  disabled?: boolean;
  locked?: { message: string; vars?: Record<string, string>; href?: string } | null;
  label?: string;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const t = useT();
  const farm = useOptionalFarm();
  const shown = EXPORT_FORMATS.filter((f) => !formats || formats.includes(f.value));

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const table = await load(format);
      const letterhead = table.letterhead ?? (farm ? farmLetterhead(farm) : PLATFORM_LETTERHEAD);
      await exportTable(format, { ...table, letterhead });
      const n = rowCount(table);
      if (format === 'copy') toast.success(t(n === 1 ? 'Copied {count} row' : 'Copied {count} rows', { count: n }));
      else if (format !== 'print') toast.success(t(n === 1 ? 'Downloaded {count} row' : 'Downloaded {count} rows', { count: n }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (locked) {
    return (
      <Menu
        label={`${t(label)} (${t('locked')})`}
        align="end"
        className="w-72 p-3"
        triggerClassName={cn(buttonClasses('outline', 'sm'), 'text-muted-foreground')}
        trigger={
          <>
            <Lock className="h-3.5 w-3.5" /> {t(label)}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </>
        }
      >
        {(close) => (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> {t('Upgrade to download')}
            </p>
            <p className="text-muted-foreground">{t(locked.message, locked.vars)}</p>
            {locked.href && (
              <Link href={locked.href} onClick={close} className={cn(buttonClasses('primary', 'sm'), 'w-full')}>
                {t('Choose a plan')}
              </Link>
            )}
          </div>
        )}
      </Menu>
    );
  }

  if (disabled) {
    return (
      <button type="button" disabled className={buttonClasses('outline', 'sm')}>
        <Download className="h-4 w-4" /> {t(label)}
      </button>
    );
  }

  return (
    <Menu
      label={t(label)}
      align="end"
      className="min-w-72"
      triggerClassName={cn(buttonClasses('outline', 'sm'))}
      trigger={
        <>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t(label)}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
    >
      {(close) =>
        shown.map((f) => {
          const Icon = ICONS[f.value];
          return (
            <button
              key={f.value}
              type="button"
              role="menuitem"
              disabled={!!busy}
              className={menuItemClasses}
              onClick={() => {
                close();
                void run(f.value);
              }}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{t(f.label)}</span>
              <span className="text-xs text-muted-foreground">{t(f.hint)}</span>
            </button>
          );
        })
      }
    </Menu>
  );
}
