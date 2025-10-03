import mongoose from "mongoose";

const stockTransferSchema = new mongoose.Schema(
  {
    fromCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      index: true,
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      index: true,
      validate: {
        validator: async function(toCenterId) {
          const Center = mongoose.model("Center");
          const toCenter = await Center.findById(toCenterId);
          return toCenter && toCenter._id.toString() !== this.fromCenter.toString();
        },
        message: "Destination center must exist and be different from source center"
      }
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    transferNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    remark: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    products: [
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
          max: 100000,
        },
        serialNumbers: [
          {
            type: String,
            trim: true,
          },
        ],
        approvedQuantity: {
          type: Number,
          min: 0,
          validate: {
            validator: function (value) {
              return value <= this.quantity;
            },
            message: "Approved quantity cannot exceed requested quantity",
          },
        },
        approvedRemark: {
          type: String,
          trim: true,
          maxlength: 200,
        },
        receivedQuantity: {
          type: Number,
          min: 0,
          validate: {
            validator: function (value) {
              return value <= (this.approvedQuantity || this.quantity);
            },
            message: "Received quantity cannot exceed approved quantity",
          },
        },
        receivedRemark: {
          type: String,
          trim: true,
          maxlength: 200,
        },
        productInStock: {
          type: Number,
          default: 0,
          min: 0,
        },
        productRemark: {
          type: String,
          trim: true,
          default: "",
          maxlength: 200,
        },
        requiresSerialNumbers: {
          type: Boolean,
          default: false,
        },
        availableSerials: [
          {
            serialNumber: String,
            purchaseId: mongoose.Schema.Types.ObjectId,
            addedAt: Date,
          },
        ],
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: {
        values: [
          "Draft",
          "Submitted",
          "Admin_Approved",
          "Admin_Rejected",
          "Confirmed",
          "Shipped",
          "Incompleted",
          "Completed",
          "Rejected",
        ],
        message: "{VALUE} is not a valid status",
      },
      default: "Draft",
      index: true,
    },

    // Simplified admin approval - only status and user/timestamp
    adminApproval: {
      status: {
        type: String,
        enum: ["Approved", "Rejected"],
        default: null,
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectedAt: Date,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    stockStatus: {
      sourceDeducted: {
        type: Boolean,
        default: false,
      },
      destinationAdded: {
        type: Boolean,
        default: false,
      },
      deductedAt: Date,
      addedAt: Date,
      lastStockCheck: Date,
    },

    centerApproval: {
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    shippingInfo: {
      shippedAt: Date,
      shippedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      shippedDate: {
        type: Date,
        validate: {
          validator: function (value) {
            return !this.date || value >= this.date;
          },
          message: "Shipped date cannot be before transfer date",
        },
      },
      expectedDeliveryDate: {
        type: Date,
        validate: {
          validator: function (value) {
            return (
              !this.shippingInfo.shippedDate ||
              value >= this.shippingInfo.shippedDate
            );
          },
          message: "Expected delivery date cannot be before shipped date",
        },
      },
      shipmentDetails: {
        type: String,
        maxlength: 1000,
      },
      documents: [String],
      carrierInfo: {
        name: String,
        trackingNumber: String,
        contact: String,
      },
    },

    receivingInfo: {
      receivedAt: Date,
      receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      receivedDate: Date,
      qualityCheck: {
        passed: Boolean,
        checkedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        remarks: String,
        checkedAt: Date,
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
      incompleteRemark: {
        type: String,
        maxlength: 500,
      },
    },

    challanDocument: {
      type: String,
      trim: true,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    lastStatusChange: Date,
    processingTime: Number,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals
stockTransferSchema.virtual("transferDirection").get(function() {
  return `${this.fromCenter?.centerCode || 'Unknown'} → ${this.toCenter?.centerCode || 'Unknown'}`;
});

stockTransferSchema.virtual("statusDuration").get(function () {
  if (!this.lastStatusChange) return null;
  return Date.now() - this.lastStatusChange.getTime();
});

stockTransferSchema.virtual("isPendingAdminApproval").get(function () {
  return this.status === "Submitted" && !this.adminApproval.status;
});

stockTransferSchema.virtual("isAdminApproved").get(function () {
  return this.adminApproval.status === "Approved";
});

stockTransferSchema.virtual("isAdminRejected").get(function () {
  return this.adminApproval.status === "Rejected";
});

// Static Methods
stockTransferSchema.statics.findByUserCenter = function(userCenterId, options = {}) {
  const { page = 1, limit = 10, status, populate = true } = options;
  const skip = (page - 1) * limit;

  let query = this.find({ fromCenter: userCenterId });

  if (status) {
    query = query.where('status', status);
  }

  query = query.sort({ createdAt: -1 }).skip(skip).limit(limit);

  if (populate) {
    query = query
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "fullName email");
  }

  return query;
};

stockTransferSchema.statics.findByStatus = function (status, options = {}) {
  const { page = 1, limit = 10, populate = true } = options;
  const skip = (page - 1) * limit;

  let query = this.find({ status })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (populate) {
    query = query
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "fullName email");
  }

  return query;
};

stockTransferSchema.statics.findPendingAdminApproval = function (options = {}) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  return this.find({
    status: "Submitted",
    "adminApproval.status": { $exists: false }
  })
    .populate("fromCenter", "_id centerName centerCode")
    .populate("toCenter", "_id centerName centerCode")
    .populate("products.product", "productTitle productCode trackSerialNumbers")
    .populate("createdBy", "fullName email")
    .sort(sortOptions)
    .limit(limit)
    .skip(skip);
};

stockTransferSchema.statics.findAdminApproved = function (options = {}) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  return this.find({
    "adminApproval.status": "Approved",
  })
    .populate("fromCenter", "_id centerName centerCode")
    .populate("toCenter", "_id centerName centerCode")
    .populate("products.product", "productTitle productCode trackSerialNumbers")
    .populate("createdBy", "fullName email")
    .populate("adminApproval.approvedBy", "fullName email")
    .sort(sortOptions)
    .limit(limit)
    .skip(skip);
};

stockTransferSchema.statics.findAdminRejected = function (options = {}) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  return this.find({
    "adminApproval.status": "Rejected",
  })
    .populate("fromCenter", "_id centerName centerCode")
    .populate("toCenter", "_id centerName centerCode")
    .populate("products.product", "productTitle productCode trackSerialNumbers")
    .populate("createdBy", "fullName email")
    .populate("adminApproval.rejectedBy", "fullName email")
    .sort(sortOptions)
    .limit(limit)
    .skip(skip);
};

stockTransferSchema.statics.findByDestinationCenter = function(toCenterId, options = {}) {
  const { page = 1, limit = 10, status, populate = true } = options;
  const skip = (page - 1) * limit;

  let query = this.find({ toCenter: toCenterId });

  if (status) {
    query = query.where('status', status);
  }

  query = query.sort({ createdAt: -1 }).skip(skip).limit(limit);

  if (populate) {
    query = query
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "fullName email");
  }

  return query;
};

