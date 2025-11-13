import mongoose from "mongoose";

const raisePOSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    voucherNo: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        availableQuantity: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        purchasedQuantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending"
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("RaisePO", raisePOSchema);