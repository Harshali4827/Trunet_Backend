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
//     default: 0,
//     min: 0
//   },
//   returnedQty: {
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
//       required: true
//     },
//     status: {
//       type: String,
//       enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "returned", "transferred","partially_repaired","pending_under_repair"],
//       required: true
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
//       default: 0
//     },
//     repairHistory: [{
//       date: Date,
//       status: String,
//       remark: String,
//       quantity: Number,
//       repairedQty: Number,
//       irrepairedQty: Number,
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
//     enum: ["transferred", "in_repair", "repaired", "returned", "cancelled", "partially_repaired", "under_repair", "irreparable","partially_repaired","pending_under_repair"],
//     default: "transferred"
//   },
//   repairUpdates: [{
//     date: {
//       type: Date,
//       default: Date.now
//     },
//     status: String,
//     remark: String,
//     quantity: Number,
//     repairedQty: Number,
//     irrepairedQty: Number,
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
//   },
//   lastRepairUpdate: Date
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// repairTransferSchema.virtual('damagedQty').get(function() {
//   return this.underRepairQty;
// });

// repairTransferSchema.methods.updateStatusAndQuantities = function() {
//   let totalRepaired = 0;
//   let totalIrrepaired = 0;
//   let totalUnderRepair = 0;
//   let totalReturned = 0;
  
//   if (!this.isSerialized || this.serialNumbers.length === 0) {
//     totalRepaired = this.repairedQty || 0;
//     totalIrrepaired = this.irrepairedQty || 0;
//     totalUnderRepair = this.underRepairQty || 0;
//     totalReturned = this.returnedQty || 0;

//     if (totalUnderRepair === 0 && this.quantity > (totalRepaired + totalIrrepaired + totalReturned)) {
//       totalUnderRepair = this.quantity - totalRepaired - totalIrrepaired - totalReturned;
//       this.underRepairQty = totalUnderRepair;
//     }
//   } else {
//     this.serialNumbers.forEach(serial => {
//       const serialQty = serial.quantity || 1;
      
//       if (serial.status === "repaired") {
//         totalRepaired += serialQty;
//       } else if (serial.status === "irreparable") {
//         totalIrrepaired += serialQty;
//       } else if (serial.status === "returned") {
//         totalReturned += serialQty;
//       } else {
//         const processedQty = (serial.repairedQty || 0) + (serial.irrepairedQty || 0);
//         serial.underRepairQty = Math.max(0, serialQty - processedQty);
//         totalUnderRepair += serial.underRepairQty;
//       }
//     });

//     this.repairedQty = totalRepaired;
//     this.irrepairedQty = totalIrrepaired;
//     this.underRepairQty = totalUnderRepair;
//     this.returnedQty = totalReturned;
//   }
//   const calculatedTotal = totalRepaired + totalIrrepaired + totalUnderRepair + totalReturned;
//   if (calculatedTotal !== this.quantity) {
//     console.warn(`Quantity mismatch in repair transfer ${this._id}: ${calculatedTotal} vs ${this.quantity}`);
//     if (Math.abs(calculatedTotal - this.quantity) <= 2) {
//       this.quantity = calculatedTotal;
//     }
//   }
  
//   if (totalUnderRepair > 0) {
//     this.status = "under_repair";
//   } else if (totalRepaired === this.quantity) {
//     this.status = "repaired";
//   } else if (totalIrrepaired === this.quantity) {
//     this.status = "irreparable";
//   } else if (totalReturned === this.quantity) {
//     this.status = "returned";
//   } else if (totalRepaired > 0 && totalIrrepaired > 0) {
//     this.status = "partially_repaired";
//   } else {
//     this.status = "transferred";
//   }
  
//   this.lastRepairUpdate = new Date();
// };

// repairTransferSchema.methods.addItemsToTransfer = function(items, transferredBy, remark) {
//   console.log(`Adding ${items.length} items to existing transfer ${this._id}`);
  
//   if (!this.isSerialized) {
//     const additionalQty = items.reduce((sum, item) => sum + item.quantity, 0);

//     this.quantity += additionalQty;
//     this.underRepairQty = (this.underRepairQty || 0) + additionalQty;
    
//     console.log(`Non-serialized: Added ${additionalQty} items. New total: ${this.quantity}, Under repair: ${this.underRepairQty}`);
//   } else {
//     const existingSerials = this.serialNumbers.map(sn => sn.serialNumber);
//     const newSerials = [];
    
