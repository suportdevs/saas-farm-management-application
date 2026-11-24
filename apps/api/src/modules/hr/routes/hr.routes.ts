import { Router } from 'express';
import { catalogRouter } from '../../products';
import { designationCatalog, employeeCatalog } from '../services/hr-catalogs';

/**
 * Mounted at /api/farms. Each catalog gets the standard catalog endpoints
 * (list, export, options, create, import, bulk delete, status, update, delete):
 *
 *   /api/farms/:farm/hr/designations
 *   /api/farms/:farm/hr/employees
 */
export const router = Router();

router.use('/:farm/hr/designations', catalogRouter(designationCatalog));
router.use('/:farm/hr/employees', catalogRouter(employeeCatalog));
