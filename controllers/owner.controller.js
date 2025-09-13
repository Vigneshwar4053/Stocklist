// controllers/owner.controller.js 
import fs from 'fs/promises';
import path from 'path';
import { Product } from '../models/product.model.js';
import imagekit from '../lib/imagekit.js';
import { uploadFilePathToImageKit } from '../utils/imageUpload.js'; // or inline the function
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
  const map = new Map((existingVariants || []).map(v => [String(v.name || v.form).trim(), v]));
  for (const inv of incomingVariants) {
    if (!inv || (!inv.name && !inv.form)) continue;
    const name = String(inv.name || inv.form).trim();
    const price = toNumber(inv.price ?? inv.originalPrice);
    const qty = Math.max(0, Math.floor(toNumber(inv.quantity, 0) || 0));
    const sku = inv.sku || '';
    const images = inv.images || [];
    const barcode = inv.barcode || '';

    if (map.has(name)) {
      const ev = map.get(name);
      if (price !== undefined) ev.price = price;
      if (qty > 0) ev.quantity = (ev.quantity || 0) + qty;
      if (sku) ev.sku = sku;
      if (images && images.length) ev.images = (ev.images || []).concat(images);
      if (barcode) ev.barcode = barcode;
    } else {
      existingVariants.push({
        name,
        form: name,
        originalPrice: price !== undefined ? price : 0,
        price: price !== undefined ? price : 0,
        quantity: qty,
        sku,
        images,
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
  const n = Math.floor(Math.random() * 1e12);
  return n.toString().padStart(12, '0');
};

/* ImageKit uploader helper */
async function uploadBufferToImageKit(buffer, originalname = 'file', folder = '/products') {
  if (!imagekit || typeof imagekit.upload !== 'function') {
    throw new Error('imagekit client not configured');
  }
  const safeName = (originalname || 'file').replace(/[^\w.-]/g, '_').slice(0, 80);
  const fileName = `${Date.now()}_${safeName}`;
  const resp = await imagekit.upload({
    file: buffer,
    fileName,
    folder
  });
  return resp?.url || resp?.filePath || null;
}

/* Schema-aware mapping helper for images */
function mapImageUrlsToSchema(urls = []) {
  try {
    const path = Product.schema.path('images');
    if (!path) return urls.slice();

    if (path.instance === 'Array' && path.caster && path.caster.instance === 'String') {
      // schema: images: [String]
      return urls.slice();
    }

    // otherwise assume subdocument array -> map to objects with { url }
    return urls.map(u => ({ url: u }));
  } catch (e) {
    return urls.slice();
  }
}

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

/* ---------- addProduct ---------- */
export const addProduct = async (req, res) => {
  // req.files provided by multer.diskStorage middleware
  // expects upload.fields([{ name: 'images' }, { name: 'invoice' }])
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    console.log('>>> addProduct body keys:', Object.keys(req.body || {}));
    if (req.files) console.log('>>> addProduct files keys:', Object.keys(req.files));

    const body = req.body || {};
    const prodName = (body.name || body.prodName || '').trim();
    if (!prodName) return res.status(400).json({ message: 'Product name required' });

    // parse variants (same robust parser you had)
    const parseVariants = raw => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e) { return null; } }
      return null;
    };
    const incomingVariants = parseVariants(body.variants);
    if (body.variants && incomingVariants === null) {
      return res.status(400).json({ message: 'Invalid JSON variants' });
    }

    // UPLOAD FILES TO IMAGEKIT (from disk) -> collect URLs
    const uploadedImageUrls = [];
    let invoiceUrl = null;

    // handle images
    if (req.files && req.files.images && Array.isArray(req.files.images)) {
      for (const f of req.files.images) {
        try {
          const u = await uploadFilePathToImageKit(f.path, f.originalname, `/products/${req.user.id}`);
          if (u) uploadedImageUrls.push(u);
        } catch (err) {
          console.warn('image upload failed for', f.path, err);
        } finally {
          // delete temp file regardless of success
          try { await fs.unlink(f.path); } catch (e) { /* ignore */ }
        }
      }
    }

    // invoice
    if (req.files && req.files.invoice && Array.isArray(req.files.invoice) && req.files.invoice[0]) {
      const f = req.files.invoice[0];
      try {
        const u = await uploadFilePathToImageKit(f.path, f.originalname, `/invoices/${req.user.id}`);
        if (u) invoiceUrl = u;
      } catch (err) {
        console.warn('invoice upload failed', err);
      } finally {
        try { await fs.unlink(f.path); } catch (e) { /* ignore */ }
      }
    }

    // fallback: if req.files was upload.any (array) - handle by checking fieldname
    if (Array.isArray(req.files) && req.files.length) {
      for (const f of req.files) {
        if (f.fieldname === 'images') {
          try {
            const u = await uploadFilePathToImageKit(f.path, f.originalname, `/products/${req.user.id}`);
            if (u) uploadedImageUrls.push(u);
          } catch (err) { console.warn(err); }
          try { await fs.unlink(f.path); } catch (e) {}
        } else if ((f.fieldname === 'invoice' || f.fieldname === 'invoices') && !invoiceUrl) {
          try {
            const u = await uploadFilePathToImageKit(f.path, f.originalname, `/invoices/${req.user.id}`);
            if (u) invoiceUrl = u;
          } catch (err) { console.warn(err); }
          try { await fs.unlink(f.path); } catch (e) {}
        }
      }
    }

    // Now build product payload and save product document (store image URLs)
    const description = body.description || '';
    const brand = body.brand || 'generic';

    // Normalize variants into the shape your model expects
    const normalizedVariants = (incomingVariants || []).map(v => ({
      name: v.name || v.form || 'default',
      sku: v.sku || '', // you may generate sku here if needed
      barcode: v.barcode || '',
      quantity: Number(v.quantity || 0),
      originalPrice: Number(v.price || v.originalPrice || 0),
      price: Number(v.price || v.originalPrice || 0),
      images: Array.isArray(v.images) ? v.images : []
    }));

    // either create or update existing product for this owner and name
    let product = await Product.findOne({ createdBy: req.user.id, prodName });
    if (product) {
      // merge
      if (normalizedVariants.length) {
        // for simplicity append variants (or implement merge-by-name logic)
        product.variants = product.variants.concat(normalizedVariants);
      }
      if (uploadedImageUrls.length) product.images = (product.images || []).concat(uploadedImageUrls);
      if (invoiceUrl) product.invoiceLink = invoiceUrl;
      product.description = description || product.description;
      product.brand = brand || product.brand;
      await product.save();
      return res.status(200).json({ product, message: 'Product updated (images uploaded)' });
    }

    // create new
    const toCreate = {
      prodName,
      description,
      brand,
      images: uploadedImageUrls,
      invoiceLink: invoiceUrl,
      variants: normalizedVariants,
      createdBy: req.user.id
    };

    const created = await Product.create(toCreate);
    return res.status(201).json({ product: created });
  } catch (err) {
    console.error('addProduct error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error', error: err.message || String(err) });
  }
};
/* ---------- updateProduct ---------- */
export const updateProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.createdBy && product.createdBy.toString() !== req.user.id) return res.status(403).json({ message: 'Not your product' });

    const body = req.body || {};

    if (body.name) product.name = String(body.name).trim();
    if (body.prodName) product.prodName = String(body.prodName).trim();
    if (body.description) product.description = body.description;
    if (body.brand) product.brand = body.brand;
    if (body.isImported !== undefined) product.imported = (body.isImported === 'true' || body.isImported === true);

    if (body.actualPrice !== undefined) {
      const p = toNumber(body.actualPrice);
      if (p !== undefined) { product.actualPrice = p; product.price = p; }
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

    // upload new images/invoice if provided
    let imageUrls = [];
    let invoiceLink = null;

    if (req.files) {
      if (req.files.images && Array.isArray(req.files.images)) {
        for (const f of req.files.images) {
          try {
            const url = await uploadBufferToImageKit(f.buffer, f.originalname, `/products/${req.user.id}`);
            if (url) imageUrls.push(url);
          } catch (e) { console.warn('ImageKit upload failed for image', f.originalname, e && e.message); }
        }
      }
      if (req.files.invoice && Array.isArray(req.files.invoice) && req.files.invoice[0]) {
        const f = req.files.invoice[0];
        try {
          const url = await uploadBufferToImageKit(f.buffer, f.originalname, `/invoices/${req.user.id}`);
          if (url) invoiceLink = url;
        } catch (e) { console.warn('ImageKit upload failed for invoice', f.originalname, e && e.message); }
      }
      if ((!imageUrls || imageUrls.length === 0) && Array.isArray(req.files)) {
        for (const f of req.files) {
          if (f.fieldname === 'images') {
            try {
              const url = await uploadBufferToImageKit(f.buffer, f.originalname, `/products/${req.user.id}`);
              if (url) imageUrls.push(url);
            } catch (e) { console.warn('imagekit err', e && e.message); }
          } else if ((f.fieldname === 'invoice' || f.fieldname === 'invoices') && !invoiceLink) {
            try {
              const url = await uploadBufferToImageKit(f.buffer, f.originalname, `/invoices/${req.user.id}`);
              if (url) invoiceLink = url;
            } catch (e) { console.warn('imagekit err', e && e.message); }
          }
        }
      }
    }

    if (imageUrls.length) {
      const mapped = mapImageUrlsToSchema(imageUrls);
      product.images = product.images || [];
      if (product.images.length && typeof product.images[0] === 'string' && typeof mapped[0] === 'string') {
        product.images.push(...mapped);
      } else if (product.images.length && typeof product.images[0] === 'object' && typeof mapped[0] === 'object') {
        product.images.push(...mapped);
      } else {
        product.images = product.images.concat(mapped);
      }
    }
    if (invoiceLink) product.invoiceLink = invoiceLink;

    await product.save();
    return res.json({ product });
  } catch (err) {
    console.error('updateProduct error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error', error: err.message || String(err) });
  }
};

