# HerdSphere — cattle farm management SaaS

Multi-tenant SaaS for dairy and beef farms worldwide, built on the starter kit below
(**Express 5 API + Next.js 16 web app + Tailwind 4 + PostgreSQL (Drizzle)**).

## Quick start

```bash
npm install
npm run setup        # creates apps/api/.env and apps/web/.env.local
npm run db:up        # Docker project "herdsphere": Postgres :5434 (herdsphere + herdsphere_test), Mailpit :8026
npm run db:migrate
npm run db:seed      # admin@example.com / Admin12345 + demo farm "Green Valley Dairy"
npm run dev          # web http://localhost:3000 · api http://localhost:4000 · mail http://localhost:8026
```

Host ports are overridable (`POSTGRES_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`) so the stack can run
next to other projects. Production: see [Deployment](#deployment) — `docker-compose.prod.yml` builds
`herdsphere-api` and `herdsphere-web` images and requires `APP_SECRET` and `POSTGRES_PASSWORD`.

## Architecture: modules

The monorepo keeps the kit's layout (`apps/api`, `apps/web`, `packages/shared`). Inside it, **every
product feature is a module with the same name in all three places**:

```
packages/shared/src/<module>/      contract: zod schemas, types, constants (used by API and web)
apps/api/src/modules/<module>/     backend:  schema.ts · service.ts · routes.ts · index.ts (public API)
apps/web/src/modules/<module>/     frontend: components/ · server.ts · context.tsx · navigation.ts
apps/web/src/app/…                 Next.js routes only — thin pages that compose module components
```

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `farms` | Tenant core: farms, members, roles & permissions, invitations, activity log, localisation. Exposes `requireFarm()`, `getFarm()`, `registerUsageCounter()` and **`farmExtensions`** (hooks other modules plug into). | core |
| `subscriptions` | Plans, trials, limits & capabilities, Stripe checkout/portal/invoices/webhooks, trial reminder emails. Owns the `farm_subscriptions` table. | farms |
| `platform` | Operator console: MRR/ARR and growth stats, tenant directory, manual plans, trial extensions, suspensions. | farms, subscriptions |

Rules that keep modules independent:

- **One-way dependencies** in the order of `apps/api/src/modules/app-modules.ts` (`farms → subscriptions → platform`).
  A module imports another only through its `index.ts`, never its internal files.
- **Each module owns its tables** (`schema.ts`); others read them through the owner's functions. The
  tenant core never imports plans — `subscriptions` adds the plan to every farm, enforces seat limits and
  starts trials through `farmExtensions` (`extendContext`, `extendSummaries`, `addSeatGuard`, `onCreated`, `onDeleting`).
- **Each module has its own tests** (`apps/api/test/<module>.test.ts`) and env vars (`parseModuleEnv('<module>', …)`).
- Kit-installed modules (`npm run kit add two-factor`…) live alongside in the same folders and are registered
  automatically in `registry.ts` / `installed.ts`; product modules are listed by hand in `app-modules.ts`.

### Adding an operation module (herd, milk, health, breeding, feed, finance…)

1. `packages/shared/src/herd/` — schemas and types; export from `packages/shared/src/index.ts`.
2. `apps/api/src/modules/herd/` — `schema.ts`, `service.ts`, `routes.ts`, `index.ts` (`defineModule({ name: 'herd', basePath: 'farms', router, setup })`),
   then add it to `app-modules.ts` and run `npm run db:generate -- --name herd`.

   ```ts
   import { getFarm, registerUsageCounter, requireFarm } from '../farms';
   import { assertWithinLimit, requireCapability } from '../subscriptions';

   router.post('/:farm/animals', requireFarm('herd.create'), requireCapability('herd'), async (req, res) => {
     const { farm } = getFarm(res);
     await assertWithinLimit(farm.id, 'animals', await countAnimals(farm.id)); // 402 PLAN_LIMIT_REACHED
     …
   });
   // in setup(): registerUsageCounter('animals', countAnimals) — feeds plan limits and the billing page
   ```
3. `apps/web/src/modules/herd/` — components; pages under `apps/web/src/app/(app)/farms/[farm]/herd/`
   (they take precedence over the "coming next" placeholder). Flip the module's `status` to `'live'` in
   `apps/web/src/modules/farms/navigation.ts`. Client components read the tenant with `useFarm()`,
   `useCan('herd.create')` and `useHasCapability('herd')` from `@/modules/farms/context`.
4. `apps/api/test/herd.test.ts`.

### Roles & permissions

Permissions are per-action keys, `<module>.<action>` (`products.view`, `products.delete`, `members.invite`…), declared once
in `PERMISSION_MODULES` (`packages/shared/src/farms/access.ts`). A member's effective permissions are resolved in three layers:

1. **Role defaults** — `ROLE_PERMISSIONS` in the same file.
2. **Role overrides (per farm)** — owners change what a role can do on their farm, per action key. Stored as allow/deny deltas in
   `farm_role_permissions`, so keys added later still follow the defaults.
3. **Member overrides (per module/action)** — allow or deny single keys for one member (`farm_members.permission_overrides`); they win over the role.

Owners always hold every key; `farm.delete` is owner-only. Changing permissions needs `roles.manage` (owners by default); a
non-owner given it can only change keys they hold, and never their own. Endpoints: `GET /api/farms/:farm/permissions`,
`PUT|DELETE /api/farms/:farm/roles/:role/permissions`, `PUT /api/farms/:farm/members/:userId/permissions`. UI: **Farm → Roles & permissions**.

**The farm decides which modules exist at all.** After the three layers, keys are limited to modules that are
in the farm's plan (`MODULE_CAPABILITIES`, plus `ACTION_CAPABILITIES` — every `*.export` needs `data_export`) and
not switched off in **Farm settings → Modules** (`farms.disabled_modules`). `requireFarm(key)` answers, in order:
`403 MODULE_DISABLED` → `402 PLAN_UPGRADE_REQUIRED` → `403 FARM_PERMISSION_REQUIRED`. The context returns
`modules: { finance: 'plan' | 'disabled' | 'enabled', … }`; the sidebar hides switched-off modules and shows a lock
on plan-locked ones. Role settings are stored ungated, so an upgrade brings everything back.

```
user ─┬─ platform staff (users.role = admin, users.staff_role) → platform.* keys (operator console)
      └─ farm member (farm_members.role)
             role defaults → farm role overrides → member overrides   (what the person may do)
             ∩ plan capabilities ∩ enabled modules                      (what the farm has)
```

**Custom farm roles.** Besides the six system roles, a farm can define up to 30 roles of its own (name, description,
per-action keys) in **Roles & permissions** — `GET|POST /api/farms/:farm/roles`, `GET|PATCH|DELETE /api/farms/:farm/roles/:id`.
Members and invitations point at one with `custom_role_id`; its keys replace the system role's (member overrides still
apply on top). Underneath, such members keep the `viewer` system role, so owner-only rules are untouched. A role that
members or pending invitations hold can't be deleted (`409 ROLE_IN_USE`), and non-owners can only create, edit or assign
roles whose keys they hold themselves (`403 PERMISSION_ESCALATION`).

