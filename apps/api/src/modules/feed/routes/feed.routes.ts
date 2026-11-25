import { Router } from 'express';
import { finishReceiveBulkSchema, finishReceiveItemListSchema, finishReceiveListSchema, finishReceiveProductSearchSchema, finishReceiveSchema } from '@kit/shared';
import { validate } from '../../../core';
import { requireFarm } from '../../farms';
import { finishReceiveController as c } from '../controllers/finish-receive.controller';

/**
 * Mounted at /api/farms:
 *
 *   GET    /:farm/feed/finish-receives              list (?q, status 0|1, warehouse, from, to, page, pageSize ≤ 1000)
 *   GET    /:farm/feed/finish-receives/:key         one receive with its lines
 *   POST   /:farm/feed/finish-receives              create (Pending)
 *   PUT    /:farm/feed/finish-receives/:key         update (Pending only)
 *   POST   /:farm/feed/finish-receives/:key/process Pending → Processed
 *   DELETE /:farm/feed/finish-receives/:key         delete (Pending only)
 *   GET    /:farm/feed/finish-receives/product-search  form product picker (?category, q)
 *   POST   /:farm/feed/finish-receives/bulk-confirm { keys }  Pending → Processed
 *   POST   /:farm/feed/finish-receives/bulk-reset   { keys }  Processed → Pending
 *   GET    /:farm/feed/finish-receive-items         every line with its receive
 */
export const router = Router();

const path = '/:farm/feed/finish-receives';

router.get(path, requireFarm('feed.finish_receive_list'), validate(finishReceiveListSchema, 'query'), c.list);
// Fixed paths before /:key.
router.get(`${path}/product-search`, requireFarm(['feed.finish_receive_create', 'feed.finish_receive_edit']), validate(finishReceiveProductSearchSchema, 'query'), c.productSearch);
router.post(`${path}/bulk-confirm`, requireFarm('feed.finish_receive_process'), validate(finishReceiveBulkSchema), c.bulkConfirm);
router.post(`${path}/bulk-reset`, requireFarm('feed.finish_receive_reset'), validate(finishReceiveBulkSchema), c.bulkReset);
router.get('/:farm/feed/finish-receive-items', requireFarm('feed.finish_receive_list'), validate(finishReceiveItemListSchema, 'query'), c.items);
router.get(`${path}/:key`, requireFarm(['feed.finish_receive_list', 'feed.finish_receive_edit']), c.show);
router.post(path, requireFarm('feed.finish_receive_create'), validate(finishReceiveSchema), c.create);
router.put(`${path}/:key`, requireFarm('feed.finish_receive_edit'), validate(finishReceiveSchema), c.update);
router.post(`${path}/:key/process`, requireFarm('feed.finish_receive_process'), c.process);
router.delete(`${path}/:key`, requireFarm('feed.finish_receive_delete'), c.remove);
