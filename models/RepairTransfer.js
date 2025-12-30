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
      enum: ["pending_under_repair", "under_repair", "repaired", "irreparable", "returned", "partially_repaired"],
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
        enum: ["pending_under_repair", "under_repair", "repaired", "irreparable", "returned", "partially_repaired"]
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
    repairCost: {
      type: Number,
      default: 0
    },
    technician: String,
    repairRemark: String
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
    enum: ["pending_under_repair", "partially_accepted", "under_repair", "repaired", "irreparable", "returned", "cancelled", "completed"],
    default: "pending_under_repair"
  },
  repairUpdates: [{
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending_under_repair", "partially_accepted", "under_repair", "repaired", "irreparable", "returned", "cancelled", "completed"]
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

// Method to add items to an existing transfer
repairTransferSchema.methods.addItemsToTransfer = function(items, updatedBy, remark) {
  if (this.status !== "pending_under_repair" && this.status !== "partially_accepted") {
    throw new Error(`Cannot add items to transfer with status: ${this.status}`);
  }

  let totalQuantityToAdd = 0;
  
  if (this.isSerialized) {
    // For serialized products
    const existingSerials = this.serialNumbers.map(sn => sn.serialNumber);
    
    items.forEach(item => {
      if (item.serialNumber && !existingSerials.includes(item.serialNumber)) {
        this.serialNumbers.push({
          serialNumber: item.serialNumber,
          status: "pending_under_repair",
          quantity: item.quantity || 1,
          repairedQty: 0,
          irrepairedQty: 0,
          underRepairQty: 0,
          repairHistory: [{
            date: new Date(),
            status: "pending_under_repair",
            remark: remark || "Additional item transferred",
            quantity: item.quantity || 1,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: updatedBy,
            cost: 0
          }]
        });
        totalQuantityToAdd += (item.quantity || 1);
      }
    });
  } else {
    // For non-serialized products
    items.forEach(item => {
      totalQuantityToAdd += (item.quantity || 0);
    });
  }

  // Update quantities
  this.quantity += totalQuantityToAdd;
  this.pendingUnderRepairQty = (this.pendingUnderRepairQty || 0) + totalQuantityToAdd;

  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: this.status,
    remark: remark || `Added ${totalQuantityToAdd} items to transfer`,
    quantity: totalQuantityToAdd,
    updatedBy: updatedBy,
    cost: 0
  });

  this.updateStatusAndQuantities();

  return {
    success: true,
    addedQuantity: totalQuantityToAdd,
    newTotalQuantity: this.quantity,
    newPendingQty: this.pendingUnderRepairQty
  };
};

