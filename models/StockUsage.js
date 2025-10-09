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
        "Other",
      ],
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
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
  },
  { timestamps: true }
);

stockUsageSchema.index({ center: 1, date: -1 });
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

export default mongoose.model("StockUsage", stockUsageSchema);
