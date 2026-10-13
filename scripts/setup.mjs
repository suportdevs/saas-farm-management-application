#!/usr/bin/env node
// One-time local setup: creates env files with a freshly generated secret.
import crypto from 'node:crypto';
import fs from 'node:fs';

const files = [
  { from: 'apps/api/.env.example', to: 'apps/api/.env' },
  { from: 'apps/web/.env.example', to: 'apps/web/.env.local' },
];

for (const { from, to } of files) {
  if (fs.existsSync(to)) {
    console.log(`• ${to} already exists — skipped`);
    continue;
  }
  let content = fs.readFileSync(from, 'utf8');
  content = content.replace(/^APP_SECRET=.*$/m, `APP_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
  fs.writeFileSync(to, content);
  console.log(`✔ Created ${to}`);
}

console.log(`
Next steps:
  npm run db:up        # start Postgres + Mailpit (Docker)
  npm run db:migrate   # create tables
  npm run db:seed      # optional: admin@example.com / Admin12345
  npm run dev          # http://localhost:3000  (emails: http://localhost:8026)

Optional modules:
  npm run kit list
  npm run kit add two-factor social-auth billing organizations
`);
