// import mongoose from 'mongoose';

// const faultyStockSchema = new mongoose.Schema({
//   batchNumber: {
//     type: String,
//     trim: true,
//     index: true
//   },
//   createdAt: {
//     type: Date,
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
//     default: 0,
//     min: 0
//   },
//   transferredQty: {
//     type: Number,
//     default: 0
//   },
//   damageQty: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   isSerialized: {
//     type: Boolean,
//     default: true
//   },
//   serialNumbers: [{
//     serialNumber: {
//       type: String,
//       trim: true,
//       required: function() {
//         return this.parent().isSerialized === true;
//       }
//     },
//     status: {
//       type: String,
//       enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "transferred","partially_repaired","pending_damage"],
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
//       default: 0
//     },
//     repairHistory: [{
//       date: {
//         type: Date,
//         default: Date.now
//       },
//       status: {
//         type: String,
//         enum: ["damaged", "under_repair", "repaired", "irreparable", "returned", "transferred","partially_repaired","pending_damage"]
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
//   repairHistory: [{
//     date: {
//       type: Date,
//       default: Date.now
//     },
//     status: {
//       type: String,
//       enum: ["damaged", "under_repair", "repaired", "irreparable", "returned", "transferred","pending_damage"]
//     },
//     remark: String,
//     quantity: {
//       type: Number,
//       default: 0
//     },
//     repairedQty: {
//       type: Number,
//       default: 0
//     },
//     irrepairedQty: {
//       type: Number,
//       default: 0
//     },
//     updatedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User"
//     },
//     cost: {
//       type: Number,
//       default: 0
//     }
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
//     enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "partially_repaired", "transferred","pending_damage"],
//     default: "pending_damage"
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

// faultyStockSchema.virtual('damagedQty').get(function() {
//   if (this.isSerialized) {
//     return this.serialNumbers.filter(sn => sn.status === "damaged").length;
//   } else {
//     return this.damageQty || 0;
//   }
// });

// faultyStockSchema.virtual('availableForRepairQty').get(function() {
//   return this.damageQty || 0;
// });

// faultyStockSchema.methods.validateQuantities = function() {
//   if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
//     const totalSerials = this.serialNumbers.length;
    
//     const totalRepairedFromSerials = this.serialNumbers
//       .filter(sn => sn.status === "repaired")
//       .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
//     const totalIrrepairedFromSerials = this.serialNumbers
//       .filter(sn => sn.status === "irreparable")
//       .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
//     const totalUnderRepairFromSerials = this.serialNumbers
//       .filter(sn => sn.status === "under_repair")
//       .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
//     const totalTransferredFromSerials = this.serialNumbers
//       .filter(sn => sn.status === "transferred")
//       .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
//     const totalDamagedFromSerials = this.serialNumbers
//       .filter(sn => sn.status === "damaged")
//       .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
//     this.repairedQty = totalRepairedFromSerials;
//     this.irrepairedQty = totalIrrepairedFromSerials;
//     this.underRepairQty = totalUnderRepairFromSerials;
//     this.transferredQty = totalTransferredFromSerials;
//     this.damageQty = totalDamagedFromSerials;
    
//     const totalFromSerials = totalRepairedFromSerials + totalIrrepairedFromSerials + 
//                            totalUnderRepairFromSerials + totalTransferredFromSerials + 
//                            totalDamagedFromSerials;
    
//     if (totalFromSerials !== this.quantity) {
//       console.warn(`Serial quantity mismatch for ${this._id}: Serial total=${totalFromSerials}, Expected=${this.quantity}`);
//       if (Math.abs(totalFromSerials - this.quantity) <= 1) {
//         this.quantity = totalFromSerials;
//       }
//     }
//   } else {
//     const calculatedTotal = (this.repairedQty || 0) + 
//                            (this.irrepairedQty || 0) + 
//                            (this.underRepairQty || 0) + 
//                            (this.transferredQty || 0) +
//                            (this.damageQty || 0);
    
//     const totalWithDamage = calculatedTotal;
    
//     if (totalWithDamage !== this.quantity) {
//       console.warn(`Non-serialized quantity mismatch for ${this._id}: Total=${totalWithDamage}, Expected=${this.quantity}`);
//       if (calculatedTotal > this.quantity) {
//         this.damageQty = Math.max(0, this.damageQty - (calculatedTotal - this.quantity));
//       } else if (calculatedTotal < this.quantity) {
//         this.damageQty = this.damageQty + (this.quantity - calculatedTotal);
//       }
//     }
//   }
  
//   return true;
// };

// // Method to update overall status and quantities
// // faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
// //   this.validateQuantities();
  
// //   // Handle non-serialized products
// //   if (!this.isSerialized || !this.serialNumbers || this.serialNumbers.length === 0) {
// //     // Ensure underRepairQty is not negative
// //     if (this.underRepairQty < 0) {
// //       this.underRepairQty = 0;
// //     }
    
// //     // Calculate damageQty based on current state
// //     const processedQty = (this.repairedQty || 0) + 
// //                          (this.irrepairedQty || 0) + 
// //                          (this.underRepairQty || 0);
    
// //     const calculatedDamageQty = Math.max(0, this.quantity - processedQty);
    
