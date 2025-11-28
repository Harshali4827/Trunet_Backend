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
    
    challanNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    challanDate: {
      type: Date,
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

        approvedSerials: [
          {
            type: String,
            trim: true,
            validate: {
              validator: function (serial) {
                return serial && serial.trim().length > 0;
              },
              message: "Serial number cannot be empty",
            },
          },
        ],

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

    warehouseChallanApproval: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    centerChallanApproval: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
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
    
      warehouseChallanApprovedAt: {
        type: Date,
      },
      warehouseChallanApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      warehouseChallanApprovedRemark: {
        type: String,
        trim: true,
      },

      centerChallanApprovedAt: {
        type: Date,
      },
      centerChallanApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      centerChallanApprovedRemark: {
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
    rejectionInfo: {
      rejectedAt: {
        type: Date,
      },
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectionReason: {
        type: String,
        trim: true,
      },
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


stockRequestSchema.statics.generateChallanNumber = async function () {
  const currentYear = new Date().getFullYear();
  const prefix = `CHL/${currentYear}/`;

  const lastChallan = await this.findOne({
    challanNo: new RegExp(`^${prefix}`)
  }).sort({ challanNo: -1 });
  
  let sequence = 1;
  if (lastChallan && lastChallan.challanNo) {
    const lastSequence = parseInt(lastChallan.challanNo.split('/').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
};


stockRequestSchema.methods.approveRequest = async function (
  approvedBy,
  productApprovals = []
) {
  this.status = "Confirmed";
  this.approvalInfo.approvedBy = approvedBy;
  this.approvalInfo.approvedAt = new Date();
 
  const StockRequest = mongoose.model("StockRequest");
  this.challanNo = await StockRequest.generateChallanNumber();
  this.challanDate = new Date(); 

  if (productApprovals.length > 0) {
    this.products.forEach((product, index) => {
      const approval = productApprovals.find(
        (pa) => pa.productId.toString() === product.product.toString()
      );
      if (approval) {
        product.approvedQuantity = approval.approvedQuantity;
        product.approvedRemark = approval.approvedRemark || "";

        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          if (approval.approvedSerials.length !== approval.approvedQuantity) {
            throw new Error(
              `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${product.product}`
            );
          }

          const uniqueSerials = new Set(approval.approvedSerials);
          if (uniqueSerials.size !== approval.approvedSerials.length) {
            throw new Error(
              `Duplicate serial numbers found for product ${product.product}`
            );
          }

          product.approvedSerials = approval.approvedSerials;
        }
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

      if (receivedQuantity > productItem.approvedQuantity) {
        throw new Error(
          `Received quantity (${receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product "${productDoc?.productTitle}"`
        );
      }

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
        if (
          !productItem.approvedSerials ||
          productItem.approvedSerials.length === 0
        ) {
          throw new Error(
            `No serial numbers assigned for product "${productDoc.productTitle}". Please assign serial numbers during approval.`
          );
        }

        const serialNumbersToTransfer = productItem.approvedSerials.slice(
          0,
          receivedQuantity
        );

        const validationResult = outletStock.validateAndGetSerials(
          serialNumbersToTransfer,
          this.warehouse
        );

        const availableSerials = Array.isArray(validationResult)
          ? validationResult
          : validationResult.availableSerials;

        if (
          !availableSerials ||
          availableSerials.length !== serialNumbersToTransfer.length
        ) {
          const missingSerials = serialNumbersToTransfer.filter(
            (sn) => !availableSerials.includes(sn)
          );
          throw new Error(
            `Some serial numbers are not available in outlet stock: ${missingSerials.join(
              ", "
            )}`
          );
        }

        transferredSerials = await outletStock.transferStock(
          this.center,
          receivedQuantity,
          serialNumbersToTransfer
        );

        productItem.serialNumbers = serialNumbersToTransfer;
        productItem.transferredSerials = transferredSerials;
      } else {
        console.log(
          `Non-serialized transfer: ${receivedQuantity} units of product ${productId}`
        );
        transferredSerials = await outletStock.transferStock(
          this.center,
          receivedQuantity,
          []
        );

        productItem.serialNumbers = [];
        productItem.transferredSerials = [];
      }

      productItem.receivedQuantity = receivedQuantity;
      productItem.receivedRemark = receipt.receivedRemark || "";

      transferResults.push({
        productId,
        productName: productDoc?.productTitle,
        receivedQuantity,
        transferredQuantity: receivedQuantity,
        serials: tracksSerialNumbers ? transferredSerials : [],
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

stockRequestSchema.methods.validateSerialNumbers = async function (
  productApprovals
) {
  const OutletStock = mongoose.model("OutletStock");
  const Product = mongoose.model("Product");
  const validationResults = [];

  for (const approval of productApprovals) {
    const productDoc = await Product.findById(approval.productId);
    const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

    if (tracksSerialNumbers && approval.approvedSerials) {
      const outletStock = await OutletStock.findOne({
        outlet: this.warehouse,
        product: approval.productId,
      });

      if (!outletStock) {
        validationResults.push({
          productId: approval.productId,
          productName: productDoc.productTitle,
          valid: false,
          error: `No stock found in outlet for this product`,
        });
        continue;
      }

      const availableSerials = await outletStock.validateAndGetSerials(
        approval.approvedSerials,
        this.warehouse
      );

      const unavailableSerials = approval.approvedSerials.filter(
        (sn) => !availableSerials.includes(sn)
      );

      validationResults.push({
        productId: approval.productId,
        productName: productDoc.productTitle,
        valid: unavailableSerials.length === 0,
        availableSerials: availableSerials,
        unavailableSerials: unavailableSerials,
        error:
          unavailableSerials.length > 0
            ? `Serial numbers not available: ${unavailableSerials.join(", ")}`
            : null,
      });
    } else {
      validationResults.push({
        productId: approval.productId,
        productName: productDoc.productTitle,
        valid: true,
        availableSerials: [],
        unavailableSerials: [],
        error: null,
      });
    }
  }

  return validationResults;
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

    await this.save();

    return this;
  } catch (error) {
    throw error;
  }
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
