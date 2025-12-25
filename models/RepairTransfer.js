// import mongoose from "mongoose";

// const repairTransferSchema = new mongoose.Schema({
//   date: {
//     type: Date,
//     required: true,
//     default: Date.now
//   },
//   faultyStock: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "FaultyStock",
//     required: true
//   },
//   fromCenter: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Center",
//     required: true
//   },
//   toCenter: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Center",
//     required: true
//   },
//   product: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Product",
//     required: true
//   },
//   quantity: {
//     type: Number,
//     required: true,
//     min: 1
//   },
//   serialNumbers: [{
//     serialNumber: {
//       type: String,
//       required: true
//     },
//     status: {
//       type: String,
//       enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor","returned_to_center","returned_to_warehouse","transferred","partially_repaired","under_repair"],
//       required: true
//     },
    
//     repairHistory: [{
//       date: Date,
//       status: String,
//       remark: String,
//       updatedBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User"
//       },
//       cost: Number
//     }]
//   }],
//   transferRemark: {
//     type: String,
//     trim: true
//   },
//   transferredBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   status: {
//     type: String,
//     enum: ["transferred", "in_repair", "repaired", "returned", "cancelled",'returned_to_center','returned_to_warehouse',"partially_repaired","under_repair"],
//     default: "transferred"
//   },
//   repairUpdates: [{
//     date: {
//       type: Date,
//       default: Date.now
//     },
//     status: String,
//     remark: String,
//     updatedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User"
//     },
//     cost: {
//       type: Number,
//       default: 0
//     }
//   }],
//   expectedReturnDate: Date,
//   actualReturnDate: Date,
//   totalRepairCost: {
//     type: Number,
//     default: 0
//   }
// }, { timestamps: true });

// repairTransferSchema.methods.updateStatus = function() {
//   const statusCount = {};
  
//   this.serialNumbers.forEach(serial => {
//     statusCount[serial.status] = (statusCount[serial.status] || 0) + 1;
//   });

//   const totalSerials = this.serialNumbers.length;
  
//   if (statusCount.repaired === totalSerials) {
//     this.status = "repaired";
//   } else if (statusCount.under_repair > 0 || statusCount.damaged > 0) {
//     this.status = "in_repair";
//   }
// };

// export default mongoose.model("RepairTransfer", repairTransferSchema);



import mongoose from "mongoose";

const repairTransferSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  faultyStock: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FaultyStock",
    required: true
  },
  fromCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  toCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  // Original quantity transferred
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  // QUANTITY TRACKING FIELDS
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
  returnedQty: {
    type: Number,
    default: 0
  },
  // For non-serialized products
  isSerialized: {
    type: Boolean,
    default: true
  },
  serialNumbers: [{
    serialNumber: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "returned", "transferred"],
      required: true
    },
    // For non-serialized: batch quantity
    quantity: {
      type: Number,
      default: 1
    },
    // Quantity breakdown
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
      date: Date,
      status: String,
      remark: String,
      quantity: Number,
      repairedQty: Number,
      irrepairedQty: Number,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      cost: Number
    }]
  }],
  transferRemark: {
    type: String,
    trim: true
  },
  transferredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  status: {
    type: String,
    enum: ["transferred", "in_repair", "repaired", "returned", "cancelled", "partially_repaired", "under_repair","irreparable"],
    default: "transferred"
  },
  repairUpdates: [{
    date: {
      type: Date,
      default: Date.now
    },
    status: String,
    remark: String,
    quantity: Number,
    repairedQty: Number,
    irrepairedQty: Number,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    cost: {
      type: Number,
      default: 0
    }
  }],
  expectedReturnDate: Date,
  actualReturnDate: Date,
  totalRepairCost: {
    type: Number,
    default: 0
  },
  lastRepairUpdate: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for damaged quantity
repairTransferSchema.virtual('damagedQty').get(function() {
  return this.underRepairQty;
});

// Method to update status and quantities
repairTransferSchema.methods.updateStatusAndQuantities = function() {
  let totalRepaired = 0;
  let totalIrrepaired = 0;
  let totalUnderRepair = 0;
  let totalReturned = 0;
  
  this.serialNumbers.forEach(serial => {
    const serialQty = serial.quantity || 1;
    
    if (serial.status === "repaired") {
      totalRepaired += serialQty;
    } else if (serial.status === "irreparable") {
      totalIrrepaired += serialQty;
    } else if (serial.status === "returned") {
      totalReturned += serialQty;
    } else {
      totalUnderRepair += serial.underRepairQty || (serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
    }
  });
  
  // Update quantity fields
  this.repairedQty = totalRepaired;
  this.irrepairedQty = totalIrrepaired;
  this.returnedQty = totalReturned;
  this.underRepairQty = totalUnderRepair;
  
  // Determine overall status
  if (this.repairedQty === this.quantity) {
    this.status = "repaired";
  } else if (this.irrepairedQty === this.quantity) {
    this.status = "irreparable";
  } else if (this.returnedQty === this.quantity) {
    this.status = "returned";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
    this.status = "partially_repaired";
  } else if (this.underRepairQty > 0) {
    this.status = "under_repair";
  } else {
    this.status = "transferred";
  }
  
  this.lastRepairUpdate = new Date();
};

// Method to update repair quantities for a serial/batch
repairTransferSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy, remark, cost = 0) {
  const serial = this.serialNumbers.find(sn => sn.serialNumber === serialNumber);
  if (!serial) {
    throw new Error(`Serial number ${serialNumber} not found in repair transfer`);
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
    remark: remark || `Repair update: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
    updatedBy: updatedBy,
    cost: cost * (repairedQty + irrepairedQty)
  });
  
  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: this.status,
    remark: remark || `Updated ${serialNumber}: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
    quantity: repairedQty + irrepairedQty,
    repairedQty: repairedQty,
    irrepairedQty: irrepairedQty,
    updatedBy: updatedBy,
    cost: cost * (repairedQty + irrepairedQty)
  });
  
  // Update total repair cost
  if (cost > 0) {
    this.totalRepairCost = (this.totalRepairCost || 0) + (cost * (repairedQty + irrepairedQty));
  }
  
  // Update overall status and quantities
  this.updateStatusAndQuantities();
};

// Method to get quantity summary
repairTransferSchema.methods.getQuantitySummary = function() {
  return {
    total: this.quantity,
    repaired: this.repairedQty,
    irrepaired: this.irrepairedQty,
    underRepair: this.underRepairQty,
    returned: this.returnedQty,
    remaining: this.quantity - (this.repairedQty + this.irrepairedQty + this.returnedQty)
  };
};

export default mongoose.model("RepairTransfer", repairTransferSchema);
