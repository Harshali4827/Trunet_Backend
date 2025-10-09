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
      required: false,
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
    shiftingHistory: [{
      fromCenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Center',
        required: true
      },
      toCenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Center',
        required: true
      },
      shiftingRequest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ShiftingRequest',
        required: true
      },
      shiftedAt: {
        type: Date,
        default: Date.now
      },
      shiftedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    }]
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);