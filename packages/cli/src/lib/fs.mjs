import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

export function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Deletes a file and prunes empty parent directories up to (not including) stopAt. */
export function removeFile(file, stopAt) {
  if (fs.existsSync(file)) fs.rmSync(file);
  let dir = path.dirname(file);
  while (dir.startsWith(stopAt) && dir !== stopAt) {
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}
