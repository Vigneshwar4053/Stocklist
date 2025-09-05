// routes/owner.routes.js
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import {
  createStocklist,
  addProduct,
  updateProduct,
  getProducts,
  
  deleteProduct,
  listProducts
} from '../controllers/owner.controller.js';

const router = express.Router();

// stocklist creation (JSON)
router.post('/create-stocklist', auth, requireRole('owner'), createStocklist);

// add product (multipart; images[] and invoices[] optional)
router.post('/add-product', auth, requireRole('owner'), upload.fields([
  { name: 'images', maxCount: 6 },
  { name: 'invoices', maxCount: 4 }
]), addProduct);

// update product (supports multipart OR JSON)
router.patch('/product/:id', auth, requireRole('owner'), upload.fields([
  { name: 'images', maxCount: 6 },
  { name: 'invoices', maxCount: 4 }
]), updateProduct);

router.get('/products', auth, requireRole('owner'),getProducts);
router.get('/product/:id', auth, requireRole('owner'),  getProducts);
router.delete('/product/:id', auth, requireRole('owner'), deleteProduct);

export default router;
