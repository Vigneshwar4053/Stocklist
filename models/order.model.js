import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 } // unit price at time of purchase
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerStocklistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional (if customer buys from stocklist)
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['STOCKLIST_PURCHASE', 'CUSTOMER_PURCHASE'], required: true }
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', OrderSchema);
