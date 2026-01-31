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

        // NEW: Track source of approved stock
        sourceBreakdown: {
          fromReseller: {
            quantity: { 
              type: Number, 
              default: 0,
              min: 0
            },
            serials: [{ 
              type: String,
              trim: true 
            }], // For serialized products
          },
          fromOutlet: {
            quantity: { 
              type: Number, 
              default: 0,
              min: 0
            },
            serials: [{ 
              type: String,
              trim: true 
            }], // For serialized products
          },
          totalApproved: {
            type: Number,
            default: 0,
            min: 0
          }
        },
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
      }
    },

    incompleteInfo: {
      incompleteOn: Date,
      incompleteBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      incompleteRemark: {
        type: String,
        trim: true,
      },
      incompleteReceipts: [
        {
          productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
          },
          receivedQuantity: Number,
          receivedRemark: String,
          receivedSerials: [String],
        }
      ]
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
    
invoiceInfo: {
  invoiceRaised: {
    type: Boolean,
    default: false
  },
  invoiceNumber: {
    type: String,
    trim: true
  },
  invoiceDate: {
    type: Date
  },
  invoiceRaisedAt: {
    type: Date
  },
  invoiceRaisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}
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

        // NEW: Store source breakdown if available
        if (approval.sourceBreakdown) {
          product.sourceBreakdown = approval.sourceBreakdown;
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
    const ResellerStock = mongoose.model("ResellerStock");

    // Get reseller ID from the center
    const center = await mongoose.model("Center").findById(this.center).populate("reseller");
    const resellerId = center?.reseller?._id;

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

      // Get source breakdown
      const sourceBreakdown = productItem.sourceBreakdown || {};
      const fromReseller = sourceBreakdown.fromReseller || { quantity: 0, serials: [] };
      const fromOutlet = sourceBreakdown.fromOutlet || { quantity: 0, serials: [] };

      let transferredSerials = [];
      let transferredFromReseller = 0;
      let transferredFromOutlet = 0;

      // 1. Process stock from reseller (if any)
      if (fromReseller.quantity > 0 && resellerId) {
        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId,
        });

        if (!resellerStock) {
          throw new Error(`Reseller stock not found for product "${productDoc?.productTitle}"`);
        }

        const resellerQtyToTransfer = Math.min(fromReseller.quantity, receivedQuantity);
        let resellerSerialsToTransfer = [];

        if (tracksSerialNumbers && Array.isArray(fromReseller.serials)) {
          // Get serials from reseller
          resellerSerialsToTransfer = fromReseller.serials.slice(0, resellerQtyToTransfer);
          
          // Verify serials are available in reseller stock
          for (const serialNumber of resellerSerialsToTransfer) {
            const serial = resellerStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber && sn.status === "available"
            );
            
            if (!serial) {
              throw new Error(`Serial number ${serialNumber} not available in reseller stock for product "${productDoc?.productTitle}"`);
            }

            // Mark as consumed in reseller stock
            serial.status = "consumed";
            serial.consumedDate = new Date();
            serial.consumedBy = transferredBy;
            serial.currentLocation = this.center;
            
            serial.transferHistory.push({
              fromCenter: null,
              toCenter: this.center,
              transferDate: new Date(),
              transferType: "outbound_transfer",
              remark: "Stock request completion",
              transferredBy: transferredBy,
              referenceId: this._id
            });
          }
          
          transferredSerials.push(...resellerSerialsToTransfer);
        } else {
          // Non-serialized products from reseller
          console.log(`Transferring ${resellerQtyToTransfer} non-serialized units from reseller stock`);
        }

        // Update reseller stock quantities
        resellerStock.availableQuantity -= resellerQtyToTransfer;
        resellerStock.consumedQuantity += resellerQtyToTransfer;
        await resellerStock.save();

        transferredFromReseller = resellerQtyToTransfer;
        console.log(`Transferred ${transferredFromReseller} units from reseller stock`);
      }

      // 2. Process stock from outlet (remaining quantity)
      const outletQtyToTransfer = Math.min(
        fromOutlet.quantity,
        receivedQuantity - transferredFromReseller
      );

      if (outletQtyToTransfer > 0) {
        const outletStock = await OutletStock.findOne({
          outlet: this.warehouse,
          product: productId,
        });

        if (!outletStock || outletStock.availableQuantity < outletQtyToTransfer) {
          throw new Error(
            `Insufficient stock in outlet for product "${
              productDoc?.productTitle || productId
            }". Required: ${outletQtyToTransfer}, Available: ${
              outletStock ? outletStock.availableQuantity : 0
            }`
          );
        }

        let outletSerialsToTransfer = [];

        if (tracksSerialNumbers && Array.isArray(fromOutlet.serials)) {
          // Get serials from outlet
          outletSerialsToTransfer = fromOutlet.serials.slice(0, outletQtyToTransfer);

          // Verify serials are available in outlet stock
          for (const serialNumber of outletSerialsToTransfer) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber && sn.status === "in_transit"
            );
            
            if (!serial) {
              throw new Error(`Serial number ${serialNumber} not in transit in outlet stock for product "${productDoc?.productTitle}"`);
            }

            // Mark as transferred in outlet stock
            serial.status = "transferred";
            serial.currentLocation = this.center;
            serial.transferHistory.push({
              fromCenter: this.warehouse,
              toCenter: this.center,
              transferDate: new Date(),
              transferType: "outlet_to_center",
              remark: "Stock request completion",
              transferredBy: transferredBy,
              referenceId: this._id
            });
          }
          
          transferredSerials.push(...outletSerialsToTransfer);
        } else {
          // Non-serialized products from outlet
          console.log(`Transferring ${outletQtyToTransfer} non-serialized units from outlet stock`);
        }

        // Update outlet stock quantities
        outletStock.availableQuantity -= outletQtyToTransfer;
        outletStock.inTransitQuantity -= outletQtyToTransfer;
        outletStock.totalQuantity -= outletQtyToTransfer;
        await outletStock.save();

        transferredFromOutlet = outletQtyToTransfer;
        console.log(`Transferred ${transferredFromOutlet} units from outlet stock`);
      }

      // 3. Add stock to center (both from reseller and outlet)
      if (transferredFromReseller > 0 || transferredFromOutlet > 0) {
        // Find or create center stock
        let centerStock = await CenterStock.findOne({
          center: this.center,
          product: productId,
        });

        if (!centerStock) {
          centerStock = new CenterStock({
            center: this.center,
            product: productId,
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
            serialNumbers: [],
          });
        }

        const totalTransferred = transferredFromReseller + transferredFromOutlet;
        
        // Track how many serials were actually added (not just reactivated)
        let newlyAddedSerials = 0;
        let reactivatedSerials = 0;

        // Add serial numbers to center stock
        if (tracksSerialNumbers && transferredSerials.length > 0) {
          for (const serialNumber of transferredSerials) {
            // Check if serial already exists in center stock
            const existingSerialIndex = centerStock.serialNumbers.findIndex(
              sn => sn.serialNumber === serialNumber
            );

            if (existingSerialIndex !== -1) {
              // Serial already exists - update it
              const existingSerial = centerStock.serialNumbers[existingSerialIndex];
              
              // Check if the serial is damaged
              if (existingSerial.status === "damaged" || existingSerial.status === "damage_pending") {
                // Reactivate damaged serial
                existingSerial.status = "available";
                existingSerial.currentLocation = this.center;
                
                existingSerial.transferHistory.push({
                  fromCenter: null,
                  toCenter: this.center,
                  transferDate: new Date(),
                  transferType: "replacement_return",
                  remark: "Stock request completion - reactivated damaged stock",
                  referenceId: this._id,
                  transferredBy: transferredBy
                });
                
                reactivatedSerials++;
                console.log(`Reactivated damaged serial ${serialNumber} in center stock`);
              } else if (existingSerial.status === "available") {
                // Serial already exists and is available - this might be a duplicate
                console.warn(`Serial ${serialNumber} already exists in center stock with status "available"`);
                // We should not count this as a new transfer
              } else if (existingSerial.status === "consumed") {
                // If it's consumed, we might want to create a new entry or handle differently
                console.log(`Serial ${serialNumber} exists with status "consumed" - creating new entry`);
                newlyAddedSerials++;
                addNewSerialToCenterStock(serialNumber);
              }
            } else {
              // Serial doesn't exist - add it
              newlyAddedSerials++;
              addNewSerialToCenterStock(serialNumber);
            }
          }

          // Update center stock quantities based on actual additions
          centerStock.totalQuantity += newlyAddedSerials;
          centerStock.availableQuantity += (newlyAddedSerials + reactivatedSerials);
          
          console.log(`Added ${newlyAddedSerials} new serials and reactivated ${reactivatedSerials} damaged serials`);
        } else {
          // Non-serialized products
          centerStock.totalQuantity += totalTransferred;
          centerStock.availableQuantity += totalTransferred;
        }

        await centerStock.save();

        // Helper function to add new serial to center stock
        async function addNewSerialToCenterStock(serialNumber) {
          // Get purchaseId from outlet stock for outlet serials
          let purchaseId = null;
          let originalOutlet = this.warehouse;
          
          // For reseller serials, we need to get the original purchaseId
          if (fromReseller.serials && fromReseller.serials.includes(serialNumber)) {
            // Try to find the serial in reseller stock to get transfer history
            const resellerStock = await ResellerStock.findOne({
              reseller: resellerId,
              product: productId,
              "serialNumbers.serialNumber": serialNumber
            });
            
            if (resellerStock) {
              const serial = resellerStock.serialNumbers.find(
                sn => sn.serialNumber === serialNumber
              );
              
              // Try to get original purchaseId from transfer history
              if (serial && serial.transferHistory && serial.transferHistory.length > 0) {
                const originalTransfer = serial.transferHistory.find(
                  th => th.transferType === "outlet_to_reseller"
                );
                if (originalTransfer && originalTransfer.referenceId) {
                  // Get purchaseId from the original outlet stock
                  const originalOutletStock = await OutletStock.findById(originalTransfer.referenceId);
                  if (originalOutletStock) {
                    const outletSerial = originalOutletStock.serialNumbers.find(
                      sn => sn.serialNumber === serialNumber
                    );
                    purchaseId = outletSerial?.purchaseId;
                    originalOutlet = originalTransfer.fromCenter;
                  }
                }
              }
            }
          } else {
            // For outlet serials, get purchaseId from outlet stock
            const outletStock = await OutletStock.findOne({
              outlet: this.warehouse,
              product: productId,
              "serialNumbers.serialNumber": serialNumber
            });
            
            if (outletStock) {
              const serial = outletStock.serialNumbers.find(
                sn => sn.serialNumber === serialNumber
              );
              purchaseId = serial?.purchaseId;
            }
          }

          centerStock.serialNumbers.push({
            serialNumber: serialNumber,
            purchaseId: purchaseId || new mongoose.Types.ObjectId(),
            originalOutlet: originalOutlet,
            status: "available",
            currentLocation: this.center,
            transferHistory: [{
              fromCenter: originalOutlet,
              toCenter: this.center,
              transferDate: new Date(),
              transferType: "inbound_transfer",
              remark: `Stock request completion - from ${(fromReseller.serials && fromReseller.serials.includes(serialNumber)) ? 'reseller' : 'outlet'}`,
              referenceId: this._id,
              transferredBy: transferredBy
            }]
          });
          console.log(`Added new serial ${serialNumber} to center stock`);
        }
      }

      // Update product item in stock request
      productItem.receivedQuantity = receivedQuantity;
      productItem.receivedRemark = receipt.receivedRemark || "";
      productItem.serialNumbers = transferredSerials;
      productItem.transferredSerials = transferredSerials;

      transferResults.push({
        productId,
        productName: productDoc?.productTitle,
        receivedQuantity,
        transferredFromReseller,
        transferredFromOutlet,
        totalTransferred: transferredFromReseller + transferredFromOutlet,
        serials: tracksSerialNumbers ? transferredSerials : [],
        success: true,
      });

      console.log(
        `Successfully transferred ${receivedQuantity} units of ${productDoc?.productTitle} to center (${transferredFromReseller} from reseller, ${transferredFromOutlet} from outlet)`
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
      message: "Stock transferred successfully to center",
      transferResults,
    };
  } catch (error) {
    this.stockTransferStatus = "failed";
    this.stockTransferError = error.message;
    await this.save();

    throw new Error(`Failed to transfer stock: ${error.message}`);
  }
};

