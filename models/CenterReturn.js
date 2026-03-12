
import mongoose from "mongoose";

const centerReturnSchema = new mongoose.Schema({
  returnNumber: {
    type: String,
    required: true,
    unique: true
  },
  center: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reseller",
    required: true
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    serialNumbers: [String],
    accepted: {
      type: Boolean,
      default: false
    },
    acceptedAt: Date
  }],
  status: {
    type: String,
    enum: ["pending", "accepted"],
    default: "pending"
  },
  remark: String,
  returnDate: {
    type: Date,
    default: Date.now
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  acceptedAt: Date,
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });


centerReturnSchema.pre('save', async function(next) {
  if (!this.returnNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const count = await mongoose.model('CenterReturn').countDocuments();
    this.returnNumber = `CR${year}${month}${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model("CenterReturn", centerReturnSchema);