//     for (const item of items) {
//       if (existingSerials.includes(item.serialNumber)) {
//         throw new Error(`Serial ${item.serialNumber} already exists in this transfer`);
//       }
      
//       newSerials.push({
//         serialNumber: item.serialNumber,
//         status: "under_repair",
//         quantity: item.quantity || 1,
//         repairedQty: 0,
//         irrepairedQty: 0,
//         underRepairQty: item.quantity || 1,
//         repairHistory: [{
//           date: new Date(),
//           status: "under_repair",
//           remark: remark || "Transferred to repair center",
//           updatedBy: transferredBy,
//           cost: 0
//         }]
//       });
//     }
    
//     this.serialNumbers.push(...newSerials);

//     this.quantity += newSerials.length;
//     console.log(`Serialized: Added ${newSerials.length} new serials. New total: ${this.quantity}`);
//   }
  
//   this.repairUpdates.push({
//     date: new Date(),
//     status: "under_repair",
//     remark: remark || `Additional items transferred to repair center`,
//     quantity: items.length,
//     updatedBy: transferredBy,
//     cost: 0
//   });

//   this.updateStatusAndQuantities();
  
//   return {
//     success: true,
//     added: items.length,
//     newTotal: this.quantity,
//     newStatus: this.status
//   };
// };

// repairTransferSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy, remark, cost = 0) {
//   const serial = this.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//   if (!serial) {
//     throw new Error(`Serial number ${serialNumber} not found in repair transfer`);
//   }
  
//   const serialQty = serial.quantity || 1;
//   const currentProcessed = (serial.repairedQty || 0) + (serial.irrepairedQty || 0);
//   const remainingQty = serialQty - currentProcessed;

//   if (repairedQty + irrepairedQty > remainingQty) {
//     throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${remainingQty} remaining for ${serialNumber}`);
//   }
  
//   serial.repairedQty = (serial.repairedQty || 0) + repairedQty;
//   serial.irrepairedQty = (serial.irrepairedQty || 0) + irrepairedQty;
//   serial.underRepairQty = Math.max(0, serialQty - serial.repairedQty - serial.irrepairedQty);

//   if (serial.repairedQty === serialQty) {
//     serial.status = "repaired";
//   } else if (serial.irrepairedQty === serialQty) {
//     serial.status = "irreparable";
//   } else if (serial.underRepairQty > 0) {
//     serial.status = "under_repair";
//   } else {
//     serial.status = "damaged";
//   }

//   serial.repairHistory.push({
//     date: new Date(),
//     status: serial.status,
//     repairedQty: repairedQty,
//     irrepairedQty: irrepairedQty,
//     quantity: repairedQty + irrepairedQty,
//     remark: remark || `Repair update: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
//     updatedBy: updatedBy,
//     cost: cost * (repairedQty + irrepairedQty)
//   });

//   this.repairUpdates.push({
//     date: new Date(),
//     status: this.status,
//     remark: remark || `Updated ${serialNumber}: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
//     quantity: repairedQty + irrepairedQty,
//     repairedQty: repairedQty,
//     irrepairedQty: irrepairedQty,
//     updatedBy: updatedBy,
//     cost: cost * (repairedQty + irrepairedQty)
//   });

//   if (cost > 0) {
//     this.totalRepairCost = (this.totalRepairCost || 0) + (cost * (repairedQty + irrepairedQty));
//   }
//   this.updateStatusAndQuantities();
// };

// repairTransferSchema.methods.getQuantitySummary = function() {
//   return {
//     total: this.quantity,
//     repaired: this.repairedQty,
//     irrepaired: this.irrepairedQty,
//     underRepair: this.underRepairQty,
//     returned: this.returnedQty,
//     remaining: this.quantity - (this.repairedQty + this.irrepairedQty + this.returnedQty)
//   };
// };

// repairTransferSchema.pre('save', function(next) {
//   if (this.repairedQty === undefined) this.repairedQty = 0;
//   if (this.irrepairedQty === undefined) this.irrepairedQty = 0;
//   if (this.underRepairQty === undefined) this.underRepairQty = 0;
//   if (this.returnedQty === undefined) this.returnedQty = 0;
  
