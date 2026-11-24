import { Router } from 'express';
import { finishReceiveListSchema, finishReceiveSchema } from '@kit/shared';
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
 */
export const router = Router();

const path = '/:farm/feed/finish-receives';

router.get(path, requireFarm('feed.finish_receive_list'), validate(finishReceiveListSchema, 'query'), c.list);
router.get(`${path}/:key`, requireFarm(['feed.finish_receive_list', 'feed.finish_receive_edit']), c.show);
router.post(path, requireFarm('feed.finish_receive_create'), validate(finishReceiveSchema), c.create);
router.put(`${path}/:key`, requireFarm('feed.finish_receive_edit'), validate(finishReceiveSchema), c.update);
router.post(`${path}/:key/process`, requireFarm('feed.finish_receive_process'), c.process);
router.delete(`${path}/:key`, requireFarm('feed.finish_receive_delete'), c.remove);
