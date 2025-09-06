// models/product.model.js
import mongoose from 'mongoose';

const VariantSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g. "1kg", "2kg"
  price: { type: Number, required: true, min: 0 }, // price for this variant
  quantity: { type: Number, required: true, min: 0, default: 0 }, // owner's stock for this variant
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' }
}, { timestamps: true });

const ImageSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  data: Buffer
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  images: { type: [ImageSchema], default: [] },
  invoices: { type: [ImageSchema], default: [] },
  variants: { type: [VariantSchema], default: [] }, // major change: per-variant price & stock
  // legacy fields kept for backward compatibility (optional)
  actualPrice: { type: Number, min: 0 }, // used if no variants provided
  discountPrice: { type: Number, min: 0 },
  quantity: { type: Number, default: 0, min: 0 }, // deprecated if using variants
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// ensure unique product name per owner
ProductSchema.index({ createdBy: 1, name: 1 }, { unique: true, partialFilterExpression: { name: { $exists: true } } });

export const Product = mongoose.model('Product', ProductSchema);