// Method to accept pending items (for repair center)
repairTransferSchema.methods.acceptPendingItems = function(acceptedQuantities, acceptedBy, remark) {
  if (this.status !== "pending_under_repair" && this.status !== "partially_accepted") {
    throw new Error(`Cannot accept items from transfer with status: ${this.status}`);
  }

  console.log(`Accepting pending items for transfer ${this._id}`);
  console.log(`Before accept - PendingUnderRepairQty: ${this.pendingUnderRepairQty}, UnderRepairQty: ${this.underRepairQty}`);

  if (this.isSerialized) {
    // For serialized products
    const pendingSerials = this.serialNumbers.filter(sn => sn.status === "pending_under_repair");
    
    if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
      // Accept specific serials
      for (const accepted of acceptedQuantities) {
        const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
        if (serial) {
          // Update serial status to under_repair
          serial.status = "under_repair";
          serial.underRepairQty = 1;
          
          // Add repair history entry
          serial.repairHistory.push({
            date: new Date(),
            status: "under_repair",
            remark: accepted.remark || remark || "Accepted at repair center",
            quantity: 1,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: acceptedBy,
            cost: 0
          });
        }
      }
    } else {
      // Accept all pending serials
      pendingSerials.forEach(serial => {
        serial.status = "under_repair";
        serial.underRepairQty = 1;
        
        serial.repairHistory.push({
          date: new Date(),
          status: "under_repair",
          remark: remark || "Accepted at repair center",
          quantity: 1,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: acceptedBy,
          cost: 0
        });
      });
    }

    // Calculate accepted count
    const acceptedCount = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
    const pendingCount = this.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
    
    this.underRepairQty = acceptedCount;
    this.pendingUnderRepairQty = pendingCount;

  } else {
    // For non-serialized products
    const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
      ? acceptedQuantities.totalAcceptedQty 
      : this.pendingUnderRepairQty;
    
    if (totalAccepted > this.pendingUnderRepairQty) {
      throw new Error(`Cannot accept ${totalAccepted} items. Only ${this.pendingUnderRepairQty} pending items available`);
    }

    // Update quantities
    this.underRepairQty = (this.underRepairQty || 0) + totalAccepted;
    this.pendingUnderRepairQty = Math.max(0, this.pendingUnderRepairQty - totalAccepted);
  }

  // Update accepted info
  this.acceptedBy = acceptedBy;
  this.acceptedAt = new Date();

  // Update status
  this.updateStatusAndQuantities();

  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: this.status,
    remark: remark || `Accepted ${this.isSerialized ? this.underRepairQty + ' items' : this.underRepairQty + ' quantity'} at repair center`,
    quantity: this.underRepairQty,
    updatedBy: acceptedBy,
    cost: 0
  });

  console.log(`After accept - PendingUnderRepairQty: ${this.pendingUnderRepairQty}, UnderRepairQty: ${this.underRepairQty}, Status: ${this.status}`);

  return {
    success: true,
    acceptedQty: this.underRepairQty,
    pendingQty: this.pendingUnderRepairQty,
    status: this.status,
    acceptedBy: acceptedBy,
    acceptedAt: this.acceptedAt
  };
};

// Method to update repair status
repairTransferSchema.methods.updateRepairStatus = function(updateData, updatedBy) {
  const { repairedQty, irrepairedQty, status, remark, cost, technician } = updateData;
  
  // Validate
  const totalToUpdate = (repairedQty || 0) + (irrepairedQty || 0);
  const availableForRepair = this.underRepairQty - (this.repairedQty + this.irrepairedQty);
  
  if (totalToUpdate > availableForRepair) {
    throw new Error(`Cannot update ${totalToUpdate} items. Only ${availableForRepair} items available for repair`);
  }

  if (this.isSerialized) {
    // For serialized products - update specific serials if provided
    const underRepairSerials = this.serialNumbers.filter(sn => sn.status === "under_repair");
    
    // For simplicity, update first N serials
    let updatedCount = 0;
    for (let i = 0; i < Math.min(totalToUpdate, underRepairSerials.length); i++) {
      const serial = underRepairSerials[i];
      
      if (repairedQty > 0) {
        serial.status = "repaired";
        serial.repairedQty = 1;
        serial.repairDate = new Date();
        repairedQty--;
      } else if (irrepairedQty > 0) {
        serial.status = "irreparable";
        serial.irrepairedQty = 1;
        irrepairedQty--;
      }
      
      serial.repairHistory.push({
        date: new Date(),
        status: serial.status,
        remark: remark || `Repair update`,
        quantity: 1,
        repairedQty: serial.status === "repaired" ? 1 : 0,
        irrepairedQty: serial.status === "irreparable" ? 1 : 0,
        updatedBy: updatedBy,
        cost: cost || 0
      });
      
      if (technician) serial.technician = technician;
      if (remark) serial.repairRemark = remark;
      if (cost) serial.repairCost = cost;
      
      updatedCount++;
    }
    
    if (updatedCount !== totalToUpdate) {
      throw new Error(`Only updated ${updatedCount} serials out of ${totalToUpdate}`);
    }
  } else {
    // For non-serialized products
    if (repairedQty) {
      this.repairedQty = (this.repairedQty || 0) + repairedQty;
    }
    
    if (irrepairedQty) {
      this.irrepairedQty = (this.irrepairedQty || 0) + irrepairedQty;
    }
    
    // Update underRepairQty
    this.underRepairQty = Math.max(0, this.underRepairQty - totalToUpdate);
  }

  // Update total repair cost
  if (cost) {
    this.totalRepairCost = (this.totalRepairCost || 0) + cost;
  }

  // Update status
  this.updateStatusAndQuantities();

  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: this.status,
    remark: remark || `Repair update: ${repairedQty || 0} repaired, ${irrepairedQty || 0} irrepaired`,
    quantity: totalToUpdate,
    updatedBy: updatedBy,
    cost: cost || 0
  });

  // Update completion dates if all items are processed
  if (this.status === "repaired" || this.status === "irreparable" || this.status === "completed") {
    this.actualCompletionDate = new Date();
    this.completedBy = updatedBy;
    this.completedAt = new Date();
  }

  return {
    success: true,
    status: this.status,
    repairedQty: this.repairedQty,
    irrepairedQty: this.irrepairedQty,
    underRepairQty: this.underRepairQty,
    totalRepairCost: this.totalRepairCost,
    actualCompletionDate: this.actualCompletionDate
  };
};

