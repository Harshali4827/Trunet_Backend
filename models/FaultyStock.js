// import mongoose from "mongoose";

// const faultyStockSchema = new mongoose.Schema({
//   date: {
//     type: Date,
//     required: true,
//     default: Date.now
//   },
//   usageReference: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "StockUsage",
//     required: true
//   },
//   center: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Center",
//     required: true
//   },
//   toCenter: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Center",
//   },
//   reseller: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Reseller",
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
//   repairedQty: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   irrepairedQty: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   underRepairQty: {
//     type: Number,
//     default: function() {
//       return this.quantity - (this.repairedQty + this.irrepairedQty);
//     }
//   },
//   transferredQty: {
//     type: Number,
//     default: 0
//   },
//   isSerialized: {
//     type: Boolean,
//     default: true
//   },
//   serialNumbers: [{
//     serialNumber: {
//       type: String,
//       trim: true,
//       required: true
//     },
//     status: {
//       type: String,
//       enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "transferred"],
//       default: "damaged"
//     },
//     quantity: {
//       type: Number,
//       default: 1
//     },
//     repairedQty: {
//       type: Number,
//       default: 0
//     },
//     irrepairedQty: {
//       type: Number,
//       default: 0
//     },
//     underRepairQty: {
//       type: Number,
//       default: function() {
//         return (this.quantity || 1) - (this.repairedQty + this.irrepairedQty);
//       }
//     },
//     repairHistory: [{
//       date: {
//         type: Date,
//         default: Date.now
//       },
//       status: {
//         type: String,
//         enum: ["damaged", "under_repair", "repaired", "irreparable", "returned", "transferred"]
//       },
//       remark: String,
//       quantity: {
//         type: Number,
//         default: 0
//       },
//       repairedQty: {
//         type: Number,
//         default: 0
//       },
//       irrepairedQty: {
//         type: Number,
//         default: 0
//       },
//       updatedBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User"
//       },
//       cost: {
//         type: Number,
//         default: 0
//       }
//     }],
//     repairDate: Date,
//     disposalDate: Date,
//     vendorReturnDate: Date,
//     repairCost: {
//       type: Number,
//       default: 0
//     },
//     technician: String,
//     repairRemark: String
//   }],
//   usageType: {
//     type: String,
//     required: true
//   },
//   remark: {
//     type: String,
//     trim: true
//   },
//   reportedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   overallStatus: {
//     type: String,
//     enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "partially_repaired", "transferred"],
//     default: "damaged"
//   },
//   damageDate: {
//     type: Date,
//     default: Date.now
//   },
//   repairDate: Date,
//   disposalDate: Date,
//   vendorReturnDate: Date,
//   lastRepairUpdate: Date
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // Virtual for damaged quantity
// faultyStockSchema.virtual('damagedQty').get(function() {
//   return this.underRepairQty;
// });

// // Method to update overall status and quantities
// faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
//   let totalRepaired = 0;
//   let totalIrrepaired = 0;
//   let totalUnderRepair = 0;
//   let totalTransferred = 0;
  
//   this.serialNumbers.forEach(serial => {
//     const serialQty = serial.quantity || 1;
    
//     if (serial.status === "repaired") {
//       totalRepaired += serialQty;
//     } else if (serial.status === "irreparable") {
//       totalIrrepaired += serialQty;
//     } else if (serial.status === "transferred") {
//       totalTransferred += serialQty;
//     } else {
//       totalUnderRepair += serial.underRepairQty || (serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
//     }
//   });
  
//   // Update main quantity fields
//   this.repairedQty = totalRepaired;
//   this.irrepairedQty = totalIrrepaired;
//   this.transferredQty = totalTransferred;
//   this.underRepairQty = totalUnderRepair;
  