**Custom staff roles.** Super admins (anyone with `platform.staff.manage`) manage staff roles in **Platform admin → Staff roles**
— `GET|POST /api/admin/staff-roles`, `GET|PATCH|DELETE /api/admin/staff-roles/:key`. Built-in roles are read-only; custom
ones live in `platform_roles` and `users.staff_role` holds the key. New staff start as `analyst`, and nobody appoints or
re-scopes staff who can do more than they can. `npm run db:seed` creates a login per built-in staff role:
`support@example.com`, `billing@example.com`, `analyst@example.com` (password `SEED_STAFF_PASSWORD`, default the admin password).

**Platform staff** have per-action `platform.*` keys by staff role (`packages/shared/src/platform/access.ts`):
`super_admin` (everything, incl. `platform.staff.manage`), `support`, `billing`, `analyst`. Admins without a
staff role are super admins. Guard operator routes with `requirePlatform('platform.tenants.suspend')`.

**Billing events** from Stripe webhooks land in the farm's activity log (`farm.subscription_changed`,
`farm.subscription_cancel_scheduled|resumed`, `farm.payment_succeeded|failed`); a failed payment also emails every owner.
Subscribe the webhook to `invoice.paid` and `invoice.payment_failed` in addition to the `customer.subscription.*` events.