// //     // Update damageQty if it doesn't match calculated value
// //     if (this.damageQty !== calculatedDamageQty) {
// //       console.log(`Adjusting damageQty from ${this.damageQty} to ${calculatedDamageQty}`);
// //       this.damageQty = calculatedDamageQty;
// //     }
    
// //     console.log(`Non-serialized update: Total=${this.quantity}, DamageQty=${this.damageQty}, Repaired=${this.repairedQty}, UnderRepair=${this.underRepairQty}, Irrepaired=${this.irrepairedQty}`);
    
// //     // Update status based on quantities
// //     if (this.repairedQty === this.quantity) {
// //       this.overallStatus = "repaired";
// //       this.repairDate = this.repairDate || new Date();
// //     } else if (this.irrepairedQty === this.quantity) {
// //       this.overallStatus = "irreparable";
// //     } else if (this.transferredQty === this.quantity) {
// //       this.overallStatus = "transferred";
// //     } else if (this.underRepairQty === this.quantity) {
// //       this.overallStatus = "under_repair";
// //     } else if (this.underRepairQty > 0) {
// //       this.overallStatus = "partially_repaired";
// //     } else if (this.damageQty === this.quantity) {
// //       this.overallStatus = "damaged";
// //     } else {
// //       this.overallStatus = "partially_repaired";
// //     }
    
// //     this.lastRepairUpdate = new Date();
// //     return;
// //   }
  
  
// //   let totalRepaired = 0;
// //   let totalIrrepaired = 0;
// //   let totalUnderRepair = 0;
// //   let totalTransferred = 0;
// //   let totalDamaged = 0;
  
// //   this.serialNumbers.forEach(serial => {
// //     const serialQty = serial.quantity || 1;
    
// //     if (serial.status === "repaired") {
// //       totalRepaired += serialQty;
// //     } else if (serial.status === "irreparable") {
// //       totalIrrepaired += serialQty;
// //     } else if (serial.status === "transferred") {
// //       totalTransferred += serialQty;
// //     } else if (serial.status === "under_repair") {
// //       totalUnderRepair += serialQty;
// //     } else if (serial.status === "damaged") {
// //       totalDamaged += serialQty;
// //     }
    
// //     // Update serial's underRepairQty
// //     if (serial.status === "under_repair") {
// //       serial.underRepairQty = Math.max(0, serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
// //     } else if (serial.status === "damaged") {
// //       serial.underRepairQty = 0;
// //     }
// //   });
  
// //   this.repairedQty = totalRepaired;
// //   this.irrepairedQty = totalIrrepaired;
// //   this.transferredQty = totalTransferred;
// //   this.underRepairQty = totalUnderRepair;
// //   this.damageQty = totalDamaged;
  
// //   const calculatedTotal = totalRepaired + totalIrrepaired + totalTransferred + totalUnderRepair + totalDamaged;
// //   if (calculatedTotal !== this.quantity) {
// //     console.warn(`Final quantity mismatch for ${this._id}: ${calculatedTotal} vs ${this.quantity}`);
// //   }
  
// //   // Determine overall status
// //   if (this.repairedQty === this.quantity) {
// //     this.overallStatus = "repaired";
// //     this.repairDate = this.repairDate || new Date();
// //   } else if (this.irrepairedQty === this.quantity) {
// //     this.overallStatus = "irreparable";
// //   } else if (this.transferredQty === this.quantity) {
// //     this.overallStatus = "transferred";
// //   } else if (this.underRepairQty === this.quantity) {
// //     this.overallStatus = "under_repair";
// //   } else if (this.repairedQty > 0 || this.irrepairedQty > 0 || this.underRepairQty > 0) {
// //     this.overallStatus = "partially_repaired";
// //   } else {
// //     this.overallStatus = "damaged";
// //   }
  
// //   this.lastRepairUpdate = new Date();
// // };


// faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
//   this.validateQuantities();
  
//   if (!this.isSerialized || !this.serialNumbers || this.serialNumbers.length === 0) {
//     if (this.underRepairQty < 0) {
//       this.underRepairQty = 0;
//     }
//     const processedQty = (this.repairedQty || 0) + 
//                          (this.irrepairedQty || 0) + 
//                          (this.underRepairQty || 0) +
//                          (this.transferredQty || 0);
    
//     const calculatedDamageQty = Math.max(0, this.quantity - processedQty);
//     if (this.damageQty !== calculatedDamageQty) {
//       console.log(`Adjusting damageQty from ${this.damageQty} to ${calculatedDamageQty}`);
//       this.damageQty = calculatedDamageQty;
//     }
    
//     console.log(`Non-serialized update: Total=${this.quantity}, DamageQty=${this.damageQty}, Repaired=${this.repairedQty}, UnderRepair=${this.underRepairQty}, Irrepaired=${this.irrepairedQty}, Transferred=${this.transferredQty}`);
//     if (this.repairedQty === this.quantity) {
//       this.overallStatus = "repaired";
//       this.repairDate = this.repairDate || new Date();
//     } else if (this.irrepairedQty === this.quantity) {
//       this.overallStatus = "irreparable";
//     } else if (this.transferredQty === this.quantity) {
//       this.overallStatus = "transferred";
//     } else if (this.underRepairQty === this.quantity) {
//       this.overallStatus = "under_repair";
//     } else if (this.underRepairQty > 0) {
//       this.overallStatus = "partially_repaired";
//     } else if (this.damageQty === this.quantity) {
//       this.overallStatus = "damaged";
//     } else {
//       this.overallStatus = "partially_repaired";
//     }
    
