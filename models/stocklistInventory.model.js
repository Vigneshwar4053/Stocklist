// models/stocklistInventory.model.js
import mongoose from 'mongoose';

const StocklistInventorySchema = new mongoose.Schema(
  {
    stocklistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true }, // reference to Product.variants._id
    quantity: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

// unique per stocklist+product+variant
StocklistInventorySchema.index({ stocklistId: 1, productId: 1, variantId: 1 }, { unique: true });

export const StocklistInventory = mongoose.model('StocklistInventory', StocklistInventorySchema);
