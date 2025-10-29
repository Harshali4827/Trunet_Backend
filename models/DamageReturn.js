
import mongoose from "mongoose";

const damageReturnSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    originalUsageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockUsage",
      required: true
    },
    
    type: {
      type: String,
      required: true,
      default: "Damage Return"
    },
  
    usageType: {
      type: String,
      required: true,
    },
    
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    connectionType: {
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
    reason: {
      type: String,
      enum: ["NC", "Convert", "Shifting", "Repair"],
    },
    shiftingAmount: {
      type: Number,
      default: 0,
    },
    wireChangeAmount: {
      type: Number,
      default: 0,
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
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    
    serialNumber: {
      type: String,
      required: true,
      trim: true
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1
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

    remark: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "replaced","damage_pending"],
      default: "pending"
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalRemark: {
      type: String,
      trim: true,
    },
    rejectionRemark: {
      type: String,
      trim: true,
    },
    approvalDate: {
      type: Date,
    },
    rejectionDate: {
      type: Date,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }
  },
  { timestamps: true }
);

damageReturnSchema.index({ center: 1, date: -1 });
damageReturnSchema.index({ customer: 1 });
damageReturnSchema.index({ product: 1 });
damageReturnSchema.index({ serialNumber: 1 });
damageReturnSchema.index({ status: 1 });
damageReturnSchema.index({ originalUsageId: 1 });
damageReturnSchema.index({ usageType: 1 });
damageReturnSchema.index({ type: 1 });

export default mongoose.model("DamageReturn", damageReturnSchema);