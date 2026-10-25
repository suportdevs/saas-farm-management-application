import type { NextFunction, Request, Response } from 'express';
import type { Capability } from '@kit/shared';
import { AppError } from '../../../core';
import { getFarm } from '../../farms';
import { entitlementsOf, findSubscription } from '../services/entitlement.service';

/** Requires the farm's plan (or deal) to include a capability. Use after `requireFarm()`. */
export function requireCapability(capability: Capability) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const { plan, capabilities } = entitlementsOf(await findSubscription(getFarm(res).farm.id));
    if (!capabilities.includes(capability)) {
      throw new AppError(402, 'PLAN_UPGRADE_REQUIRED', `This feature isn't included in the ${plan.name} plan. Upgrade to unlock it.`);
    }
    next();
  };
}
