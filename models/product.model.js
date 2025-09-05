import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // owner id
    stock: { type: Number, default: 0, min: 0 } // owner's available stock
  },
  { timestamps: true }
);

ProductSchema.index({ createdBy: 1, name: 1 }, { unique: true, partialFilterExpression: { name: { $exists: true } } });

export const Product = mongoose.model('Product', ProductSchema);