//     this.lastRepairUpdate = new Date();
//     return;
//   }
//   let totalRepaired = 0;
//   let totalIrrepaired = 0;
//   let totalUnderRepair = 0;
//   let totalTransferred = 0;
//   let totalDamaged = 0;
  
//   this.serialNumbers.forEach(serial => {
//     const serialQty = serial.quantity || 1;
    
//     if (serial.status === "repaired") {
//       totalRepaired += serialQty;
//     } else if (serial.status === "irreparable") {
//       totalIrrepaired += serialQty;
//     } else if (serial.status === "transferred") {
//       totalTransferred += serialQty;
//     } else if (serial.status === "under_repair") {
//       totalUnderRepair += serialQty;
//     } else if (serial.status === "damaged") {
//       totalDamaged += serialQty;
//     }
//     if (serial.status === "under_repair") {
//       serial.underRepairQty = Math.max(0, serialQty - (serial.repairedQty || 0) - (serial.irrepairedQty || 0));
//     } else if (serial.status === "damaged") {
//       serial.underRepairQty = 0;
//     }
//   });
  
//   this.repairedQty = totalRepaired;
//   this.irrepairedQty = totalIrrepaired;
//   this.transferredQty = totalTransferred;
//   this.underRepairQty = totalUnderRepair;
//   this.damageQty = totalDamaged;
  
//   const calculatedTotal = totalRepaired + totalIrrepaired + totalTransferred + totalUnderRepair + totalDamaged;
//   if (calculatedTotal !== this.quantity) {
//     console.warn(`Final quantity mismatch for ${this._id}: ${calculatedTotal} vs ${this.quantity}`);
//   }
//   if (this.repairedQty === this.quantity) {
//     this.overallStatus = "repaired";
//     this.repairDate = this.repairDate || new Date();
//   } else if (this.irrepairedQty === this.quantity) {
//     this.overallStatus = "irreparable";
//   } else if (this.transferredQty === this.quantity) {
//     this.overallStatus = "transferred";
//   } else if (this.underRepairQty === this.quantity) {
//     this.overallStatus = "under_repair";
//   } else if (this.repairedQty > 0 || this.irrepairedQty > 0 || this.underRepairQty > 0) {
//     this.overallStatus = "partially_repaired";
//   } else {
//     this.overallStatus = "damaged";
//   }
  
//   this.lastRepairUpdate = new Date();
// };
// faultyStockSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy) {
//   if (!this.isSerialized) {
//     if (repairedQty + irrepairedQty > this.damageQty) {
//       throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${this.damageQty} damaged items available`);
//     }
//     this.damageQty -= (repairedQty + irrepairedQty);
//     this.repairedQty = (this.repairedQty || 0) + repairedQty;
//     this.irrepairedQty = (this.irrepairedQty || 0) + irrepairedQty;
    
//     this.updateQuantitiesAndStatus();
//     return;
//   }
//   const serial = this.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//   if (!serial) {
//     throw new Error(`Serial number ${serialNumber} not found in faulty stock`);
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
//     serial.repairDate = new Date();
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
//     remark: `Repair update: ${repairedQty} repaired, ${irrepairedQty} irrepaired`,
//     updatedBy: updatedBy
//   });
//   this.updateQuantitiesAndStatus();
// };
// faultyStockSchema.methods.transferToRepair = function(quantity, serialNumbers = [], transferredBy) {
//   if (this.isSerialized) {
//     const damagedSerials = this.serialNumbers.filter(sn => sn.status === "damaged");
    
//     if (serialNumbers.length > 0) {
//       let transferredCount = 0;
//       for (const serialNumber of serialNumbers) {
//         const serial = damagedSerials.find(sn => sn.serialNumber === serialNumber);
//         if (serial) {
//           serial.status = "under_repair";
//           serial.underRepairQty = 1;
//           transferredCount++;
          
//           serial.repairHistory.push({
//             date: new Date(),
//             status: "under_repair",
//             remark: "Transferred to repair center",
//             quantity: 1,
//             repairedQty: 0,
//             irrepairedQty: 0,
//             updatedBy: transferredBy
//           });
//         }
//       }
      
//       if (transferredCount !== quantity) {
//         throw new Error(`Transferred ${transferredCount} serials but expected ${quantity}`);
//       }
//     } else {
//       let transferredCount = 0;
//       for (let i = 0; i < Math.min(quantity, damagedSerials.length); i++) {
//         damagedSerials[i].status = "under_repair";
//         damagedSerials[i].underRepairQty = 1;
//         transferredCount++;
        
//         damagedSerials[i].repairHistory.push({
//           date: new Date(),
//           status: "under_repair",
//           remark: "Transferred to repair center",
//           quantity: 1,
//           repairedQty: 0,
//           irrepairedQty: 0,
//           updatedBy: transferredBy
//         });
//       }
      
