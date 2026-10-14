'use client';

import { useState, type ChangeEvent } from 'react';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  CATALOG,
  CATALOG_IMPORT_LIMIT,
  catalogPath,
  importColumns,
  type CatalogResource,
} from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError, api, errorMessage } from '@/lib/api';
import { parseCsvObjects } from '@/lib/csv';
import { useFarm } from '@/modules/farms/context';
import { downloadImportTemplate } from '../files';

type Rows = Record<string, string>[];

/** "rows.3.short_name" → "Line 5 · short_name: …" (line 1 is the header). */
function describeErrors(details: Record<string, string[]>): string[] {
  return Object.entries(details).map(([path, messages]) => {
    const [, index, column] = path.match(/^rows\.(\d+)\.?(.*)$/) ?? [];
    const where =
      index !== undefined ? `Line ${Number(index) + 2}${column ? ` · ${column}` : ''}` : path;
    return `${where}: ${messages.join(', ')}`;
  });
}

export function CatalogImportDialog({
  resource,
  onClose,
  onImported,
}: {
  resource: CatalogResource;
  onClose: () => void;
  onImported: () => void;
}) {
  const { farm } = useFarm();
  const { plural } = CATALOG[resource];
  const columns = importColumns(resource);
  const [file, setFile] = useState<{ name: string; rows: Rows } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    setFile(null);
    setErrors([]);
    if (!picked) return;

    const { headers, rows } = parseCsvObjects(await picked.text());
    const missing = columns.filter((c) => c.required && !headers.includes(c.csv)).map((c) => c.csv);
    if (missing.length)
      return setErrors([
        `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the format.`,
      ]);
    if (!rows.length) return setErrors(['The file has no rows.']);
    if (rows.length > CATALOG_IMPORT_LIMIT)
      return setErrors([`Import at most ${CATALOG_IMPORT_LIMIT.toLocaleString()} rows at a time.`]);
    // Send only the known columns.
    setFile({
      name: picked.name,
      rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.csv, r[c.csv] ?? '']))),
    });
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const { imported } = await api.post<{ imported: number }>(
        `/farms/${farm.slug}/${catalogPath(resource)}/import`,
        { rows: file.rows },
      );
      toast.success(`Imported ${imported} ${imported === 1 ? 'row' : 'rows'}`);
      onImported();
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.details ? describeErrors(err.details) : [errorMessage(err)],
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Import ${plural.toLowerCase()}`}
      description="Upload a CSV file (Excel: File → Save as → CSV UTF-8). All rows are imported, or none if any row has a problem."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file} loading={busy}>
            Import {file ? `${file.rows.length} ${file.rows.length === 1 ? 'row' : 'rows'}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Columns:{' '}
            {columns.map((c, i) => (
              <span key={c.csv}>
                {i > 0 && ', '}
                <code className="font-medium text-foreground">{c.csv}</code>
                {c.required && <span className="text-destructive">*</span>}
              </span>
            ))}
          </p>
          <Button variant="outline" size="sm" onClick={() => downloadImportTemplate(resource)}>
            <Download className="h-4 w-4" /> Download template
          </Button>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
          <FileUp className="h-6 w-6 text-primary" />
          <span className="text-sm font-medium">{file ? file.name : 'Choose a CSV file'}</span>
          <span className="text-xs text-muted-foreground">
            {file
              ? `${file.rows.length} rows ready to import`
              : `Up to ${CATALOG_IMPORT_LIMIT.toLocaleString()} rows`}
          </span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
        </label>

        {file && !errors.length && <Preview rows={file.rows.slice(0, 5)} resource={resource} />}

        {errors.length > 0 && (
          <Alert variant="error">
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {errors.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {errors.length > 50 && <li>…and {errors.length - 50} more</li>}
            </ul>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function Preview({ rows, resource }: { rows: Rows; resource: CatalogResource }) {
  const columns = importColumns(resource);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.csv} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.csv} className="max-w-48 truncate px-3 py-2">
                  {r[c.csv]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
