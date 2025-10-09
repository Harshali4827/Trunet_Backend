import mongoose from "mongoose";

const outletStockSchema = new mongoose.Schema(
  {
    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      validate: {
        validator: async function (outletId) {
          const Center = mongoose.model("Center");
          const outlet = await Center.findById(outletId);
          return outlet && outlet.centerType === "Outlet";
        },
        message: "Must be a valid Outlet center",
      },
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
    inTransitQuantity: {
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
        purchaseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockPurchase",
          required: true,
        },
        status: {
          type: String,
          enum: ["available", "in_transit", "transferred", "sold", "returned"],
          default: "available",
        },
        currentLocation: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
        },
        transferHistory: [
          {
            fromCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            toCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            transferDate: Date,
            transferType: {
              type: String,
              enum: ["outlet_to_center", "center_to_center", "field_usage"],
            },
          },
        ],
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

outletStockSchema.index({ outlet: 1, product: 1 }, { unique: true });
outletStockSchema.index({ "serialNumbers.serialNumber": 1 });

outletStockSchema.statics.updateStock = async function (
  outletId,
  productId,
  quantity,
  serialNumbers = [],
  purchaseId
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
      purchaseId: purchaseId,
      status: "available",
      currentLocation: outletId,
      transferHistory: [],
    }));

    updateData.$push = {
      serialNumbers: { $each: serialsToAdd },
    };
  }

  return this.findOneAndUpdate(
    { outlet: outletId, product: productId },
    updateData,
    { upsert: true, new: true }
  );
};

outletStockSchema.methods.validateAndGetSerials = function (
  requestedSerials,
  currentLocation
) {
  try {
    const availableSerials = [];

    for (const requestedSerial of requestedSerials) {
      const serial = this.serialNumbers.find(
        (sn) =>
          sn.serialNumber === requestedSerial &&
          sn.status === "available" &&
          sn.currentLocation?.toString() === currentLocation.toString()
      );

      if (serial) {
        availableSerials.push(requestedSerial);
      }
    }

    return availableSerials;
  } catch (error) {
    throw new Error(`Error validating serial numbers: ${error.message}`);
  }
};

outletStockSchema.methods.getAvailableSerials = function (
  requestedSerials,
  currentLocation
) {
  const validationResult = this.validateAndGetSerials(
    requestedSerials,
    currentLocation
  );
  return validationResult.availableSerials;
};

outletStockSchema.methods.getFIFOStock = function (quantity) {
  const availableSerials = this.serialNumbers
    .filter((sn) => sn.status === "available")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, quantity);

  return {
    availableQuantity: this.availableQuantity,
    availableSerials: availableSerials.map((sn) => ({
      serialNumber: sn.serialNumber,
      purchaseId: sn.purchaseId,
    })),
  };
};

outletStockSchema.methods.transferStock = async function (
  toCenter,
  quantity,
  serialNumbers = []
) {
  try {
    if (this.availableQuantity < quantity) {
      throw new Error("Insufficient stock available");
    }

    let transferredSerials = [];

    if (serialNumbers.length > 0) {
      for (const serialNumber of serialNumbers) {
        const serial = this.serialNumbers.find(
          (sn) => sn.serialNumber === serialNumber && sn.status === "available"
        );

        if (!serial) {
          throw new Error(`Serial number ${serialNumber} not available`);
        }

        serial.status = "transferred";
        serial.currentLocation = toCenter;
        serial.transferHistory.push({
          fromCenter: this.outlet,
          toCenter: toCenter,
          transferDate: new Date(),
          transferType: "outlet_to_center",
        });

        transferredSerials.push(serialNumber);
      }
    } else {
      const availableSerials = this.serialNumbers
        .filter((sn) => sn.status === "available")
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, quantity);

      if (availableSerials.length > 0) {
        for (const serial of availableSerials) {
          serial.status = "transferred";
          serial.currentLocation = toCenter;
          serial.transferHistory.push({
            fromCenter: this.outlet,
            toCenter: toCenter,
            transferDate: new Date(),
            transferType: "outlet_to_center",
          });
          transferredSerials.push(serial.serialNumber);
        }
      } else {
        console.log(
          `Non-serialized transfer: ${quantity} units of product ${this.product}`
        );
      }
    }

    this.availableQuantity -= quantity;
    this.totalQuantity -= quantity;

    await this.save();

    const CenterStock = mongoose.model("CenterStock");

    await CenterStock.updateStock(
      toCenter,
      this.product,
      quantity,
      transferredSerials,
      this.outlet,
      "inbound_transfer"
    );

    return transferredSerials;
  } catch (error) {
    throw error;
  }
};

export default mongoose.model("OutletStock", outletStockSchema);