//   // Validate quantities
//   const calculatedTotal = this.repairedQty + this.irrepairedQty + this.transferredQty + this.underRepairQty;
//   if (calculatedTotal !== this.quantity) {
//     console.warn(`Quantity mismatch for FaultyStock ${this._id}: Expected ${this.quantity}, Calculated ${calculatedTotal}`);
//     // Auto-correct if mismatch is small
//     if (Math.abs(calculatedTotal - this.quantity) <= 1) {
//       this.underRepairQty = this.quantity - (this.repairedQty + this.irrepairedQty + this.transferredQty);
//     }
//   }
  
//   // Determine overall status
//   if (this.repairedQty === this.quantity) {
//     this.overallStatus = "repaired";
//     this.repairDate = this.repairDate || new Date();
//   } else if (this.irrepairedQty === this.quantity) {
//     this.overallStatus = "irreparable";
//   } else if (this.transferredQty === this.quantity) {
//     this.overallStatus = "transferred";
//   } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
//     this.overallStatus = "partially_repaired";
//   } else if (this.underRepairQty > 0) {
//     this.overallStatus = "under_repair";
//   } else {
//     this.overallStatus = "damaged";
//   }
  
//   this.lastRepairUpdate = new Date();
// };

// // Method to update repair quantities for a serial/batch
// faultyStockSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy) {
//   const serial = this.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//   if (!serial) {
//     throw new Error(`Serial number ${serialNumber} not found in faulty stock`);
//   }
  
//   const serialQty = serial.quantity || 1;
//   const currentProcessed = (serial.repairedQty || 0) + (serial.irrepairedQty || 0);
//   const remainingQty = serialQty - currentProcessed;
  
//   // Validate quantities
//   if (repairedQty + irrepairedQty > remainingQty) {
//     throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${remainingQty} remaining for ${serialNumber}`);
//   }
  
//   // Update serial quantities
//   serial.repairedQty = (serial.repairedQty || 0) + repairedQty;
//   serial.irrepairedQty = (serial.irrepairedQty || 0) + irrepairedQty;
//   serial.underRepairQty = serialQty - serial.repairedQty - serial.irrepairedQty;
  
//   // Update serial status
//   if (serial.repairedQty === serialQty) {
//     serial.status = "repaired";
//     serial.repairDate = new Date();
//   } else if (serial.irrepairedQty === serialQty) {
//     serial.status = "irreparable";
//   } else if (serial.underRepairQty > 0) {
//     serial.status = "under_repair";
//   }
  
//   // Add to repair history
//   serial.repairHistory.push({
//     date: new Date(),
//     status: serial.status,
//     repairedQty: repairedQty,
//     irrepairedQty: irrepairedQty,
//     quantity: repairedQty + irrepairedQty,
//     remark: `Repair update: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
//     updatedBy: updatedBy
//   });
  
//   // Update overall quantities and status
//   this.updateQuantitiesAndStatus();
// };

// faultyStockSchema.methods.getQuantitySummary = function() {
//   return {
//     total: this.quantity,
//     repaired: this.repairedQty,
//     irrepaired: this.irrepairedQty,
//     underRepair: this.underRepairQty,
//     transferred: this.transferredQty,
//     remaining: this.quantity - (this.repairedQty + this.irrepairedQty + this.transferredQty)
//   };
// };

// export default mongoose.model("FaultyStock", faultyStockSchema);


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
    default: 0,  // FIX: Start with 0, not calculated
    min: 0
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
      required: function() {
        return this.parent().isSerialized === true;
      }
    },
    status: {
      type: String,
      enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "transferred"],
      default: "damaged"  // FIX: Start as damaged
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
      default: 0  // FIX: Start with 0 for new damaged items
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
    default: "damaged"  // FIX: Start as damaged
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
  if (this.isSerialized) {
    // For serialized products, count damaged serials
    return this.serialNumbers.filter(sn => sn.status === "damaged").length;
  } else {
    // For non-serialized: Damaged = Total - (Repaired + Irrepaired + UnderRepair + Transferred)
    return Math.max(0, this.quantity - 
      (this.repairedQty || 0) - 
      (this.irrepairedQty || 0) - 
      (this.underRepairQty || 0) - 
      (this.transferredQty || 0));
  }
});

