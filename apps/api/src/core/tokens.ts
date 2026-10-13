import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { verificationTokens } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';

type TokenType = (typeof verificationTokens.$inferInsert)['type'];

/** Issues a single-use token. Any previous token of the same type for the user is revoked. */
export async function issueToken(
  userId: string,
  type: TokenType,
  ttlMs: number,
  data?: Record<string, unknown>,
): Promise<string> {
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx
      .delete(verificationTokens)
      .where(and(eq(verificationTokens.userId, userId), eq(verificationTokens.type, type)));
    await tx.insert(verificationTokens).values({
      userId,
      type,
      tokenHash: sha256(token),
      data: data ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  });
  return token;
}

/** Consumes a token and returns its userId and data, or null if invalid/expired. */
export async function consumeTokenData(
  token: string,
  type: TokenType,
): Promise<{ userId: string; data: Record<string, unknown> } | null> {
  const [row] = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, sha256(token)),
        eq(verificationTokens.type, type),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: verificationTokens.userId, data: verificationTokens.data });
  return row ? { userId: row.userId, data: row.data ?? {} } : null;
}

/** Consumes a token and returns its userId, or null if invalid/expired. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  return (await consumeTokenData(token, type))?.userId ?? null;
}

export async function purgeExpiredTokens() {
  await db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, new Date()));
}
