import { Router } from 'express';
import { requireAuth } from '../../core';
import { referralStats } from './service';

export const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  res.json(await referralStats(req.auth!.user.id));
});