stockTransferSchema.statics.getTransferStats = async function (centerId = null) {
  const matchStage = centerId
    ? { $match: { fromCenter: new mongoose.Types.ObjectId(centerId) } }
    : { $match: {} };

  return this.aggregate([
    matchStage,
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalQuantity: { $sum: { $sum: "$products.quantity" } },
        avgProcessingTime: { $avg: "$processingTime" },
      },
    },
    {
      $project: {
        status: "$_id",
        count: 1,
        totalQuantity: 1,
        avgProcessingTime: 1,
        _id: 0,
      },
    },
  ]);
};

stockTransferSchema.statics.getDestinationStats = async function (centerId) {
  return this.aggregate([
    { $match: { toCenter: new mongoose.Types.ObjectId(centerId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalReceivedQuantity: { 
          $sum: { 
            $sum: "$products.receivedQuantity" 
          } 
        },
        pendingCount: {
          $sum: {
            $cond: [{ $in: ["$status", ["Shipped", "Confirmed", "Admin_Approved"]] }, 1, 0]
          }
        }
      },
    },
    {
      $project: {
        status: "$_id",
        count: 1,
        totalReceivedQuantity: 1,
        pendingCount: 1,
        _id: 0,
      },
    },
  ]);
};

// Instance Methods
stockTransferSchema.methods.submitTransfer = async function () {
  if (this.status !== "Draft") {
    throw new Error("Only draft transfers can be submitted");
  }

  await this.validateSerialNumbers();
  await this.validateStockAvailability();
  
  this.status = "Submitted";
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.validateSerialNumbers = async function () {
  const Product = mongoose.model("Product");
  
  for (const item of this.products) {
    const product = await Product.findById(item.product);
    if (product && product.trackSerialNumbers) {
      if (!item.serialNumbers || item.serialNumbers.length !== item.quantity) {
        throw new Error(
          `Product "${product.productTitle}" requires exactly ${item.quantity} serial numbers`
        );
      }
      
      const uniqueSerials = new Set(item.serialNumbers);
      if (uniqueSerials.size !== item.serialNumbers.length) {
        throw new Error(
          `Product "${product.productTitle}" has duplicate serial numbers`
        );
      }
    }
  }
};

// Simplified Admin Approval Methods - No modifications or remarks
stockTransferSchema.methods.approveByAdmin = async function (approvedBy) {
  if (this.status !== "Submitted") {
    throw new Error("Only submitted transfers can be approved by admin");
  }

  if (this.adminApproval.status) {
    throw new Error("Transfer has already been processed by admin");
  }

  // Set approved quantity equal to requested quantity for all products
  this.products.forEach((product) => {
    product.approvedQuantity = product.quantity;
  });

  this.adminApproval.status = "Approved";
  this.adminApproval.approvedBy = approvedBy;
  this.adminApproval.approvedAt = new Date();

  this.status = "Admin_Approved";
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.rejectByAdmin = async function (rejectedBy) {
  if (this.status !== "Submitted") {
    throw new Error("Only submitted transfers can be rejected by admin");
  }

  if (this.adminApproval.status) {
    throw new Error("Transfer has already been processed by admin");
  }

  this.adminApproval.status = "Rejected";
  this.adminApproval.rejectedBy = rejectedBy;
  this.adminApproval.rejectedAt = new Date();

  this.status = "Admin_Rejected";
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.confirmTransfer = async function (confirmedBy) {
  if (this.status !== "Admin_Approved") {
    throw new Error("Transfer must be admin approved before center confirmation");
  }

  this.status = "Confirmed";
  this.centerApproval.approvedBy = confirmedBy;
  this.centerApproval.approvedAt = new Date();
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.shipTransfer = async function (
  shippedBy,
  shippingDetails = {}
) {
  if (this.status !== "Confirmed") {
    throw new Error("Transfer must be confirmed before shipping");
  }

  if (!this.stockStatus.sourceDeducted) {
    await this.processSourceDeduction();
  }

  this.status = "Shipped";
  this.shippingInfo.shippedBy = shippedBy;
  this.shippingInfo.shippedAt = new Date();
  this.lastStatusChange = new Date();

  Object.keys(shippingDetails).forEach((key) => {
    if (shippingDetails[key] !== undefined) {
      this.shippingInfo[key] = shippingDetails[key];
    }
  });

  return this.save();
};

stockTransferSchema.methods.completeTransfer = async function (
  completedBy,
  productReceipts = []
) {
  if (this.status !== "Shipped") {
    throw new Error("Transfer must be shipped before completion");
  }

  if (!this.stockStatus.destinationAdded) {
    await this.processDestinationAddition();
  }

  this.status = "Completed";
  this.receivingInfo.receivedBy = completedBy;
  this.receivingInfo.receivedAt = new Date();
  this.completionInfo.completedOn = new Date();
  this.completionInfo.completedBy = completedBy;
  this.lastStatusChange = new Date();

  this.processingTime = Date.now() - this.createdAt.getTime();

  if (productReceipts.length > 0) {
    productReceipts.forEach((receipt) => {
      const productItem = this.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );
      if (productItem) {
        productItem.receivedQuantity = receipt.receivedQuantity;
        productItem.receivedRemark = receipt.receivedRemark || "";
      }
    });
  } else {
    this.products.forEach((product) => {
      product.receivedQuantity = product.approvedQuantity || product.quantity;
    });
  }

  return this.save();
};

stockTransferSchema.methods.markAsIncomplete = async function (
  incompleteBy,
  incompleteRemark = ""
) {
  if (!["Shipped", "Confirmed"].includes(this.status)) {
    throw new Error("Only shipped or confirmed transfers can be marked as incomplete");
  }

  this.status = "Incompleted";
  this.completionInfo.incompleteOn = new Date();
  this.completionInfo.incompleteBy = incompleteBy;
  this.completionInfo.incompleteRemark = incompleteRemark;
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.rejectTransfer = async function (
  rejectedBy,
  rejectionRemark = ""
) {
  if (!["Admin_Approved", "Confirmed"].includes(this.status)) {
    throw new Error("Only admin approved or confirmed transfers can be rejected");
  }

  this.status = "Rejected";
  this.completionInfo.incompleteOn = new Date();
  this.completionInfo.incompleteBy = rejectedBy;
  this.completionInfo.incompleteRemark = rejectionRemark;
  this.lastStatusChange = new Date();

  return this.save();
};

stockTransferSchema.methods.validateStockAvailability = async function () {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  for (const item of this.products) {
    const product = await Product.findById(item.product);
    const requiresSerialNumbers = product ? product.trackSerialNumbers : false;
    item.requiresSerialNumbers = requiresSerialNumbers;

    const centerStock = await CenterStock.findOne({
      center: this.fromCenter,
      product: item.product,
    });

    if (!centerStock || centerStock.availableQuantity < item.quantity) {
      throw new Error(
        `Insufficient stock for product ${product?.productTitle}. Available: ${
          centerStock?.availableQuantity || 0
        }, Requested: ${item.quantity}`
      );
    }

    item.productInStock = centerStock.availableQuantity;

    if (requiresSerialNumbers && centerStock.serialNumbers) {
      const availableSerials = centerStock.serialNumbers
        .filter((sn) => sn.status === "available")
        .sort(
          (a, b) =>
            new Date(a.createdAt || a.transferHistory[0]?.transferDate) -
            new Date(b.createdAt || b.transferHistory[0]?.transferDate)
        )
        .slice(0, item.quantity);

      if (availableSerials.length < item.quantity) {
        throw new Error(
          `Insufficient serial numbers available for product ${product?.productTitle}. Available: ${availableSerials.length}, Required: ${item.quantity}`
        );
      }

      item.availableSerials = availableSerials.map((serial) => ({
        serialNumber: serial.serialNumber,
        purchaseId: serial.purchaseId,
        addedAt: serial.createdAt || serial.transferHistory[0]?.transferDate,
      }));
    }
  }
};

stockTransferSchema.methods.processSourceDeduction = async function () {
  const CenterStock = mongoose.model("CenterStock");

  for (const item of this.products) {
    const centerStock = await CenterStock.findOne({
      center: this.fromCenter,
      product: item.product,
    });

    if (!centerStock) {
      throw new Error(`Stock not found for product in source center`);
    }

    let serialNumbersToTransfer = [];
    const quantityToTransfer = item.approvedQuantity || item.quantity;

    if (item.requiresSerialNumbers) {
      const availableSerials = centerStock.serialNumbers
        .filter((sn) => sn.status === "available")
        .sort(
          (a, b) =>
            new Date(a.createdAt || a.transferHistory[0]?.transferDate) -
            new Date(b.createdAt || b.transferHistory[0]?.transferDate)
        )
        .slice(0, quantityToTransfer);

      serialNumbersToTransfer = availableSerials.map((sn) => sn.serialNumber);
      item.serialNumbers = serialNumbersToTransfer;
    }

    await centerStock.transferToCenter(
      this.toCenter,
      quantityToTransfer,
      serialNumbersToTransfer
    );
  }

  this.stockStatus.sourceDeducted = true;
  this.stockStatus.deductedAt = new Date();
  this.stockStatus.lastStockCheck = new Date();
};

stockTransferSchema.methods.processDestinationAddition = async function () {
  const CenterStock = mongoose.model("CenterStock");

  for (const item of this.products) {
    let serialNumbers = [];
    const quantityToAdd =
      item.receivedQuantity || item.approvedQuantity || item.quantity;

    if (
      item.requiresSerialNumbers &&
      item.serialNumbers &&
      item.serialNumbers.length > 0
    ) {
      serialNumbers = item.serialNumbers.slice(0, quantityToAdd);
    }

    await CenterStock.updateStock(
      this.toCenter,
      item.product,
      quantityToAdd,
      serialNumbers,
      this.fromCenter,
      "inbound_transfer"
    );
  }

  this.stockStatus.destinationAdded = true;
  this.stockStatus.addedAt = new Date();
  this.stockStatus.lastStockCheck = new Date();
};

// Middleware
stockTransferSchema.pre("save", async function (next) {
  try {
    if (this.isModified("status")) {
      this.lastStatusChange = new Date();
    }

    // Auto-update main status based on admin approval
    if (this.isModified("adminApproval.status")) {
      if (this.adminApproval.status === "Approved") {
        this.status = "Admin_Approved";
      } else if (this.adminApproval.status === "Rejected") {
        this.status = "Admin_Rejected";
      }
    }

    if (this.isNew) {
      return next();
    }

    // Validate status transitions - Admin approval is mandatory after submission
    if (this.isModified("status")) {
      const validTransitions = {
        Draft: ["Submitted"],
        Submitted: ["Admin_Approved", "Admin_Rejected"],
        Admin_Approved: ["Confirmed", "Rejected"],
        Admin_Rejected: [],
        Confirmed: ["Shipped", "Incompleted", "Rejected"],
        Shipped: ["Completed", "Incompleted"],
        Incompleted: ["Confirmed", "Shipped", "Completed"],
        Completed: [],
        Rejected: [],
      };

      if (this._id) {
        const originalDoc = await this.constructor.findById(this._id);
        if (originalDoc && originalDoc.status !== this.status) {
          if (!validTransitions[originalDoc.status]?.includes(this.status)) {
            return next(
              new Error(
                `Invalid status transition from ${originalDoc.status} to ${this.status}`
              )
            );
          }
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

stockTransferSchema.pre("validate", async function (next) {
  try {
    if (
      this.toCenter &&
      this.fromCenter.toString() === this.toCenter.toString()
    ) {
      return next(new Error("From center and to center cannot be the same"));
    }

    if (!this.products || this.products.length === 0) {
      return next(new Error("At least one product is required for transfer"));
    }

    // Validate that center cannot proceed without admin approval
    if (this.isModified("status") && ["Confirmed", "Shipped", "Completed", "Incompleted"].includes(this.status)) {
      if (this.adminApproval.status !== "Approved") {
        return next(new Error("Admin approval is required before center can process the transfer"));
      }
    }

    if (this.isModified("transferNumber")) {
      const existingTransfer = await this.constructor.findOne({
        transferNumber: this.transferNumber,
        _id: { $ne: this._id },
      });

      if (existingTransfer) {
        return next(new Error("Transfer number must be unique"));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

stockTransferSchema.post("save", function() {
  if (this._originalStatus !== undefined) {
    delete this._originalStatus;
  }
});

// Indexes
stockTransferSchema.index({ createdAt: -1 });
stockTransferSchema.index({ updatedAt: -1 });
stockTransferSchema.index({ status: 1, createdAt: -1 });
stockTransferSchema.index({ fromCenter: 1, status: 1 });
stockTransferSchema.index({ toCenter: 1, status: 1 });
stockTransferSchema.index({ "adminApproval.status": 1 });
stockTransferSchema.index({ "products.product": 1 });
stockTransferSchema.index({ date: 1, status: 1 });
stockTransferSchema.index({
  transferNumber: "text",
  remark: "text",
});

stockTransferSchema.index({ fromCenter: 1, toCenter: 1, status: 1 });
stockTransferSchema.index({ status: 1, "adminApproval.status": 1 });
stockTransferSchema.index({ createdBy: 1, status: 1 });

stockTransferSchema.index({ toCenter: 1, createdAt: -1 });
stockTransferSchema.index({ fromCenter: 1, toCenter: 1, createdAt: -1 });

export default mongoose.model("StockTransfer", stockTransferSchema);