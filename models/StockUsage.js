import mongoose from "mongoose";

const stockUsageSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    usageType: {
      type: String,
      required: true,
      enum: [
        "Customer",
        "Building",
        "Building to Building",
        "Control Room",
        "Damage",
        "Stolen from Center",
        "Stolen from Field",
        "Damage Return",
        "Other",
      ],
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
    },
    remark: {
      type: String,
      trim: true,
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
    damageReason: {
      type: String,
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

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
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
        serialNumbers: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],

    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
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
    },


    originalUsageType: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changeDate: Date,
    changeRemark: String,


    revertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    revertRemark: {
      type: String,
      trim: true,
    },
    revertDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

stockUsageSchema.index({ center: 1, date: -1 });
stockUsageSchema.index({ toCenter: 1 }); 
stockUsageSchema.index({ usageType: 1 });
stockUsageSchema.index({ customer: 1 });
stockUsageSchema.index({ fromBuilding: 1 });
stockUsageSchema.index({ toBuilding: 1 });
stockUsageSchema.index({ fromControlRoom: 1 });
stockUsageSchema.index({ status: 1 });
stockUsageSchema.index({ usageType: 1, status: 1 });

stockUsageSchema.pre("save", function (next) {
  switch (this.usageType) {
    case "Customer":
      if (!this.customer) {
        return next(new Error("Customer is required for customer usage type"));
      }
      break;

    case "Building":
      if (!this.fromBuilding) {
        return next(
          new Error("From Building is required for building usage type")
        );
      }
      break;

    case "Building to Building":
      if (!this.fromBuilding || !this.toBuilding) {
        return next(
          new Error(
            "Both From Building and To Building are required for building to building usage type"
          )
        );
      }
      break;

    case "Control Room":
      if (!this.fromControlRoom) {
        return next(
          new Error("From Control Room is required for control room usage type")
        );
      }
      break;

    case "Damage":
      if (!this.toCenter) {
        return next(
          new Error("To Center is required for damage usage type")
        );
      }
      if (!this.damageReason) {
        return next(
          new Error("Damage reason is required for damage usage type")
        );
      }
      break;

    case "Stolen from Center":
    case "Stolen from Field":
    case "Other":
      break;
  }
  next();
});

stockUsageSchema.statics.createStockUsage = async function (usageData) {
  try {
    const StockUsage = mongoose.model("StockUsage");
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    for (let item of usageData.items) {
      const product = await Product.findById(item.product);
      if (!product) {
        throw new Error(`Product ${item.product} not found`);
      }

      const centerStock = await CenterStock.findOne({
        center: usageData.center,
        product: item.product,
      });

      if (!centerStock || centerStock.availableQuantity < item.quantity) {
        throw new Error(
          `Insufficient stock for product ${product.productTitle}`
        );
      }

      item.oldStock = centerStock.availableQuantity;
      item.newStock = centerStock.availableQuantity - item.quantity;
      item.totalStock = centerStock.totalQuantity;

      if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
        const availableSerials = centerStock.validateAndGetSerials(
          item.serialNumbers,
          usageData.center
        );

        if (availableSerials.length !== item.serialNumbers.length) {
          throw new Error("Some serial numbers are not available or invalid");
        }
      }
    }

    const stockUsage = new StockUsage(usageData);
    await stockUsage.save();

    if (usageData.usageType !== "Damage") {
      await stockUsage.processStockDeduction();
    } else {
      await stockUsage.reserveStockForDamage();
    }

    return stockUsage;
  } catch (error) {
    throw error;
  }
};

