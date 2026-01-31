import mongoose from "mongoose";

const resellerStockSchema = new mongoose.Schema({
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reseller",
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  availableQuantity: { type: Number, default: 0 },
  totalQuantity: { type: Number, default: 0 },
  consumedQuantity: { type: Number, default: 0 },
  damagedQuantity: { type: Number, default: 0 },
  repairQuantity: { type: Number, default: 0 },
  centerReturns: [{
    center: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Center",
      required: true 
    },
    quantity: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    sourceType: { 
      type: String, 
      enum: ["center_return", "damage_repair", "direct_purchase"],
      default: "center_return"
    },
    referenceId: mongoose.Schema.Types.ObjectId,
    remark: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],

  pendingTransfers: [{
    outletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    serialNumbers: [{
      serialNumber: String,
      originalSerialNumber: String, 
      status: {
        type: String,
        enum: ["pending", "available", "rejected"],
        default: "pending"
      }
    }],
    transferDate: {
      type: Date,
      default: Date.now
    },
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    transferRemark: String,
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending"
    },
    acceptedAt: Date,
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    rejectionReason: String
  }],
  sourceBreakdown: {
    damageRepairQuantity: { type: Number, default: 0 },
    centerReturnQuantity: { type: Number, default: 0 }, 
  },

  serialNumbers: [{
    serialNumber: { type: String, required: true },
    status: { 
      type: String, 
      enum: ["available", "consumed", "damaged", "under_repair", "repaired", "irreparable"],
      default: "available"
    },
    currentLocation: { type: mongoose.Schema.Types.ObjectId, ref: "Center" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    transferHistory: [{
      fromCenter: { type: mongoose.Schema.Types.ObjectId, ref: "Center" },
      toCenter: { type: mongoose.Schema.Types.ObjectId, ref: "Center" },
      toReseller: { type: mongoose.Schema.Types.ObjectId, ref: "Reseller" },
      transferDate: { type: Date, default: Date.now },
      transferType: {
        type: String,
        enum: ["inbound_transfer", "outbound_transfer", "field_usage", "return_from_field", "repair_transfer", "return_from_repair","outlet_to_reseller","center_to_reseller_return"]
      },
      sourceType: { type: String, enum: ["damage_repair", "center_return", "direct_purchase"] },
      referenceId: mongoose.Schema.Types.ObjectId,
      remark: String,
      transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }],
    consumedDate: Date,
    consumedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    damageDate: Date,
    repairHistory: [{
      status: String,
      date: { type: Date, default: Date.now },
      remark: String,
      cost: Number,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }]
  }],
  
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

resellerStockSchema.statics.updateStock = async function(
  resellerId, 
  productId, 
  quantity, 
  serialNumbers = [], 
  referenceId = null, 
  usageType = null
) {
  let resellerStock = await this.findOne({
    reseller: resellerId,
    product: productId
  });

  if (!resellerStock) {
    resellerStock = new this({
      reseller: resellerId,
      product: productId,
      availableQuantity: 0,
      totalQuantity: 0,
      serialNumbers: []
    });
  }

  if (serialNumbers && serialNumbers.length > 0) {
    for (const serialNumber of serialNumbers) {
      const existingSerial = resellerStock.serialNumbers.find(
        sn => sn.serialNumber === serialNumber
      );

      if (!existingSerial) {
        resellerStock.serialNumbers.push({
          serialNumber: serialNumber,
          status: "available",
          currentLocation: null,
          transferHistory: [{
            fromCenter: null,
            toCenter: null,
            transferDate: new Date(),
            transferType: "inbound_transfer",
            referenceId: referenceId,
            remark: `Added to reseller stock - ${usageType || 'manual'}`
          }]
        });
      }
    }
  }

  resellerStock.availableQuantity += quantity;
  resellerStock.totalQuantity += quantity;
  resellerStock.lastUpdated = new Date();

  return await resellerStock.save();
};

resellerStockSchema.index({ reseller: 1, product: 1 }, { unique: true });
resellerStockSchema.index({ "serialNumbers.serialNumber": 1 });

export default mongoose.model("ResellerStock", resellerStockSchema);