//       if (transferredCount !== quantity) {
//         throw new Error(`Only found ${damagedSerials.length} damaged serials, but trying to transfer ${quantity}`);
//       }
//     }
//   } else {
//     if (quantity > this.damageQty) {
//       throw new Error(`Cannot transfer ${quantity} items. Only ${this.damageQty} damaged items available`);
//     }
  
//     this.damageQty -= quantity;
//     this.underRepairQty = (this.underRepairQty || 0) + quantity;
    
//     console.log(`Transferred ${quantity} non-serialized items to repair. DamageQty: ${this.damageQty}, UnderRepairQty: ${this.underRepairQty}`);
//   }

//   this.updateQuantitiesAndStatus();
  
//   return {
//     success: true,
//     transferred: quantity,
//     newStatus: this.overallStatus,
//     underRepairQty: this.underRepairQty,
//     damageQty: this.damageQty,
//     damagedQty: this.damagedQty
//   };
// };
// faultyStockSchema.methods.markAsRepairedFromRepair = function(quantity, finalStatus, remark, updatedBy) {
//   if (this.isSerialized) {
//     throw new Error("This method is only for non-serialized products");
//   }
  
//   console.log(`Marking ${quantity} non-serialized items as ${finalStatus}`);
//   console.log(`Before - UnderRepairQty: ${this.underRepairQty}, RepairedQty: ${this.repairedQty}, IrrepairedQty: ${this.irrepairedQty}`);

//   if (quantity > this.underRepairQty) {
//     throw new Error(`Cannot mark ${quantity} items. Only ${this.underRepairQty} items are under repair`);
//   }
//   this.underRepairQty = Math.max(0, this.underRepairQty - quantity);
  
//   if (finalStatus === "repaired") {
//     this.repairedQty = (this.repairedQty || 0) + quantity;
//   } else if (finalStatus === "irreparable") {
//     this.irrepairedQty = (this.irrepairedQty || 0) + quantity;
//   } else {
//     throw new Error(`Invalid final status: ${finalStatus}`);
//   }
  
//   console.log(`After - UnderRepairQty: ${this.underRepairQty}, RepairedQty: ${this.repairedQty}, IrrepairedQty: ${this.irrepairedQty}`);
  
//   if (!Array.isArray(this.repairHistory)) {
//     this.repairHistory = [];
//   }
  
//   this.repairHistory.push({
//     date: new Date(),
//     status: finalStatus,
//     remark: remark || `Marked ${quantity} items as ${finalStatus}`,
//     quantity: quantity,
//     repairedQty: finalStatus === "repaired" ? quantity : 0,
//     irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//     updatedBy: updatedBy
//   });
  
//   this.updateQuantitiesAndStatus();
  
//   return {
//     success: true,
//     quantity: quantity,
//     status: finalStatus,
//     newUnderRepairQty: this.underRepairQty,
//     newRepairedQty: this.repairedQty,
//     newIrrepairedQty: this.irrepairedQty,
//     overallStatus: this.overallStatus
//   };
// };

// faultyStockSchema.methods.getQuantitySummary = function() {
//   if (!this.isSerialized) {
//     return {
//       total: this.quantity,
//       repaired: this.repairedQty || 0,
//       irrepaired: this.irrepairedQty || 0,
//       underRepair: this.underRepairQty || 0,
//       transferred: this.transferredQty || 0,
//       damageQty: this.damageQty || 0,
//       damaged: this.damagedQty,
//       availableForRepair: this.damageQty || 0
//     };
//   }

//   const underRepair = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
//   const repaired = this.serialNumbers.filter(sn => sn.status === "repaired").length;
//   const irreparable = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
//   const transferred = this.serialNumbers.filter(sn => sn.status === "transferred").length;
//   const damaged = this.serialNumbers.filter(sn => sn.status === "damaged").length;
  
//   return {
//     total: this.quantity,
//     repaired: repaired,
//     irrepaired: irreparable,
//     underRepair: underRepair,
//     transferred: transferred,
//     damageQty: damaged,
//     damaged: damaged,
//     availableForRepair: damaged
//   };
// };

// faultyStockSchema.pre('save', function(next) {
//   if (this.damageQty === undefined || this.damageQty === null) {
//     if (!this.isSerialized) {
//       this.damageQty = this.quantity;
//     } else {
//       this.damageQty = 0;
//     }
//   }
//   if (this.underRepairQty === undefined || this.underRepairQty === null) {
//     this.underRepairQty = 0;
//   }
//   if (!this.overallStatus) {
//     this.overallStatus = "damaged";
//   }
//   if (!this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
//     console.warn(`Non-serialized product ${this._id} has serial numbers. Clearing them.`);
//     this.serialNumbers = [];
//   }
//   if (this.isSerialized && this.serialNumbers) {
//     this.serialNumbers.forEach(serial => {
//       if (!serial.status) {
//         serial.status = "damaged";
//       }
//       if (serial.status === "damaged" && serial.underRepairQty !== 0) {
//         serial.underRepairQty = 0;
//       }
//     });
//   }
  
