import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit mobile number'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Center',
      required: [true, 'Center ID is required'],
    },
    address1: { type: String },
    address2: { type: String },
    city: { type: String },
    state: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
