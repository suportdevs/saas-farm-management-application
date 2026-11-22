import 'server-only';
import { cookies } from 'next/headers';
import { PAGE_SIZES, parsePrefs, PREFS_COOKIE } from './preferences';

/**
 * Rows per page for a server-rendered list: the `?pageSize=` in the URL when
 * it is one of PAGE_SIZES, otherwise the user's default (Site settings).
 */
export async function resolvePageSize(fromUrl?: string | string[]): Promise<number> {
  const asked = Number(Array.isArray(fromUrl) ? fromUrl[0] : fromUrl);
  if (PAGE_SIZES.includes(asked as never)) return asked;
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value).pageSize;
}
