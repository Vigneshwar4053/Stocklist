// routes/owner.routes.js
import express from 'express';
import { createStocklist, addProduct, listProducts } from '../controllers/owner.controller.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// POST /api/owner/create-stocklist
router.post('/create-stocklist', auth, requireRole('owner'), createStocklist);

// POST /api/owner/add-product
router.post('/add-product', auth, requireRole('owner'), addProduct);

// GET /api/owner/products
router.get('/products', auth, requireRole('owner'), listProducts);

export default router;