//   this.updateQuantitiesAndStatus();
  
//   next();
// });

// export default mongoose.model("FaultyStock", faultyStockSchema);


////***********  below is add accept functionality *******



import mongoose from 'mongoose';
const faultyStockSchema = new mongoose.Schema({
  batchNumber: {
    type: String,
    trim: true,
    index: true
  },
  createdAt: {
    type: Date,
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
    min: 0,
    default: 0
  },
  pendingDamageQty: {
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
  underRepairQty: {
    type: Number,
    default: 0,
    min: 0
  },
  transferredQty: {
    type: Number,
    default: 0
  },
  damageQty: {
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
      enum: ["pending_damage", "damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "transferred", "partially_repaired","pending_under_repair"],
      default: "pending_damage"
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
        enum: ["pending_damage", "damaged", "under_repair", "repaired", "irreparable", "returned", "transferred", "partially_repaired", "rejected"]
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
  pendingDamageHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    quantity: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending"
    },
    remark: String,
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    usageReference: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockUsage"
    },
    serialNumbers: [String],
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    acceptedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    rejectedAt: Date
  }],
  repairHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending_damage", "damaged", "under_repair", "repaired", "irreparable", "returned", "transferred", "rejected","pending_under_repair"]
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
    enum: ["pending_damage", "damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "partially_repaired", "transferred","pending_under_repair"],
    default: "pending_damage"
  },
  damageDate: {
    type: Date,
    default: Date.now
  },
  repairDate: Date,
  disposalDate: Date,
  vendorReturnDate: Date,
  lastRepairUpdate: Date,
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  acceptedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  rejectedAt: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for damaged quantity
faultyStockSchema.virtual('damagedQty').get(function() {
  if (this.isSerialized) {
    return this.serialNumbers.filter(sn => sn.status === "damaged").length;
  } else {
    return this.damageQty || 0;
  }
});

// Virtual for pending damage quantity
faultyStockSchema.virtual('totalPendingDamageQty').get(function() {
  if (this.isSerialized) {
    return this.serialNumbers.filter(sn => sn.status === "pending_damage").length;
  } else {
    return this.pendingDamageQty || 0;
  }
});

// Virtual for available for repair quantity
faultyStockSchema.virtual('availableForRepairQty').get(function() {
  return this.damageQty || 0;
});

// Method to validate quantities before saving
faultyStockSchema.methods.validateQuantities = function() {
  if (this.isSerialized && this.serialNumbers && this.serialNumbers.length > 0) {
    const totalSerials = this.serialNumbers.length;
    
    const totalPendingFromSerials = this.serialNumbers
      .filter(sn => sn.status === "pending_damage")
      .reduce((sum, sn) => sum + (sn.quantity || 1), 0);
    
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
    
    this.pendingDamageQty = totalPendingFromSerials;
    this.repairedQty = totalRepairedFromSerials;
    this.irrepairedQty = totalIrrepairedFromSerials;
    this.underRepairQty = totalUnderRepairFromSerials;
    this.transferredQty = totalTransferredFromSerials;
    this.damageQty = totalDamagedFromSerials;
    
    const totalFromSerials = totalPendingFromSerials + totalRepairedFromSerials + totalIrrepairedFromSerials + 
                           totalUnderRepairFromSerials + totalTransferredFromSerials + 
                           totalDamagedFromSerials;
    
    if (totalFromSerials !== this.quantity) {
      console.warn(`Serial quantity mismatch for ${this._id}: Serial total=${totalFromSerials}, Expected=${this.quantity}`);
      if (Math.abs(totalFromSerials - this.quantity) <= 1) {
        this.quantity = totalFromSerials;
      }
    }
  } else {
    // FIXED: For non-serialized products, quantity should be sum of all categories
    const totalFromAllQuantities = 
      (this.pendingDamageQty || 0) + 
      (this.damageQty || 0) + 
      (this.underRepairQty || 0) +
      (this.repairedQty || 0) + 
      (this.irrepairedQty || 0) + 
      (this.transferredQty || 0);
    
    // Update quantity to match the sum if different
    if (this.quantity !== totalFromAllQuantities) {
      console.log(`Non-serialized quantity adjustment: ${this.quantity} -> ${totalFromAllQuantities}`);
      this.quantity = totalFromAllQuantities;
    }
  }
  
  return true;
};

// Method to update overall status and quantities
faultyStockSchema.methods.updateQuantitiesAndStatus = function() {
  this.validateQuantities();
  
  // Handle non-serialized products
  if (!this.isSerialized || !this.serialNumbers || this.serialNumbers.length === 0) {
    console.log(`Non-serialized update - Before: Quantity=${this.quantity}, PendingDamageQty=${this.pendingDamageQty}, DamageQty=${this.damageQty}`);
    
    // FIXED: Don't recalculate damageQty - it should remain as set
    // Status logic - pending_damage takes priority
    if (this.pendingDamageQty > 0) {
      this.overallStatus = "pending_damage";
      console.log(`Setting status to pending_damage because pendingDamageQty=${this.pendingDamageQty}`);
    } else if (this.damageQty > 0) {
      this.overallStatus = "damaged";
      console.log(`Setting status to damaged because damageQty=${this.damageQty}`);
    } else if (this.repairedQty > 0 && this.repairedQty === this.quantity) {
      this.overallStatus = "repaired";
      this.repairDate = this.repairDate || new Date();
    } else if (this.irrepairedQty > 0 && this.irrepairedQty === this.quantity) {
      this.overallStatus = "irreparable";
    } else if (this.transferredQty > 0 && this.transferredQty === this.quantity) {
      this.overallStatus = "transferred";
    } else if (this.underRepairQty > 0 && this.underRepairQty === this.quantity) {
      this.overallStatus = "under_repair";
    } else if (this.underRepairQty > 0) {
      this.overallStatus = "partially_repaired";
    } else {
      // If all quantities are 0, default to pending_damage
      if (this.quantity === 0) {
        this.overallStatus = "pending_damage";
      } else {
        this.overallStatus = "damaged";
      }
    }
    
    this.lastRepairUpdate = new Date();
    console.log(`Non-serialized update - After: OverallStatus=${this.overallStatus}`);
    return;
  }
  
  // Handle serialized products
  let totalPending = 0;
  let totalRepaired = 0;
  let totalIrrepaired = 0;
  let totalUnderRepair = 0;
  let totalTransferred = 0;
  let totalDamaged = 0;
  
  this.serialNumbers.forEach(serial => {
    const serialQty = serial.quantity || 1;
    
    if (serial.status === "pending_damage") {
      totalPending += serialQty;
    } else if (serial.status === "repaired") {
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
    } else if (serial.status === "pending_damage" || serial.status === "damaged") {
      serial.underRepairQty = 0;
    }
  });
  
  // Update pending damage quantity for serialized products
  this.pendingDamageQty = totalPending;
  this.repairedQty = totalRepaired;
  this.irrepairedQty = totalIrrepaired;
  this.transferredQty = totalTransferred;
  this.underRepairQty = totalUnderRepair;
  this.damageQty = totalDamaged;
  
  const calculatedTotal = totalPending + totalRepaired + totalIrrepaired + totalTransferred + totalUnderRepair + totalDamaged;
  if (calculatedTotal !== this.quantity) {
    console.warn(`Final quantity mismatch for ${this._id}: ${calculatedTotal} vs ${this.quantity}`);
    this.quantity = calculatedTotal;
  }
  
  // Determine overall status with pending_damage as priority
  if (totalPending > 0) {
    this.overallStatus = "pending_damage";
  } else if (this.repairedQty === this.quantity) {
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
  } else if (this.damageQty === this.quantity) {
    this.overallStatus = "damaged";
  } else {
    this.overallStatus = "pending_damage";
  }
  
  this.lastRepairUpdate = new Date();
};

// Method to accept pending damage items
faultyStockSchema.methods.acceptPendingDamage = function(acceptedQuantities, acceptedBy, remark) {
  if (this.overallStatus !== "pending_damage" && this.pendingDamageQty <= 0) {
    throw new Error("No pending damage items to accept");
  }
  
  console.log(`Accepting pending damage for ${this._id}`);
  console.log(`Before accept - Quantity: ${this.quantity}, PendingDamageQty: ${this.pendingDamageQty}, DamageQty: ${this.damageQty}`);
  
  if (this.isSerialized) {
    // For serialized products
    const pendingSerials = this.serialNumbers.filter(sn => sn.status === "pending_damage");
    
    if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
      // Accept specific serials
      for (const accepted of acceptedQuantities) {
        const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
        if (serial) {
          // Update serial status to damaged
          serial.status = "damaged";
          
          // Update repair history
          serial.repairHistory.push({
            date: new Date(),
            status: "damaged",
            remark: accepted.remark || remark || "Damage accepted and verified",
            quantity: 1,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: acceptedBy
          });
          
          console.log(`Accepted serial: ${accepted.serialNumber}`);
        }
      }
    } else {
      // Accept all pending serials
      pendingSerials.forEach(serial => {
        serial.status = "damaged";
        serial.repairHistory.push({
          date: new Date(),
          status: "damaged",
          remark: remark || "Damage accepted and verified",
          quantity: 1,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: acceptedBy
        });
      });
    }
  } else {
    // For non-serialized products
    const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
      ? acceptedQuantities.totalAcceptedQty 
      : this.pendingDamageQty;
    
    if (totalAccepted > this.pendingDamageQty) {
      throw new Error(`Cannot accept ${totalAccepted} items. Only ${this.pendingDamageQty} pending items available`);
    }
    
    // FIXED: For non-serialized, we don't need to update quantity here
    // because quantity is already the total sum (pending + damage + repaired, etc.)
    // Just move items from pending to damaged
    
    this.pendingDamageQty = Math.max(0, this.pendingDamageQty - totalAccepted);
    this.damageQty = (this.damageQty || 0) + totalAccepted;
    
    // Update pending damage history
    if (this.pendingDamageHistory && this.pendingDamageHistory.length > 0) {
      const pendingEntries = this.pendingDamageHistory.filter(entry => entry.status === "pending");
      if (pendingEntries.length > 0) {
        // Update the oldest pending entry
        const pendingEntry = pendingEntries[0];
        pendingEntry.status = "accepted";
        pendingEntry.acceptedBy = acceptedBy;
        pendingEntry.acceptedAt = new Date();
        pendingEntry.remark = remark || pendingEntry.remark;
      }
    }
    
    // Add to repair history
    if (!this.repairHistory) {
      this.repairHistory = [];
    }
    
    this.repairHistory.push({
      date: new Date(),
      status: "damaged",
      remark: remark || `Accepted ${totalAccepted} damaged items`,
      quantity: totalAccepted,
      repairedQty: 0,
      irrepairedQty: 0,
      updatedBy: acceptedBy
    });
  }
  
  // Update timestamps
  this.acceptedBy = acceptedBy;
  this.acceptedAt = new Date();
  
  // Update overall status
  this.updateQuantitiesAndStatus();
  
  console.log(`After accept - Quantity: ${this.quantity}, PendingDamageQty: ${this.pendingDamageQty}, DamageQty: ${this.damageQty}, Status: ${this.overallStatus}`);
  
  return {
    success: true,
    message: "Damage items accepted successfully",
    data: {
      overallStatus: this.overallStatus,
      totalQuantity: this.quantity,
      damageQty: this.damageQty,
      pendingDamageQty: this.pendingDamageQty
    }
  };
};