To give a new module keys, add it to `PERMISSION_MODULES` (and its defaults to `ROLE_PERMISSIONS`), then guard each route with
`requireFarm('<module>.<action>')` and each button with `useCan('<module>.<action>')`.

### Products module (catalog engine)

Products, product sizes, categories, brands, units, sizes and colors share one engine: list/search/paginate,
advanced filters, create & edit (modal, searchable and dependent selects), soft delete, bulk delete, status toggle, product images, CSV import
(all-or-nothing, row-level errors), export, print and an import template.

- Columns (table, modal, filters, CSV headers, template examples): `packages/shared/src/products/catalog.ts`
- Validation (body, import row, filters): `packages/shared/src/products/schemas.ts`
- Tables: `apps/api/src/modules/products/schema.ts` — every table has `tenant_id` (the farm); `id` is internal, `key` (uuid) is public; rows are soft-deleted; `status` is 1 = active, 0 = inactive
- One `new Catalog({...})` per resource in `apps/api/src/modules/products/catalogs.ts` — `fields` is exactly what a list row returns; `references` and `usedBy` declare foreign keys and delete protection
- Each new product gets a default product size (no size); deleting a product deletes its sizes. Images are stored under `UPLOAD_DIR` (`apps/api/src/lib/storage.ts`) — mount a volume there in production
- Endpoints per catalog under `/api/farms/:farm/products[/<resource>]`: `GET /`, `/export`, `/options`, `POST /`, `/import`, `/bulk-delete`, `/toggle-status`, `PUT|DELETE /:key`, `GET|PUT|DELETE /:key/image`

To add a catalog: add it to `CATALOG_RESOURCES`/`CATALOG` and `catalogSchemas`, add a table, a `Catalog` definition, then
`npm run db:generate -- --name <name>`. The web page and sidebar link pick it up automatically.

---

# SaaS Starter Kit

Production-ready SaaS foundation: **Express 5 API + Next.js 16 web app + Tailwind 4 + PostgreSQL (Drizzle)**, in a TypeScript monorepo with installable feature modules.

## Features

**Core (always on)**

- **Authentication** — email/password with Argon2id, revocable database sessions in httpOnly cookies, "remember me", sliding expiry, CSRF guard, rate limiting, constant-time login.
- **Brute-force protection** — accounts lock for `LOGIN_LOCKOUT_MINUTES` after `LOGIN_MAX_ATTEMPTS` failures (per account+IP, plus a higher per-account limit), shared across instances. Optional **math captcha** on login, sign-up, password reset and magic-link forms.
- **10 auth page layouts** — `centered`, `split-left`, `split-right`, `fullscreen`, `card`, `youtube-video`, `animated-birds`, `aurora-waves`, `particle-network`, `tidal`. Pick one with `NEXT_PUBLIC_AUTH_LAYOUT`; in development a floating switcher previews them all. Animations respect reduced-motion and adapt to dark/light theme.
- **Email verification modes** — `EMAIL_VERIFICATION=off | optional | required` (required blocks the app and the API until verified).
- **Beautiful emails** — branded HTML templates with preheaders, buttons and one-time-code blocks for verification, reset, OTP, magic links, invitations and a welcome email.
- **Automatic roles** — addresses in `ADMIN_EMAILS` become admins once their email is verified.
- **Account management** — profile, password change, email change (confirmed via link to the new address), active sessions with remote sign-out, account deletion, personal security activity log.
- **Email flows** — verification, password reset, email change, security notifications. Sent through a retrying job queue; printed to the console when SMTP isn't configured.
- **Admin console** (`/admin`) — sign-up analytics, user directory with search and filters, role changes, manual verification, suspend/unsuspend, revoke sessions, delete, and **impersonation** (with a banner and sensitive actions blocked).
- **Audit log** — sign-ins, failed attempts, password/email changes and every admin action, with IP and device. Browsable by admins; users see their own.
- **Background jobs** — Postgres-backed queue (`FOR UPDATE SKIP LOCKED`), retries with exponential backoff, de-duplication keys, and cluster-safe recurring tasks. No Redis needed.
- **Production plumbing** — typed env validation, structured logs with request ids, liveness/readiness probes, graceful shutdown, shared Postgres rate-limit store for multiple instances, security headers, Docker images, CI.
- **Public site** — landing page, Terms and Privacy templates, `robots.txt`, `sitemap.xml`, Open Graph metadata, dark mode.

