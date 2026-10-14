'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from '@kit/shared';
import { Button } from '@/components/ui/button';

/** The image chosen in the form: unchanged, a new file, or removed. */
export type ImageChange = { type: 'keep' } | { type: 'set'; file: File } | { type: 'remove' };

/** Image picker with preview; validates type and size before anything is uploaded. */
export function ImageField({
  currentUrl,
  onChange,
}: {
  currentUrl: string | null;
  onChange: (change: ImageChange) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs we created.
  useEffect(
    () => () => void (preview?.startsWith('blob:') && URL.revokeObjectURL(preview)),
    [preview],
  );

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type))
      return setError('Choose a JPEG, PNG, WebP or GIF image.');
    if (file.size > IMAGE_MAX_BYTES)
      return setError(`Images can be up to ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
    setError(null);
    setPreview(URL.createObjectURL(file));
    onChange({ type: 'set', file });
  };

  const remove = () => {
    setError(null);
    setPreview(null);
    onChange(currentUrl ? { type: 'remove' } : { type: 'keep' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            {preview ? 'Change image' : 'Choose image'}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="sr-only"
          onChange={pick}
          aria-label="Image file"
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP or GIF, up to {IMAGE_MAX_BYTES / 1024 / 1024} MB.
        </p>
      )}
    </div>
  );
}
