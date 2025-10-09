import mongoose from "mongoose";

const entityStockSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: [
        "customer",
        "building",
        "controlRoom",
        "damage",
        "stolen",
        "other",
      ],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    serialNumbers: [
      {
        serialNumber: {
          type: String,
          required: true,
          trim: true,
        },
        status: {
          type: String,
          enum: ["available", "assigned", "used", "returned", "damaged"],
          default: "available",
        },
        assignedDate: {
          type: Date,
          default: Date.now,
        },
        usageReference: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockUsage",
        },
        usageType: {
          type: String,
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
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

entityStockSchema.index(
  { entityType: 1, entityId: 1, product: 1 },
  { unique: true }
);
entityStockSchema.index({ "serialNumbers.serialNumber": 1 });

entityStockSchema.statics.updateStock = async function (
  entityType,
  entityId,
  productId,
  quantity,
  serialNumbers = [],
  usageReference,
  usageType
) {
  const updateData = {
    $inc: {
      totalQuantity: quantity,
      availableQuantity: quantity,
    },
    lastUpdated: new Date(),
  };

  if (serialNumbers.length > 0) {
    const serialsToAdd = serialNumbers.map((serial) => ({
      serialNumber: serial.serialNumber || serial,
      status: "assigned",
      assignedDate: new Date(),
      usageReference: usageReference,
      usageType: usageType,
    }));

    updateData.$push = {
      serialNumbers: { $each: serialsToAdd },
    };
  }

  return this.findOneAndUpdate(
    { entityType, entityId, product: productId },
    updateData,
    { upsert: true, new: true, runValidators: true }
  );
};

export default mongoose.model("EntityStock", entityStockSchema);
