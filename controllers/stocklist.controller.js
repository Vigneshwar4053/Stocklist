// controllers/stocklist.controller.js
import mongoose from 'mongoose';
import { Product } from '../models/product.model.js';
import { StocklistInventory } from '../models/stocklistInventory.model.js';
import { Order } from '../models/order.model.js';

/**
 * Stocklist buys product(s):
 * - Decrease owner's stock
 * - Increase stocklist's inventory
 * - Record an order
 */
export const stocklistBuy = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'stocklist') return res.status(403).json({ message: 'Only stocklist can call this' });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'items array required' });
    }

    // Fetch products
    const prodIds = items.map(i => i.productId);
    const products = await Product.find({ _id: { $in: prodIds } }).session(session);

    if (products.length !== prodIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'One or more products not found' });
    }

    const prodMap = new Map(products.map(p => [p._id.toString(), p]));

    const orderItems = [];
    for (const it of items) {
      const { productId, quantity } = it;
      if (!productId || !quantity || quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(422).json({ message: 'productId and positive quantity required' });
      }

      const prod = prodMap.get(productId);
      if (!prod) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product not found: ${productId}` });
      }

      // Check owner stock
      if (prod.stock < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          message: `Insufficient owner stock for ${prod.name}`,
          available: prod.stock
        });
      }

      // Reduce owner's stock
      prod.stock = prod.stock - quantity;
      await prod.save({ session });

      // Upsert into stocklist inventory
      await StocklistInventory.findOneAndUpdate(
        { stocklistId: req.user.id, productId },
        { $inc: { quantity } },
        { new: true, upsert: true, session }
      );

      orderItems.push({
        productId,
        name: prod.name,
        quantity,
        price: prod.price
      });
    }

    const totalAmount = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);

    const [order] = await Order.create(
      [
        {
          buyerId: req.user.id,
          items: orderItems,
          totalAmount,
          type: 'STOCKLIST_PURCHASE'
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Inventory snapshot
    const inventory = await StocklistInventory.find({ stocklistId: req.user.id }).populate('productId');

    const invPayload = inventory.map(row => ({
      productId: row.productId._id,
      name: row.productId.name,
      price: row.productId.price,
      quantity: row.quantity
    }));

    return res.status(201).json({ order, inventory: invPayload });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('stocklistBuy error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Stocklist dashboard:
 * Show all inventory for this stocklist
 */
export const dashboard = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'stocklist') return res.status(403).json({ message: 'Only stocklist can access dashboard' });

    const inventory = await StocklistInventory.find({ stocklistId: req.user.id }).populate('productId');

    const invPayload = inventory.map(row => ({
      productId: row.productId._id,
      name: row.productId.name,
      price: row.productId.price,
      quantity: row.quantity
    }));

    return res.json({ stocklistId: req.user.id, inventory: invPayload });
  } catch (err) {
    console.error('dashboard error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
