import mongoose from "mongoose";

const stockRequestSchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "Warehouse is required"],
      validate: {
        validator: async function (warehouseId) {
          if (!warehouseId) return false;

          const Center = mongoose.model("Center");
          const warehouse = await Center.findById(warehouseId);

          return warehouse && warehouse.centerType === "Outlet";
        },
        message: 'Warehouse must be a valid center with centerType "Outlet"',
      },
    },

    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "Center is required"],
    },

    date: {
      type: Date,
      required: true,
      default: () => new Date().setHours(0, 0, 0, 0),
    },

    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      trim: true,
    },

    remark: {
      type: String,
      trim: true,
    },

    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: [true, "Product is required"],
        },
        quantity: {
          type: Number,
          required: [true, "Quantity is required"],
          min: [1, "Quantity must be at least 1"],
        },

        approvedQuantity: {
          type: Number,
          min: [0, "Approved quantity cannot be negative"],
        },
        approvedRemark: {
          type: String,
          trim: true,
        },

        receivedQuantity: {
          type: Number,
          min: [0, "Received quantity cannot be negative"],
        },
        receivedRemark: {
          type: String,
          trim: true,
        },
        productInStock: {
          type: Number,
          default: 0,
          min: 0,
        },
        productRemark: {
          type: String,
          trim: true,
        },

        serialNumbers: [
          {
            type: String,
            trim: true,
          },
        ],
        transferredSerials: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],

    status: {
      type: String,
      enum: [
        "Draft",
        "Submitted",
        "Confirmed",
        "Shipped",
        "Incompleted",
        "Completed",
        "Rejected",
      ],
      default: "Submitted",
    },

    approvalInfo: {
      approvedAt: {
        type: Date,
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approvedRemark: {
        type: String,
        trim: true,
      },
    },

    shippingInfo: {
      shippedAt: {
        type: Date,
      },
      shippedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      shippedDate: Date,
      expectedDeliveryDate: Date,
      shipmentDetails: String,
      shipmentRemark: String,
      documents: [String],
      shipmentRejected: {
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    },

    receivingInfo: {
      receivedAt: {
        type: Date,
      },
      receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    completionInfo: {
      completedOn: Date,
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      incompleteOn: Date,
      incompleteBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      incompleteRemark: String,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    stockTransferStatus: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed"],
      default: "pending",
    },
    stockTransferError: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

stockRequestSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    const now = new Date();

    switch (this.status) {
      case "Confirmed":
        if (!this.approvalInfo.approvedAt) {
          this.approvalInfo.approvedAt = now;
        }
        break;

      case "Shipped":
        if (!this.shippingInfo.shippedAt) {
          this.shippingInfo.shippedAt = now;
        }
        break;

      case "Completed":
        if (!this.receivingInfo.receivedAt) {
          this.receivingInfo.receivedAt = now;
        }

        if (!this.completionInfo.completedOn) {
          this.completionInfo.completedOn = now;
        }
        break;
    }
  }
  next();
});

stockRequestSchema.methods.approveRequest = function (
  approvedBy,
  approvedRemark = "",
  productApprovals = []
) {
  this.status = "Confirmed";
  this.approvalInfo.approvedBy = approvedBy;
  this.approvalInfo.approvedAt = new Date();

  if (productApprovals.length > 0) {
    this.products.forEach((product, index) => {
      const approval = productApprovals.find(
        (pa) => pa.productId.toString() === product.product.toString()
      );
      if (approval) {
        product.approvedQuantity = approval.approvedQuantity;
        product.approvedRemark = approval.approvedRemark || "";
      }
    });
  }

  return this.save();
};

stockRequestSchema.methods.transferStockToCenter = async function (
  productReceipts,
  transferredBy
) {
  try {
    this.stockTransferStatus = "in_progress";
    await this.save();

    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    const transferResults = [];

    for (const receipt of productReceipts) {
      const productId = receipt.productId;
      const receivedQuantity = receipt.receivedQuantity;

      const productItem = this.products.find(
        (p) => p.product.toString() === productId.toString()
      );
      if (!productItem) {
        throw new Error(`Product ${productId} not found in stock request`);
      }

      const productDoc = await Product.findById(productId);
      const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      const outletStock = await OutletStock.findOne({
        outlet: this.warehouse,
        product: productId,
      });

      if (!outletStock || outletStock.availableQuantity < receivedQuantity) {
        throw new Error(
          `Insufficient stock in outlet for product "${
            productDoc?.productTitle || productId
          }". Required: ${receivedQuantity}, Available: ${
            outletStock ? outletStock.availableQuantity : 0
          }`
        );
      }

      let transferredSerials = [];

      if (tracksSerialNumbers) {
        const fifoResult = outletStock.getFIFOStock(receivedQuantity);

        if (fifoResult.availableSerials.length < receivedQuantity) {
          throw new Error(
            `Insufficient serial numbers available for product ${productDoc.productTitle}. Requested: ${receivedQuantity}, Available: ${fifoResult.availableSerials.length}`
          );
        }

        const serialNumbersToTransfer = fifoResult.availableSerials.map(
          (sn) => sn.serialNumber
        );

        transferredSerials = await outletStock.transferStock(
          this.center,
          receivedQuantity,
          serialNumbersToTransfer
        );

        productItem.serialNumbers = serialNumbersToTransfer;
        productItem.transferredSerials = transferredSerials;
      } else {
        transferredSerials = await outletStock.transferStock(
          this.center,
          receivedQuantity,
          []
        );

        productItem.serialNumbers = [];
        productItem.transferredSerials = [];
      }

      transferResults.push({
        productId,
        productName: productDoc?.productTitle,
        receivedQuantity,
        transferredQuantity: receivedQuantity,
        serials: transferredSerials,
        success: true,
      });

      console.log(
        `Successfully transferred ${receivedQuantity} units of ${productDoc?.productTitle} from outlet to center`
      );
    }

    this.stockTransferStatus = "completed";
    this.stockTransferInfo = {
      transferredAt: new Date(),
      transferredBy: transferredBy,
      transferResults: transferResults,
    };

    await this.save();

    return {
      success: true,
      message: "Stock transferred successfully from outlet to center",
      transferResults,
    };
  } catch (error) {
    this.stockTransferStatus = "failed";
    this.stockTransferError = error.message;
    await this.save();

    throw new Error(`Failed to transfer stock: ${error.message}`);
  }
};

