'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CATALOG,
  catalogPath,
  catalogSchemas,
  fieldOf,
  STATUS_OPTIONS,
  type CatalogColumn,
  type CatalogResource,
  type CatalogRow,
} from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { handleFormError } from '@/lib/form';
import { useFarm } from '@/modules/farms/context';
import { imageUrl, rowValue } from '../files';
import { CatalogSelect } from './catalog-select';
import { ImageField, type ImageChange } from './image-field';

type Values = Record<string, string>;

const HEX = /^#[0-9a-f]{6}$/i;

const defaultValue = (c: CatalogColumn, row: CatalogRow | null) =>
  row ? rowValue(row, fieldOf(c)) : c.input === 'status' ? '1' : '';

/** Create (row = null) or edit a catalog row in a modal. */
export function CatalogFormDialog({
  resource,
  row,
  onClose,
  onSaved,
}: {
  resource: CatalogResource;
  row: CatalogRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { farm } = useFarm();
  const { label, columns, image: hasImage } = CATALOG[resource];
  const path = `/farms/${farm.slug}/${catalogPath(resource)}`;
  const currentImage = row && hasImage ? imageUrl(farm.slug, resource, row) : null;
  const [image, setImage] = useState<ImageChange>({ type: 'keep' });
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(catalogSchemas[resource] as never),
    defaultValues: Object.fromEntries(columns.map((c) => [fieldOf(c), defaultValue(c, row)])),
  });

  const onSubmit = handleSubmit(async (values) => {
    let key = row?.key;
    try {
      if (row) await api.put(`${path}/${row.key}`, values);
      else key = (await api.post<{ key: string }>(path, values)).key;
    } catch (err) {
      return handleFormError(err, setError);
    }
    // The image is uploaded separately, once the row exists.
    try {
      if (image.type === 'set') await api.upload(`${path}/${key}/image`, image.file);
      if (image.type === 'remove') await api.delete(`${path}/${key}/image`);
      toast.success(row ? `${label} updated` : `${label} added`);
    } catch (err) {
      toast.error(`${label} saved, but the image wasn't: ${errorMessage(err)}`);
    }
    onSaved();
  });

  /** Columns whose choices depend on `c` (e.g. product on category). */
  const dependents = (c: CatalogColumn) => columns.filter((d) => d.dependsOn === c.csv);
  const parentOf = (c: CatalogColumn) => columns.find((p) => p.csv === c.dependsOn);

  const input = (c: CatalogColumn) => {
    const name = fieldOf(c);
    const id = `catalog-${name}`;
    const invalid = !!errors[name];
    if (c.ref) {
      const ref = c.ref;
      const parent = parentOf(c);
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <CatalogSelect
              id={id}
              resource={ref}
              value={field.value ?? ''}
              onChange={(value) => {
                field.onChange(value);
                // A new parent invalidates the dependent choice.
                for (const d of dependents(c)) setValue(fieldOf(d), '');
              }}
              filters={parent && { [parent.csv]: watch(fieldOf(parent)) }}
              initialLabel={row ? rowValue(row, c.key) : undefined}
              clearable={!c.required}
              invalid={invalid}
            />
          )}
        />
      );
    }
    if (c.input === 'status') {
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <SearchSelect
              id={id}
              options={STATUS_OPTIONS}
              value={field.value ?? ''}
              onChange={field.onChange}
              invalid={invalid}
            />
          )}
        />
      );
    }
    if (c.input === 'textarea')
      return <Textarea id={id} rows={3} aria-invalid={invalid} {...register(name)} />;
    if (c.input === 'number') {
      return (
        <Input
          id={id}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          aria-invalid={invalid}
          {...register(name)}
        />
      );
    }
    if (c.input === 'color') {
      const value = watch(name);
      return (
        <div className="flex gap-2">
          <Input id={id} placeholder="#DC2626" aria-invalid={invalid} {...register(name)} />
          <input
            type="color"
            aria-label="Pick a color"
            value={HEX.test(value) ? value : '#000000'}
            onChange={(e) => setValue(name, e.target.value.toUpperCase(), { shouldDirty: true })}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
          />
        </div>
      );
    }
    return <Input id={id} aria-invalid={invalid} {...register(name)} />;
  };

  const fieldLabel = (c: CatalogColumn) =>
    c.required || c.input === 'status' || c.virtual ? c.label : `${c.label} (optional)`;

  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="catalog-form" loading={isSubmitting}>
            {row ? 'Save changes' : `Add ${label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form id="catalog-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {hasImage && <ImageField currentUrl={currentImage} onChange={setImage} />}
        {columns.map((c) => (
          <Field
            key={c.key}
            id={`catalog-${fieldOf(c)}`}
            label={fieldLabel(c)}
            hint={
              c.virtual ? `Narrows the ${dependents(c)[0]?.label.toLowerCase()} list` : undefined
            }
            error={errors[fieldOf(c)]?.message}
          >
            {input(c)}
          </Field>
        ))}
        {errors.root && (
          <p className="text-sm text-destructive" role="alert">
            {errors.root.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
