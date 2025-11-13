
import mongoose from "mongoose";

const resellerStockSchema = new mongoose.Schema({
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reseller",
    required: true
  },
  center: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
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
      transferDate: { type: Date, default: Date.now },
      transferType: {
        type: String,
        enum: ["inbound_transfer", "outbound_transfer", "field_usage", "return_from_field", "repair_transfer", "return_from_repair"]
      },
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
  centerId, 
  productId, 
  quantity, 
  serialNumbers = [], 
  referenceId = null, 
  usageType = null
) {
  let resellerStock = await this.findOne({
    reseller: resellerId,
    center: centerId,
    product: productId
  });

  if (!resellerStock) {
    resellerStock = new this({
      reseller: resellerId,
      center: centerId,
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
          currentLocation: centerId,
          transferHistory: [{
            fromCenter: null,
            toCenter: centerId,
            transferDate: new Date(),
            transferType: "inbound_transfer",
            referenceId: referenceId,
            remark: `Added to reseller repair stock - ${usageType || 'manual'}`
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

export default mongoose.model("ResellerStock", resellerStockSchema);