// Virtual for available for repair quantity
faultyStockSchema.virtual('availableForRepairQty').get(function() {
  return this.damagedQty;
});

// Method to validate quantities before saving
faultyStockSchema.methods.validateQuantities = function() {
  if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    // For serialized products
    const totalSerials = this.serialNumbers.length;
    
    // Calculate totals from serials
    const totalRepairedFromSerials = this.serialNumbers
      .filter(sn => sn.status === "repaired")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
    const totalIrrepairedFromSerials = this.serialNumbers
      .filter(sn => sn.status === "irreparable")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
    const totalUnderRepairFromSerials = this.serialNumbers
      .filter(sn => sn.status === "under_repair")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
    const totalTransferredFromSerials = this.serialNumbers
      .filter(sn => sn.status === "transferred")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
    const totalDamagedFromSerials = this.serialNumbers
      .filter(sn => sn.status === "damaged")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
    // Update main quantity fields from serials
    this.repairedQty = totalRepairedFromSerials;
    this.irrepairedQty = totalIrrepairedFromSerials;
    this.underRepairQty = totalUnderRepairFromSerials;
    this.transferredQty = totalTransferredFromSerials;
    
    // Verify total
    const totalFromSerials = totalRepairedFromSerials + totalIrrepairedFromSerials + 
                           totalUnderRepairFromSerials + totalTransferredFromSerials + 
                           totalDamagedFromSerials;
    
    if (totalFromSerials !== this.quantity) {
      console.warn(`Serial quantity mismatch for ${this._id}: Serial total=${totalFromSerials}, Expected=${this.quantity}`);
      // Auto-correct if mismatch
      if (Math.abs(totalFromSerials - this.quantity) <= 1) {
        this.quantity = totalFromSerials;
      }
    }
  } else {
    // For non-serialized products
    const calculatedTotal = (this.repairedQty || 0) + 
                           (this.irrepairedQty || 0) + 
                           (this.underRepairQty || 0) + 
                           (this.transferredQty || 0);
    
    const damagedQty = Math.max(0, this.quantity - calculatedTotal);
    const totalWithDamaged = calculatedTotal + damagedQty;
    
    if (totalWithDamaged !== this.quantity) {
      console.warn(`Non-serialized quantity mismatch for ${this._id}: Total=${totalWithDamaged}, Expected=${this.quantity}`);
      // Ensure quantities don't exceed total
      if (calculatedTotal > this.quantity) {
        // Reduce underRepairQty if needed
        this.underRepairQty = Math.max(0, this.underRepairQty - (calculatedTotal - this.quantity));
      }
    }
  }
  
  return true;
};

