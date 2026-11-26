import 'server-only';
import { resolveLanguage } from '@kit/shared';
import { requireUser } from '@/lib/session';
import { getFarmContext } from '@/modules/farms/server';
import { translator } from './translate';

/**
 * `t` for server components: the user's language, else the farm's default
 * (pass the farm slug on farm pages), else English — the same rule as the
 * client provider.
 */
export async function getT(farmSlug?: string) {
  const [user, ctx] = await Promise.all([requireUser(), farmSlug ? getFarmContext(farmSlug) : undefined]);
  return translator(resolveLanguage(user.language, ctx?.farm.language));
}