stockUsageSchema.methods.processStockDeduction = async function () {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    for (let item of this.items) {
      const product = await Product.findById(item.product);

      if (product.trackSerialNumber === "No") {
        await CenterStock.findOneAndUpdate(
          {
            center: this.center,
            product: item.product,
          },
          {
            $inc: {
              totalQuantity: -item.quantity,
              availableQuantity: -item.quantity,
            },
          },
          { session }
        );
      } else {
        const centerStock = await CenterStock.findOne({
          center: this.center,
          product: item.product,
        }).session(session);

        if (centerStock && item.serialNumbers) {
          for (const serialNumber of item.serialNumbers) {
            const serial = centerStock.serialNumbers.find(
              (sn) =>
                sn.serialNumber === serialNumber && sn.status === "available"
            );

            if (serial) {
              serial.status = "consumed";
              serial.currentLocation = null;
              serial.consumedDate = new Date();
              serial.consumedBy = this.createdBy;
              serial.transferHistory.push({
                fromCenter: this.center,
                toCenter: this.toCenter, // Added toCenter to transfer history
                transferDate: new Date(),
                transferType:
                  this.usageType === "Damage"
                    ? "damage_reserved"
                    : "field_usage",
                usageType: this.usageType,
                referenceId: this._id,
                remark: this.remark,
              });
            }
          }

          await centerStock.save({ session });
        }
      }

      if (this.usageType !== "Damage") {
        await this.addStockToEntity(item, session);
      }
    }

    if (this.usageType !== "Damage") {
      this.status = "completed";
      await this.save({ session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

stockUsageSchema.methods.reserveStockForDamage = async function () {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    for (let item of this.items) {
      const product = await Product.findById(item.product);
      const centerStock = await CenterStock.findOne({
        center: this.center,
        product: item.product,
      }).session(session);

      if (!centerStock) continue;

      if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
        for (const serialNumber of item.serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (sn) =>
              sn.serialNumber === serialNumber && sn.status === "available"
          );

          if (serial) {
            serial.status = "consumed";
            serial.currentLocation = null;
            serial.consumedDate = new Date();
            serial.consumedBy = this.createdBy;
            serial.transferHistory.push({
              fromCenter: this.center,
              toCenter: this.toCenter, 
              transferDate: new Date(),
              transferType: "damage_reserved",
              usageType: this.usageType,
              referenceId: this._id,
              remark: this.remark || "Reserved for damage approval",
            });
          }
        }

        centerStock.availableQuantity -= item.quantity;
        centerStock.consumedQuantity += item.quantity;
      } else {
        centerStock.availableQuantity -= item.quantity;
        centerStock.totalQuantity -= item.quantity;
      }

      await centerStock.save({ session });
    }

    this.status = "pending";
    await this.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

stockUsageSchema.methods.approveDamage = async function (
  approvedBy,
  approvalRemark
) {
  if (this.usageType !== "Damage") {
    throw new Error("Only damage requests can be approved");
  }

  if (this.status !== "pending") {
    throw new Error("Only pending damage requests can be approved");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    for (let item of this.items) {
      const product = await Product.findById(item.product);
      const centerStock = await CenterStock.findOne({
        center: this.center,
        product: item.product,
      }).session(session);

      if (!centerStock) continue;

      if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
        for (const serialNumber of item.serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (sn) => sn.serialNumber === serialNumber && sn.status === "consumed"
          );

          if (serial) {
            serial.status = "damaged";
            serial.transferHistory.push({
              fromCenter: this.center,
              transferDate: new Date(),
              transferType: "damage_approved",
              usageType: this.usageType,
              referenceId: this._id,
              remark: approvalRemark || "Damage approved",
            });
          }
        }
      } else {
      }

      await centerStock.save({ session });
    }

    this.status = "completed";
    this.approvedBy = approvedBy;
    this.approvalRemark = approvalRemark;
    this.approvalDate = new Date();
    await this.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

stockUsageSchema.methods.rejectDamage = async function (
  rejectedBy,
  rejectionRemark
) {
  if (this.usageType !== "Damage") {
    throw new Error("Only damage requests can be rejected");
  }

  if (this.status !== "pending") {
    throw new Error("Only pending damage requests can be rejected");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    for (let item of this.items) {
      const product = await Product.findById(item.product);
      const centerStock = await CenterStock.findOne({
        center: this.center,
        product: item.product,
      }).session(session);

      if (!centerStock) continue;

      if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
        for (const serialNumber of item.serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (sn) => sn.serialNumber === serialNumber && sn.status === "consumed"
          );

          if (serial) {
            serial.status = "available";
            serial.currentLocation = this.center;
            serial.consumedDate = null;
            serial.consumedBy = null;
            serial.transferHistory.push({
              fromCenter: null,
              toCenter: this.center,
              transferDate: new Date(),
              transferType: "damage_rejected",
              usageType: this.usageType,
              referenceId: this._id,
              remark: rejectionRemark || "Damage rejected - stock restored",
            });
          }
        }

        centerStock.availableQuantity += item.quantity;
        centerStock.consumedQuantity = Math.max(
          0,
          centerStock.consumedQuantity - item.quantity
        );
      } else {
        centerStock.availableQuantity += item.quantity;
        centerStock.totalQuantity += item.quantity;
      }

      await centerStock.save({ session });
    }

    this.status = "cancelled";
    this.rejectedBy = rejectedBy;
    this.rejectionRemark = rejectionRemark;
    this.rejectionDate = new Date();
    await this.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

stockUsageSchema.methods.addStockToEntity = async function (item, session) {
  try {
    const EntityStock = mongoose.model("EntityStock");
    const entityType = this.getEntityType();
    const entityId = this.getEntityId();

    if (!entityId) return;

    await EntityStock.updateStock(
      entityType,
      entityId,
      item.product,
      item.quantity,
      item.serialNumbers || [],
      this._id
    );
  } catch (error) {
    throw error;
  }
};

stockUsageSchema.methods.getEntityType = function () {
  switch (this.usageType) {
    case "Customer":
      return "customer";
    case "Building":
    case "Building to Building":
      return "building";
    case "Control Room":
      return "controlRoom";
    case "Damage":
      return "damage";
    case "Stolen from Center":
    case "Stolen from Field":
      return "stolen";
    case "Other":
      return "other";
    default:
      return null;
  }
};

stockUsageSchema.methods.getEntityId = function () {
  switch (this.usageType) {
    case "Customer":
      return this.customer;
    case "Building":
      return this.fromBuilding;
    case "Building to Building":
      return this.toBuilding;
    case "Control Room":
      return this.fromControlRoom;
    case "Damage":
    case "Stolen from Center":
    case "Stolen from Field":
    case "Other":
      return this.center;
    default:
      return null;
  }
};

stockUsageSchema.methods.cancelStockUsage = async function () {
  if (this.status !== "completed") {
    throw new Error("Only completed stock usage can be cancelled");
  }

  if (this.usageType === "Damage" && this.approvedBy) {
    throw new Error("Approved damage requests cannot be cancelled");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");
    const EntityStock = mongoose.model("EntityStock");

    for (let item of this.items) {
      const product = await Product.findById(item.product);
      const entityType = this.getEntityType();
      const entityId = this.getEntityId();

      if (product.trackSerialNumber === "No") {
        await CenterStock.findOneAndUpdate(
          {
            center: this.center,
            product: item.product,
          },
          {
            $inc: {
              totalQuantity: item.quantity,
              availableQuantity: item.quantity,
            },
          },
          { session }
        );
      }

      if (entityId) {
        await EntityStock.updateStock(
          entityType,
          entityId,
          item.product,
          -item.quantity,
          [],
          this._id
        );
      }
    }

    this.status = "cancelled";
    await this.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// stockUsageSchema.methods.revertDamage = async function (revertedBy, revertRemark) {
//   if (this.usageType !== "Damage") {
//     throw new Error("Only damage entries can be reverted");
//   }

//   if (this.status !== "completed") {
//     throw new Error("Only completed damage entries can be reverted");
//   }

//   try {
//     const CenterStock = mongoose.model("CenterStock");
//     const Product = mongoose.model("Product");
//     const FaultyStock = mongoose.model("FaultyStock");

//     for (let item of this.items) {
//       const product = await Product.findById(item.product);

//       const faultyStock = await FaultyStock.findOne({
//         usageReference: this._id,
//         product: item.product,
//         center: this.center,
//       });

//       if (faultyStock) {

//         if (faultyStock.overallStatus === "damaged" || 
//             faultyStock.overallStatus === "under_repair" || 
//             faultyStock.overallStatus === "repaired" || 
//             faultyStock.overallStatus === "irreparable") {

//           if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
//             const acceptedSerials = [];
//             for (const serialNumber of item.serialNumbers) {
//               const serialInFaulty = faultyStock.serialNumbers.find(
//                 sn => sn.serialNumber === serialNumber
//               );
              
//               if (serialInFaulty && 
//                   (serialInFaulty.status === "damaged" || 
//                    serialInFaulty.status === "under_repair" || 
//                    serialInFaulty.status === "repaired" || 
//                    serialInFaulty.status === "irreparable")) {
//                 acceptedSerials.push(serialNumber);
//               }
//             }
            
//             if (acceptedSerials.length > 0) {
//               throw new Error(
//                 `Cannot revert product with serial number(s): ${acceptedSerials.join(', ')}. ` +
//                 `These items have already been accepted into faulty stock and are in "${faultyStock.overallStatus}" status.`
//               );
//             }
//           } else {
//             throw new Error(
//               `Cannot revert this damage entry. The product "${product.productTitle}" ` +
//               `has already been accepted into faulty stock and is in "${faultyStock.overallStatus}" status.`
//             );
//           }
//         }
        
//         console.log(`Faulty stock status: ${faultyStock.overallStatus} - Proceeding with reversion`);
//       }

//       let centerStock = await CenterStock.findOne({
//         center: this.center,
//         product: item.product,
//       });

//       if (!centerStock) {
//         centerStock = new CenterStock({
//           center: this.center,
//           product: item.product,
//           totalQuantity: 0,
//           availableQuantity: 0,
//           consumedQuantity: 0,
//           damagedQuantity: 0,
//           serialNumbers: [],
//         });
//       }

//       if (product.trackSerialNumber === "Yes" && item.serialNumbers && item.serialNumbers.length > 0) {
//         for (const serialNumber of item.serialNumbers) {
//           const serial = centerStock.serialNumbers.find(
//             (sn) => sn.serialNumber === serialNumber
//           );

//           if (serial) {
//             serial.status = "available";
//             serial.currentLocation = this.center;
//             serial.consumedDate = null;
//             serial.consumedBy = null;

//             if (!serial.transferHistory) {
//               serial.transferHistory = [];
//             }
            
//             serial.transferHistory.push({
//               fromCenter: this.center,
//               toCenter: this.center,
//               transferDate: new Date(),
//               transferType: "damage_reverted",
//               referenceId: this._id,
//               remark: revertRemark || "Damage reverted - stock restored",
//               revertedBy: revertedBy
//             });
//           } else {
//             const purchaseId = null;
            
//             centerStock.serialNumbers.push({
//               serialNumber: serialNumber,
//               purchaseId: purchaseId,
//               originalOutlet: this.center,
//               status: "available",
//               currentLocation: this.center,
//               transferHistory: [{
//                 fromCenter: null,
//                 toCenter: this.center,
//                 transferDate: new Date(),
//                 transferType: "damage_reverted",
//                 referenceId: this._id,
//                 remark: revertRemark || "Damage reverted - stock restored",
//                 revertedBy: revertedBy
//               }]
//             });
//           }
//         }

//         centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.quantity;
//         centerStock.consumedQuantity = Math.max(
//           0,
//           (centerStock.consumedQuantity || 0) - item.quantity
//         );
//         centerStock.damagedQuantity = Math.max(
//           0,
//           (centerStock.damagedQuantity || 0) - item.quantity
//         );
    
//         if (centerStock.totalQuantity !== undefined) {
//           centerStock.totalQuantity = (centerStock.totalQuantity || 0) + item.quantity;
//         }
//       } else {

//         centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.quantity;
//         centerStock.totalQuantity = (centerStock.totalQuantity || 0) + item.quantity;
//         centerStock.consumedQuantity = Math.max(
//           0,
//           (centerStock.consumedQuantity || 0) - item.quantity
//         );
//         centerStock.damagedQuantity = Math.max(
//           0,
//           (centerStock.damagedQuantity || 0) - item.quantity
//         );
//       }
//       await centerStock.save();
//       console.log(`✓ Center stock updated for product: ${item.product}`);

//       if (faultyStock) {
//         if (product.trackSerialNumber === "Yes" && item.serialNumbers && item.serialNumbers.length > 0) {

//           faultyStock.serialNumbers = faultyStock.serialNumbers.filter(
//             sn => !item.serialNumbers.includes(sn.serialNumber)
//           );
          
//           if (faultyStock.serialNumbers.length === 0) {
//             await FaultyStock.findByIdAndDelete(faultyStock._id);
//             console.log(`✓ Deleted faulty stock entry as all serials were reverted`);
//           } else {

//             faultyStock.quantity = faultyStock.serialNumbers.length;

//             faultyStock.damageQty = faultyStock.serialNumbers.filter(
//               sn => sn.status === "damaged"
//             ).length;

//             if (typeof faultyStock.updateQuantitiesAndStatus === 'function') {
//               faultyStock.updateQuantitiesAndStatus();
//             }
            
//             await faultyStock.save();
//             console.log(`✓ Updated faulty stock, removed reverted serials`);
//           }
//         } else {

//           await FaultyStock.findByIdAndDelete(faultyStock._id);
//           console.log(`✓ Deleted faulty stock entry for non-serialized product`);
//         }
//       } else {

//         const altFaultyStock = await FaultyStock.findOneAndDelete({
//           product: item.product,
//           center: this.center,
//           toCenter: this.toCenter
//         });
        
//         if (altFaultyStock) {
//           console.log(`✓ Removed faulty stock entry via alternative query`);
//         }
//       }
//     }

//     this.status = "cancelled";
//     this.revertedBy = revertedBy;
//     this.revertRemark = revertRemark;
//     this.revertDate = new Date();
//     await this.save();

//     console.log("✓ Damage entry reverted successfully");
    
//     return {
//       success: true,
//       message: "Damage entry reverted successfully. Stock restored and faulty stock removed."
//     };
//   } catch (error) {
//     console.error("Error in revertDamage:", error);
//     throw error;
//   }
// };


stockUsageSchema.methods.revertDamage = async function (revertedBy, revertRemark) {
  if (this.usageType !== "Damage") {
    throw new Error("Only damage entries can be reverted");
  }

  if (this.status !== "completed") {
    throw new Error("Only completed damage entries can be reverted");
  }

  try {
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");
    const FaultyStock = mongoose.model("FaultyStock");

    for (let item of this.items) {
      const product = await Product.findById(item.product);

      // FIXED: Find faulty stock with pending_damage status only
      const faultyStock = await FaultyStock.findOne({
        product: item.product,
        center: this.center,
        overallStatus: "pending_damage" // Only revert items with pending_damage status
      });

      if (faultyStock) {
        console.log(`Found pending_damage faulty stock: ${faultyStock._id}`);
        
        // Check if this specific item can be reverted (only pending_damage)
        if (product.trackSerialNumber === "Yes" && item.serialNumbers && item.serialNumbers.length > 0) {
          // For serialized products, check each serial number is in pending_damage
          const validSerials = [];
          const invalidSerials = [];

          for (const serialNumber of item.serialNumbers) {
            const serialInFaulty = faultyStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );
            
            if (serialInFaulty && serialInFaulty.status === "pending_damage") {
              validSerials.push(serialNumber);
            } else if (serialInFaulty) {
              invalidSerials.push({
                serial: serialNumber,
                status: serialInFaulty.status
              });
            }
          }

          if (invalidSerials.length > 0) {
            throw new Error(
              `Cannot revert serial numbers: ${invalidSerials.map(s => `${s.serial} (${s.status})`).join(', ')}. ` +
              `Only items with status "pending_damage" can be reverted.`
            );
          }

          // Proceed with reversion only for valid pending_damage serials
          if (validSerials.length > 0) {
            // Remove ONLY the pending_damage serials from faulty stock
            faultyStock.serialNumbers = faultyStock.serialNumbers.filter(
              sn => !validSerials.includes(sn.serialNumber)
            );

            // Update pendingDamageHistory entries for these serials
            if (faultyStock.pendingDamageHistory && faultyStock.pendingDamageHistory.length > 0) {
              for (const entry of faultyStock.pendingDamageHistory) {
                if (entry.status === "pending" && entry.serialNumbers && entry.serialNumbers.length > 0) {
                  // Check if this entry contains any of the reverted serials
                  const hasRevertedSerials = entry.serialNumbers.some(sn => validSerials.includes(sn));
                  
                  if (hasRevertedSerials) {
                    // Remove reverted serials from this entry
                    entry.serialNumbers = entry.serialNumbers.filter(sn => !validSerials.includes(sn));
                    
                    // If entry has no serials left, mark it as rejected
                    if (entry.serialNumbers.length === 0) {
                      entry.status = "rejected";
                      entry.rejectedBy = revertedBy;
                      entry.rejectedAt = new Date();
                      entry.remark = revertRemark || "Reverted - all serials removed";
                    } else {
                      // Update quantity based on remaining serials
                      entry.quantity = entry.serialNumbers.length;
                    }
                  }
                }
              }
            }

            // Update quantities
            if (faultyStock.serialNumbers.length === 0) {
              // If no serials left, delete the faulty stock record
              await FaultyStock.findByIdAndDelete(faultyStock._id);
              console.log(`✓ Deleted faulty stock entry as all pending_damage serials were reverted`);
            } else {
              // Update the faulty stock quantities and status
              faultyStock.quantity = faultyStock.serialNumbers.length;
              faultyStock.updateQuantitiesAndStatus();
              await faultyStock.save();
              console.log(`✓ Updated faulty stock, removed reverted pending_damage serials: ${validSerials.join(', ')}`);
            }
          }

        } else {
          // For non-serialized products - only revert pending_damage
          if (faultyStock.pendingDamageQty >= item.quantity) {
            // Reduce from pendingDamageQty
            faultyStock.pendingDamageQty -= item.quantity;

            // Update pendingDamageHistory
            if (faultyStock.pendingDamageHistory && faultyStock.pendingDamageHistory.length > 0) {
              let remainingToRevert = item.quantity;
              const pendingEntries = faultyStock.pendingDamageHistory
                .filter(entry => entry.status === "pending")
                .sort((a, b) => new Date(a.date) - new Date(b.date));

              for (const entry of pendingEntries) {
                if (remainingToRevert <= 0) break;
                
                const entryQuantity = entry.quantity || 0;
                
                if (entryQuantity <= remainingToRevert) {
                  // Revert this entire entry
                  entry.status = "rejected";
                  entry.rejectedBy = revertedBy;
                  entry.rejectedAt = new Date();
                  entry.remark = revertRemark || "Reverted damage entry";
                  remainingToRevert -= entryQuantity;
                } else {
                  // Revert partial quantity from this entry
                  entry.quantity = entryQuantity - remainingToRevert;
                  remainingToRevert = 0;
                }
              }
            }

            // Update faulty stock
            faultyStock.updateQuantitiesAndStatus();
            
            // If all quantities are zero, delete the record
            if (faultyStock.quantity === 0 && faultyStock.pendingDamageQty === 0) {
              await FaultyStock.findByIdAndDelete(faultyStock._id);
              console.log(`✓ Deleted faulty stock entry as all pending_damage quantities are zero`);
            } else {
              await faultyStock.save();
              console.log(`✓ Updated faulty stock, removed ${item.quantity} pending_damage items`);
            }
          } else {
            throw new Error(
              `Cannot revert ${item.quantity} items. Only ${faultyStock.pendingDamageQty} pending_damage items available.`
            );
          }
        }

        // Update center stock (restore the items)
        let centerStock = await CenterStock.findOne({
          center: this.center,
          product: item.product,
        });

        if (!centerStock) {
          centerStock = new CenterStock({
            center: this.center,
            product: item.product,
            totalQuantity: 0,
            availableQuantity: 0,
            consumedQuantity: 0,
            damagedQuantity: 0,
            serialNumbers: [],
          });
        }

        if (product.trackSerialNumber === "Yes" && item.serialNumbers && item.serialNumbers.length > 0) {
          // Restore specific serials
          for (const serialNumber of item.serialNumbers) {
            const serial = centerStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              serial.status = "available";
              serial.currentLocation = this.center;
              serial.consumedDate = null;
              serial.consumedBy = null;
              serial.damageDate = null;

              if (!serial.transferHistory) {
                serial.transferHistory = [];
              }
              
              serial.transferHistory.push({
                fromCenter: this.center,
                toCenter: this.center,
                transferDate: new Date(),
                transferType: "damage_reverted",
                referenceId: this._id,
                remark: revertRemark || "Damage reverted - stock restored",
                revertedBy: revertedBy
              });
            } else {
              // Add new serial if it doesn't exist
              centerStock.serialNumbers.push({
                serialNumber: serialNumber,
                status: "available",
                currentLocation: this.center,
                transferHistory: [{
                  fromCenter: null,
                  toCenter: this.center,
                  transferDate: new Date(),
                  transferType: "damage_reverted",
                  referenceId: this._id,
                  remark: revertRemark || "Damage reverted - stock restored",
                  revertedBy: revertedBy
                }]
              });
            }
          }

          // Update quantities
          centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.serialNumbers.length;
          centerStock.consumedQuantity = Math.max(
            0,
            (centerStock.consumedQuantity || 0) - item.serialNumbers.length
          );
          centerStock.damagedQuantity = Math.max(
            0,
            (centerStock.damagedQuantity || 0) - item.serialNumbers.length
          );
          
          if (centerStock.totalQuantity !== undefined) {
            centerStock.totalQuantity = (centerStock.totalQuantity || 0) + item.serialNumbers.length;
          }
        } else {
          // Restore non-serialized items
          centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.quantity;
          centerStock.totalQuantity = (centerStock.totalQuantity || 0) + item.quantity;
          centerStock.consumedQuantity = Math.max(
            0,
            (centerStock.consumedQuantity || 0) - item.quantity
          );
          centerStock.damagedQuantity = Math.max(
            0,
            (centerStock.damagedQuantity || 0) - item.quantity
          );
        }

        await centerStock.save();
        console.log(`✓ Center stock updated for product: ${item.product}`);
      } else {
        console.log(`No pending_damage faulty stock found for product: ${item.product}`);
        
        // Even if no faulty stock, we can still restore center stock if needed
        // This handles cases where the faulty stock might have been deleted already
        let centerStock = await CenterStock.findOne({
          center: this.center,
          product: item.product,
        });

        if (centerStock) {
          if (product.trackSerialNumber === "Yes" && item.serialNumbers && item.serialNumbers.length > 0) {
            for (const serialNumber of item.serialNumbers) {
              const serial = centerStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial) {
                serial.status = "available";
                serial.currentLocation = this.center;
                serial.consumedDate = null;
                serial.consumedBy = null;
                serial.damageDate = null;

                serial.transferHistory.push({
                  fromCenter: this.center,
                  toCenter: this.center,
                  transferDate: new Date(),
                  transferType: "damage_reverted",
                  referenceId: this._id,
                  remark: revertRemark || "Damage reverted - stock restored",
                  revertedBy: revertedBy
                });
              }
            }
            
            centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.serialNumbers.length;
            centerStock.consumedQuantity = Math.max(0, (centerStock.consumedQuantity || 0) - item.serialNumbers.length);
            centerStock.damagedQuantity = Math.max(0, (centerStock.damagedQuantity || 0) - item.serialNumbers.length);
          } else {
            centerStock.availableQuantity = (centerStock.availableQuantity || 0) + item.quantity;
            centerStock.consumedQuantity = Math.max(0, (centerStock.consumedQuantity || 0) - item.quantity);
            centerStock.damagedQuantity = Math.max(0, (centerStock.damagedQuantity || 0) - item.quantity);
          }
          
          await centerStock.save();
          console.log(`✓ Center stock updated for product: ${item.product} (no pending_damage faulty stock)`);
        }
      }
    }
    
    // Update the stock usage record
    this.status = "cancelled";
    this.revertedBy = revertedBy;
    this.revertRemark = revertRemark;
    this.revertDate = new Date();
    await this.save();

    console.log("✓ Damage entry reverted successfully");
    
    return {
      success: true,
      message: "Damage entry reverted successfully. Only pending_damage items were reverted."
    };
  } catch (error) {
    console.error("Error in revertDamage:", error);
    throw error;
  }
};

export default mongoose.model("StockUsage", stockUsageSchema);
