'use client';

import { useCallback, useEffect, useState } from 'react';
import { CATALOG, catalogPath, type CatalogOption, type CatalogResource } from '@kit/shared';
import { SearchSelect, type SearchSelectProps } from '@/components/ui/search-select';
import { api } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';

type Props = Omit<SearchSelectProps, 'options' | 'loadOptions' | 'selectedLabel' | 'onChange'> & {
  resource: CatalogResource;
  onChange: (value: string) => void;
  /** Label of the current value, when known (e.g. from the row being edited). */
  initialLabel?: string;
  /** Narrows the choices, e.g. { category: <key> } for a category's products. Empty values are ignored. */
  filters?: Record<string, string | undefined>;
};

/**
 * A searchable select over another catalog. Choices are fetched as you type
 * (key + name only), narrowed by `filters`; a preselected value without a
 * label is looked up by key.
 */
export function CatalogSelect({
  resource,
  value,
  onChange,
  initialLabel,
  filters,
  placeholder,
  ...rest
}: Props) {
  const { farm } = useFarm();
  const path = `/farms/${farm.slug}/${catalogPath(resource)}/options`;
  const narrowedBy = new URLSearchParams(
    Object.entries(filters ?? {}).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  // The label belongs to one value; a value changed from outside is looked up again.
  const [known, setKnown] = useState({ value, label: initialLabel });
  const label = known.value === value ? known.label : undefined;

  useEffect(() => {
    if (!value || label) return;
    let cancelled = false;
    api
      .get<{ options: CatalogOption[] }>(`${path}?keys=${value}`)
      .then(({ options }) => !cancelled && setKnown({ value, label: options[0]?.name }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, value, label]);

  const loadOptions = useCallback(
    async (q: string) => {
      const { options } = await api.get<{ options: CatalogOption[] }>(
        `${path}?q=${encodeURIComponent(q)}${narrowedBy && `&${narrowedBy}`}`,
      );
      return options.map((o) => ({ value: o.key, label: o.name }));
    },
    [path, narrowedBy],
  );

  return (
    <SearchSelect
      {...rest}
      value={value}
      selectedLabel={label}
      loadOptions={loadOptions}
      placeholder={placeholder ?? `Choose ${CATALOG[resource].label.toLowerCase()}…`}
      onChange={(next, option) => {
        setKnown({ value: next, label: option?.label });
        onChange(next);
      }}
    />
  );
}