// Method to reject pending damage items
faultyStockSchema.methods.rejectPendingDamage = function(rejectedQuantities, rejectedBy, remark) {
  if (this.overallStatus !== "pending_damage" && this.pendingDamageQty <= 0) {
    throw new Error("No pending damage items to reject");
  }
  
  console.log(`Rejecting pending damage for ${this._id}`);
  console.log(`Before reject - Quantity: ${this.quantity}, PendingDamageQty: ${this.pendingDamageQty}`);
  
  if (this.isSerialized) {
    // For serialized products
    if (rejectedQuantities && Array.isArray(rejectedQuantities)) {
      // Remove specific rejected serials
      this.serialNumbers = this.serialNumbers.filter(sn => 
        !rejectedQuantities.includes(sn.serialNumber) || sn.status !== "pending_damage"
      );
    } else {
      // Remove all pending serials
      this.serialNumbers = this.serialNumbers.filter(sn => 
        sn.status !== "pending_damage"
      );
    }
  } else {
    // For non-serialized products
    const totalRejected = rejectedQuantities && rejectedQuantities.totalRejectedQty 
      ? rejectedQuantities.totalRejectedQty 
      : this.pendingDamageQty;
    
    // Just reduce pending damage quantity
    this.pendingDamageQty = Math.max(0, this.pendingDamageQty - totalRejected);
    
    // Update pending damage history
    if (this.pendingDamageHistory && this.pendingDamageHistory.length > 0) {
      const pendingEntries = this.pendingDamageHistory.filter(entry => entry.status === "pending");
      if (pendingEntries.length > 0) {
        // Update the oldest pending entry
        const pendingEntry = pendingEntries[0];
        pendingEntry.status = "rejected";
        pendingEntry.rejectedBy = rejectedBy;
        pendingEntry.rejectedAt = new Date();
        pendingEntry.remark = remark || pendingEntry.remark;
      }
    }
    
    // Add rejection to history
    if (!this.repairHistory) {
      this.repairHistory = [];
    }
    
    this.repairHistory.push({
      date: new Date(),
      status: "rejected",
      remark: remark || `Rejected ${totalRejected} damage items`,
      quantity: totalRejected,
      repairedQty: 0,
      irrepairedQty: 0,
      updatedBy: rejectedBy
    });
  }
  
  // Update timestamps
  this.rejectedBy = rejectedBy;
  this.rejectedAt = new Date();
  
  // Update overall status
  this.updateQuantitiesAndStatus();
  
  console.log(`After reject - Quantity: ${this.quantity}, PendingDamageQty: ${this.pendingDamageQty}, Status: ${this.overallStatus}`);
  
  // If no items left, mark for deletion
  const shouldDelete = this.quantity === 0 && this.pendingDamageQty === 0;
  
  return {
    success: true,
    message: "Damage items rejected successfully",
    data: {
      overallStatus: this.overallStatus,
      totalQuantity: this.quantity,
      damageQty: this.damageQty,
      pendingDamageQty: this.pendingDamageQty,
      shouldDelete: shouldDelete
    }
  };
};