//   if (!this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
//     console.warn(`Clearing serialNumbers for non-serialized transfer ${this._id}`);
//     this.serialNumbers = [];
//   }

//   this.updateStatusAndQuantities();
  
//   next();
// });

// export default mongoose.model("RepairTransfer", repairTransferSchema);



import mongoose from 'mongoose';

const repairTransferSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
    required: true
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
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  pendingUnderRepairQty: {
    type: Number,
    default: 0,
    min: 0
  },
  underRepairQty: {
    type: Number,
    default: 0,
    min: 0
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
  returnedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  // NEW FIELD: For non-serialized pending transfers
  pendingTransferQty: {
    type: Number,
    default: 0,
    min: 0
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
      enum: ["pending_under_repair", "under_repair", "repaired", "irreparable", "returned", "partially_repaired", "transferred","pending_transfer"],
      default: "pending_under_repair"
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
      default: 0
    },
    repairHistory: [{
      date: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ["pending_under_repair", "under_repair", "repaired", "irreparable", "returned", "partially_repaired", "transferred","pending_transfer"]
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
      },
      // For tracking transfer status
      transferStatus: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending"
      },
      destinationOutlet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Center"
      }
    }],
    repairDate: Date,
    disposalDate: Date,
    repairCost: {
      type: Number,
      default: 0
    },
    technician: String,
    repairRemark: String
  }],
  // NEW FIELD: For tracking non-serialized pending transfers details
  pendingTransferDetails: [{
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
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    transferredAt: {
      type: Date,
      default: Date.now
    },
    remark: String,
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
  transferRemark: {
    type: String,
    trim: true
  },
  transferredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  acceptedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  completedAt: Date,
  status: {
    type: String,
    enum: ["pending_under_repair", "partially_accepted", "under_repair", "repaired", "irreparable", "returned", "cancelled", "completed","transferred","pending_transfer"],
    default: "pending_under_repair"
  },
  repairUpdates: [{
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending_under_repair", "partially_accepted", "under_repair", "repaired", "irreparable", "returned", "cancelled", "completed", "transferred","pending_transfer"]
    },
    remark: String,
    quantity: {
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
    },
    // For tracking transfer status
    transferStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending"
    },
    destinationOutlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center"
    },
    acceptedAt: Date,
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  }],
  estimatedCompletionDate: Date,
  actualCompletionDate: Date,
  totalRepairCost: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for accepted quantity
repairTransferSchema.virtual('acceptedQty').get(function() {
  return this.underRepairQty || 0;
});

// Virtual for remaining pending quantity
repairTransferSchema.virtual('remainingPendingQty').get(function() {
  return this.pendingUnderRepairQty || 0;
});

