'use client';

import { CATALOG, catalogPath, catalogPermission, PERMISSION_MODULES, type CatalogResource, type CatalogRow } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { useExportLock } from '@/modules/subscriptions/use-export-lock';
import { useT } from '@/i18n/provider';
import { catalogExportTable } from '../files';

type CatalogModule = (typeof CATALOG)[CatalogResource]['module'];

/**
 * "Download module": every list of a module (e.g. Herd → animals, pens,
 * batches…) in one file — one Excel sheet per list, one section per list in
 * PDF and print. Only lists the member may export are included.
 */
export function ModuleExport({ module }: { module: CatalogModule }) {
  const { farm, membership } = useFarm();
  const exportLock = useExportLock();
  const t = useT();
  const resources = (Object.keys(CATALOG) as CatalogResource[]).filter(
    (r) => CATALOG[r].module === module && membership.permissions.includes(catalogPermission(r, 'export')),
  );
  const label = PERMISSION_MODULES[module]?.label ?? module;
  // Plan without data export: show the button locked, with an upgrade link.
  if (exportLock) return <ExportMenu label={t('Download {module}', { module: t(label) })} load={async () => ({ filename: module, title: label, sections: [] })} locked={exportLock} />;
  if (resources.length < 2) return null;

  return (
    <ExportMenu
      label={t('Download {module}', { module: t(label) })}
      formats={['excel', 'pdf', 'print', 'json']}
      load={async (format) => {
        // All lists in parallel, every row (no filters).
        const lists = await Promise.all(
          resources.map(async (r) => {
            const { rows } = await api.get<{ rows: CatalogRow[] }>(`/farms/${farm.slug}/${catalogPath(r)}/export`);
            const table = catalogExportTable(r, rows, farm.name, format);
            return { title: table.title, headers: table.headers, rows: table.rows };
          }),
        );
        return {
          filename: `${module}-module`,
          title: `${label} — all lists`,
          subtitle: lists.map((l) => `${l.title} ${l.rows.length}`).join(', '),
          sections: lists,
          // Every row of every list: no filters.
          criteria: [],
        };
      }}
    />
  );
}