// Method to update overall status and quantities
faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
  // First validate quantities
  this.validateQuantities();
  
  // Handle non-serialized products
  if (!this.isSerialized || !this.serialNumbers || this.serialNumbers.length === 0) {
    // For non-serialized, underRepairQty is set manually when transferred to repair
    // Damaged quantity = total - (repaired + irrepaired + underRepair + transferred)
    const damagedQty = Math.max(0, this.quantity - 
      (this.repairedQty || 0) - 
      (this.irrepairedQty || 0) - 
      (this.underRepairQty || 0) - 
      (this.transferredQty || 0));
    
    console.log(`Non-serialized update: Total=${this.quantity}, Repaired=${this.repairedQty}, Irrepaired=${this.irrepairedQty}, UnderRepair=${this.underRepairQty}, Damaged=${damagedQty}`);
    
    // Update status based on quantities
    if (this.repairedQty === this.quantity) {
      this.overallStatus = "repaired";
      this.repairDate = this.repairDate || new Date();
    } else if (this.irrepairedQty === this.quantity) {
      this.overallStatus = "irreparable";
    } else if (this.transferredQty === this.quantity) {
      this.overallStatus = "transferred";
    } else if (this.underRepairQty > 0 && this.underRepairQty < this.quantity) {
      this.overallStatus = "partially_repaired";
    } else if (this.underRepairQty === this.quantity) {
      this.overallStatus = "under_repair";
    } else if (damagedQty > 0) {
      this.overallStatus = "damaged";
    } else {
      this.overallStatus = "damaged"; // default
    }
    
    this.lastRepairUpdate = new Date();
    return;
  }
  
  // Handle serialized products
  let totalRepaired = 0;
  let totalIrrepaired = 0;
  let totalUnderRepair = 0;
  let totalTransferred = 0;
  let totalDamaged = 0;
  
  this.serialNumbers.forEach(serial => {
    const serialQty = serial.quantity || 1;
    
    if (serial.status === "repaired") {
      totalRepaired += serialQty;
    } else if (serial.status === "irreparable") {
      totalIrrepaired += serialQty;
    } else if (serial.status === "transferred") {
      totalTransferred += serialQty;
    } else if (serial.status === "under_repair") {
      totalUnderRepair += serialQty;
    } else if (serial.status === "damaged") {
      totalDamaged += serialQty;
    }
    
    // Update serial's underRepairQty
    if (serial.status === "under_repair") {
      serial.underRepairQty = Math.max(0, serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
    } else if (serial.status === "damaged") {
      serial.underRepairQty = 0; // Damaged items are not under repair
    }
  });
  
  // Update main quantity fields
  this.repairedQty = totalRepaired;
  this.irrepairedQty = totalIrrepaired;
  this.transferredQty = totalTransferred;
  this.underRepairQty = totalUnderRepair;
  
  // Validate final total
  const calculatedTotal = totalRepaired + totalIrrepaired + totalTransferred + totalUnderRepair + totalDamaged;
  if (calculatedTotal !== this.quantity) {
    console.warn(`Final quantity mismatch for ${this._id}: ${calculatedTotal} vs ${this.quantity}`);
  }
  
  // Determine overall status
  if (this.repairedQty === this.quantity) {
    this.overallStatus = "repaired";
    this.repairDate = this.repairDate || new Date();
  } else if (this.irrepairedQty === this.quantity) {
    this.overallStatus = "irreparable";
  } else if (this.transferredQty === this.quantity) {
    this.overallStatus = "transferred";
  } else if (this.underRepairQty === this.quantity) {
    this.overallStatus = "under_repair";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0 || this.underRepairQty > 0) {
    this.overallStatus = "partially_repaired";
  } else {
    this.overallStatus = "damaged";
  }
  
  this.lastRepairUpdate = new Date();
};

