
import mongoose from "mongoose";

const returnRecordSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    originalUsageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockUsage",
      required: true,
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    usageType: {
      type: String,
      required: true,
      enum: [
        "Customer",
        "Building", 
        "Building to Building",
        "Control Room",
        "Damage",
        "Stolen from Center",
        "Stolen from Field",
        "Damage Return",
        "Other",
      ],
    },
    type: {
      type: String,
      enum: ["return"],
      default: "return",
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    fromBuilding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
    },
    toBuilding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
    },
    fromControlRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ControlRoom",
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },
        serialNumber: {
          type: String,
          trim: true,
          required: true,
        },
        oldStock: {
          type: Number,
          default: 0,
        },
        newStock: {
          type: Number,
          default: 0,
        },
        totalStock: {
          type: Number,
          default: 0,
        },
      },
    ],
    remark: {
      type: String,
      trim: true,
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["completed"],
      default: "completed",
    },
  },
  { timestamps: true }
);

returnRecordSchema.index({ originalUsageId: 1 });
returnRecordSchema.index({ center: 1, date: -1 });
returnRecordSchema.index({ "items.serialNumber": 1 });

export default mongoose.model("ReturnRecord", returnRecordSchema);