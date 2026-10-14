import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { env } from '../config/env';

/**
 * File storage for uploads. Local disk under UPLOAD_DIR; swap this module for
 * an object store (S3, R2…) without touching callers. Paths are relative,
 * e.g. "products/<tenant>/<file>.webp".
 */
const root = resolve(env.UPLOAD_DIR);

function fullPath(path: string) {
  const full = resolve(root, path);
  // Never escape the upload directory.
  if (!full.startsWith(root + sep)) throw new Error(`Invalid storage path: ${path}`);
  return full;
}

export const storage = {
  async put(path: string, data: Buffer) {
    const full = fullPath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  /** The file's bytes, or null when it doesn't exist. */
  async get(path: string): Promise<Buffer | null> {
    try {
      return await readFile(fullPath(path));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  },
  async remove(path: string) {
    await rm(fullPath(path), { force: true });
  },
};