**Installable modules** (`npm run kit add <name>`)

| Module          | What you get                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `two-factor`    | TOTP authenticator-app 2FA with backup codes, enforced on every sign-in method                   |
| `social-auth`   | Google, Facebook, GitHub, X, LinkedIn, Bitbucket, GitLab and Slack (OAuth 2 + PKCE) with account linking |
| `passkeys`      | Passwordless WebAuthn sign-in (Face ID, Touch ID, Windows Hello, security keys)                  |
| `email-otp`     | Two-step sign-in with a 6-digit emailed code, resend cooldown and attempt limits                 |
| `magic-link`    | Passwordless single-use sign-in links by email (optional sign-up)                               |
| `referrals`     | Personal invitation links for every user with automatic sign-up tracking                         |
| `billing`       | Stripe subscriptions: pricing page, checkout, customer portal, webhooks, `requirePlan()` gating  |
| `organizations` | Teams with owner/admin/member roles, email invitations, ownership transfer, `requireOrgRole()`   |

## Quick start

Requirements: Node.js 22 (see `.nvmrc`) and Docker (for Postgres + Mailpit), or your own PostgreSQL 15+.

```bash
npm install
npm run setup        # creates apps/api/.env and apps/web/.env.local with a fresh APP_SECRET
npm run db:up        # Postgres on :5434, Mailpit on :8026
npm run db:migrate
npm run db:seed      # optional: admin@example.com / Admin12345
npm run dev          # web http://localhost:3000 · api http://localhost:4000 · mail http://localhost:8026
```

Add features whenever you need them:

```bash
npm run kit list
npm run kit add billing organizations
npm run db:migrate
```

## Project structure

```
apps/
  api/                       Express API
    src/core/                Public surface for modules: auth flow, sessions, hooks, jobs, audit, tokens
    src/modules/
      auth/ users/ admin/    Kit core routers
      farms/                 Tenant core (farms, members, roles, invitations, activity)
      subscriptions/         Plans, trials, limits, Stripe billing
      platform/              Operator console (stats, tenants, manual plans, suspensions)
      app-modules.ts         Product modules, in dependency order (hand-maintained)
      registry.ts            Kit-installed modules (generated by the CLI)
    src/db/                  Core Drizzle schema, client, migrator, seed
    drizzle/                 Generated SQL migrations (commit these)
    test/                    Vitest + Supertest integration tests, one file per module
  web/                       Next.js App Router
    src/app/(marketing)      Landing, pricing, legal pages
    src/app/(auth)           Sign in/up, password reset, email verification, invitations
    src/app/(onboarding)     New-farm wizard
    src/app/(app)            Signed-in area: farms/[farm]/…, settings, admin
    src/modules/<module>/    Feature code per module (farms, subscriptions, platform) + kit modules
    src/components/          App chrome (shell, site) and the UI kit (components/ui)
    src/lib/                 API client, session, formatting
packages/
  shared/src/<module>/       Zod schemas, types and constants per module (core/ for the kit)
  cli/                       The `kit` CLI and module templates (packages/cli/modules/*)
docker/                      Container init scripts (e.g. creates the test database)
```

