// controllers/owner.controller.js
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';

/* ---------------- helpers ---------------- */
const toNumber = (v, fallback = undefined) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseVariants = raw => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return null;
};

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
      if (qty > 0) ev.quantity = (ev.quantity || 0) + qty;
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

/* SKU / Barcode generators */
const generateSku = (base = 'PRD') => {
  const slug = base.toString().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  const t = Date.now().toString().slice(-5);
  return `${slug || 'PRD'}-${t}-${rnd}`;
};

const generateBarcode = () => {
  // 12-digit numeric string
  const n = Math.floor(Math.random() * 1e12);
  return n.toString().padStart(12, '0');
};

/* ---------------- controllers ---------------- */

/**
 * POST /api/owner/create-stocklist
 */
export const createStocklist = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

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
};

/* ---------- addProduct (stores files as Buffers and ensures sku/barcode) ---------- */
export const addProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    // debug
    console.log('>>> addProduct body keys:', Object.keys(req.body || {}));
    if (req.files) console.log('>>> addProduct files keys:', Object.keys(req.files));

    const body = req.body || {};
    const rawVariants = body.variants;
    const incomingVariants = parseVariants(rawVariants);
    if (rawVariants && incomingVariants === null) {
      return res.status(400).json({ message: 'Invalid JSON in variants field' });
    }

    const name = (body.name || '').trim();
    const description = body.description || '';
    let sku = (body.sku || '').toString().trim();
    let barcode = (body.barcode || '').toString().trim();
    const actualPrice = body.actualPrice !== undefined ? toNumber(body.actualPrice) : undefined;
    const quantity = body.quantity !== undefined ? Math.max(0, Math.floor(toNumber(body.quantity, 0) || 0)) : 0;

    if (!name) return res.status(400).json({ message: 'name is required' });
    if ((!incomingVariants || incomingVariants.length === 0) && actualPrice === undefined) {
      return res.status(400).json({ message: 'Either variants (with price) or actualPrice must be provided' });
    }

    // normalize & validate variants
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
      if (errs.length) return res.status(400).json({ message: 'Invalid variants', errors: errs });
    }

    // handle files (multer memoryStorage expected)
    let imagesPayload = [];
    let invoicePayload = null;

    if (req.files) {
      // preferred shape: req.files.images (array), req.files.invoice (array with one)
      if (req.files.images && Array.isArray(req.files.images)) {
        imagesPayload = req.files.images.map(f => ({ filename: f.originalname, mimeType: f.mimetype, data: f.buffer }));
      }
      if (req.files.invoice && Array.isArray(req.files.invoice) && req.files.invoice[0]) {
        const f = req.files.invoice[0];
        invoicePayload = { filename: f.originalname, mimeType: f.mimetype, data: f.buffer };
      }

      // fallback if upload.any() used (req.files is array)
      if ((!imagesPayload || imagesPayload.length === 0) && Array.isArray(req.files)) {
        for (const f of req.files) {
          if (f.fieldname === 'images') imagesPayload.push({ filename: f.originalname, mimeType: f.mimetype, data: f.buffer });
          else if (f.fieldname === 'invoice' && !invoicePayload) invoicePayload = { filename: f.originalname, mimeType: f.mimetype, data: f.buffer };
        }
      }
    }

    // fallback: allow base64 JSON in body.images / body.invoice
    if ((!imagesPayload || imagesPayload.length === 0) && body.images) {
      try {
        const arr = Array.isArray(body.images) ? body.images : (typeof body.images === 'string' ? JSON.parse(body.images) : []);
        for (const item of arr || []) {
          if (!item || !item.data) continue;
          const parts = item.data.split(',');
          const dataBase64 = parts.length === 2 ? parts[1] : parts[0];
          const buf = Buffer.from(dataBase64, 'base64');
          const mime = parts[0] && parts[0].includes(':') ? parts[0].split(';')[0].split(':')[1] : (item.mimeType || 'application/octet-stream');
          imagesPayload.push({ filename: item.filename || 'file', mimeType: mime, data: buf });
        }
      } catch (e) { /* ignore */ }
    }
    if (!invoicePayload && body.invoice) {
      try {
        const inv = typeof body.invoice === 'string' ? JSON.parse(body.invoice) : body.invoice;
        if (inv && inv.data) {
          const parts = inv.data.split(',');
          const dataBase64 = parts.length === 2 ? parts[1] : parts[0];
          const buf = Buffer.from(dataBase64, 'base64');
          const mime = parts[0] && parts[0].includes(':') ? parts[0].split(';')[0].split(':')[1] : (inv.mimeType || 'application/octet-stream');
          invoicePayload = { filename: inv.filename || 'invoice', mimeType: mime, data: buf };
        }
      } catch (e) {}
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

      // append images
      if (imagesPayload.length) {
        product.images = product.images || [];
        for (const img of imagesPayload) product.images.push({ filename: img.filename, mimeType: img.mimeType, data: img.data });
      }
      // invoice
      if (invoicePayload) product.invoice = { filename: invoicePayload.filename, mimeType: invoicePayload.mimeType, data: invoicePayload.data };

      product.description = description || product.description;
      // set product-level sku/barcode if provided; else keep existing; else generate
      if (sku) product.sku = sku;
      if (barcode) product.barcode = barcode;
      if (!product.sku || product.sku === '') {
        // prefer first variant sku if exists
        if (product.variants && product.variants.length && product.variants[0].sku) product.sku = product.variants[0].sku;
        else product.sku = generateSku(name);
      }
      if (!product.barcode || product.barcode === '') {
        if (product.variants && product.variants.length && product.variants[0].barcode) product.barcode = product.variants[0].barcode;
        else product.barcode = generateBarcode();
      }

      await product.save();
      return res.status(200).json({ product, message: 'Existing product updated' });
    }

    // create new product
    const toCreate = {
      name,
      description,
      createdBy: req.user.id,
      sku: sku || undefined,
      barcode: barcode || undefined,
      images: imagesPayload.map(i => ({ filename: i.filename, mimeType: i.mimeType, data: i.data })),
      invoice: invoicePayload ? { filename: invoicePayload.filename, mimeType: invoicePayload.mimeType, data: invoicePayload.data } : undefined
    };

    if (normalized.length) {
      toCreate.variants = normalized.map(v => ({
        name: v.name,
        price: Number(v.price),
        quantity: Number(v.quantity || 0),
        sku: v.sku || '',
        barcode: v.barcode || ''
      }));
    } else {
      toCreate.actualPrice = Number(actualPrice || 0);
      toCreate.quantity = Math.max(0, Math.floor(quantity || 0));
    }

    // ensure sku/barcode filled: prefer top-level, else first variant, else generate
    if (!toCreate.sku || toCreate.sku === '') {
      if (toCreate.variants && toCreate.variants.length && toCreate.variants[0].sku) {
        toCreate.sku = toCreate.variants[0].sku;
      } else {
        toCreate.sku = generateSku(name);
      }
    }
    if (!toCreate.barcode || toCreate.barcode === '') {
      if (toCreate.variants && toCreate.variants.length && toCreate.variants[0].barcode) {
        toCreate.barcode = toCreate.variants[0].barcode;
      } else {
        toCreate.barcode = generateBarcode();
      }
    }

    console.log('>>> addProduct creating:', { name: toCreate.name, variants: toCreate.variants?.length, images: toCreate.images?.length || 0, sku: toCreate.sku, barcode: toCreate.barcode });

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