/* ---------- list/get/delete ---------- */
export const listProducts = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });
    const products = await Product.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    return res.json({ products });
  } catch (err) {
    console.error('listProducts error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error' });
  }
};
export const getProducts = listProducts;

const isObjectIdString = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);

/**
 * GET /api/owner/product/:id
 * Supports either 24-hex Mongo id or product name (exact or case-insensitive)
 */
export const getProduct = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'owner') return res.status(403).json({ message: 'Only owner allowed' });

    const q = (req.params.id || req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Missing product id or name' });

    let product = null;

    if (isObjectIdString(q)) {
      product = await Product.findById(q);
    }

    if (!product) {
      product = await Product.findOne({ createdBy: req.user.id, prodName: q }) ||
                await Product.findOne({ createdBy: req.user.id, name: q });
    }

    if (!product) {
      product = await Product.findOne({ createdBy: req.user.id, prodName: new RegExp(`^${q}$`, 'i') }) ||
                await Product.findOne({ createdBy: req.user.id, name: new RegExp(`^${q}$`, 'i') });
    }

    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (product.createdBy && product.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not your product' });
    }

    return res.json({ product });
  } catch (err) {
    console.error('getProduct error:', err && err.stack ? err.stack : err);
    if (err && (err.name === 'CastError' || err.name === 'BSONTypeError')) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    return res.status(500).json({ message: 'Server error', error: err?.message || String(err) });
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
    console.error('deleteProduct error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