// Method to update repair quantities for a serial/batch
faultyStockSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy) {
  if (!this.isSerialized) {
    // For non-serialized products, update directly
    if (repairedQty + irrepairedQty > this.quantity - (this.repairedQty + this.irrepairedQty)) {
      throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${this.quantity - (this.repairedQty + this.irrepairedQty)} remaining`);
    }
    
    this.repairedQty = (this.repairedQty || 0) + repairedQty;
    this.irrepairedQty = (this.irrepairedQty || 0) + irrepairedQty;
    this.updateQuantitiesAndStatus();
    return;
  }
  
  // For serialized products
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
  serial.underRepairQty = Math.max(0, serialQty - serial.repairedQty - serial.irrepairedQty);
  
  // Update serial status
  if (serial.repairedQty === serialQty) {
    serial.status = "repaired";
    serial.repairDate = new Date();
  } else if (serial.irrepairedQty === serialQty) {
    serial.status = "irreparable";
  } else if (serial.underRepairQty > 0) {
    serial.status = "under_repair";
  } else {
    serial.status = "damaged";
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

// Method to transfer items to repair center
faultyStockSchema.methods.transferToRepair = function(quantity, serialNumbers = [], transferredBy) {
  // Calculate available damaged items
  const availableDamaged = this.damagedQty;
  
  if (quantity > availableDamaged) {
    throw new Error(`Cannot transfer ${quantity} items. Only ${availableDamaged} damaged items available`);
  }
  
  if (this.isSerialized) {
    // For serialized products
    const damagedSerials = this.serialNumbers.filter(sn => sn.status === "damaged");
    
    if (serialNumbers.length > 0) {
      // Transfer specific serials
      let transferredCount = 0;
      for (const serialNumber of serialNumbers) {
        const serial = damagedSerials.find(sn => sn.serialNumber === serialNumber);
        if (serial) {
          serial.status = "under_repair";
          serial.underRepairQty = 1;
          transferredCount++;
          
          // Add to repair history
          serial.repairHistory.push({
            date: new Date(),
            status: "under_repair",
            remark: "Transferred to repair center",
            quantity: 1,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: transferredBy
          });
        }
      }
      
      if (transferredCount !== quantity) {
        throw new Error(`Transferred ${transferredCount} serials but expected ${quantity}`);
      }
    } else {
      // Transfer first N damaged serials
      let transferredCount = 0;
      for (let i = 0; i < Math.min(quantity, damagedSerials.length); i++) {
        damagedSerials[i].status = "under_repair";
        damagedSerials[i].underRepairQty = 1;
        transferredCount++;
        
        // Add to repair history
        damagedSerials[i].repairHistory.push({
          date: new Date(),
          status: "under_repair",
          remark: "Transferred to repair center",
          quantity: 1,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: transferredBy
        });
      }
      
      if (transferredCount !== quantity) {
        throw new Error(`Only found ${damagedSerials.length} damaged serials, but trying to transfer ${quantity}`);
      }
    }
  } else {
    // For non-serialized products
    this.underRepairQty = (this.underRepairQty || 0) + quantity;
  }
  
  // Update overall status
  this.updateQuantitiesAndStatus();
  
  return {
    success: true,
    transferred: quantity,
    newStatus: this.overallStatus,
    underRepairQty: this.underRepairQty,
    damagedQty: this.damagedQty
  };
};

faultyStockSchema.methods.getQuantitySummary = function() {
  const damaged = this.damagedQty;
  
  if (!this.isSerialized) {
    return {
      total: this.quantity,
      repaired: this.repairedQty || 0,
      irrepaired: this.irrepairedQty || 0,
      underRepair: this.underRepairQty || 0,
      transferred: this.transferredQty || 0,
      damaged: damaged,
      availableForRepair: damaged
    };
  }
  
  // For serialized products
  const underRepair = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
  const repaired = this.serialNumbers.filter(sn => sn.status === "repaired").length;
  const irreparable = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
  const transferred = this.serialNumbers.filter(sn => sn.status === "transferred").length;
  
  return {
    total: this.quantity,
    repaired: repaired,
    irrepaired: irreparable,
    underRepair: underRepair,
    transferred: transferred,
    damaged: damaged,
    availableForRepair: damaged
  };
};

// Pre-save middleware to ensure consistency
faultyStockSchema.pre('save', function(next) {
  // Ensure underRepairQty is calculated if not set
  if (this.underRepairQty === undefined || this.underRepairQty === null) {
    this.underRepairQty = 0; // Start with 0 for new damage reports
  }
  
  // Ensure overallStatus is set for new documents
  if (!this.overallStatus) {
    this.overallStatus = "damaged"; // Default to damaged
  }
  
  // For non-serialized products, ensure serialNumbers array is empty
  if (!this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    console.warn(`Non-serialized product ${this._id} has serial numbers. Clearing them.`);
    this.serialNumbers = [];
  }
  
  // For serialized products, ensure status is set correctly
  if (this.isSerialized && this.serialNumbers) {
    this.serialNumbers.forEach(serial => {
      if (!serial.status) {
        serial.status = "damaged"; // Default to damaged
      }
      if (serial.status === "damaged" && serial.underRepairQty !== 0) {
        serial.underRepairQty = 0; // Damaged items should not be under repair
      }
    });
  }
  
  // Call updateQuantitiesAndStatus before saving
  this.updateQuantitiesAndStatus();
  
  next();
});

export default mongoose.model("FaultyStock", faultyStockSchema);