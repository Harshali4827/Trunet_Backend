import mongoose from "mongoose";

const faultyStockSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  usageReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockUsage",
    required: true
  },
  center: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  toCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
  },
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
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  repairedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  irrepairedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  underRepairQty: {
    type: Number,
    default: function() {
      return this.quantity - (this.repairedQty + this.irrepairedQty);
    }
  },
  transferredQty: {
    type: Number,
    default: 0
  },
  isSerialized: {
    type: Boolean,
    default: true
  },
  serialNumbers: [{
    serialNumber: {
      type: String,
      trim: true,
      required: true
    },
    status: {
      type: String,
      enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "transferred"],
      default: "damaged"
    },
    quantity: {
      type: Number,
      default: 1
    },
    repairedQty: {
      type: Number,
      default: 0
    },
    irrepairedQty: {
      type: Number,
      default: 0
    },
    underRepairQty: {
      type: Number,
      default: function() {
        return (this.quantity || 1) - (this.repairedQty + this.irrepairedQty);
      }
    },
    repairHistory: [{
      date: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ["damaged", "under_repair", "repaired", "irreparable", "returned", "transferred"]
      },
      remark: String,
      quantity: {
        type: Number,
        default: 0
      },
      repairedQty: {
        type: Number,
        default: 0
      },
      irrepairedQty: {
        type: Number,
        default: 0
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      cost: {
        type: Number,
        default: 0
      }
    }],
    repairDate: Date,
    disposalDate: Date,
    vendorReturnDate: Date,
    repairCost: {
      type: Number,
      default: 0
    },
    technician: String,
    repairRemark: String
  }],
  usageType: {
    type: String,
    required: true
  },
  remark: {
    type: String,
    trim: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  overallStatus: {
    type: String,
    enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "partially_repaired", "transferred"],
    default: "damaged"
  },
  damageDate: {
    type: Date,
    default: Date.now
  },
  repairDate: Date,
  disposalDate: Date,
  vendorReturnDate: Date,
  lastRepairUpdate: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for damaged quantity
faultyStockSchema.virtual('damagedQty').get(function() {
  return this.underRepairQty;
});

// Method to update overall status and quantities
faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
  let totalRepaired = 0;
  let totalIrrepaired = 0;
  let totalUnderRepair = 0;
  let totalTransferred = 0;
  
  this.serialNumbers.forEach(serial => {
    const serialQty = serial.quantity || 1;
    
    if (serial.status === "repaired") {
      totalRepaired += serialQty;
    } else if (serial.status === "irreparable") {
      totalIrrepaired += serialQty;
    } else if (serial.status === "transferred") {
      totalTransferred += serialQty;
    } else {
      totalUnderRepair += serial.underRepairQty || (serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
    }
  });
  
  // Update main quantity fields
  this.repairedQty = totalRepaired;
  this.irrepairedQty = totalIrrepaired;
  this.transferredQty = totalTransferred;
  this.underRepairQty = totalUnderRepair;
  
  // Validate quantities
  const calculatedTotal = this.repairedQty + this.irrepairedQty + this.transferredQty + this.underRepairQty;
  if (calculatedTotal !== this.quantity) {
    console.warn(`Quantity mismatch for FaultyStock ${this._id}: Expected ${this.quantity}, Calculated ${calculatedTotal}`);
    // Auto-correct if mismatch is small
    if (Math.abs(calculatedTotal - this.quantity) <= 1) {
      this.underRepairQty = this.quantity - (this.repairedQty + this.irrepairedQty + this.transferredQty);
    }
  }
  
  // Determine overall status
  if (this.repairedQty === this.quantity) {
    this.overallStatus = "repaired";
    this.repairDate = this.repairDate || new Date();
  } else if (this.irrepairedQty === this.quantity) {
    this.overallStatus = "irreparable";
  } else if (this.transferredQty === this.quantity) {
    this.overallStatus = "transferred";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
    this.overallStatus = "partially_repaired";
  } else if (this.underRepairQty > 0) {
    this.overallStatus = "under_repair";
  } else {
    this.overallStatus = "damaged";
  }
  
  this.lastRepairUpdate = new Date();
};

// Method to update repair quantities for a serial/batch
faultyStockSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy) {
  const serial = this.serialNumbers.find(sn => sn.serialNumber === serialNumber);
  if (!serial) {
    throw new Error(`Serial number ${serialNumber} not found in faulty stock`);
  }
  
  const serialQty = serial.quantity || 1;
  const currentProcessed = (serial.repairedQty || 0) + (serial.irrepairedQty || 0);
  const remainingQty = serialQty - currentProcessed;
  
  // Validate quantities
  if (repairedQty + irrepairedQty > remainingQty) {
    throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${remainingQty} remaining for ${serialNumber}`);
  }
  
  // Update serial quantities
  serial.repairedQty = (serial.repairedQty || 0) + repairedQty;
  serial.irrepairedQty = (serial.irrepairedQty || 0) + irrepairedQty;
  serial.underRepairQty = serialQty - serial.repairedQty - serial.irrepairedQty;
  
  // Update serial status
  if (serial.repairedQty === serialQty) {
    serial.status = "repaired";
    serial.repairDate = new Date();
  } else if (serial.irrepairedQty === serialQty) {
    serial.status = "irreparable";
  } else if (serial.underRepairQty > 0) {
    serial.status = "under_repair";
  }
  
  // Add to repair history
  serial.repairHistory.push({
    date: new Date(),
    status: serial.status,
    repairedQty: repairedQty,
    irrepairedQty: irrepairedQty,
    quantity: repairedQty + irrepairedQty,
    remark: `Repair update: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
    updatedBy: updatedBy
  });
  
  // Update overall quantities and status
  this.updateQuantitiesAndStatus();
};

faultyStockSchema.methods.getQuantitySummary = function() {
  return {
    total: this.quantity,
    repaired: this.repairedQty,
    irrepaired: this.irrepairedQty,
    underRepair: this.underRepairQty,
    transferred: this.transferredQty,
    remaining: this.quantity - (this.repairedQty + this.irrepairedQty + this.transferredQty)
  };
};

export default mongoose.model("FaultyStock", faultyStockSchema);