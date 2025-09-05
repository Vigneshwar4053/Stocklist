import mongoose from 'mongoose';

const StocklistInventorySchema = new mongoose.Schema(
  {
    stocklistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

// ensure one row per stocklistId+productId
StocklistInventorySchema.index({ stocklistId: 1, productId: 1 }, { unique: true });

export const StocklistInventory = mongoose.model('StocklistInventory', StocklistInventorySchema);