// Method to update repair quantities for a serial/batch
faultyStockSchema.methods.updateRepairQuantities = function(serialNumber, repairedQty, irrepairedQty, updatedBy) {
  if (!this.isSerialized) {
    // For non-serialized products, update directly
    if (repairedQty + irrepairedQty > this.damageQty) {
      throw new Error(`Cannot process ${repairedQty + irrepairedQty} items. Only ${this.damageQty} damaged items available`);
    }
    
    // Reduce damageQty and add to repaired/irrepaired
    this.damageQty -= (repairedQty + irrepairedQty);
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
    if (quantity > this.damageQty) {
      throw new Error(`Cannot transfer ${quantity} items. Only ${this.damageQty} damaged items available`);
    }
    
    // Reduce damageQty and increase underRepairQty
    this.damageQty -= quantity;
    this.underRepairQty = (this.underRepairQty || 0) + quantity;
    
    console.log(`Transferred ${quantity} non-serialized items to repair. DamageQty: ${this.damageQty}, UnderRepairQty: ${this.underRepairQty}`);
  }
  
  // Update overall status
  this.updateQuantitiesAndStatus();
  
  return {
    success: true,
    transferred: quantity,
    newStatus: this.overallStatus,
    underRepairQty: this.underRepairQty,
    damageQty: this.damageQty,
    damagedQty: this.damagedQty
  };
};

