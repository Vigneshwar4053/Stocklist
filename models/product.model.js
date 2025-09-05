// models/product.model.js
import mongoose from 'mongoose';

const ImageSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  data: Buffer
}, { _id: false });

const VariantSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "kg", "unit", "litre"
  extraInfo: { type: String } // optional meta for variant
}, { _id: false });

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    images: { type: [ImageSchema], default: [] },          // store images as binary
    invoices: { type: [ImageSchema], default: [] },        // invoices or PDF stored as binary
    variants: { type: [VariantSchema], default: [] },      // e.g. [{name: "kg"}]
    actualPrice: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },       // owner's available stock
    sku: { type: String, default: '' },
    barcode: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// unique product per owner by name
ProductSchema.index({ createdBy: 1, name: 1 }, { unique: true, partialFilterExpression: { name: { $exists: true } } });

export const Product = mongoose.model('Product', ProductSchema);
