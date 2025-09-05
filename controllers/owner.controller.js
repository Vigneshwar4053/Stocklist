// controllers/owner.controller.js
import { User } from '../models/user.model.js';
import { Product } from '../models/product.model.js';

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
 * Owner -> add product OR increase stock if product with same name already exists for this owner
 * POST /api/owner/add-product
 * Body: { name, price, initialStock? }
 */
export const addProduct = async (req, res) => {
  try {
    const { name, price, initialStock } = req.body || {};
    const stockToAdd = typeof initialStock === 'number' && initialStock > 0 ? Math.floor(initialStock) : 0;

    if (!name || typeof price !== 'number') {
      return res.status(400).json({ message: 'name (string) and price (number) required' });
    }

    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'owner') return res.status(403).json({ message: 'Only owners can add products' });

    // Find existing product by this owner with same name
    const existing = await Product.findOne({ createdBy: req.user.id, name });

    if (existing) {
      // update price and optionally increase stock
      existing.price = price;
      if (stockToAdd > 0) existing.stock = existing.stock + stockToAdd;
      await existing.save();
      return res.status(200).json({ product: existing, message: 'Existing product updated (price/stock updated).' });
    }

    // create new product with initial stock
    const product = await Product.create({
      name,
      price,
      createdBy: req.user.id,
      stock: stockToAdd
    });

    return res.status(201).json({ product });
  } catch (err) {
    console.error('addProduct error', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Product with same name already exists for this owner' });
    }
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Owner -> list products (simple)
 * GET /api/owner/products
 */
export const listProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    return res.json({ products });
  } catch (err) {
    console.error('listProducts error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