The browser only talks to the Next.js origin: `/api/*` is rewritten to the Express API, so cookies stay first-party and CORS isn't needed.

## Scripts

| Command                              | Description                                        |
| ------------------------------------ | -------------------------------------------------- |
| `npm run dev`                        | API + web with hot reload (the API runs the job worker) |
| `npm run dev:worker`                 | Run a separate job worker (set `RUN_WORKER=false` on the API) |
| `npm run build` / `npm start`        | Production build / start                           |
| `npm run typecheck`                  | Type-check every workspace                         |
| `npm test`                           | API integration tests (uses `TEST_DATABASE_URL`, falls back to `DATABASE_URL`) |
| `npm run db:generate -- --name x`    | Generate a migration after editing a schema        |
| `npm run db:migrate` / `db:studio`   | Apply migrations / open Drizzle Studio             |
| `npm run kit <list\|info\|add\|remove\|sync>` | Manage modules                            |

## How it fits together

### Hooks — extend auth without editing core

Modules register hooks in `setup()` (`apps/api/src/core/hooks.ts`):

- `addLoginGuard` — return a challenge name (e.g. `"two-factor"`) to require an extra step on any sign-in.
- `addUserSerializer` — add fields to the public user (e.g. `twoFactorEnabled`, `plan`).
- `onUserCreated` / `onUserDeleting` — react to account lifecycle (e.g. cancel subscriptions, hand over org ownership).
- `addFeatures` — add fields to `GET /api/features`.

On the web side, modules contribute to fixed **slots** (`apps/web/src/modules/types.ts`): sign-in buttons, Settings → Security cards, settings tabs, sidebar items, public nav links, dashboard widgets and login challenge pages.

### Background jobs

```ts
import { defineJob, schedule } from '../../core';

const sendDigest = defineJob<{ userId: string }>('digest.send', async ({ userId }) => {
  /* … throw to retry with backoff … */
});
await sendDigest.enqueue({ userId }, { delayMs: 60_000, uniqueKey: `digest:${userId}:${day}` });

schedule('reports.nightly', 24 * 60 * 60 * 1000, async () => {
  /* runs once per interval across all instances */
});
```

Built-in schedules purge expired sessions, tokens, rate-limit rows, old jobs and audit entries older than `AUDIT_LOG_RETENTION_DAYS`.

### Audit log

```ts
import { audit } from '../../core';
await audit(req, { action: 'project.deleted', targetType: 'project', targetId: id, metadata: { name } });
```

The actor defaults to the signed-in user; during impersonation the admin's id is recorded in `metadata.impersonatorId`. Add friendly labels in `apps/web/src/lib/audit.ts`.

### Plan and team gating (with the modules installed)

```ts
import { requirePlan } from '../billing';
import { getOrg, requireOrgRole } from '../organizations';

router.get('/reports', requireAuth, requirePlan('pro', 'team'), handler);
router.post('/:org/projects', requireAuth, requireOrgRole('admin'), (req, res) => {
  const { org, role } = getOrg(res);
});
```

## Configuration

API variables live in `apps/api/.env` (see `.env.example` for comments); module variables are appended there automatically by `kit add`.

| Variable                   | Default                 | Notes                                                        |
| -------------------------- | ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`             | —                       | Required                                                     |
| `APP_SECRET`               | —                       | Required, 32+ chars. Derives keys for encryption and signing |
| `WEB_URL`                  | `http://localhost:3000` | Public URL used in emails and OAuth/Stripe redirects         |
| `TRUST_PROXY`              | `loopback`              | Hop count (e.g. `1`) behind a load balancer                  |
| `SMTP_*`, `MAIL_FROM`      | —                       | Empty `SMTP_HOST` logs emails instead of sending             |
| `RATE_LIMIT_STORE`         | `memory`                | Use `postgres` when running more than one API instance       |
| `RUN_WORKER`               | `true`                  | Process jobs inside the API process                          |
| `JOB_CONCURRENCY`          | `5`                     | Jobs processed in parallel per worker                        |
| `AUDIT_LOG_RETENTION_DAYS` | `365`                   |                                                              |
| `EMAIL_VERIFICATION`       | `optional`              | `off`, `optional` or `required`                              |
| `LOGIN_MAX_ATTEMPTS`       | `5`                     | Failed sign-ins before a lock; `0` disables lockout           |
| `LOGIN_LOCKOUT_MINUTES`    | `15`                    |                                                              |
| `CAPTCHA_ENABLED` / `CAPTCHA_FORMS` | `false` / all       | Math captcha; forms: `login,register,forgot-password,magic-link` |
| `ADMIN_EMAILS`             | —                       | Comma separated; promoted to admin after verifying           |
| `SEND_WELCOME_EMAIL`       | `true`                  |                                                              |

