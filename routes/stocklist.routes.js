import express from 'express';
import { stocklistBuy, dashboard } from '../controllers/stocklist.controller.js';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';

const router = express.Router();

router.post('/buy', auth, requireRole('stocklist'), stocklistBuy);
router.get('/dashboard', auth, requireRole('stocklist'), dashboard);

export default router;
