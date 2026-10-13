import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { audit, badRequest, forbidden, limiter, notFound, requireAuth, validate } from '../../core';
import type { Organization, OrgRole } from './schema';
import * as orgs from './service';

export const router = Router();

const inviteLimiter = limiter({ name: 'org-invite', windowMs: 60 * 60 * 1000, limit: 50 });

const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
  .refine((s) => !orgs.RESERVED_SLUGS.has(s), 'That URL is reserved');
const roleSchema = z.enum(['owner', 'admin', 'member']);

export interface OrgContext {
  org: Organization;
  role: OrgRole;
}

/** Org context set by `requireOrgRole` — use in your own org-scoped routes. */
export const getOrg = (res: Response) => res.locals.org as OrgContext;

/**
 * Resolves `:org` (id or slug) and requires the signed-in user to hold at
 * least `minRole`. Non-members get a 404 so org existence isn't leaked.
 */
export function requireOrgRole(minRole: OrgRole = 'member') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const membership = await orgs.findMembership(String(req.params.org), req.auth!.user.id);
    if (!membership) throw notFound('Organization not found');
    if (!orgs.atLeast(membership.role, minRole)) throw forbidden(`This requires the ${minRole} role`, 'ORG_ROLE_REQUIRED');
    res.locals.org = membership satisfies OrgContext;
    next();
  };
}

const tokenSchema = z.object({ token: z.string().min(1).max(200) });

/** Public: lets the invitation page show details before the visitor signs in. */
router.post('/invitations/lookup', validate(tokenSchema), async (req, res) => {
  const invitation = await orgs.lookupInvitation((req.body as z.infer<typeof tokenSchema>).token);
  if (!invitation) throw notFound('This invitation is invalid or has expired');
  res.json({ invitation });
});

// Everything below requires a signed-in user.
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ organizations: await orgs.listUserOrganizations(req.auth!.user.id) });
});

const createSchema = z.object({ name: nameSchema, slug: slugSchema.optional() });
router.post('/', validate(createSchema), async (req, res) => {
  const { name, slug } = req.body as z.infer<typeof createSchema>;
  const org = await orgs.createOrganization(req.auth!.user, name, slug);
  await audit(req, { action: 'org.created', targetType: 'organization', targetId: org.id, metadata: { name } });
  res.status(201).json({ organization: { ...orgs.serializeOrg(org), role: 'owner' } });
});

// Declared before the /:org routes.
router.post('/invitations/accept', validate(tokenSchema), async (req, res) => {
  const { token } = req.body as z.infer<typeof tokenSchema>;
  const org = await orgs.acceptInvitation(token, req.auth!.user);
  await audit(req, { action: 'org.invitation_accepted', targetType: 'organization', targetId: org.id });
  res.json({ organization: orgs.serializeOrg(org) });
});

// ─── A single organization ───────────────────────────────────────────────

router.get('/:org', requireOrgRole('member'), (_req, res) => {
  const { org, role } = getOrg(res);
  res.json({ organization: { ...orgs.serializeOrg(org), role } });
});

const updateSchema = z
  .object({ name: nameSchema.optional(), slug: slugSchema.optional() })
  .refine((v) => v.name || v.slug, 'Nothing to update');
router.patch('/:org', requireOrgRole('admin'), validate(updateSchema), async (req, res) => {
  const { org, role } = getOrg(res);
  const updated = await orgs.updateOrganization(org, req.body as z.infer<typeof updateSchema>);
  await audit(req, { action: 'org.updated', targetType: 'organization', targetId: org.id, metadata: req.body });
  res.json({ organization: { ...orgs.serializeOrg(updated), role } });
});

router.delete('/:org', requireOrgRole('owner'), async (req, res) => {
  const { org } = getOrg(res);
  await orgs.deleteOrganization(org.id);
  await audit(req, { action: 'org.deleted', targetType: 'organization', targetId: org.id, metadata: { name: org.name } });
  res.status(204).end();
});

router.get('/:org/members', requireOrgRole('member'), async (_req, res) => {
  const members = await orgs.listMembers(getOrg(res).org.id);
  res.json({ members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })) });
});

const roleUpdateSchema = z.object({ role: roleSchema });
router.patch('/:org/members/:userId', requireOrgRole('admin'), validate(roleUpdateSchema), async (req, res) => {
  const { org, role } = getOrg(res);
  const { role: newRole } = req.body as z.infer<typeof roleUpdateSchema>;
  await orgs.changeRole(org.id, role, String(req.params.userId), newRole);
  await audit(req, {
    action: 'org.member_role_changed',
    targetType: 'organization',
    targetId: org.id,
    metadata: { userId: req.params.userId, role: newRole },
  });
  res.status(204).end();
});

/** Removes a member — or leaves, when the target is yourself. */
router.delete('/:org/members/:userId', requireOrgRole('member'), async (req, res) => {
  const { org, role } = getOrg(res);
  const targetId = String(req.params.userId);
  await orgs.removeMember(org.id, { userId: req.auth!.user.id, role }, targetId);
  const self = targetId === req.auth!.user.id;
  await audit(req, {
    action: self ? 'org.member_left' : 'org.member_removed',
    targetType: 'organization',
    targetId: org.id,
    metadata: { userId: targetId },
  });
  res.status(204).end();
});

router.get('/:org/invitations', requireOrgRole('admin'), async (_req, res) => {
  const invitations = await orgs.listInvitations(getOrg(res).org.id);
  res.json({
    invitations: invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
  });
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  role: roleSchema.default('member'),
});
router.post('/:org/invitations', requireOrgRole('admin'), inviteLimiter, validate(inviteSchema), async (req, res) => {
  const { org, role } = getOrg(res);
  const input = req.body as z.infer<typeof inviteSchema>;
  if (input.role === 'owner' && role !== 'owner') throw forbidden('Only owners can invite owners', 'OWNER_REQUIRED');
  if (input.email === req.auth!.user.email) throw badRequest("You're already a member", 'ALREADY_MEMBER');
  const invitation = await orgs.invite(org, req.auth!.user, input.email, input.role);
  await audit(req, { action: 'org.member_invited', targetType: 'organization', targetId: org.id, metadata: { email: input.email, role: input.role } });
  res.status(201).json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() } });
});

router.delete('/:org/invitations/:id', requireOrgRole('admin'), async (req, res) => {
  const { org } = getOrg(res);
  await orgs.revokeInvitation(org.id, String(req.params.id));
  await audit(req, { action: 'org.invitation_revoked', targetType: 'organization', targetId: org.id });
  res.status(204).end();
});
