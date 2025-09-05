// controllers/owner.controller.js
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';

/**
 * Helper to safely parse numbers from request body
 */
function toNumber(v, fallback = undefined) {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Owner -> create a stocklist account (role: 'stocklist')
 * POST /api/owner/create-stocklist
 * Body: { username, password }
 */
export const createStocklist = async (req, res) => {
  try {
    const body = req.body || {};
    const username = body.username;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ message: 'username & password required' });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already exists' });

    const stocklist = await User.create({ username, password, role: 'stocklist' });
    return res.status(201).json({ id: stocklist._id, username: stocklist.username, role: stocklist.role });
  } catch (err) {
    console.error('createStocklist error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Add product (or update existing by name for same owner).
 * Accepts JSON fields (for multipart version you can adapt).
 * POST /api/owner/add-product
 * Body: { name, description?, actualPrice, discountPrice?, quantity?, sku?, barcode?, variants? }
 */
export const addProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    const body = req.body || {};
    const name = (body.name || '').trim();
    const description = body.description || '';
    const actualPrice = toNumber(body.actualPrice);
    const discountPrice = toNumber(body.discountPrice, undefined);
    const quantity = toNumber(body.quantity, 0) || 0;
    const sku = body.sku || '';
    const barcode = body.barcode || '';
    let variants = [];

    if (body.variants) {
      try { variants = typeof body.variants === 'string' ? JSON.parse(body.variants) : body.variants; }
      catch (e) { variants = []; }
    }

    if (!name || actualPrice === undefined) {
      return res.status(400).json({ message: 'name and actualPrice are required' });
    }

    // check existing by same owner & name
    const existing = await Product.findOne({ createdBy: req.user.id, name });

    if (existing) {
      // update price/description/quantity/etc.
      existing.description = description;
      existing.actualPrice = actualPrice;
      if (discountPrice !== undefined) existing.discountPrice = discountPrice;
      if (Number.isFinite(quantity) && quantity > 0) existing.quantity = existing.quantity + Math.floor(quantity);
      if (sku) existing.sku = sku;
      if (barcode) existing.barcode = barcode;
      if (variants && variants.length) existing.variants = variants;
      await existing.save();
      return res.status(200).json({ product: existing, message: 'Existing product updated (stock/fields updated).' });
    }

    // create new product
    const product = await Product.create({
      name,
      description,
      actualPrice,
      discountPrice,
      quantity: Math.max(0, Math.floor(quantity)),
      sku,
      barcode,
      variants,
      createdBy: req.user.id
    });

    return res.status(201).json({ product });
  } catch (err) {
    console.error('addProduct error', err);
    if (err.code === 11000) return res.status(409).json({ message: 'Product with same name already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Update product: price, quantity (adjust or set), sku, barcode, variants, description
 * PATCH /api/owner/product/:id
 * Body supports JSON with fields:
 * - setQuantity (absolute), adjustQuantity (+/-), actualPrice, discountPrice, sku, barcode, variants (JSON)
 */
export const updateProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });

    const body = req.body || {};

    if (body.name) product.name = body.name;
    if (body.description) product.description = body.description;

    if (body.actualPrice !== undefined) {
      const p = toNumber(body.actualPrice);
      if (!Number.isNaN(p)) product.actualPrice = p;
    }
    if (body.discountPrice !== undefined) {
      const dp = toNumber(body.discountPrice);
      if (!Number.isNaN(dp)) product.discountPrice = dp;
    }

    if (body.setQuantity !== undefined) {
      const s = toNumber(body.setQuantity);
      if (Number.isFinite(s) && s >= 0) product.quantity = Math.floor(s);
    } else if (body.adjustQuantity !== undefined) {
      const a = toNumber(body.adjustQuantity);
      if (Number.isFinite(a)) product.quantity = Math.max(0, product.quantity + Math.floor(a));
    }

    if (body.sku) product.sku = body.sku;
    if (body.barcode) product.barcode = body.barcode;

    if (body.variants) {
      try { product.variants = typeof body.variants === 'string' ? JSON.parse(body.variants) : body.variants; } catch(e) {}
    }

    await product.save();
    return res.json({ product });
  } catch (err) {
    console.error('updateProduct error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * List owner products
 * GET /api/owner/products
 */
export const listProducts = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });
    const products = await Product.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    return res.json({ products });
  } catch (err) {
    console.error('listProducts error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get single product by id (owner only)
 * GET /api/owner/product/:id
 */
export const getProducts = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });
    if (product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });
    return res.json({ product });
  } catch (err) {
    console.error('getProducts error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete product (owner only)
 * DELETE /api/owner/product/:id
 */
export const deleteProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });
    if (product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });
    await product.deleteOne();
    return res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('deleteProduct error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
