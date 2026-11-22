'use client';

import { useState } from 'react';
import { Braces, ChevronDown, Copy, Download, FileSpreadsheet, FileText, Loader2, Printer, Sheet, TableProperties } from 'lucide-react';
import { toast } from 'sonner';
import { buttonClasses } from '@/components/ui/button';
import { Menu, menuItemClasses } from '@/components/ui/menu';
import { errorMessage } from '@/lib/api';
import { EXPORT_FORMATS, exportTable, type ExportFormat, type ExportTable } from '@/lib/table-export';
import { cn } from '@/lib/utils';

const ICONS = { excel: FileSpreadsheet, csv: Sheet, pdf: FileText, tsv: TableProperties, json: Braces, print: Printer, copy: Copy };

/**
 * "Download" button with a menu of formats (Excel, CSV, PDF, TSV, JSON, Print, Copy).
 * `load` fetches the rows when a format is picked, e.g. every row matching
 * the current filters. Pass `formats` to offer only some of them.
 */
export function ExportMenu({
  load,
  formats,
  disabled,
  label = 'Download',
}: {
  load: (format: ExportFormat) => Promise<ExportTable>;
  formats?: ExportFormat[];
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const shown = EXPORT_FORMATS.filter((f) => !formats || formats.includes(f.value));

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const table = await load(format);
      await exportTable(format, table);
      if (format === 'copy') toast.success(`Copied ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}`);
      else if (format !== 'print') toast.success(`Downloaded ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (disabled) {
    return (
      <button type="button" disabled className={buttonClasses('outline', 'sm')}>
        <Download className="h-4 w-4" /> {label}
      </button>
    );
  }

  return (
    <Menu
      label={label}
      align="end"
      className="min-w-72"
      triggerClassName={cn(buttonClasses('outline', 'sm'))}
      trigger={
        <>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {label}
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
              <span className="flex-1">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.hint}</span>
            </button>
          );
        })
      }
    </Menu>
  );
}
