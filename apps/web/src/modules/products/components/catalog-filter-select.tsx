'use client';

import { useState } from 'react';
import type { CatalogResource } from '@kit/shared';
import { useT } from '@/i18n/provider';
import { CatalogSelect } from './catalog-select';

/**
 * A searchable catalog select for a plain <form> filter bar (server pages):
 * the chosen key is sent as `name`, like a native <select>.
 *
 *   <CatalogFilterSelect resource="batches" name="batch" defaultValue={query.batch} label={batchName} placeholder="Any batch" />
 */
export function CatalogFilterSelect({
  resource,
  name,
  defaultValue,
  label,
  placeholder,
  className = 'w-44',
}: {
  resource: CatalogResource;
  name: string;
  defaultValue?: string;
  /** Name of the preselected row, when the page already knows it. */
  label?: string;
  placeholder: string;
  className?: string;
}) {
  const t = useT();
  const [value, setValue] = useState(defaultValue ?? '');
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <CatalogSelect
        resource={resource}
        value={value}
        onChange={setValue}
        initialLabel={label}
        placeholder={t(placeholder)}
        aria-label={t(placeholder)}
        clearable
        size="sm"
        className={className}
      />
    </>
  );
}
