import { z } from 'zod';
import { parseModuleEnv } from '../../core';

export const config = parseModuleEnv(
  'farms',
  z.object({
    /** Farms a single user may own — limits abuse of free trials. */
    FARM_MAX_OWNED: z.coerce.number().int().min(1).default(10),
  }),
);