repairTransferSchema.methods.markAsPendingTransfer = function(quantity, outletId, transferredBy, remark, serialNumbers = []) {
  console.log(`Marking ${quantity} items as pending transfer to outlet ${outletId}. IsSerialized: ${this.isSerialized}`);
  
  if (this.isSerialized) {
    // For SERIALIZED products
    if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      throw new Error("Serial numbers are required for serialized products");
    }
    
    if (serialNumbers.length !== quantity) {
      throw new Error(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length})`);
    }
    
    // Update each serial from "repaired" to "pending_transfer"
    let updatedCount = 0;
    for (const serialNumber of serialNumbers) {
      const serialIndex = this.serialNumbers.findIndex(sn => 
        sn.serialNumber === serialNumber && sn.status === "repaired"
      );
      
      if (serialIndex !== -1) {
        this.serialNumbers[serialIndex].status = "pending_transfer";
        this.serialNumbers[serialIndex].repairHistory.push({
          date: new Date(),
          status: "pending_transfer",
          remark: remark || `Transferred to warehouse (pending)`,
          quantity: 1,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: transferredBy,
          transferStatus: "pending",
          destinationOutlet: outletId
        });
        updatedCount++;
      }
    }
    
    if (updatedCount !== quantity) {
      throw new Error(`Could only find ${updatedCount} repaired serials out of ${quantity} requested`);
    }
    
  } else {
    // For NON-SERIALIZED products
    if (quantity > this.repairedQty) {
      throw new Error(`Cannot transfer ${quantity} items. Only ${this.repairedQty} repaired items available`);
    }
  }
  
  // Update quantities for BOTH types
  this.repairedQty = Math.max(0, this.repairedQty - quantity);
  this.pendingTransferQty = (this.pendingTransferQty || 0) + quantity;
  
  // Track destination outlet for this pending transfer
  if (!this.pendingTransferDetails) {
    this.pendingTransferDetails = [];
  }
  
  this.pendingTransferDetails.push({
    outletId: outletId,
    quantity: quantity,
    transferredBy: transferredBy,
    transferredAt: new Date(),
    remark: remark || `Pending transfer to outlet`,
    status: "pending",
    serialNumbers: this.isSerialized ? serialNumbers : []
  });
  
  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: "pending_transfer",
    remark: remark || `Transferred ${quantity} ${this.isSerialized ? 'serialized' : 'non-serialized'} items to warehouse (pending)`,
    quantity: quantity,
    updatedBy: transferredBy,
    transferStatus: "pending",
    destinationOutlet: outletId,
    serialNumbers: this.isSerialized ? serialNumbers : []
  });
  
  // Update overall status
  this.updateStatusAndQuantities();
  
  console.log(`After - RepairedQty: ${this.repairedQty}, PendingTransferQty: ${this.pendingTransferQty}`);
  
  return {
    success: true,
    quantity: quantity,
    pendingTransferQty: this.pendingTransferQty,
    repairedQty: this.repairedQty,
    status: this.status,
    isSerialized: this.isSerialized
  };
};
// Updated updateStatusAndQuantities method
repairTransferSchema.methods.updateStatusAndQuantities = function() {
  // For SERIALIZED products
  if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    const pendingCount = this.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
    const underRepairCount = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
    const repairedCount = this.serialNumbers.filter(sn => sn.status === "repaired").length;
    const irrepairedCount = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
    const returnedCount = this.serialNumbers.filter(sn => sn.status === "returned").length;
    const pendingTransferCount = this.serialNumbers.filter(sn => sn.status === "pending_transfer").length;
    const transferredCount = this.serialNumbers.filter(sn => sn.status === "transferred").length;
    
    this.pendingUnderRepairQty = pendingCount;
    this.underRepairQty = underRepairCount;
    this.repairedQty = repairedCount;
    this.irrepairedQty = irrepairedCount;
    this.returnedQty = returnedCount;
    this.pendingTransferQty = pendingTransferCount; // Now includes serialized pending transfers
    
    // Validate quantity matches
    const calculatedTotal = pendingCount + underRepairCount + repairedCount + 
                           irrepairedCount + returnedCount + pendingTransferCount + transferredCount;
    if (calculatedTotal !== this.quantity) {
      console.warn(`Quantity mismatch in transfer ${this._id}: Calculated ${calculatedTotal}, Expected ${this.quantity}`);
    }
  }
  
  // Determine status
  if (this.quantity === this.returnedQty) {
    this.status = "returned";
  } else if (this.quantity === this.repairedQty) {
    this.status = "repaired";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.irrepairedQty) {
    this.status = "irreparable";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.underRepairQty) {
    this.status = "under_repair";
  } else if (this.pendingUnderRepairQty === this.quantity) {
    this.status = "pending_under_repair";
  } else if (this.pendingUnderRepairQty > 0 && this.underRepairQty > 0) {
    this.status = "partially_accepted";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
    this.status = "partially_repaired";
  } else if (this.pendingTransferQty > 0) {
    // For BOTH serialized and non-serialized
    this.status = "pending_transfer";
  } else {
    this.status = "pending_under_repair";
  }
};

// Method to accept pending non-serialized transfer
repairTransferSchema.methods.acceptPendingTransfer = function(outletId, quantity, acceptedBy, remark) {
  if (this.isSerialized) {
    throw new Error("Use serial-specific methods for serialized products");
  }
  
  console.log(`Accepting ${quantity} non-serialized items from pending transfer for outlet ${outletId}`);
  
  if (quantity > this.pendingTransferQty) {
    throw new Error(`Cannot accept ${quantity} items. Only ${this.pendingTransferQty} pending transfer items available`);
  }
  
  // Update pending transfer details
  let remainingToAccept = quantity;
  let acceptedCount = 0;
  
  if (this.pendingTransferDetails && this.pendingTransferDetails.length > 0) {
    for (const detail of this.pendingTransferDetails) {
      if (detail.outletId.toString() === outletId.toString() && 
          detail.status === "pending" && 
          remainingToAccept > 0) {
        
        const toAccept = Math.min(detail.quantity, remainingToAccept);
        
        detail.status = "accepted";
        detail.acceptedAt = new Date();
        detail.acceptedBy = acceptedBy;
        if (remark) detail.remark = remark;
        
        // Reduce quantity if partially accepted
        if (toAccept < detail.quantity) {
          // Create new pending entry for remaining quantity
          this.pendingTransferDetails.push({
            outletId: outletId,
            quantity: detail.quantity - toAccept,
            transferredBy: detail.transferredBy,
            transferredAt: detail.transferredAt,
            remark: detail.remark,
            status: "pending"
          });
          detail.quantity = toAccept;
        }
        
        remainingToAccept -= toAccept;
        acceptedCount += toAccept;
      }
    }
  }
  
  if (acceptedCount !== quantity) {
    throw new Error(`Could only accept ${acceptedCount} out of ${quantity} requested items`);
  }
  
  // Update quantities
  this.pendingTransferQty = Math.max(0, this.pendingTransferQty - quantity);
  this.returnedQty = (this.returnedQty || 0) + quantity;
  
  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: "transferred",
    remark: remark || `Accepted ${quantity} repaired non-serialized items at warehouse`,
    quantity: quantity,
    updatedBy: acceptedBy,
    transferStatus: "accepted",
    destinationOutlet: outletId,
    acceptedAt: new Date(),
    acceptedBy: acceptedBy
  });
  
  // Update overall status
  this.updateStatusAndQuantities();
  
  console.log(`After accept - PendingTransferQty: ${this.pendingTransferQty}, ReturnedQty: ${this.returnedQty}`);
  
  return {
    success: true,
    acceptedQuantity: quantity,
    pendingTransferQty: this.pendingTransferQty,
    returnedQty: this.returnedQty,
    status: this.status
  };
};

// Method to reject pending non-serialized transfer
repairTransferSchema.methods.rejectPendingTransfer = function(outletId, quantity, rejectedBy, reason) {
  if (this.isSerialized) {
    throw new Error("Use serial-specific methods for serialized products");
  }
  
  console.log(`Rejecting ${quantity} non-serialized items from pending transfer for outlet ${outletId}`);
  
  if (quantity > this.pendingTransferQty) {
    throw new Error(`Cannot reject ${quantity} items. Only ${this.pendingTransferQty} pending transfer items available`);
  }
  
  // Update pending transfer details
  let remainingToReject = quantity;
  let rejectedCount = 0;
  
  if (this.pendingTransferDetails && this.pendingTransferDetails.length > 0) {
    for (const detail of this.pendingTransferDetails) {
      if (detail.outletId.toString() === outletId.toString() && 
          detail.status === "pending" && 
          remainingToReject > 0) {
        
        const toReject = Math.min(detail.quantity, remainingToReject);
        
        detail.status = "rejected";
        detail.rejectedAt = new Date();
        detail.rejectedBy = rejectedBy;
        detail.rejectionReason = reason;
        
        // Reduce quantity if partially rejected
        if (toReject < detail.quantity) {
          // Create new pending entry for remaining quantity
          this.pendingTransferDetails.push({
            outletId: outletId,
            quantity: detail.quantity - toReject,
            transferredBy: detail.transferredBy,
            transferredAt: detail.transferredAt,
            remark: detail.remark,
            status: "pending"
          });
          detail.quantity = toReject;
        }
        
        remainingToReject -= toReject;
        rejectedCount += toReject;
      }
    }
  }
  
  if (rejectedCount !== quantity) {
    throw new Error(`Could only reject ${rejectedCount} out of ${quantity} requested items`);
  }
  
  // Update quantities - return to repairedQty
  this.pendingTransferQty = Math.max(0, this.pendingTransferQty - quantity);
  this.repairedQty = (this.repairedQty || 0) + quantity;
  
  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: "rejected",
    remark: `Rejected ${quantity} repaired non-serialized items: ${reason}`,
    quantity: quantity,
    updatedBy: rejectedBy,
    transferStatus: "rejected",
    destinationOutlet: outletId,
    rejectionReason: reason
  });
  
  // Update overall status
  this.updateStatusAndQuantities();
  
  console.log(`After reject - PendingTransferQty: ${this.pendingTransferQty}, RepairedQty: ${this.repairedQty}`);
  
  return {
    success: true,
    rejectedQuantity: quantity,
    pendingTransferQty: this.pendingTransferQty,
    repairedQty: this.repairedQty,
    status: this.status
  };
};

// Updated status and quantities method
repairTransferSchema.methods.updateStatusAndQuantities = function() {
  // Update serialized quantities
  if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    const pendingCount = this.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
    const underRepairCount = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
    const repairedCount = this.serialNumbers.filter(sn => sn.status === "repaired").length;
    const irrepairedCount = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
    const returnedCount = this.serialNumbers.filter(sn => sn.status === "returned").length;
    const pendingTransferCount = this.serialNumbers.filter(sn => sn.status === "pending_transfer").length;
    const transferredCount = this.serialNumbers.filter(sn => sn.status === "transferred").length;
    
    this.pendingUnderRepairQty = pendingCount;
    this.underRepairQty = underRepairCount;
    this.repairedQty = repairedCount;
    this.irrepairedQty = irrepairedCount;
    this.returnedQty = returnedCount;

    const calculatedTotal = pendingCount + underRepairCount + repairedCount + 
                           irrepairedCount + returnedCount + pendingTransferCount + transferredCount;
    if (calculatedTotal !== this.quantity) {
      console.warn(`Quantity mismatch in transfer ${this._id}: Calculated ${calculatedTotal}, Expected ${this.quantity}`);
    }
  }

  // Determine status
  if (this.quantity === this.returnedQty) {
    this.status = "returned";
  } else if (this.quantity === this.repairedQty) {
    this.status = "repaired";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.irrepairedQty) {
    this.status = "irreparable";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.underRepairQty) {
    this.status = "under_repair";
  } else if (this.pendingUnderRepairQty === this.quantity) {
    this.status = "pending_under_repair";
  } else if (this.pendingUnderRepairQty > 0 && this.underRepairQty > 0) {
    this.status = "partially_accepted";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
    this.status = "partially_repaired";
  } else if (this.isSerialized && this.serialNumbers && this.serialNumbers.some(sn => sn.status === "pending_transfer")) {
    this.status = "pending_transfer";
  } else if (!this.isSerialized && this.pendingTransferQty > 0) {
    this.status = "pending_transfer";
  } else {
    this.status = "pending_under_repair";
  }
};

// Get quantity summary
repairTransferSchema.methods.getQuantitySummary = function() {
  return {
    total: this.quantity,
    pendingUnderRepair: this.pendingUnderRepairQty || 0,
    underRepair: this.underRepairQty || 0,
    repaired: this.repairedQty || 0,
    irrepaired: this.irrepairedQty || 0,
    returned: this.returnedQty || 0,
    pendingTransfer: this.pendingTransferQty || 0,
    remaining: this.quantity - (this.pendingUnderRepairQty + this.underRepairQty + this.repairedQty + 
                               this.irrepairedQty + this.returnedQty + this.pendingTransferQty)
  };
};

// Pre-save middleware
repairTransferSchema.pre('save', function(next) {
  // Ensure quantity fields are set
  if (this.pendingUnderRepairQty === undefined) this.pendingUnderRepairQty = 0;
  if (this.underRepairQty === undefined) this.underRepairQty = 0;
  if (this.repairedQty === undefined) this.repairedQty = 0;
  if (this.irrepairedQty === undefined) this.irrepairedQty = 0;
  if (this.returnedQty === undefined) this.returnedQty = 0;
  if (this.pendingTransferQty === undefined) this.pendingTransferQty = 0;
  if (this.totalRepairCost === undefined) this.totalRepairCost = 0;
  
  // For non-serialized, ensure serialNumbers is empty
  if (!this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    console.warn(`Clearing serialNumbers for non-serialized transfer ${this._id}`);
    this.serialNumbers = [];
  }
  
  // For new transfers, set pending quantity to total quantity
  if (this.isNew && this.pendingUnderRepairQty === 0 && this.status === "pending_under_repair") {
    this.pendingUnderRepairQty = this.quantity;
  }
  
  // Update status and quantities
  this.updateStatusAndQuantities();
  
  next();
});

export default mongoose.model("RepairTransfer", repairTransferSchema);