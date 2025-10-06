import mongoose from "mongoose";

const centerStockSchema = new mongoose.Schema({
  center: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true,
    validate: {
      validator: async function (centerId) {
        const Center = mongoose.model("Center");
        const center = await Center.findById(centerId);
        return center && center.centerType === "Center";
      },
      message: 'Must be a valid Center (not Outlet)'
    }
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  totalQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  availableQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  inTransitQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  consumedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  serialNumbers: [{
    serialNumber: {
      type: String,
      required: true,
      trim: true
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockPurchase",
      required: true
    },
    originalOutlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true
    },
    status: {
      type: String,
      enum: ["available", "in_transit", "transferred", "consumed", "returned"],
      default: "available"
    },
    currentLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center"
    },
    transferHistory: [{
      fromCenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Center"
      },
      toCenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Center"
      },
      transferDate: Date,
      transferType: {
        type: String,
        enum: ["inbound_transfer", "outbound_transfer", "field_usage"]
      }
    }],
    consumedDate: {
      type: Date,
      default: null
    },
    consumedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

centerStockSchema.index({ center: 1, product: 1 }, { unique: true });
centerStockSchema.index({ "serialNumbers.serialNumber": 1 });


// In CenterStock model - update to handle non-serialized products
centerStockSchema.statics.updateStock = async function(
  centerId,
  productId,
  quantity,
  serialNumbers = [],
  sourceCenter,
  transferType = "inbound_transfer"
) {
  const updateData = {
    $inc: {
      totalQuantity: quantity,
      availableQuantity: quantity
    },
    lastUpdated: new Date()
  };

  // Only add serial numbers if they are provided (for serialized products)
  if (serialNumbers.length > 0) {
    // Get purchase IDs for the serial numbers
    const purchaseIds = await Promise.all(
      serialNumbers.map(async (serialNumber) => {
        const OutletStock = mongoose.model("OutletStock");
        const outletStock = await OutletStock.findOne({
          "serialNumbers.serialNumber": serialNumber
        });
        
        if (outletStock) {
          const serial = outletStock.serialNumbers.find(
            sn => sn.serialNumber === serialNumber
          );
          return serial ? serial.purchaseId : null;
        }
        return null;
      })
    );

    const serialsToAdd = serialNumbers.map((serialNumber, index) => ({
      serialNumber: serialNumber,
      purchaseId: purchaseIds[index],
      originalOutlet: sourceCenter,
      status: "available",
      currentLocation: centerId,
      transferHistory: [{
        fromCenter: sourceCenter,
        toCenter: centerId,
        transferDate: new Date(),
        transferType: transferType
      }]
    }));

    updateData.$push = {
      serialNumbers: { $each: serialsToAdd }
    };
  }
  // For non-serialized products, we just update the quantities without adding serial numbers

  return this.findOneAndUpdate(
    { center: centerId, product: productId },
    updateData,
    { upsert: true, new: true }
  );
};

centerStockSchema.statics.getPurchaseIdFromSerial = async function(serialNumber) {
  const OutletStock = mongoose.model("OutletStock");
  const outletStock = await OutletStock.findOne({
    "serialNumbers.serialNumber": serialNumber
  });
  
  if (outletStock) {
    const serial = outletStock.serialNumbers.find(
      sn => sn.serialNumber === serialNumber
    );
    return serial ? serial.purchaseId : null;
  }
  return null;
};


// In CenterStock model - fix transferToCenter method
centerStockSchema.methods.transferToCenter = async function(toCenter, quantity, serialNumbers = []) {
  try {
    if (this.availableQuantity < quantity) {
      throw new Error("Insufficient stock available");
    }

    let transferredSerials = [];

    if (serialNumbers.length > 0) {
      for (const serialNumber of serialNumbers) {
        const serial = this.serialNumbers.find(
          sn => sn.serialNumber === serialNumber && sn.status === "available"
        );
        
        if (!serial) {
          throw new Error(`Serial number ${serialNumber} not available`);
        }

        serial.status = "transferred";
        serial.currentLocation = toCenter;
        serial.transferHistory.push({
          fromCenter: this.center,
          toCenter: toCenter,
          transferDate: new Date(),
          transferType: "outbound_transfer"
        });

        transferredSerials.push(serialNumber);
      }
    } else {
      const availableSerials = this.serialNumbers
        .filter(sn => sn.status === "available")
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, quantity);

      if (availableSerials.length < quantity) {
        throw new Error("Insufficient serial numbers available");
      }

      for (const serial of availableSerials) {
        serial.status = "transferred";
        serial.currentLocation = toCenter;
        serial.transferHistory.push({
          fromCenter: this.center,
          toCenter: toCenter,
          transferDate: new Date(),
          transferType: "outbound_transfer"
        });

        transferredSerials.push(serial.serialNumber);
      }
    }

    this.availableQuantity -= quantity;
    this.totalQuantity -= quantity;

    await this.save();

    await this.constructor.updateStock(
      toCenter,
      this.product,
      quantity,
      transferredSerials,
      this.center,
      "inbound_transfer"
    );

    return transferredSerials;

  } catch (error) {
    throw error;
  }
};


centerStockSchema.methods.consumeStock = async function(quantity, serialNumbers = [], consumedBy = null) {
  if (this.availableQuantity < quantity) {
    throw new Error("Insufficient stock available for consumption");
  }

  let consumedSerials = [];

  if (serialNumbers.length > 0) {
    
    for (const serialNumber of serialNumbers) {
      const serial = this.serialNumbers.find(
        sn => sn.serialNumber === serialNumber && sn.status === "available"
      );
      
      if (!serial) {
        throw new Error(`Serial number ${serialNumber} not available`);
      }

      serial.status = "consumed";
      serial.consumedDate = new Date();
      serial.consumedBy = consumedBy;
      serial.transferHistory.push({
        fromCenter: this.center,
        toCenter: null,
        transferDate: new Date(),
        transferType: "field_usage"
      });

      consumedSerials.push(serialNumber);
    }
  } else {
    
    const availableSerials = this.serialNumbers
      .filter(sn => sn.status === "available")
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, quantity);

    if (availableSerials.length < quantity) {
      throw new Error("Insufficient serial numbers available for consumption");
    }

    for (const serial of availableSerials) {
      serial.status = "consumed";
      serial.consumedDate = new Date();
      serial.consumedBy = consumedBy;
      serial.transferHistory.push({
        fromCenter: this.center,
        toCenter: null,
        transferDate: new Date(),
        transferType: "field_usage"
      });

      consumedSerials.push(serial.serialNumber);
    }
  }

  this.availableQuantity -= quantity;
  this.consumedQuantity += quantity;

  await this.save();
  return consumedSerials;
};


centerStockSchema.statics.getCenterStockSummary = async function(centerId) {
  return this.aggregate([
    { $match: { center: mongoose.Types.ObjectId(centerId) } },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $project: {
        product: 1,
        productName: { $arrayElemAt: ["$productDetails.productTitle", 0] },
        totalQuantity: 1,
        availableQuantity: 1,
        consumedQuantity: 1,
        inTransitQuantity: 1,
        lastUpdated: 1
      }
    },
    { $sort: { productName: 1 } }
  ]);
};

export default mongoose.model("CenterStock", centerStockSchema);