// Method to mark non-serialized items as repaired from repair center
faultyStockSchema.methods.markAsRepairedFromRepair = function(quantity, finalStatus, remark, updatedBy) {
  if (this.isSerialized) {
    throw new Error("This method is only for non-serialized products");
  }
  
  console.log(`Marking ${quantity} non-serialized items as ${finalStatus}`);
  console.log(`Before - UnderRepairQty: ${this.underRepairQty}, RepairedQty: ${this.repairedQty}, IrrepairedQty: ${this.irrepairedQty}`);
  
  // Validate
  if (quantity > this.underRepairQty) {
    throw new Error(`Cannot mark ${quantity} items. Only ${this.underRepairQty} items are under repair`);
  }
  
  // Update underRepairQty and corresponding status
  this.underRepairQty = Math.max(0, this.underRepairQty - quantity);
  
  if (finalStatus === "repaired") {
    this.repairedQty = (this.repairedQty || 0) + quantity;
  } else if (finalStatus === "irreparable") {
    this.irrepairedQty = (this.irrepairedQty || 0) + quantity;
  } else {
    throw new Error(`Invalid final status: ${finalStatus}`);
  }
  
  console.log(`After - UnderRepairQty: ${this.underRepairQty}, RepairedQty: ${this.repairedQty}, IrrepairedQty: ${this.irrepairedQty}`);
  
  // Add to repair history
  if (!Array.isArray(this.repairHistory)) {
    this.repairHistory = [];
  }
  
  this.repairHistory.push({
    date: new Date(),
    status: finalStatus,
    remark: remark || `Marked ${quantity} items as ${finalStatus}`,
    quantity: quantity,
    repairedQty: finalStatus === "repaired" ? quantity : 0,
    irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
    updatedBy: updatedBy
  });
  
  // Update overall status
  this.updateQuantitiesAndStatus();
  
  return {
    success: true,
    quantity: quantity,
    status: finalStatus,
    newUnderRepairQty: this.underRepairQty,
    newRepairedQty: this.repairedQty,
    newIrrepairedQty: this.irrepairedQty,
    overallStatus: this.overallStatus
  };
};

faultyStockSchema.methods.getQuantitySummary = function() {
  if (!this.isSerialized) {
    return {
      total: this.quantity,
      pendingDamage: this.pendingDamageQty || 0,
      repaired: this.repairedQty || 0,
      irrepaired: this.irrepairedQty || 0,
      underRepair: this.underRepairQty || 0,
      transferred: this.transferredQty || 0,
      damageQty: this.damageQty || 0,
      damaged: this.damagedQty,
      availableForRepair: this.damageQty || 0
    };
  }
  
  // For serialized products
  const pendingDamage = this.serialNumbers.filter(sn => sn.status === "pending_damage").length;
  const underRepair = this.serialNumbers.filter(sn => sn.status === "under_repair").length;
  const repaired = this.serialNumbers.filter(sn => sn.status === "repaired").length;
  const irreparable = this.serialNumbers.filter(sn => sn.status === "irreparable").length;
  const transferred = this.serialNumbers.filter(sn => sn.status === "transferred").length;
  const damaged = this.serialNumbers.filter(sn => sn.status === "damaged").length;
  
  return {
    total: this.quantity,
    pendingDamage: pendingDamage,
    repaired: repaired,
    irrepaired: irreparable,
    underRepair: underRepair,
    transferred: transferred,
    damageQty: damaged,
    damaged: damaged,
    availableForRepair: damaged
  };
};

// Pre-save middleware to ensure consistency
faultyStockSchema.pre('save', function(next) {
  // Ensure damageQty is calculated if not set
  if (this.damageQty === undefined || this.damageQty === null) {
    this.damageQty = 0;
  }
  
  // Ensure pendingDamageQty is calculated if not set
  if (this.pendingDamageQty === undefined || this.pendingDamageQty === null) {
    this.pendingDamageQty = 0;
  }
  
  // Ensure underRepairQty is calculated if not set
  if (this.underRepairQty === undefined || this.underRepairQty === null) {
    this.underRepairQty = 0;
  }
  
  // Ensure overallStatus is set for new documents
  if (!this.overallStatus) {
    this.overallStatus = "pending_damage";
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
        serial.status = "pending_damage";
      }
      if ((serial.status === "damaged" || serial.status === "pending_damage") && serial.underRepairQty !== 0) {
        serial.underRepairQty = 0;
      }
    });
  }
  
  this.updateQuantitiesAndStatus();
  
  next();
});

export default mongoose.model("FaultyStock", faultyStockSchema);