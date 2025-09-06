// controllers/owner.controller.js
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';

/* ---------------- helpers ---------------- */
function toNumber(v, fallback = undefined) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeIncomingVariants(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return []; }
  }
  return [];
}
function mergeVariants(existingVariants, incomingVariants) {
  const map = new Map((existingVariants || []).map(v => [String(v.name).trim(), v]));
  for (const inv of incomingVariants) {
    if (!inv || !inv.name) continue;
    const name = String(inv.name).trim();
    const price = toNumber(inv.price);
    const qty = Math.max(0, Math.floor(toNumber(inv.quantity, 0) || 0));
    const sku = inv.sku || '';
    const barcode = inv.barcode || '';

    if (map.has(name)) {
      const ev = map.get(name);
      if (price !== undefined) ev.price = price;
      if (qty > 0) ev.quantity = ev.quantity + qty;
      if (sku) ev.sku = sku;
      if (barcode) ev.barcode = barcode;
    } else {
      existingVariants.push({
        name,
        price: price !== undefined ? price : 0,
        quantity: qty,
        sku,
        barcode
      });
    }
  }
  return existingVariants;
}

/* ---------------- controllers ---------------- */

/**
 * POST /api/owner/create-stocklist
 */
export const createStocklist = async (req, res) => {
  try {
    const body = req.body || {};
    const username = (body.username || '').trim();
    const password = body.password;
    if (!username || !password) return res.status(400).json({ message: 'username & password required' });

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already exists' });

    const stocklist = await User.create({ username, password, role: 'stocklist' });
    return res.status(201).json({ id: stocklist._id, username: stocklist.username, role: stocklist.role });
  } catch (err) {
    console.error('createStocklist error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/* ---------- robust addProduct with final coercion & logging ---------- */

const parseVariants = raw => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return null;
};

export const addProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    // debug logs to inspect incoming body/files
    console.log('>>> addProduct - received body keys:', Object.keys(req.body || {}));
    if (req.files) console.log('>>> addProduct - files keys:', Object.keys(req.files));

    const body = req.body || {};

    // parse & show the raw variants
    const rawVariants = body.variants;
    console.log('>>> addProduct - raw variants:', rawVariants);
    const incomingVariants = parseVariants(rawVariants);
    if (rawVariants && incomingVariants === null) {
      return res.status(400).json({ message: 'Invalid JSON in variants field' });
    }

    // basic fields
    const name = (body.name || '').trim();
    const description = body.description || '';
    const sku = body.sku || '';
    const barcode = body.barcode || '';
    const actualPrice = body.actualPrice !== undefined ? toNumber(body.actualPrice) : undefined;
    const quantity = body.quantity !== undefined ? Math.max(0, Math.floor(toNumber(body.quantity, 0) || 0)) : 0;

    if (!name) return res.status(400).json({ message: 'name is required' });
    if ((!incomingVariants || incomingVariants.length === 0) && actualPrice === undefined) {
      return res.status(400).json({ message: 'Either variants (with price) or actualPrice must be provided' });
    }

    // normalize & validate incoming variants
    let normalized = [];
    if (incomingVariants && incomingVariants.length) {
      const errs = [];
      for (let i = 0; i < incomingVariants.length; i++) {
        const v = incomingVariants[i];
        if (!v || typeof v !== 'object') { errs.push(`variants[${i}] must be an object`); continue; }
        const vname = (v.name || '').toString().trim();
        const vprice = toNumber(v.price);
        const vqty = v.quantity !== undefined ? Math.max(0, Math.floor(toNumber(v.quantity, 0) || 0)) : 0;
        const vsku = v.sku || '';
        const vbarcode = v.barcode || '';

        if (!vname) errs.push(`variants[${i}].name is required`);
        if (vprice === undefined) errs.push(`variants[${i}].price is required and must be a number`);
        if (v.quantity !== undefined && Number.isNaN(Number(v.quantity))) errs.push(`variants[${i}].quantity must be a number`);

        normalized.push({ name: vname, price: vprice, quantity: vqty, sku: vsku, barcode: vbarcode });
      }
      console.log('>>> addProduct - normalized variants:', normalized);
      if (errs.length) return res.status(400).json({ message: 'Invalid variants', errors: errs });
    }

    // find existing product
    let product = await Product.findOne({ createdBy: req.user.id, name });

    if (product) {
      // update existing
      if (normalized.length) {
        product.variants = mergeVariants(product.variants || [], normalized);
      } else {
        if (actualPrice !== undefined) product.actualPrice = actualPrice;
        if (Number.isFinite(quantity) && quantity > 0) product.quantity = (product.quantity || 0) + quantity;
      }

      product.description = description || product.description;
      if (sku) product.sku = sku;
      if (barcode) product.barcode = barcode;

      await product.save();
      return res.status(200).json({ product, message: 'Existing product updated' });
    }

    // prepare create payload with forced numeric coercion
    const toCreate = { name, description, createdBy: req.user.id, sku, barcode };
    if (normalized.length) {
      // final coercion: ensure price is finite number for each variant
      const badIndexes = [];
      toCreate.variants = normalized.map((v, idx) => {
        const p = Number(v.price);
        if (!Number.isFinite(p)) badIndexes.push(idx);
        return {
          name: v.name,
          price: p,
          quantity: Number.isFinite(Number(v.quantity)) ? Number(v.quantity) : 0,
          sku: v.sku || '',
          barcode: v.barcode || ''
        };
      });
      if (badIndexes.length) {
        return res.status(400).json({ message: 'Invalid variant prices', errors: badIndexes.map(i => `variants[${i}].price invalid`) });
      }
    } else {
      toCreate.actualPrice = Number(actualPrice || 0);
      toCreate.quantity = Math.max(0, Math.floor(quantity || 0));
    }

    // final log - exactly what will be sent to mongoose
    console.log('>>> addProduct - final toCreate.variants:', toCreate.variants);
    console.log('>>> addProduct - final payload (toCreate):', toCreate);

    // create in DB
    const created = await Product.create(toCreate);
    return res.status(201).json({ product: created });
  } catch (err) {
    console.error('addProduct error:', err);
    if (err && err.name === 'ValidationError') {
      const list = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: 'Validation error', errors: list });
    }
    return res.status(500).json({ message: 'Server error', error: err.message || String(err) });
  }
};

/* ---------- other owner handlers (update/list/get/delete) ---------- */

export const updateProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });

    const body = req.body || {};
    if (body.name) product.name = String(body.name).trim();
    if (body.description) product.description = body.description;

    if (body.actualPrice !== undefined) {
      const p = toNumber(body.actualPrice);
      if (p !== undefined) product.actualPrice = p;
    }
    if (body.discountPrice !== undefined) {
      const dp = toNumber(body.discountPrice);
      if (dp !== undefined) product.discountPrice = dp;
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

    const incomingVariants = normalizeIncomingVariants(body.variants);
    if (incomingVariants.length) {
      product.variants = mergeVariants(product.variants || [], incomingVariants);
    }

    await product.save();
    return res.json({ product });
  } catch (err) {
    console.error('updateProduct error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

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
export const getProducts = listProducts;

export const getProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });
    if (product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });
    return res.json({ product });
  } catch (err) {
    console.error('getProduct error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

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