stockRequestSchema.methods.validateSerialNumbers = async function (productApprovals) {
  const OutletStock = mongoose.model("OutletStock");
  const ResellerStock = mongoose.model("ResellerStock");
  const Product = mongoose.model("Product");
  const validationResults = [];

  for (const approval of productApprovals) {
    const productDoc = await Product.findById(approval.productId);
    const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

    if (tracksSerialNumbers && approval.approvedSerials) {
      // Get the requesting center's reseller
      const center = await mongoose.model("Center").findById(this.center).populate("reseller");
      const resellerId = center?.reseller?._id;
      
      let unavailableSerials = [];
      let availableSerials = [];
      
      // Check both sources
      if (resellerId) {
        // Check reseller stock first
        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: approval.productId,
        });
        
        if (resellerStock) {
          for (const serialNumber of approval.approvedSerials) {
            const serial = resellerStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber && sn.status === "available"
            );
            if (serial) {
              availableSerials.push(serialNumber);
            }
          }
        }
      }
      
      // Check outlet stock for remaining serials
      const remainingSerials = approval.approvedSerials.filter(
        sn => !availableSerials.includes(sn)
      );
      
      if (remainingSerials.length > 0) {
        const outletStock = await OutletStock.findOne({
          outlet: this.warehouse,
          product: approval.productId,
        });
        
        if (outletStock) {
          for (const serialNumber of remainingSerials) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber && sn.status === "available"
            );
            if (serial) {
              availableSerials.push(serialNumber);
            } else {
              unavailableSerials.push(serialNumber);
            }
          }
        } else {
          unavailableSerials.push(...remainingSerials);
        }
      }
      
      validationResults.push({
        productId: approval.productId,
        productName: productDoc.productTitle,
        valid: unavailableSerials.length === 0,
        availableSerials: availableSerials,
        unavailableSerials: unavailableSerials,
        error: unavailableSerials.length > 0
          ? `Serial numbers not available in reseller or outlet stock: ${unavailableSerials.join(", ")}`
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

stockRequestSchema.methods.validateSerialNumbersForIncomplete = async function (productApprovals) {
  const OutletStock = mongoose.model("OutletStock");
  const ResellerStock = mongoose.model("ResellerStock");
  const Product = mongoose.model("Product");
  const validationResults = [];

  for (const approval of productApprovals) {
    const productDoc = await Product.findById(approval.productId);
    const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

    if (tracksSerialNumbers && approval.approvedSerials) {
      const center = await mongoose.model("Center").findById(this.center).populate("reseller");
      const resellerId = center?.reseller?._id;
      
      let unavailableSerials = [];
      let availableSerials = [];
      
      // Check reseller stock
      if (resellerId) {
        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: approval.productId,
        });
        
        if (resellerStock) {
          for (const serialNumber of approval.approvedSerials) {
            const serial = resellerStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber && sn.status === "available"
            );
            if (serial) {
              availableSerials.push(serialNumber);
            }
          }
        }
      }
      
      // Check outlet stock for remaining serials
      const remainingSerials = approval.approvedSerials.filter(
        sn => !availableSerials.includes(sn)
      );
      
      if (remainingSerials.length > 0) {
        const outletStock = await OutletStock.findOne({
          outlet: this.warehouse,
          product: approval.productId,
        });
        
        if (outletStock) {
          for (const serialNumber of remainingSerials) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );
            
            if (serial) {
              // Accept both available AND in_transit for incomplete completion
              if (serial.status === "available" || serial.status === "in_transit") {
                availableSerials.push(serialNumber);
              } else {
                unavailableSerials.push(serialNumber);
              }
            } else {
              unavailableSerials.push(serialNumber);
            }
          }
        } else {
          unavailableSerials.push(...remainingSerials);
        }
      }
      
      validationResults.push({
        productId: approval.productId,
        productName: productDoc.productTitle,
        valid: unavailableSerials.length === 0,
        availableSerials: availableSerials,
        unavailableSerials: unavailableSerials,
        error: unavailableSerials.length > 0
          ? `Serial numbers not available in reseller or outlet stock: ${unavailableSerials.join(", ")}`
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