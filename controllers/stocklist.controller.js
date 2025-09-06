// controllers/stocklist.controller.js
import mongoose from 'mongoose';
import { Product } from '../models/product.model.js';
import { StocklistInventory } from '../models/stocklistInventory.model.js';
import { Order } from '../models/order.model.js';

/**
 * stocklistBuy
 */
export const stocklistBuy = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user || req.user.role !== 'stocklist') {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Only stocklist can call this' });
    }

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'items array required' });
    }

    const prodIds = [...new Set(items.map(i => i.productId))];
    const products = await Product.find({ _id: { $in: prodIds } }).session(session);

    if (products.length !== prodIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'One or more products not found' });
    }

    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const orderItems = [];

    for (const it of items) {
      const productId = String(it.productId || '').trim();
      const variantId = String(it.variantId || '').trim();
      const quantity = Number(it.quantity || 0);

      if (!productId || !variantId || !Number.isFinite(quantity) || quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(422).json({ message: 'productId, variantId and positive quantity required' });
      }

      const product = prodMap.get(productId);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product not found: ${productId}` });
      }

      const variant = product.variants.id(variantId);
      if (!variant) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Variant not found for product ${product.name}` });
      }

      if (variant.quantity < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({ message: `Insufficient owner stock for ${product.name} (${variant.name})`, available: variant.quantity });
      }

      variant.quantity = variant.quantity - quantity;
      product.markModified('variants');
      await product.save({ session });

      await StocklistInventory.findOneAndUpdate(
        { stocklistId: req.user.id, productId, variantId },
        { $inc: { quantity } },
        { new: true, upsert: true, session }
      );

      orderItems.push({
        productId,
        variantId,
        variantName: variant.name,
        quantity,
        unitPrice: variant.price
      });
    }

    const totalAmount = orderItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

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

    const inventory = await StocklistInventory.find({ stocklistId: req.user.id }).populate('productId');
    const invPayload = inventory.map(row => {
      const prod = row.productId;
      const variant = prod.variants.id(row.variantId);
      return {
        productId: prod._id,
        productName: prod.name,
        variantId: row.variantId,
        variantName: variant ? variant.name : null,
        price: variant ? variant.price : (prod.actualPrice || 0),
        quantity: row.quantity
      };
    });

    return res.status(201).json({ order, inventory: invPayload });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('stocklistBuy error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * dashboard
 */
export const dashboard = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'stocklist') return res.status(403).json({ message: 'Only stocklist allowed' });

    const inventory = await StocklistInventory.find({ stocklistId: req.user.id }).populate('productId');

    const invPayload = inventory.map(row => {
      const prod = row.productId;
      const variant = prod.variants.id(row.variantId);
      return {
        productId: prod._id,
        productName: prod.name,
        variantId: row.variantId,
        variantName: variant ? variant.name : null,
        price: variant ? variant.price : (prod.actualPrice || 0),
        quantity: row.quantity
      };
    });

    return res.json({ stocklistId: req.user.id, inventory: invPayload });
  } catch (err) {
    console.error('dashboard error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
