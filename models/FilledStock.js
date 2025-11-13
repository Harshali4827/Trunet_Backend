import mongoose from "mongoose";

const filledStockSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    serialNumbers: [{
      serialNumber: {
        type: String,
        trim: true,
      },
      status: {
        type: String,
        enum: ["active", "returned", "damaged", "transferred"],
        default: "active",
      },
      assignedDate: {
        type: Date,
        default: Date.now,
      },
      returnedDate: Date,
      originalUsageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StockUsage",
      }
    }],
    originalUsageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockUsage",
    },
    shiftingRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShiftingRequest",
    },
    status: {
      type: String,
      enum: ["active", "transferred", "returned"],
      default: "active",
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

filledStockSchema.index({ customer: 1, product: 1 });
filledStockSchema.index({ center: 1 });
filledStockSchema.index({ customer: 1, center: 1 });
filledStockSchema.index({ "serialNumbers.serialNumber": 1 });

export default mongoose.model("FilledStock", filledStockSchema);