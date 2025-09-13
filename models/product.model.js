// models/product.model.js
import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  originalPrice: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  images: { type: [String], default: [] } // URLs to ImageKit
}, { _id: true });

const productSchema = new mongoose.Schema({
  prodName: { type: String, required: true },
  description: { type: String, default: '' },
  brand: { type: String, default: 'generic' },
  images: { type: [String], default: [] }, // top-level image URLs
  invoiceLink: { type: String, default: null },
  variants: { type: [variantSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);
