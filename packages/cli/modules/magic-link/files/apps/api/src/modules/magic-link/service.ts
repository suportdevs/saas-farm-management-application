import { and, eq, gt, lt } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  env,
  hooks,
  onAccountActivated,
  parseModuleEnv,
  randomToken,
  renderEmail,
  sendMail,
  sha256,
  users,
  type User,
} from '../../core';
import { magicLinkTokens } from './schema';

const config = parseModuleEnv(
  'magic-link',
  z.object({
    MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    // Let unknown emails create an account by clicking the link.
    MAGIC_LINK_SIGNUP: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true' || v === '1')
      .default(false),
  }),
);

export const signupEnabled = () => config.MAGIC_LINK_SIGNUP;

const findUser = async (email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

/** Emails a sign-in link if the address belongs to a user (or sign-up by link is enabled). */
export async function requestLink(email: string, next: string | undefined) {
  const user = await findUser(email);
  if (!user && !config.MAGIC_LINK_SIGNUP) return; // don't reveal whether the account exists

  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email)); // one live link per address
    await tx.insert(magicLinkTokens).values({
      email,
      tokenHash: sha256(token),
      next: next ?? null,
      expiresAt: new Date(Date.now() + config.MAGIC_LINK_TTL_MINUTES * 60_000),
    });
  });

  const url = `${env.WEB_URL}/magic-link?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: user ? `Sign in to ${env.APP_NAME}` : `Finish creating your ${env.APP_NAME} account`,
    ...renderEmail({
      heading: user ? 'Your magic sign-in link' : `Welcome to ${env.APP_NAME}`,
      preheader: 'One click and you’re in — no password needed.',
      body: [
        user ? `Hi ${user.name.split(' ')[0]},` : 'Hi there,',
        user ? `Click the button below to sign in to ${env.APP_NAME}.` : 'Click the button below to create your account and sign in.',
      ],
      action: { label: user ? 'Sign in' : 'Create my account', url },
      note: `This link expires in ${config.MAGIC_LINK_TTL_MINUTES} minutes and works once. If you didn't request it, you can ignore this email.`,
    }),
  });
}

/** Consumes a link. Returns the user (created on first use when sign-up is enabled) and where to go next. */
export async function consumeLink(token: string): Promise<{ user: User; next: string | null } | null> {
  const [row] = await db
    .delete(magicLinkTokens)
    .where(and(eq(magicLinkTokens.tokenHash, sha256(token)), gt(magicLinkTokens.expiresAt, new Date())))
    .returning();
  if (!row) return null;

  let user = await findUser(row.email);
  if (!user) {
    if (!config.MAGIC_LINK_SIGNUP) return null;
    const [created] = await db
      .insert(users)
      .values({ email: row.email, name: row.email.split('@')[0]!.slice(0, 100), emailVerifiedAt: new Date() })
      .onConflictDoNothing()
      .returning();
    user = created ?? (await findUser(row.email));
    if (!user) return null;
    if (created) await hooks.emit(hooks.userCreated, created);
  } else if (!user.emailVerifiedAt) {
    // Clicking the link proves the user owns the inbox.
    [user] = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id)).returning();
    await onAccountActivated(user!);
  }
  return { user: user!, next: row.next };
}

export async function purgeExpiredLinks() {
  await db.delete(magicLinkTokens).where(lt(magicLinkTokens.expiresAt, new Date()));
}
