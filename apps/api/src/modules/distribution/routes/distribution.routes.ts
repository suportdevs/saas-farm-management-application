import { Router } from 'express';
import { catalogRouter } from '../../products';
import { customerCatalog, customerTypeCatalog, supplierCatalog, supplierTypeCatalog } from '../services/distribution-catalogs';

/**
 * Mounted at /api/farms. Each catalog gets the standard catalog endpoints
 * (list, export, options, create, import, bulk delete, status, update, delete):
 *
 *   /api/farms/:farm/distribution/suppliers
 *   /api/farms/:farm/distribution/supplier-types
 *   /api/farms/:farm/distribution/customers
 *   /api/farms/:farm/distribution/customer-types
 */
export const router = Router();

router.use('/:farm/distribution/suppliers', catalogRouter(supplierCatalog));
router.use('/:farm/distribution/supplier-types', catalogRouter(supplierTypeCatalog));
router.use('/:farm/distribution/customers', catalogRouter(customerCatalog));
router.use('/:farm/distribution/customer-types', catalogRouter(customerTypeCatalog));
