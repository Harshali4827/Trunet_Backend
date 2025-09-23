import mongoose from 'mongoose';

const centerSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: [true, 'Partner ID is required'],
    },
    area: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      required: [true, 'Area ID is required'],
    },
    centerType: {
      type: String,
      required: [true, 'Center type is required'],
      enum: ['Center', 'Outlet'],
      default: 'Branch',
    },
    centerName: {
      type: String,
      required: [true, 'Center name is required'],
      trim: true,
    },
    centerCode: {
      type: String,
      required: [true, 'Center code is required'],
      unique: true,
      uppercase: true,
    },
    email: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    mobile: {
      type: String,
      match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit mobile number'],
    },
    status: {
      type: String,
      enum: ['Enable', 'Disable'],
      default: 'Enable',
    },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    stockVerified: { 
      type: String, 
      enum: ['Yes', 'No'],
      default:'No'
    },
  },
  { timestamps: true }
);

export default mongoose.model('Center', centerSchema);
