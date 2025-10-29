import mongoose from "mongoose";
const replacementRecordSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    usageType: {
      type: String,
      required: true,
    },

    connectionType: {
      type: String,
      enum: ["NC", "Convert", "Shifting", "Repair"],
    },
    reason: {
      type: String,
      enum: ["NC", "Convert", "Shifting", "Repair"],
    },
    packageAmount: {
      type: Number,
      default: 0,
    },
    packageDuration: {
      type: String,
    },
    onuCharges: {
      type: Number,
      default: 0,
    },
    installationCharges: {
      type: Number,
      default: 0,
    },
    shiftingAmount: {
      type: Number,
      default: 0,
    },
    wireChangeAmount: {
      type: Number,
      default: 0,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productType: {
      type: String,
      default: "replace"
    },
    replaceFor: {
      type: String,
      required: true
    },
    replaceProductName: {
      type: String,
      required: true
    },
    qty: {
      type: Number,
      default: 1
    },
    damageQty: {
      type: Number,
      default: 0
    },
    buildingName: {
      type: String
    },
    customerName: {
      type: String
    },
    mobile: {
      type: String
    },
    statusReason: {
      type: String,
      required: true
    },
    oldSerialNumber: {
      type: String,
      required: true
    },
    newSerialNumber: {
      type: String,
      required: true
    },
    originalUsageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockUsage",
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true
    },
    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    entityType: {
      type: String
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  { timestamps: true }
);

replacementRecordSchema.index({ date: -1 });
replacementRecordSchema.index({ originalUsageId: 1 });
replacementRecordSchema.index({ productId: 1 });
replacementRecordSchema.index({ center: 1 });
replacementRecordSchema.index({ replacedBy: 1 });
replacementRecordSchema.index({ connectionType: 1 }); 
replacementRecordSchema.index({ reason: 1 });

export default mongoose.model("ReplacementRecord", replacementRecordSchema);