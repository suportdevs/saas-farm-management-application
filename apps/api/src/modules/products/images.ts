import { randomBytes } from 'node:crypto';
import type { ImageType } from '@kit/shared';

const EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * The real type of an image from its first bytes — never trust the
 * Content-Type header or the file name.
 */
export function sniffImage(data: Buffer): ImageType | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (data.toString('ascii', 0, 6) === 'GIF87a' || data.toString('ascii', 0, 6) === 'GIF89a')
    return 'image/gif';
  return null;
}

/** A new random file name — doubles as the cache-busting version in image URLs. */
export const imageFileName = (type: ImageType) =>
  `${randomBytes(12).toString('hex')}.${EXTENSIONS[type]}`;

export const imageTypeOf = (file: string): ImageType =>
  (Object.entries(EXTENSIONS).find(([, ext]) => file.endsWith(`.${ext}`))?.[0] as ImageType) ??
  'image/jpeg';
