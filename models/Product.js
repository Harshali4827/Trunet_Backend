import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    productCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: true,
    },
    productTitle: {
      type: String,
      required: true,
      trim: true,
    },
    productCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    productPrice: {
      type: Number,
      required: true,
    },
    productImage: {
      type: String,
      default: '',
    },
    productWeight: {
      type: String,
      default: '',
    },
    productBarcode: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Enabled', 'Disables'],
      default: 'Enabled',
    },
    description: {
      type: String,
      default: '',
    },
    trackSerialNumber: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No',
    },
    repairable: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No',
    },
    replaceable: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