// Method to update status and quantities
repairTransferSchema.methods.updateStatusAndQuantities = function() {
  // For serialized products, sync quantities from serial numbers
  if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    const pendingCount = this.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
    const underRepairCount = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
    const repairedCount = this.serialNumbers.filter(sn => sn.status === "repaired").length;
    const irrepairedCount = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
    const returnedCount = this.serialNumbers.filter(sn => sn.status === "returned").length;
    
    this.pendingUnderRepairQty = pendingCount;
    this.underRepairQty = underRepairCount;
    this.repairedQty = repairedCount;
    this.irrepairedQty = irrepairedCount;
    this.returnedQty = returnedCount;
    
    // Ensure total matches
    const calculatedTotal = pendingCount + underRepairCount + repairedCount + irrepairedCount + returnedCount;
    if (calculatedTotal !== this.quantity) {
      console.warn(`Quantity mismatch in transfer ${this._id}: Calculated ${calculatedTotal}, Expected ${this.quantity}`);
    }
  }

  // Determine overall status
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
  } else {
    this.status = "pending_under_repair";
  }
};

// Method to get quantity summary
repairTransferSchema.methods.getQuantitySummary = function() {
  return {
    total: this.quantity,
    pendingUnderRepair: this.pendingUnderRepairQty || 0,
    underRepair: this.underRepairQty || 0,
    repaired: this.repairedQty || 0,
    irrepaired: this.irrepairedQty || 0,
    returned: this.returnedQty || 0,
    remaining: this.quantity - (this.pendingUnderRepairQty + this.underRepairQty + this.repairedQty + this.irrepairedQty + this.returnedQty)
  };
};

// Method to return items to source center
repairTransferSchema.methods.returnItems = function(returnQty, remark, returnedBy) {
  if (returnQty > (this.pendingUnderRepairQty + this.underRepairQty)) {
    throw new Error(`Cannot return ${returnQty} items. Only ${this.pendingUnderRepairQty + this.underRepairQty} items available for return`);
  }

  // First return from pending, then from under repair
  let remainingToReturn = returnQty;
  
  // Return pending items first
  if (this.pendingUnderRepairQty > 0) {
    const pendingToReturn = Math.min(remainingToReturn, this.pendingUnderRepairQty);
    this.pendingUnderRepairQty -= pendingToReturn;
    remainingToReturn -= pendingToReturn;
  }

  // Then return under repair items
  if (remainingToReturn > 0 && this.underRepairQty > 0) {
    const underRepairToReturn = Math.min(remainingToReturn, this.underRepairQty);
    this.underRepairQty -= underRepairToReturn;
    remainingToReturn -= underRepairToReturn;
  }

  // Update returned quantity
  this.returnedQty = (this.returnedQty || 0) + returnQty;

  // Add to repair updates
  this.repairUpdates.push({
    date: new Date(),
    status: this.status,
    remark: remark || `Returned ${returnQty} items to source center`,
    quantity: returnQty,
    updatedBy: returnedBy,
    cost: 0
  });

  // Update status
  this.updateStatusAndQuantities();

  return {
    success: true,
    returnedQty: returnQty,
    newPendingUnderRepairQty: this.pendingUnderRepairQty,
    newUnderRepairQty: this.underRepairQty,
    newReturnedQty: this.returnedQty,
    status: this.status
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