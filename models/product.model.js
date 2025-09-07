// models/product.model.js
import mongoose from 'mongoose';

const VariantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 0 },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' }
}, { _id: true });

const FileSchema = new mongoose.Schema({
  filename: { type: String },
  mimeType: { type: String },
  data: { type: Buffer } // binary buffer
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  variants: { type: [VariantSchema], default: [] },
  actualPrice: { type: Number },
  quantity: { type: Number, default: 0 },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  images: { type: [FileSchema], default: [] },
  invoice: { type: FileSchema, default: null }
}, { timestamps: true });

export const Product = mongoose.model('Product', ProductSchema);
