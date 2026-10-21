'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  Download,
  ImageIcon,
  ListFilter,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CATALOG,
  catalogPath,
  hasStatus,
  STATUS,
  statusLabel,
  type CatalogColumn,
  type CatalogPage,
  type CatalogResource,
  type CatalogRow,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Pagination } from '@/components/app/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCan, useFarm } from '@/modules/farms/context';
import { exportCatalog, imageUrl, printCatalog, rowValue } from '../files';
import { CatalogFilters, filterParams, type FilterValues } from './catalog-filters';
import { CatalogFormDialog } from './catalog-form-dialog';
import { CatalogImportDialog } from './catalog-import-dialog';

type Modal =
  | { type: 'form'; row: CatalogRow | null }
  | { type: 'import' }
  | { type: 'delete'; keys: string[] }
  | null;

type Busy = 'export' | 'print' | 'delete' | 'status' | null;

const toQueryString = (params: Record<string, string>) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return qs.size ? `?${qs}` : '';
};

/**
 * A catalog list: search, advanced filters, selection with bulk delete and
 * bulk status, export/print of every matching row, import, and the
 * create/edit modal. `query` is the current URL query (without `page`).
 */
export function CatalogManager({
  resource,
  page,
  query,
}: {
  resource: CatalogResource;
  page: CatalogPage;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { farm } = useFarm();
  const { label, plural, description, columns } = CATALOG[resource];
  const withStatus = hasStatus(resource);
  // One per-action key per button.
  const canCreate = useCan('products.create');
  const canUpdate = useCan('products.update');
  const canDelete = useCan('products.delete');
  const canImport = useCan('products.import');
  const canExport = useCan('products.export');
  /** Selection only exists for bulk actions the member may run. */
  const canSelect = canDelete || (withStatus && canUpdate);
  const withImage = !!CATALOG[resource].image;
  const apiPath = `/farms/${farm.slug}/${catalogPath(resource)}`;
  const { rows, pagination } = page;
  const q = query.q ?? '';
  const activeFilters = filterParams(resource).filter((p) => query[p]).length;

  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Busy>(null);
  const [search, setSearch] = useState(q);
  const [showFilters, setShowFilters] = useState(activeFilters > 0);
  const [navigating, startNavigation] = useTransition();

  // Selection belongs to the rows on screen.
  useEffect(() => setSelected(new Set()), [page]);

  /** Replaces the URL query (back to page 1). */
  const navigate = (params: Record<string, string>) =>
    startNavigation(() => router.replace(`${pathname}${toQueryString(params)}`));

  // Debounced search.
  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const t = setTimeout(() => navigate({ ...query, q: next }), 300);
    return () => clearTimeout(t);
  }, [search, q, query]);

  const applyFilters = (filters: FilterValues) => {
    const kept = Object.fromEntries(
      Object.entries(query).filter(([k]) => !filterParams(resource).includes(k)),
    );
    navigate({ ...kept, ...filters });
  };

  const refresh = () => {
    setModal(null);
    router.refresh();
  };

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  /** Export and print use every row matching the current search and filters. */
  const download = (kind: 'export' | 'print') =>
    run(kind, async () => {
      const { rows: all } = await api.get<{ rows: CatalogRow[] }>(
        `${apiPath}/export${toQueryString(query)}`,
      );
      if (kind === 'export') exportCatalog(resource, all);
      else printCatalog(resource, all, farm.name);
    });

  const remove = (keys: string[]) =>
    run('delete', async () => {
      try {
        if (keys.length === 1) await api.delete(`${apiPath}/${keys[0]}`);
        else await api.post(`${apiPath}/bulk-delete`, { keys });
        toast.success(
          keys.length === 1 ? `${label} deleted` : `${keys.length} ${plural.toLowerCase()} deleted`,
        );
        refresh();
      } finally {
        setModal(null);
      }
    });

  /** Flips each row's status: active ones become inactive and inactive ones active. */
  const toggleStatus = (keys: string[]) =>
    run('status', async () => {
      const { updated } = await api.post<{ updated: number }>(`${apiPath}/toggle-status`, { keys });
      toast.success(
        `Status changed for ${updated} ${updated === 1 ? label.toLowerCase() : plural.toLowerCase()}`,
      );
      router.refresh();
    });

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key)));

  const empty = rows.length === 0 && !q && !activeFilters;

  return (
    <>
      <PageHeader
        eyebrow="Product catalog"
        title={plural}
        description={description}
        actions={
          <>
            {canImport && (
              <Button variant="outline" onClick={() => setModal({ type: 'import' })}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            )}
            {canExport && (
              <>
                <Button
                  variant="outline"
                  onClick={() => download('export')}
                  loading={busy === 'export'}
                  disabled={empty}
                >
                  {busy !== 'export' && <Download className="h-4 w-4" />} Export
                </Button>
                <Button
                  variant="outline"
                  onClick={() => download('print')}
                  loading={busy === 'print'}
                  disabled={empty}
                >
                  {busy !== 'print' && <Printer className="h-4 w-4" />} Print
                </Button>
              </>
            )}
            {canCreate && (
              <Button onClick={() => setModal({ type: 'form', row: null })}>
                <Plus className="h-4 w-4" /> Add {label.toLowerCase()}
              </Button>
            )}
          </>
        }
      />

      {empty ? (
        <EmptyState
          icon={Package}
          title={`No ${plural.toLowerCase()} yet`}
          description={
            canCreate || canImport
              ? 'Add them one by one, or import a spreadsheet.'
              : `Nobody has added any ${plural.toLowerCase()} yet.`
          }
          action={
            (canCreate || canImport) && (
              <>
                {canImport && (
                  <Button variant="outline" onClick={() => setModal({ type: 'import' })}>
                    <Upload className="h-4 w-4" /> Import
                  </Button>
                )}
                {canCreate && (
                  <Button onClick={() => setModal({ type: 'form', row: null })}>
                    <Plus className="h-4 w-4" /> Add {label.toLowerCase()}
                  </Button>
                )}
              </>
            )
          }
        />
      ) : (
        <Card className="overflow-visible">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${plural.toLowerCase()}…`}
                className="pl-9"
                aria-label="Search"
              />
              {navigating && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
            >
              <ListFilter className="h-4 w-4" /> Filters
              {activeFilters > 0 && <Badge variant="primary">{activeFilters}</Badge>}
            </Button>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{selected.size} selected</span>
                {withStatus && canUpdate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus([...selected])}
                    loading={busy === 'status'}
                    title="Active rows become inactive, inactive rows active"
                  >
                    {busy !== 'status' && <RefreshCw className="h-3.5 w-3.5" />} Status
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setModal({ type: 'delete', keys: [...selected] })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {pagination.total}{' '}
              {pagination.total === 1 ? label.toLowerCase() : plural.toLowerCase()}
            </span>
          </div>

          {showFilters && (
            <CatalogFilters
              key={toQueryString(query)}
              resource={resource}
              values={query}
              onApply={applyFilters}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {canSelect && (
                    <th className="w-10 px-4 py-3">
                      <Checkbox
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all on this page"
                        disabled={!rows.length}
                      />
                    </th>
                  )}
                  {withImage && (
                    <th className="w-16 px-4 py-3">
                      <span className="sr-only">Image</span>
                    </th>
                  )}
                  {columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-4 py-3 font-medium">
                      {c.label}
                    </th>
                  ))}
                  {(canUpdate || canDelete) && <th className="w-24 px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={selected.has(row.key) ? 'bg-primary/5' : 'hover:bg-muted/30'}
                  >
                    {canSelect && (
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selected.has(row.key)}
                          onChange={() => toggle(row.key)}
                          aria-label={`Select ${row.name}`}
                        />
                      </td>
                    )}
                    {withImage && (
                      <td className="px-4 py-2">
                        <Thumbnail src={imageUrl(farm.slug, resource, row)} />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-4 py-3',
                          c.input === 'textarea' && 'max-w-xs truncate text-muted-foreground',
                          c.input === 'number' && 'tabular-nums',
                        )}
                      >
                        <Cell
                          column={c}
                          value={rowValue(row, c.key)}
                          onToggleStatus={canUpdate ? () => toggleStatus([row.key]) : undefined}
                        />
                      </td>
                    ))}
                    {(canUpdate || canDelete) && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setModal({ type: 'form', row })}
                              aria-label={`Edit ${row.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setModal({ type: 'delete', keys: [row.key] })}
                              aria-label={`Delete ${row.name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={columns.length + 3}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Nothing matches your search and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination pagination={pagination} basePath={pathname} params={query} />

      {modal?.type === 'form' && (
        <CatalogFormDialog
          resource={resource}
          row={modal.row}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
      {modal?.type === 'import' && (
        <CatalogImportDialog
          resource={resource}
          onClose={() => setModal(null)}
          onImported={refresh}
        />
      )}
      {modal?.type === 'delete' && (
        <Dialog
          open
          onClose={() => setModal(null)}
          title={
            modal.keys.length === 1
              ? `Delete this ${label.toLowerCase()}?`
              : `Delete ${modal.keys.length} ${plural.toLowerCase()}?`
          }
          description="Deleted rows disappear from lists and selects. Their history is kept."
          footer={
            <>
              <Button variant="outline" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => remove(modal.keys)}
                loading={busy === 'delete'}
              >
                Delete
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

function Cell({
  column,
  value,
  onToggleStatus,
}: {
  column: CatalogColumn;
  value: string;
  /** Makes the status badge a button that flips it. */
  onToggleStatus?: () => void;
}) {
  if (column.input === 'status') {
    const badge = (
      <Badge variant={Number(value) === STATUS.active ? 'success' : 'default'}>
        {statusLabel(value)}
      </Badge>
    );
    if (!onToggleStatus) return badge;
    return (
      <button
        type="button"
        onClick={onToggleStatus}
        title={`Click to make ${Number(value) === STATUS.active ? 'inactive' : 'active'}`}
        className="rounded-full transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {badge}
      </button>
    );
  }
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (column.input === 'color' && /^#[0-9a-f]{3,8}$/i.test(value)) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-4 w-4 rounded border" style={{ backgroundColor: value }} aria-hidden />
        <code className="text-xs">{value}</code>
      </span>
    );
  }
  return <>{value}</>;
}

function Thumbnail({ src }: { src: string | null }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
      )}
    </span>
  );
}
