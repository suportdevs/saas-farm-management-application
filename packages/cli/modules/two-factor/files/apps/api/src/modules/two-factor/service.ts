import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { db, decrypt, encrypt, env, sha256, type User } from '../../core';
import { twoFactor, type TwoFactor } from './schema';

const PURPOSE = 'two-factor';
const BACKUP_CODE_COUNT = 10;

export async function getTwoFactor(userId: string): Promise<TwoFactor | undefined> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  return row;
}

export async function isEnabled(userId: string): Promise<boolean> {
  const row = await getTwoFactor(userId);
  return Boolean(row?.enabledAt);
}

/** Starts setup: creates (or replaces) an unconfirmed secret and returns QR data. */
export async function startSetup(user: User) {
  const secret = generateSecret();
  const encrypted = encrypt(secret, PURPOSE);
  await db
    .insert(twoFactor)
    .values({ userId: user.id, secret: encrypted })
    .onConflictDoUpdate({ target: twoFactor.userId, set: { secret: encrypted, enabledAt: null, backupCodes: [], lastUsedStep: null } });
  const uri = generateURI({ secret, issuer: env.APP_NAME, label: user.email });
  return { secret, uri, qrCode: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

function newBackupCodes() {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(normalizeBackup(c))) };
}

const normalizeBackup = (code: string) => code.trim().toLowerCase().replace(/[^a-f0-9]/g, '');

async function checkTotp(row: TwoFactor, code: string): Promise<boolean> {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  const result = await verify({
    secret: decrypt(row.secret, PURPOSE),
    token,
    epochTolerance: 30, // accept one step of clock drift either way
    afterTimeStep: row.lastUsedStep ?? undefined,
  });
  if (!result.valid) return false;
  if ('timeStep' in result && typeof result.timeStep === 'number') {
    await db.update(twoFactor).set({ lastUsedStep: result.timeStep }).where(eq(twoFactor.userId, row.userId));
  }
  return true;
}

/** Confirms setup with a code from the authenticator app. Returns backup codes (shown once). */
export async function enable(userId: string, code: string): Promise<string[] | null> {
  const row = await getTwoFactor(userId);
  if (!row || row.enabledAt) return null;
  if (!(await checkTotp(row, code))) return null;
  const { codes, hashes } = newBackupCodes();
  await db.update(twoFactor).set({ enabledAt: new Date(), backupCodes: hashes }).where(eq(twoFactor.userId, userId));
  return codes;
}

/** Verifies a TOTP code or consumes a backup code. */
export async function verifyCode(userId: string, code: string): Promise<'totp' | 'backup' | null> {
  const row = await getTwoFactor(userId);
  if (!row?.enabledAt) return null;
  if (await checkTotp(row, code)) return 'totp';

  const hash = sha256(normalizeBackup(code));
  if (normalizeBackup(code).length === 10 && row.backupCodes.includes(hash)) {
    await db
      .update(twoFactor)
      .set({ backupCodes: row.backupCodes.filter((h) => h !== hash) })
      .where(eq(twoFactor.userId, userId));
    return 'backup';
  }
  return null;
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const { codes, hashes } = newBackupCodes();
  await db.update(twoFactor).set({ backupCodes: hashes }).where(eq(twoFactor.userId, userId));
  return codes;
}

export async function remainingBackupCodes(userId: string): Promise<number> {
  return (await getTwoFactor(userId))?.backupCodes.length ?? 0;
}

export async function disable(userId: string) {
  await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
}
