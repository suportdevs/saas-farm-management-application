import { Router } from 'express';
import { catalogRouter } from '../../products';
import { animalCatalog, penCatalog } from '../services/herd-catalogs';

/**
 * Mounted at /api/farms. Each herd catalog gets the standard catalog endpoints
 * (list, export, options, create, import, bulk delete, update, delete…):
 *
 *   /api/farms/:farm/herd/pens   pens
 *   /api/farms/:farm/herd        animals (with photo upload)
 *
 * Pens first, so /herd/pens isn't taken for an animal key.
 */
export const router = Router();

router.use('/:farm/herd/pens', catalogRouter(penCatalog));
router.use('/:farm/herd', catalogRouter(animalCatalog));
