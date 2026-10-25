import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { addOrgMemberSchema, createOrganizationSchema, updateOrganizationSchema, updateOrgMemberSchema } from '@kit/shared';
import { audit } from '../../../core';
import { getOrg } from '../middleware/org-access.middleware';
import * as orgs from '../services/organization.service';

const orgEvent = (id: string) => ({ targetType: 'organization', targetId: id });
const actorOf = (req: Request, res: Response) => ({ userId: req.auth!.user.id, role: getOrg(res).role });

/** GET / — the user's organizations. */
export async function list(req: Request, res: Response) {
  res.json({ organizations: await orgs.listUserOrganizations(req.auth!.user.id) });
}

/** POST / — the creator becomes its owner. */
export async function create(req: Request, res: Response) {
  const { name } = req.body as z.output<typeof createOrganizationSchema>;
  const org = await orgs.createOrganization(req.auth!.user, name);
  await audit(req, { action: 'organization.created', ...orgEvent(org.id), metadata: { name } });
  res.status(201).json({ organization: { id: org.id, name: org.name } });
}

/** GET /:org — farms and members. */
export async function show(_req: Request, res: Response) {
  const { organization, role } = getOrg(res);
  res.json(await orgs.organizationDetail(organization, role));
}

/** PATCH /:org */
export async function update(req: Request, res: Response) {
  const { organization } = getOrg(res);
  const { name } = req.body as z.output<typeof updateOrganizationSchema>;
  const updated = await orgs.renameOrganization(organization, name);
  await audit(req, { action: 'organization.updated', ...orgEvent(organization.id), metadata: { from: organization.name, to: name } });
  res.json({ organization: { id: updated.id, name: updated.name } });
}

/** DELETE /:org — only once it has no farms. */
export async function remove(req: Request, res: Response) {
  const { organization } = getOrg(res);
  await orgs.deleteOrganization(organization);
  await audit(req, { action: 'organization.deleted', ...orgEvent(organization.id), metadata: { name: organization.name } });
  res.status(204).end();
}

/** POST /:org/members — adds an existing user by email. */
export async function addMember(req: Request, res: Response) {
  const { organization, role: actorRole } = getOrg(res);
  const { email, role } = req.body as z.output<typeof addOrgMemberSchema>;
  const user = await orgs.addOrgMember(organization.id, actorRole, email, role);
  await audit(req, { action: 'organization.member_added', ...orgEvent(organization.id), metadata: { userId: user.id, email, role } });
  res.status(201).json({ members: await orgs.listOrgMembers(organization.id) });
}

/** PATCH /:org/members/:userId */
export async function updateMember(req: Request, res: Response) {
  const { organization } = getOrg(res);
  const targetId = String(req.params.userId);
  const { role } = req.body as z.output<typeof updateOrgMemberSchema>;
  const { from, to } = await orgs.updateOrgMember(organization.id, actorOf(req, res), targetId, role);
  if (from !== to) await audit(req, { action: 'organization.member_role_changed', ...orgEvent(organization.id), metadata: { userId: targetId, from, to } });
  res.json({ members: await orgs.listOrgMembers(organization.id) });
}

/** DELETE /:org/members/:userId — removes a member, or leaves when the target is yourself. */
export async function removeMember(req: Request, res: Response) {
  const { organization } = getOrg(res);
  const targetId = String(req.params.userId);
  await orgs.removeOrgMember(organization.id, actorOf(req, res), targetId);
  const self = targetId === req.auth!.user.id;
  await audit(req, { action: self ? 'organization.member_left' : 'organization.member_removed', ...orgEvent(organization.id), metadata: { userId: targetId } });
  res.status(204).end();
}
