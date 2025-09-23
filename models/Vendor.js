import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
    },
    gstNumber: {
      type: String,
      trim: true,
    },
    panNumber: {
      type: String,
      trim: true,
    },
    address1: {
      type: String,
      trim: true,
    },
    address2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Vendor', vendorSchema);
