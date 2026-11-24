import { Router } from 'express';
import { catalogRouter } from '../../products';
import {
  animalCatalog,
  batchCatalog,
  breedCatalog,
  colorMarkingCatalog,
  movementCatalog,
  penCatalog,
  penTypeCatalog,
  statusHistoryCatalog,
  weightCatalog,
  weightTargetCatalog,
} from '../services/herd-catalogs';

/**
 * Mounted at /api/farms. Each herd catalog gets the standard catalog endpoints
 * (list, export, options, create, import, bulk delete, update, delete…):
 *
 *   /api/farms/:farm/herd/pens      pens
 *   /api/farms/:farm/herd/pen-types pen types
 *   /api/farms/:farm/herd/batches   batches
 *   /api/farms/:farm/herd/weights   weight records
 *   /api/farms/:farm/herd/weight-targets  weight targets (animal or batch)
 *   /api/farms/:farm/herd/movements animal movements between pens
 *   /api/farms/:farm/herd/status-history  herd status changes
 *   /api/farms/:farm/herd/breeds    breeds (built-in ones read-only)
 *   /api/farms/:farm/herd/color-markings  color markings
 *   /api/farms/:farm/herd           animals (with photo upload)
 *
 * Sub-paths first, so /herd/pens isn't taken for an animal key.
 */
export const router = Router();

router.use('/:farm/herd/pens', catalogRouter(penCatalog));
router.use('/:farm/herd/pen-types', catalogRouter(penTypeCatalog));
router.use('/:farm/herd/batches', catalogRouter(batchCatalog));
router.use('/:farm/herd/weights', catalogRouter(weightCatalog));
router.use('/:farm/herd/weight-targets', catalogRouter(weightTargetCatalog));
router.use('/:farm/herd/movements', catalogRouter(movementCatalog));
router.use('/:farm/herd/status-history', catalogRouter(statusHistoryCatalog));
router.use('/:farm/herd/breeds', catalogRouter(breedCatalog));
router.use('/:farm/herd/color-markings', catalogRouter(colorMarkingCatalog));
router.use('/:farm/herd', catalogRouter(animalCatalog));
