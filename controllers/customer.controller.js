import mongoose from 'mongoose';
import { StocklistInventory } from '../models/stocklistInventory.model.js';
import { Order } from '../models/order.model.js';
import { AppError, asyncHandler } from '../utils/errors.js';


// Customer buys from a specific stocklist (decrement that stocklist's inventory)
// body: { sellerStocklistId, items: [{ productId, quantity, price }] }
export const customerBuy = asyncHandler(async (req, res) => {
const { sellerStocklistId, items } = req.body;
if (!sellerStocklistId) throw new AppError(400, 'sellerStocklistId required');
if (!Array.isArray(items) || items.length === 0) throw new AppError(400, 'No items provided');


const session = await mongoose.startSession();
session.startTransaction();


try {
// Check and decrement inventory atomically
for (const { productId, quantity } of items) {
if (quantity <= 0) throw new AppError(422, 'Quantity must be > 0');
const updated = await StocklistInventory.findOneAndUpdate(
{ stocklistId: sellerStocklistId, productId, quantity: { $gte: quantity } },
{ $inc: { quantity: -quantity } },
{ new: true, session }
);
if (!updated) throw new AppError(409, 'Insufficient stock for a product');
}


// total from provided prices (could be validated separately via Product if needed)
const totalAmount = items.reduce((sum, it) => sum + it.price * it.quantity, 0);


const order = await Order.create([
{
buyerId: req.user.id,
sellerStocklistId,
items,
totalAmount,
type: 'CUSTOMER_PURCHASE'
}
], { session });


await session.commitTransaction();
session.endSession();
res.status(201).json({ order: order[0] });
} catch (e) {
await session.abortTransaction();
session.endSession();
throw e;
}
});