stockRequestSchema.methods.completeWithStockTransfer = async function (
  receivedBy,
  productReceipts,
  receivedRemark = ""
) {
  try {
    await this.transferStockToCenter(productReceipts, receivedBy);

    this.status = "Completed";
    this.receivingInfo = {
      receivedAt: new Date(),
      receivedBy: receivedBy,
      receivedRemark: receivedRemark || "",
    };
    this.completionInfo = {
      completedOn: new Date(),
      completedBy: receivedBy,
    };
    this.updatedBy = receivedBy;

    this.products = this.products.map((productItem) => {
      const receipt = productReceipts.find(
        (pr) => pr.productId.toString() === productItem.product.toString()
      );

      if (receipt) {
        return {
          ...productItem.toObject(),
          receivedQuantity: receipt.receivedQuantity,
          receivedRemark: receipt.receivedRemark || "",
        };
      }
      return productItem;
    });

    await this.save();

    return this;
  } catch (error) {
    throw error;
  }
};

stockRequestSchema.methods.updateShippingInfo = function (
  shippingDetails = {}
) {
  if (shippingDetails.shippedDate)
    this.shippingInfo.shippedDate = shippingDetails.shippedDate;
  if (shippingDetails.expectedDeliveryDate)
    this.shippingInfo.expectedDeliveryDate =
      shippingDetails.expectedDeliveryDate;
  if (shippingDetails.shipmentDetails)
    this.shippingInfo.shipmentDetails = shippingDetails.shipmentDetails;
  if (shippingDetails.shipmentRemark)
    this.shippingInfo.shipmentRemark = shippingDetails.shipmentRemark;
  if (shippingDetails.documents)
    this.shippingInfo.documents = shippingDetails.documents;

  return this.save();
};

stockRequestSchema.methods.rejectShipment = function (
  rejectedBy,
  rejectionRemark = ""
) {
  const previousShippingInfo = { ...this.shippingInfo.toObject() };

  this.shippingInfo = {
    shippedAt: undefined,
    shippedBy: undefined,
    shippedDate: undefined,
    expectedDeliveryDate: undefined,
    shipmentDetails: undefined,
    shipmentRemark: undefined,
    documents: [],

    shipmentRejected: {
      rejectedAt: new Date(),
      rejectedBy: rejectedBy,
      rejectionRemark: rejectionRemark,
      previousShippingData: previousShippingInfo,
    },
  };

  this.status = "Confirmed";

  return this.save();
};

stockRequestSchema.methods.shipRequest = function (
  shippedBy,
  shippingDetails = {}
) {
  this.status = "Shipped";
  this.shippingInfo.shippedBy = shippedBy;
  this.shippingInfo.shippedAt = new Date();

  if (shippingDetails.shippedDate)
    this.shippingInfo.shippedDate = shippingDetails.shippedDate;
  if (shippingDetails.expectedDeliveryDate)
    this.shippingInfo.expectedDeliveryDate =
      shippingDetails.expectedDeliveryDate;
  if (shippingDetails.shipmentDetails)
    this.shippingInfo.shipmentDetails = shippingDetails.shipmentDetails;
  if (shippingDetails.shipmentRemark)
    this.shippingInfo.shipmentRemark = shippingDetails.shipmentRemark;
  if (shippingDetails.documents)
    this.shippingInfo.documents = shippingDetails.documents;

  return this.save();
};

stockRequestSchema.methods.revertStockTransfer = async function () {
  try {
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const productItem of this.products) {
      if (
        productItem.transferredSerials &&
        productItem.transferredSerials.length > 0
      ) {
        const productId = productItem.product;

        const centerStock = await CenterStock.findOne({
          center: this.center,
          product: productId,
        });

        if (centerStock) {
          centerStock.serialNumbers = centerStock.serialNumbers.filter(
            (sn) => !productItem.transferredSerials.includes(sn.serialNumber)
          );

          centerStock.totalQuantity -= productItem.transferredSerials.length;
          centerStock.availableQuantity -=
            productItem.transferredSerials.length;

          await centerStock.save();
        }

        const outletStock = await OutletStock.findOne({
          outlet: this.warehouse,
          product: productId,
        });

        if (outletStock) {
          for (const serialNumber of productItem.transferredSerials) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              serial.status = "available";
              serial.currentLocation = this.warehouse;

              serial.transferHistory.pop();
            }
          }

          outletStock.totalQuantity += productItem.transferredSerials.length;
          outletStock.availableQuantity +=
            productItem.transferredSerials.length;

          await outletStock.save();
        }
      }
    }

    this.stockTransferStatus = "failed";
    this.stockTransferError = "Transfer reverted";
    await this.save();

    return { success: true, message: "Stock transfer reverted successfully" };
  } catch (error) {
    throw new Error(`Failed to revert stock transfer: ${error.message}`);
  }
};

export default mongoose.model("StockRequest", stockRequestSchema);
