// models/CenterReturn.js
import mongoose from "mongoose";

const centerReturnSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  remark: {
    type: String,
    trim: true
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
    serialNumbers: [{
      type: String,
      trim: true
    }],
    
    // Stock information before return
    centerStockBefore: {
      totalQuantity: Number,
      availableQuantity: Number,
      consumedQuantity: Number
    },
    
    // Stock information after return
    centerStockAfter: {
      totalQuantity: Number,
      availableQuantity: Number,
      consumedQuantity: Number
    },
    
    // Reseller stock information after return
    resellerStockAfter: {
      totalQuantity: Number,
      availableQuantity: Number,
      consumedQuantity: Number
    }
  }],
  
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled"],
    default: "completed"
  },
  
  type: {
    type: String,
    enum: ["center_return", "damage_return", "repair_return"],
    default: "center_return"
  }
}, { timestamps: true });

// Indexes
centerReturnSchema.index({ center: 1, date: -1 });
centerReturnSchema.index({ reseller: 1 });
centerReturnSchema.index({ "processedBy": 1 });
centerReturnSchema.index({ type: 1 });

export default mongoose.model("CenterReturn", centerReturnSchema);