import { Router } from 'express';
import { purchaseListSchema, purchaseSchema } from '@kit/shared';
import { validate } from '../../../core';
import { requireFarm } from '../../farms';
import { purchaseController as c } from '../controllers/purchase.controller';

/**
 * Mounted at /api/farms:
 *
 *   GET    /:farm/purchases        list (?q, source_type, from, to, page, pageSize ≤ 1000 for downloads)
 *   GET    /:farm/purchase-items   every animal line with its purchase (same query as the list)
 *   GET    /:farm/purchases/:key   one purchase with its animal lines
 *   POST   /:farm/purchases        create (adds the animals to the herd)
 *   PUT    /:farm/purchases/:key   update (lines with a key are updated, new ones added, missing ones removed)
 *   DELETE /:farm/purchases/:key   delete (with the animals it added)
 */
export const router = Router();

// Download needs list + export; the list alone needs list.
const canList = requireFarm('purchase.purchase_list');

router.get('/:farm/purchases', canList, validate(purchaseListSchema, 'query'), c.list);
router.get('/:farm/purchase-items', canList, validate(purchaseListSchema, 'query'), c.items);
router.get('/:farm/purchases/:key', requireFarm(['purchase.purchase_list', 'purchase.purchase_edit']), c.show);
router.post('/:farm/purchases', requireFarm('purchase.purchase_create'), validate(purchaseSchema), c.create);
router.put('/:farm/purchases/:key', requireFarm('purchase.purchase_edit'), validate(purchaseSchema), c.update);
router.delete('/:farm/purchases/:key', requireFarm('purchase.purchase_delete'), c.remove);
