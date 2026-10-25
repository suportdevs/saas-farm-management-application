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
apps/api/src/modules/<module>/     backend:  MVC — models/ · services/ · controllers/ · routes/ · index.ts (public API)
apps/web/src/modules/<module>/     frontend: components/ · server.ts · context.tsx · navigation.ts
apps/web/src/app/…                 Next.js routes only — thin pages that compose module components
```

### Backend MVC inside each module

The API follows **Model – View – Controller** inside every module (the Next.js app is the View):

```
apps/api/src/modules/<module>/
  models/        Drizzle tables, one table group per *.model.ts, re-exported by models/index.ts
  services/      business logic and database queries — no req/res; throw AppError helpers
  controllers/   request handlers: read the validated input → call services → audit → respond
  routes/        URL + middleware (auth, permission, rate limit, validate) + controller — no logic
  middleware/    module-specific middleware (e.g. farms' requireFarm, subscriptions' requireCapability)
  validators/    request schemas used only by this module (shared ones live in packages/shared)
  config.ts      the module's env vars (parseModuleEnv)
  index.ts       public API for other modules + defineModule({ router, setup })
```

A request flows `routes → middleware → controller → service → model`. Keep each layer to its job:
routes never contain logic, controllers never query the database, services never touch `req`/`res`.
File names say the layer: `farm.model.ts`, `member.service.ts`, `role.controller.ts`, `farm.routes.ts`.
Model files import each other relatively (drizzle-kit loads them directly), and drizzle-kit picks up
every `models/*.model.ts` automatically.

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `farms` | Tenant core: organizations (clients), farms (tenants), members, roles & permissions, invitations, activity log, localisation. Exposes `requireFarm()`, `getFarm()`, `registerUsageCounter()` and **`farmExtensions`** (hooks other modules plug into). | core |
| `subscriptions` | Plans (database-managed), trials, limits & capabilities, Stripe checkout/portal/invoices/webhooks, manual invoices, trial reminder emails. Owns `plans` and `farm_subscriptions`. | farms |
| `platform` | Operator console: stats, clients and tenants, plan management, client accounts and teams, manual plans and invoices, suspensions. | farms, subscriptions |

Rules that keep modules independent:

- **One-way dependencies** in the order of `apps/api/src/modules/app-modules.ts` (`farms → subscriptions → platform`).
  A module imports another only through its `index.ts`, never its internal files.
- **Each module owns its tables** (`models/`); others read them through the owner's functions. The
  tenant core never imports plans — `subscriptions` adds the plan to every farm, enforces seat limits and
  starts trials through `farmExtensions` (`extendContext`, `extendSummaries`, `addSeatGuard`, `onCreated`, `onDeleting`).
- **Each module has its own tests** (`apps/api/test/<module>.test.ts`) and env vars (`parseModuleEnv('<module>', …)`).
- Kit-installed modules (`npm run kit add two-factor`…) live alongside in the same folders and are registered
  automatically in `registry.ts` / `installed.ts`; product modules are listed by hand in `app-modules.ts`.

### Adding an operation module (herd, milk, health, breeding, feed, finance…)

1. `packages/shared/src/herd/` — schemas and types; export from `packages/shared/src/index.ts`.
2. `apps/api/src/modules/herd/` — `models/animal.model.ts`, `services/animal.service.ts`, `controllers/animal.controller.ts`,
   `routes/herd.routes.ts` and `index.ts` (`defineModule({ name: 'herd', basePath: 'farms', router, setup })`),
   then add it to `app-modules.ts` and run `npm run db:generate -- --name herd`.

   ```ts
   import { getFarm, registerUsageCounter, requireFarm } from '../farms';
   import { assertWithinLimit, requireCapability } from '../subscriptions';

   // routes/herd.routes.ts
   router.post('/:farm/animals', requireFarm('herd.create'), requireCapability('herd'), validate(createAnimalSchema), animals.create);

   // controllers/animal.controller.ts
   export async function create(req: Request, res: Response) {
     const { farm } = getFarm(res);
     await assertWithinLimit(farm.id, 'animals', await countAnimals(farm.id)); // 402 PLAN_LIMIT_REACHED
     res.status(201).json(await animalService.create(farm.id, req.body));
   }
   // in setup(): registerUsageCounter('animals', countAnimals) — feeds plan limits and the billing page
   ```
3. `apps/web/src/modules/herd/` — components; pages under `apps/web/src/app/(app)/farms/[farm]/herd/`
   (they take precedence over the "coming next" placeholder). Flip the module's `status` to `'live'` in
   `apps/web/src/modules/farms/navigation.ts`. Client components read the tenant with `useFarm()`,
   `useCan('herd.create')` and `useHasCapability('herd')` from `@/modules/farms/context`.
4. `apps/api/test/herd.test.ts`.

### SaaS model: user → organization → farm → subscription

```
User ── member of ──> Organization (client: company, co-op, family business)   owner · admin · member
                          └── Farm (tenant)  ── own team, roles & permissions
                                 └── Subscription → Plan (limits + modules) + per-tenant deal
```

- **Organization** (`organizations`, `organization_members`) — the client. A user's first farm creates one; later farms join it.
  Org **owners** act as owner on every farm of the organization, **admins** as manager; **members** get farm access only from
  each farm's team. API: `/api/organizations[/:org[/members/:userId]]`. UI: **Organizations** (sidebar) and the farm switcher.
- **Farm** — the tenant. Data, team, subscription and billing stay per farm (`farms.organization_id` links it to its client).
- **Plan** (`plans` table) — price, limits, modules (capabilities), public / online checkout / archived. Managed in
  **Platform admin → Plans** (`/api/admin/plans`, permission `platform.plans.manage`); edits apply to the plan's farms at once.
  `free` is the fallback and the trial plan (`FARM_TRIAL_PLAN`) can't be archived; a plan in use can only be archived.
  Stripe price ids live on the plan (the old `STRIPE_PRICE_*` env vars still work as a fallback). Public list: `GET /api/billing/plans`.
- **Module** — a capability in code (`CAPABILITIES`, `MODULE_CAPABILITIES`). Plans include modules; a tenant's deal adds or
  removes one for that farm; the farm can switch its own modules off.

**Client flow (self-serve):** sign up → farm wizard (creates the organization) → trial of the trial plan → checkout in
**Plan & billing** → more farms and organization members from **Organizations**.

**Platform flow (manual, for any client):**

| Step | Where |
| --- | --- |
| Client account | **Users → New client account** (`POST /api/admin/users`): the client gets an email to set a password (7 days) |
| Organization + farm | **Tenants → New tenant**: new client (new organization) or an existing one from **Clients**; the owner joins or is invited and takes over the organization on accepting |
| Plan, deal, invoices | Tenant page → plan, trial, **Deal & limits** (modules on/off, limits), **Manual invoices**; moving a farm to free also cancels a live Stripe subscription |
| Team | Tenant page → **Team**: add (account joins / others invited), change role, remove, transfer ownership, resend or revoke invitations, move the farm to another organization (`platform.tenants.manage`) |

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

**Manual clients (no Stripe).** The operator console covers the whole manual flow:

| Need | Where |
| --- | --- |
| Create a tenant for a client | **Tenants → New tenant** (`POST /api/admin/farms`): existing user becomes owner, otherwise an owner invitation is emailed; optional manual plan + paid-through date |
| Who is on which plan | **Subscriptions** (`GET /api/admin/farms/subscriptions`): plan, state, Stripe/manual, renewal date, limits, deal flag, MRR, unpaid/overdue balance; CSV export |
| Custom terms (seats, animals, modules) | Tenant page → **Deal & limits** (`PATCH /api/admin/farms/:id/entitlements`): stored on `farm_subscriptions`, applied on top of any plan, survives plan changes |
| Bill and get paid offline | Tenant page → **Manual invoices**: numbered `INV-<year>-00001`, partial payments, void; an invoice that "pays for" a plan moves the tenant to it through its period end once paid in full. **Invoices** lists all of them (CSV export). The tenant sees them on its own billing page |
| Who may do it | `platform.tenants.create`, `platform.billing.view`, `platform.billing.manage` (staff roles) |

Staff roles have a list with modal create/edit, delete and CSV import / export / template (`POST /api/admin/staff-roles/import`, all rows or none).

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
- Tables: `apps/api/src/modules/products/models/` (one per table, shared columns in `columns.ts`) — every table has `tenant_id` (the farm); `id` is internal, `key` (uuid) is public; rows are soft-deleted; `status` is 1 = active, 0 = inactive
- One `new Catalog({...})` per resource in `apps/api/src/modules/products/services/catalog-definitions.ts` (engine: `services/catalog.service.ts`; one `controllers/catalog.controller.ts` serves every catalog) — `fields` is exactly what a list row returns; `references` and `usedBy` declare foreign keys and delete protection
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
      auth/ users/ admin/    Kit core (services/ · controllers/ · routes/)
      farms/                 Tenant core (farms, members, roles, invitations, activity)
      subscriptions/         Plans, trials, limits, Stripe billing
      platform/              Operator console (stats, tenants, manual plans, suspensions)
      products/              Product catalog (products, sizes, categories, brands, units, colors)
      <module>/              each: models/ · services/ · controllers/ · routes/ · index.ts
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