Web variables (`apps/web/.env.local`): `API_URL` (internal API URL, **needed at build time** for rewrites), `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AUTH_LAYOUT`, `NEXT_PUBLIC_AUTH_YOUTUBE_ID` (for the `youtube-video` layout) and `NEXT_PUBLIC_AUTH_LAYOUT_SWITCHER`. `NEXT_PUBLIC_*` values are baked in at build time.

## Deployment

```bash
APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))") \
POSTGRES_PASSWORD='a-strong-password' \
WEB_URL=https://app.example.com \
docker compose -f docker-compose.prod.yml up -d --build
```

- The API container runs pending migrations on start. With several replicas, run `node dist/db/migrate.js` as a release step instead.
- Put TLS in front of the `web` service (cookies are `Secure` in production) and set `TRUST_PROXY` to your proxy hop count.
- Health checks: `GET /api/health/live` (process up) and `GET /api/health` (database reachable, 503 otherwise).
- Every response carries `x-request-id`; 500 errors include it so users can quote it to support.
- For heavy job loads, set `RUN_WORKER=false` on the API and start the `worker` profile in `docker-compose.prod.yml`.

### Production checklist

- [ ] Strong `APP_SECRET`, real SMTP credentials and a verified sending domain (SPF/DKIM)
- [ ] Change or delete the seeded admin account
- [ ] Replace the Terms and Privacy templates with reviewed copies
- [ ] `RATE_LIMIT_STORE=postgres` if you run more than one API instance
- [ ] Database backups and log shipping
- [ ] Billing: live Stripe keys, webhook endpoint `https://<WEB_URL>/api/billing/webhook`, Customer Portal enabled

## Writing a module

A module is a folder in `packages/cli/modules/<name>/`:

```
module.json        name, title, description, requires, dependencies, devDependencies, env, notes, migration
files/             mirrored into the project root on install
  apps/api/src/modules/<name>/index.ts    export default defineModule({ name, router, publicRouter?, setup })
  apps/api/src/modules/<name>/schema.ts   Drizzle tables (picked up by drizzle-kit automatically)
  apps/web/src/modules/<name>/index.ts    export default defineWebModule({ name, …slots })
  apps/api/test/<name>.test.ts            tests ship with the module
```

`kit add` copies the files, merges dependencies and env vars, regenerates both registries and generates a migration. `kit remove` reverses it and refuses to delete files you've edited unless you pass `--force`.

Module code imports from `../../core` only. Use `db.select()` for module tables (the relational `db.query` API only knows core tables), and `publicRouter` for webhooks — it is mounted before the CSRF guard and session middleware, with the raw body in `req.rawBody`.

## Security notes

- Session tokens are random 256-bit values; only their SHA-256 is stored. Cookies are `httpOnly`, `SameSite=Lax` and `Secure` in production.
- State-changing requests must send `X-Requested-With` (the web client does); combined with strict CORS this blocks CSRF.
- Single-use tokens (verification, reset, email change, invitations) are hashed at rest and expire.
- Suspending a user revokes all sessions immediately; suspended users can't sign in by any method.
- Impersonation sessions last one hour, never extend, can't target admins, and can't change the password or email or delete the account.
# express-next-starter-kit
# saas-farm-management-application
