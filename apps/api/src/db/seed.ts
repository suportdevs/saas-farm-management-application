import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import { farmMembers, farms } from '../modules/farms/schema';
import { farmSubscriptions } from '../modules/subscriptions/schema';
import { db, pool } from './client';
import { users } from './schema';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345';
const DEMO_FARM_SLUG = 'green-valley-dairy';

async function main() {
  let admin = await db.query.users.findFirst({ where: eq(users.email, ADMIN_EMAIL) });
  if (admin) {
    console.log(`ℹ️  Admin ${ADMIN_EMAIL} already exists — skipping`);
  } else {
    [admin] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: 'Admin',
        role: 'admin',
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        emailVerifiedAt: new Date(),
      })
      .returning();
    console.log(`✅ Created admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} — change this password!`);
  }

  const [existingFarm] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, DEMO_FARM_SLUG)).limit(1);
  if (existingFarm) {
    console.log('ℹ️  Demo farm already exists — skipping');
    return;
  }
  const [farm] = await db
    .insert(farms)
    .values({
      name: 'Green Valley Dairy',
      slug: DEMO_FARM_SLUG,
      type: 'dairy',
      description: 'Demo farm created by the seed script.',
      country: 'NZ',
      region: 'Waikato',
      city: 'Hamilton',
      timezone: 'Pacific/Auckland',
      currency: 'NZD',
      locale: 'en-NZ',
      herdSize: 320,
      totalArea: 180,
      goals: ['milk_yield', 'herd_health', 'fertility'],
      createdById: admin!.id,
    })
    .returning();
  await db.insert(farmMembers).values({ farmId: farm!.id, userId: admin!.id, role: 'owner', title: 'Farm owner', lastAccessedAt: new Date() });
  await db.insert(farmSubscriptions).values({ farmId: farm!.id, trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });
  console.log(`✅ Created demo farm "${farm!.name}" owned by ${ADMIN_EMAIL}`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
