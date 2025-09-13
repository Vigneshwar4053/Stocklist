import express from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import upload from '../middleware/uploadDisk.js'; // <- disk-based multer

import {
  createStocklist,
  addProduct,
  updateProduct,
  getProduct,
  listProducts,
  deleteProduct
} from '../controllers/owner.controller.js';

const router = express.Router();

router.post('/create-stocklist', auth, requireRole('owner'), createStocklist);

router.post('/add-product', auth, requireRole('owner'),
  upload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'invoice', maxCount: 1 }
  ]),
  addProduct
);

router.patch('/product/:id', auth, requireRole('owner'),
  upload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'invoice', maxCount: 1 }
  ]),
  updateProduct
);

router.get('/products', auth, requireRole('owner'), listProducts);
router.get('/product/:id', auth, requireRole('owner'), getProduct);
router.delete('/product/:id', auth, requireRole('owner'), deleteProduct);

export default router;