/* ---------- updateProduct (ensures sku/barcode & handles files) ---------- */
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

    const incomingVariants = parseVariants(body.variants);
    if (incomingVariants && incomingVariants.length) {
      product.variants = mergeVariants(product.variants || [], incomingVariants);
    }

    // handle files (same as addProduct)
    let imagesPayload = [];
    let invoicePayload = null;

    if (req.files) {
      if (req.files.images && Array.isArray(req.files.images)) {
        imagesPayload = req.files.images.map(f => ({ filename: f.originalname, mimeType: f.mimetype, data: f.buffer }));
      }
      if (req.files.invoice && Array.isArray(req.files.invoice) && req.files.invoice[0]) {
        const f = req.files.invoice[0];
        invoicePayload = { filename: f.originalname, mimeType: f.mimetype, data: f.buffer };
      }
      if ((!imagesPayload || imagesPayload.length === 0) && Array.isArray(req.files)) {
        for (const f of req.files) {
          if (f.fieldname === 'images') imagesPayload.push({ filename: f.originalname, mimeType: f.mimetype, data: f.buffer });
          else if (f.fieldname === 'invoice' && !invoicePayload) invoicePayload = { filename: f.originalname, mimeType: f.mimetype, data: f.buffer };
        }
      }
    }

    if (imagesPayload.length) {
      product.images = product.images || [];
      for (const img of imagesPayload) product.images.push({ filename: img.filename, mimeType: img.mimeType, data: img.data });
    }
    if (invoicePayload) product.invoice = { filename: invoicePayload.filename, mimeType: invoicePayload.mimeType, data: invoicePayload.data };

    // ensure sku/barcode exist
    if (!product.sku || product.sku === '') {
      if (product.variants && product.variants.length && product.variants[0].sku) product.sku = product.variants[0].sku;
      else product.sku = generateSku(product.name || 'PRD');
    }
    if (!product.barcode || product.barcode === '') {
      if (product.variants && product.variants.length && product.variants[0].barcode) product.barcode = product.variants[0].barcode;
      else product.barcode = generateBarcode();
    }

    await product.save();
    return res.json({ product });
  } catch (err) {
    console.error('updateProduct error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ---------- list/get/delete ---------- */
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
