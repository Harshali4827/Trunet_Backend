import StockTransfer from "../models/StockTransfer.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockRequest from "../models/StockRequest.js";
import StockPurchase from "../models/StockPurchase.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import OutletStock from "../models/OutletStock.js";
import mongoose from "mongoose";

export const createStockTransfer = async (req, res) => {
  try {
    const {
      fromCenter,
      transferNumber,
      remark,
      products,
      date,
      status = "Draft",
      productApprovals = [],
    } = req.body;

    if (!transferNumber || transferNumber.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Transfer number is required",
      });
    }

    const validStatuses = ["Draft", "Submitted"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Status must be either "Draft" or "Submitted" when creating a transfer',
      });
    }

    const existingTransfer = await StockTransfer.findOne({
      transferNumber: transferNumber.trim(),
    });

    if (existingTransfer) {
      return res.status(409).json({
        success: false,
        message:
          "Transfer number already exists. Please use a unique transfer number.",
        duplicateTransferNumber: transferNumber.trim(),
        existingTransferId: existingTransfer._id,
      });
    }

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const toCenterId = user.center._id;

    const fromCenterExists = await Center.findById(fromCenter);
    const toCenterExists = await Center.findById(toCenterId);

    if (!fromCenterExists || !toCenterExists) {
      return res.status(404).json({
        success: false,
        message: "Source or destination center not found",
      });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required and cannot be empty",
      });
    }

    for (const product of products) {
      if (!product.product || !product.quantity) {
        return res.status(400).json({
          success: false,
          message: "Each product must have product ID and quantity",
        });
      }

      if (product.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Product quantity must be greater than 0",
        });
      }
    }

    let transferDate = new Date();
    if (date) {
      transferDate = new Date(date);
      if (isNaN(transferDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Please provide a valid date.",
        });
      }
    }

    const stockTransfer = new StockTransfer({
      transferNumber: transferNumber.trim(),
      fromCenter,
      toCenter: toCenterId,
      remark: remark || "",
      products,
      date: transferDate,
      status: status,
      createdBy: req.user.id,
    });

    if (status === "Submitted") {
      try {
        await stockTransfer.validateStockAvailability();

        if (productApprovals && productApprovals.length > 0) {
          const validationResults = await stockTransfer.validateSerialNumbers(
            productApprovals
          );
          const invalidResults = validationResults.filter(
            (result) => !result.valid
          );

          if (invalidResults.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Serial number validation failed: ${invalidResults
                .map((r) => r.error)
                .join(", ")}`,
              validationResults: validationResults,
            });
          }

          stockTransfer.products = stockTransfer.products.map((productItem) => {
            const approval = productApprovals.find(
              (pa) => pa.productId.toString() === productItem.product.toString()
            );

            if (approval) {
              return {
                ...productItem.toObject(),
                approvedQuantity:
                  approval.approvedQuantity || productItem.quantity,
                approvedRemark: approval.approvedRemark || "",
                approvedSerials: approval.approvedSerials || [],
              };
            }
            return productItem;
          });
        } else {
          stockTransfer.products.forEach((product) => {
            product.approvedQuantity = product.quantity;
          });
        }

        await stockTransfer.validateTransferSerialNumbers();
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: `Cannot create transfer with Submitted status: ${validationError.message}`,
        });
      }
    }

    const savedStockTransfer = await stockTransfer.save();

    const populatedTransfer = await StockTransfer.findById(
      savedStockTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email");

    res.status(201).json({
      success: true,
      message: `Stock transfer created successfully with status: ${status}`,
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error creating stock transfer:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === "transferNumber") {
        return res.status(409).json({
          success: false,
          message:
            "Transfer number already exists. Please use a unique transfer number.",
          duplicateTransferNumber: req.body.transferNumber,
        });
      }
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path}: ${error.value}`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating stock transfer",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const submitStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const submittedTransfer = await stockTransfer.submitTransfer();

    const populatedTransfer = await StockTransfer.findById(
      submittedTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Stock transfer submitted successfully. Waiting for admin approval.",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error submitting stock transfer:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const approveStockTransferByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const approvedTransfer = await stockTransfer.approveByAdmin(userId);

    const populatedTransfer = await StockTransfer.findById(approvedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("adminApproval.approvedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock transfer approved by admin successfully",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error approving stock transfer by admin:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const rejectStockTransferByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const rejectedTransfer = await stockTransfer.rejectByAdmin(userId);

    const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("adminApproval.rejectedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock transfer rejected by admin",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error rejecting stock transfer by admin:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const validateSerialNumbers = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const validationResults = await stockTransfer.validateSerialNumbers(
      productApprovals
    );

    const hasErrors = validationResults.some((result) => !result.valid);

    res.status(200).json({
      success: true,
      message: hasErrors
        ? "Some serial numbers validation failed"
        : "All serial numbers are valid",
      data: validationResults,
      isValid: !hasErrors,
    });
  } catch (error) {
    console.error("Error validating serial numbers:", error);
    res.status(500).json({
      success: false,
      message: "Error validating serial numbers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getAvailableSerials = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const availableSerials = await stockTransfer.getAvailableSerials();

    res.status(200).json({
      success: true,
      message: "Available serial numbers retrieved successfully",
      data: availableSerials,
    });
  } catch (error) {
    console.error("Error retrieving available serial numbers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving available serial numbers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const confirmStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (productApprovals && productApprovals.length > 0) {
      const validationResults = await stockTransfer.validateSerialNumbers(
        productApprovals
      );
      const invalidResults = validationResults.filter(
        (result) => !result.valid
      );

      if (invalidResults.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Serial number validation failed",
          validationErrors: invalidResults.map((result) => ({
            productId: result.productId,
            productName: result.productName,
            error: result.error,
          })),
        });
      }

      for (const approval of productApprovals) {
        if (!approval.productId) {
          return res.status(400).json({
            success: false,
            message: "Each approval must have a productId",
          });
        }

        if (
          approval.approvedQuantity === undefined ||
          approval.approvedQuantity === null
        ) {
          return res.status(400).json({
            success: false,
            message: "Each approval must have an approvedQuantity",
          });
        }

        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: "Approved quantity cannot be negative",
          });
        }

        const productItem = stockTransfer.products.find(
          (p) => p.product.toString() === approval.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product with ID ${approval.productId} not found in this transfer`,
          });
        }

        if (approval.approvedQuantity > productItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product`,
          });
        }

        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          if (approval.approvedSerials.length !== approval.approvedQuantity) {
            return res.status(400).json({
              success: false,
              message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product`,
            });
          }

          const uniqueSerials = new Set(approval.approvedSerials);
          if (uniqueSerials.size !== approval.approvedSerials.length) {
            return res.status(400).json({
              success: false,
              message: `Duplicate serial numbers found for product`,
            });
          }
        }
      }
    }

    const confirmedTransfer = await stockTransfer.confirmTransfer(
      userId,
      productApprovals
    );

    if (productApprovals && productApprovals.length > 0) {
      const CenterStock = mongoose.model("CenterStock");

      for (const approval of productApprovals) {
        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          const centerStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: approval.productId,
          });

          if (centerStock) {
            for (const serialNumber of approval.approvedSerials) {
              const serial = centerStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial) {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockTransfer.fromCenter,
                  toCenter: stockTransfer.toCenter,
                  transferDate: new Date(),
                  transferType: "outbound_transfer",
                });
              }
            }

            await centerStock.save();
          }
        }
      }
    }

    const populatedTransfer = await StockTransfer.findById(
      confirmedTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("centerApproval.approvedBy", "_id fullName email");

    let message = "Stock transfer confirmed successfully";
    let hasSerialAssignments = false;

    if (productApprovals && productApprovals.length > 0) {
      const quantityAdjustments = productApprovals.filter(
        (pa) => pa.approvedQuantity !== undefined
      ).length;
      const serialAssignments = productApprovals.filter(
        (pa) => pa.approvedSerials && pa.approvedSerials.length > 0
      ).length;

      if (quantityAdjustments > 0) {
        message += ` with ${quantityAdjustments} product quantity adjustment(s)`;
      }

      if (serialAssignments > 0) {
        hasSerialAssignments = true;
        message += ` and ${serialAssignments} serial number assignment(s) marked as in transit`;
      }
    }

    const response = {
      success: true,
      message,
      data: populatedTransfer,
    };

    if (hasSerialAssignments && productApprovals) {
      response.serialAssignments = productApprovals
        .filter((pa) => pa.approvedSerials && pa.approvedSerials.length > 0)
        .map((pa) => ({
          productId: pa.productId,
          approvedQuantity: pa.approvedQuantity,
          assignedSerials: pa.approvedSerials.length,
          newStatus: "in_transit",
        }));
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Error confirming stock transfer:", error);

    if (
      error.message.includes("Serial number validation failed") ||
      error.message.includes("Number of serial numbers") ||
      error.message.includes("Duplicate serial numbers") ||
      error.message.includes("serial numbers not available")
    ) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        error: error.message,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID or transfer ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const completeStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productReceipts } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (productReceipts && productReceipts.length > 0) {
      for (const receipt of productReceipts) {
        const productItem = stockTransfer.products.find(
          (p) => p.product.toString() === receipt.productId.toString()
        );

        if (
          productItem &&
          receipt.receivedQuantity > productItem.approvedQuantity
        ) {
          return res.status(400).json({
            success: false,
            message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product`,
          });
        }
      }
    }

    const CenterStock = mongoose.model("CenterStock");

    for (const productItem of stockTransfer.products) {
      if (
        productItem.approvedSerials &&
        productItem.approvedSerials.length > 0
      ) {
        const receivedReceipt = productReceipts?.find(
          (pr) => pr.productId.toString() === productItem.product.toString()
        );

        const receivedQuantity =
          receivedReceipt?.receivedQuantity || productItem.approvedQuantity;

        const serialsToTransfer = productItem.approvedSerials.slice(
          0,
          receivedQuantity
        );
        const serialsToReturn =
          productItem.approvedSerials.slice(receivedQuantity);

        const sourceCenterStock = await CenterStock.findOne({
          center: stockTransfer.fromCenter,
          product: productItem.product,
        });

        if (sourceCenterStock) {
          for (const serialNumber of serialsToTransfer) {
            const serial = sourceCenterStock.serialNumbers.find(
              (sn) =>
                sn.serialNumber === serialNumber && sn.status === "in_transit"
            );

            if (serial) {
              serial.status = "transferred";
              serial.currentLocation = stockTransfer.toCenter;
              serial.transferHistory.push({
                fromCenter: stockTransfer.fromCenter,
                toCenter: stockTransfer.toCenter,
                transferDate: new Date(),
                transferType: "outbound_transfer",
              });
            }
          }

          for (const serialNumber of serialsToReturn) {
            const serial = sourceCenterStock.serialNumbers.find(
              (sn) =>
                sn.serialNumber === serialNumber && sn.status === "in_transit"
            );

            if (serial) {
              serial.status = "available";

              if (serial.transferHistory.length > 0) {
                serial.transferHistory.pop();
              }
            }
          }

          const transferredCount = serialsToTransfer.length;
          const returnedCount = serialsToReturn.length;

          await sourceCenterStock.save();

          console.log(
            `[DEBUG] Product ${productItem.product}: Transferred ${transferredCount}, Returned ${returnedCount} serials`
          );
        }

        if (serialsToTransfer.length > 0) {
          const destinationCenterStock = await CenterStock.findOne({
            center: stockTransfer.toCenter,
            product: productItem.product,
          });

          if (destinationCenterStock) {
            for (const serialNumber of serialsToTransfer) {
              const originalSerial = sourceCenterStock?.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (originalSerial) {
                const existingSerial =
                  destinationCenterStock.serialNumbers.find(
                    (sn) => sn.serialNumber === serialNumber
                  );

                if (!existingSerial) {
                  const newSerial = {
                    serialNumber: serialNumber,
                    purchaseId:
                      originalSerial.purchaseId ||
                      new mongoose.Types.ObjectId(),
                    originalOutlet:
                      originalSerial.originalOutlet || stockTransfer.fromCenter,
                    status: "available",
                    currentLocation: stockTransfer.toCenter,
                    transferHistory: [
                      ...(originalSerial.transferHistory || []),
                      {
                        fromCenter: stockTransfer.fromCenter,
                        toCenter: stockTransfer.toCenter,
                        transferDate: new Date(),
                        transferType: "inbound_transfer",
                      },
                    ],
                  };

                  if (!newSerial.purchaseId) {
                    console.warn(
                      `[WARNING] Serial ${serialNumber} has no purchaseId, generating default`
                    );
                    newSerial.purchaseId = new mongoose.Types.ObjectId();
                  }

                  if (!newSerial.originalOutlet) {
                    console.warn(
                      `[WARNING] Serial ${serialNumber} has no originalOutlet, using fromCenter`
                    );
                    newSerial.originalOutlet = stockTransfer.fromCenter;
                  }

                  destinationCenterStock.serialNumbers.push(newSerial);
                } else {
                  existingSerial.status = "available";
                  existingSerial.currentLocation = stockTransfer.toCenter;
                  existingSerial.transferHistory.push({
                    fromCenter: stockTransfer.fromCenter,
                    toCenter: stockTransfer.toCenter,
                    transferDate: new Date(),
                    transferType: "inbound_transfer",
                  });
                }
              }
            }

            destinationCenterStock.totalQuantity += serialsToTransfer.length;
            destinationCenterStock.availableQuantity +=
              serialsToTransfer.length;

            destinationCenterStock.serialNumbers =
              destinationCenterStock.serialNumbers.filter((serial) => {
                const isValid = serial.purchaseId && serial.originalOutlet;
                if (!isValid) {
                  console.warn(
                    `[WARNING] Removing invalid serial ${serial.serialNumber} due to missing required fields`
                  );
                }
                return isValid;
              });

            await destinationCenterStock.save();
          } else {
            const validatedSerials = [];

            for (const serialNumber of serialsToTransfer) {
              const originalSerial = sourceCenterStock?.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (originalSerial) {
                const newSerial = {
                  serialNumber: serialNumber,
                  purchaseId:
                    originalSerial.purchaseId || new mongoose.Types.ObjectId(),
                  originalOutlet:
                    originalSerial.originalOutlet || stockTransfer.fromCenter,
                  status: "available",
                  currentLocation: stockTransfer.toCenter,
                  transferHistory: [
                    ...(originalSerial.transferHistory || []),
                    {
                      fromCenter: stockTransfer.fromCenter,
                      toCenter: stockTransfer.toCenter,
                      transferDate: new Date(),
                      transferType: "inbound_transfer",
                    },
                  ],
                };

                if (!newSerial.purchaseId) {
                  newSerial.purchaseId = new mongoose.Types.ObjectId();
                }
                if (!newSerial.originalOutlet) {
                  newSerial.originalOutlet = stockTransfer.fromCenter;
                }

                validatedSerials.push(newSerial);
              }
            }

            await CenterStock.updateStock(
              stockTransfer.toCenter,
              productItem.product,
              serialsToTransfer.length,
              serialsToTransfer,
              stockTransfer.fromCenter,
              "inbound_transfer"
            );
          }
        }
      }
    }

    if (productReceipts && productReceipts.length > 0) {
      stockTransfer.products = stockTransfer.products.map((productItem) => {
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
    }

    const completedTransfer = await stockTransfer.completeTransfer(
      userId,
      productReceipts
    );

    const populatedTransfer = await StockTransfer.findById(
      completedTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email");

    let transferredSummary = [];
    let returnedSummary = [];

    for (const productItem of completedTransfer.products) {
      const receivedReceipt = productReceipts?.find(
        (pr) => pr.productId.toString() === productItem.product.toString()
      );
      const receivedQuantity =
        receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
      const returnedCount = productItem.approvedSerials
        ? productItem.approvedSerials.length - receivedQuantity
        : 0;

      if (receivedQuantity > 0) {
        transferredSummary.push(
          `${receivedQuantity} of ${productItem.approvedQuantity}`
        );
      }
      if (returnedCount > 0) {
        returnedSummary.push(
          `${returnedCount} from ${productItem.approvedQuantity}`
        );
      }
    }

    let message = "Stock transfer completed successfully. ";
    if (transferredSummary.length > 0) {
      message += `Transferred: ${transferredSummary.join(", ")}. `;
    }
    if (returnedSummary.length > 0) {
      message += `Returned to available: ${returnedSummary.join(", ")}.`;
    }

    res.status(200).json({
      success: true,
      message: message.trim(),
      data: populatedTransfer,
      transferSummary: {
        transferred: transferredSummary,
        returned: returnedSummary,
      },
    });
  } catch (error) {
    console.error("Error completing stock transfer:", error);

    if (error.message.includes("Received quantity cannot exceed")) {
      return res.status(400).json({
        success: false,
        message: "Quantity validation failed",
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const shipStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { shippedDate, expectedDeliveryDate, shipmentDetails, carrierInfo } =
      req.body;

    console.log(`[DEBUG] Starting shipStockTransfer for transfer ID: ${id}`);

    const stockTransfer = await StockTransfer.findById(id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumber"
      );

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    console.log(
      `[DEBUG] Found transfer: ${stockTransfer.transferNumber}, Status: ${stockTransfer.status}`
    );

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const shippingDetails = {
      ...(shippedDate && { shippedDate: new Date(shippedDate) }),
      ...(expectedDeliveryDate && {
        expectedDeliveryDate: new Date(expectedDeliveryDate),
      }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(carrierInfo && { carrierInfo }),
    };

    console.log(
      `[DEBUG] Pre-validating stock and serial number availability...`
    );
    const CenterStock = mongoose.model("CenterStock");

    for (const [index, productItem] of stockTransfer.products.entries()) {
      const product = await mongoose
        .model("Product")
        .findById(productItem.product);
      const requiresSerials = product
        ? product.trackSerialNumber === "Yes"
        : false;

      console.log(`\n[DEBUG] Product ${index + 1}: ${product?.productTitle}`);
      console.log(`[DEBUG] - Requires serial numbers: ${requiresSerials}`);
      console.log(
        `[DEBUG] - Approved quantity: ${productItem.approvedQuantity}`
      );
      console.log(
        `[DEBUG] - Approved serials: ${
          productItem.approvedSerials?.length || 0
        }`
      );

      const centerStock = await CenterStock.findOne({
        center: stockTransfer.fromCenter._id,
        product: productItem.product._id,
      });

      if (centerStock) {
        console.log(
          `[DEBUG] - Available quantity: ${centerStock.availableQuantity}`
        );

        if (requiresSerials) {
          if (
            !productItem.approvedSerials ||
            productItem.approvedSerials.length === 0
          ) {
            return res.status(400).json({
              success: false,
              message: `No serial numbers assigned for product "${product?.productTitle}". Please assign serial numbers during confirmation.`,
              details: {
                product: product?.productTitle,
                requiredQuantity:
                  productItem.approvedQuantity || productItem.quantity,
              },
            });
          }

          const availableSerials = centerStock.validateAndGetSerials(
            productItem.approvedSerials,
            stockTransfer.fromCenter._id
          );

          console.log(
            `[DEBUG] - All ${productItem.approvedSerials.length} assigned serial numbers are available`
          );
        }
      }
    }

    console.log(
      `[DEBUG] All pre-validations passed. Attempting to ship transfer...`
    );

    const shippedTransfer = await stockTransfer.shipTransfer(
      userId,
      shippingDetails
    );
    console.log(
      `[DEBUG] Transfer shipped successfully. New status: ${shippedTransfer.status}`
    );

    const populatedTransfer = await StockTransfer.findById(shippedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumber"
      )
      .populate("createdBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Stock transfer shipped successfully. Stock deducted from source center using assigned serial numbers.",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error(`[DEBUG] ERROR in shipStockTransfer:`, error.message);
    console.error(`[DEBUG] Error stack:`, error.stack);

    if (
      error.message.includes("No serial numbers assigned") ||
      error.message.includes("assigned serial numbers are not available")
    ) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const markStockTransferAsIncomplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { incompleteRemark, receivedProducts } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (receivedProducts && Array.isArray(receivedProducts)) {
      stockTransfer.products = stockTransfer.products.map((productItem) => {
        const receivedProduct = receivedProducts.find(
          (rp) => rp.productId.toString() === productItem.product.toString()
        );

        if (receivedProduct) {
          return {
            ...productItem.toObject(),
            receivedQuantity: receivedProduct.receivedQuantity || 0,
            receivedRemark: receivedProduct.receivedRemark || "",
            productInStock: receivedProduct.productInStock || 0,
            productRemark: receivedProduct.productRemark || "",
          };
        }
        return productItem;
      });
    }

    const incompleteTransfer = await stockTransfer.markAsIncomplete(
      userId,
      incompleteRemark
    );

    const populatedTransfer = await StockTransfer.findById(
      incompleteTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock transfer marked as incomplete",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error marking stock transfer as incomplete:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const completeIncompleteStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals, productReceipts } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    if (stockTransfer.status !== "Incompleted") {
      return res.status(400).json({
        success: false,
        message: "Only incomplete stock transfers can be completed",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (productApprovals && productApprovals.length > 0) {
      const approvalsWithQuantity = productApprovals.filter(
        (pa) => pa.approvedQuantity > 0
      );

      if (approvalsWithQuantity.length > 0) {
        const validationResults = await stockTransfer.validateSerialNumbers(
          approvalsWithQuantity
        );
        const invalidResults = validationResults.filter(
          (result) => !result.valid
        );

        if (invalidResults.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Serial number validation failed",
            validationErrors: invalidResults,
          });
        }
      }
    }

    const productsToComplete =
      productReceipts && productReceipts.length > 0
        ? productReceipts
        : productApprovals;

    if (
      !productsToComplete ||
      !Array.isArray(productsToComplete) ||
      productsToComplete.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Product approvals or receipts are required",
      });
    }

    const productsWithQuantity = productsToComplete.filter(
      (product) => product.receivedQuantity > 0 || product.approvedQuantity > 0
    );

    const finalProductReceipts = productsWithQuantity.map((product) => ({
      productId: product.productId,
      receivedQuantity:
        product.receivedQuantity || product.approvedQuantity || 0,
      receivedRemark: product.receivedRemark || product.approvedRemark || "",
    }));

    if (productApprovals && productApprovals.length > 0) {
      const CenterStock = mongoose.model("CenterStock");

      for (const approval of productApprovals) {
        if (
          approval.approvedSerials &&
          approval.approvedSerials.length > 0 &&
          approval.approvedQuantity > 0
        ) {
          const centerStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: approval.productId,
          });

          if (centerStock) {
            for (const serialNumber of approval.approvedSerials) {
              const serial = centerStock.serialNumbers.find(
                (sn) =>
                  sn.serialNumber === serialNumber && sn.status === "available"
              );

              if (serial) {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockTransfer.fromCenter,
                  toCenter: stockTransfer.toCenter,
                  transferDate: new Date(),
                  transferType: "outbound_transfer",
                });
              }
            }

            await centerStock.save();
          }
        }
      }

      stockTransfer.products = stockTransfer.products.map((productItem) => {
        const approval = productApprovals.find(
          (pa) => pa.productId.toString() === productItem.product.toString()
        );

        if (approval) {
          return {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedRemark:
              approval.approvedRemark || productItem.approvedRemark || "",

            approvedSerials:
              approval.approvedQuantity > 0
                ? approval.approvedSerials || productItem.approvedSerials || []
                : [],
          };
        }
        return productItem;
      });
    }

    if (productReceipts && productReceipts.length > 0) {
      stockTransfer.products = stockTransfer.products.map((productItem) => {
        const receipt = productReceipts.find(
          (pr) => pr.productId.toString() === productItem.product.toString()
        );

        if (receipt) {
          return {
            ...productItem.toObject(),
            receivedQuantity: receipt.receivedQuantity,
            receivedRemark:
              receipt.receivedRemark || productItem.receivedRemark || "",
          };
        }
        return productItem;
      });
    }

    for (const receipt of finalProductReceipts) {
      const productItem = stockTransfer.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${receipt.productId} not found in stock transfer`,
        });
      }

      if (receipt.receivedQuantity > productItem.approvedQuantity) {
        return res.status(400).json({
          success: false,
          message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${productItem.product}`,
        });
      }
    }

    await stockTransfer.save();

    let completedTransfer;

    if (finalProductReceipts.length > 0) {
      const CenterStock = mongoose.model("CenterStock");

      for (const productItem of stockTransfer.products) {
        if (
          productItem.approvedSerials &&
          productItem.approvedSerials.length > 0
        ) {
          const receivedReceipt = finalProductReceipts.find(
            (pr) => pr.productId.toString() === productItem.product.toString()
          );

          const receivedQuantity =
            receivedReceipt?.receivedQuantity || productItem.approvedQuantity;

          const serialsToTransfer = productItem.approvedSerials.slice(
            0,
            receivedQuantity
          );
          const serialsToReturn =
            productItem.approvedSerials.slice(receivedQuantity);

          const sourceCenterStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: productItem.product,
          });

          if (sourceCenterStock) {
            for (const serialNumber of serialsToTransfer) {
              const serial = sourceCenterStock.serialNumbers.find(
                (sn) =>
                  sn.serialNumber === serialNumber && sn.status === "in_transit"
              );

              if (serial) {
                serial.status = "transferred";
                serial.currentLocation = stockTransfer.toCenter;
                serial.transferHistory.push({
                  fromCenter: stockTransfer.fromCenter,
                  toCenter: stockTransfer.toCenter,
                  transferDate: new Date(),
                  transferType: "outbound_transfer",
                });
              }
            }

            for (const serialNumber of serialsToReturn) {
              const serial = sourceCenterStock.serialNumbers.find(
                (sn) =>
                  sn.serialNumber === serialNumber && sn.status === "in_transit"
              );

              if (serial) {
                serial.status = "available";

                if (serial.transferHistory.length > 0) {
                  serial.transferHistory.pop();
                }
              }
            }

            const transferredCount = serialsToTransfer.length;
            const returnedCount = serialsToReturn.length;

            sourceCenterStock.inTransitQuantity -=
              transferredCount + returnedCount;
            sourceCenterStock.totalQuantity -= transferredCount;
            sourceCenterStock.availableQuantity += returnedCount;

            await sourceCenterStock.save();
          }

          if (serialsToTransfer.length > 0) {
            const destinationCenterStock = await CenterStock.findOne({
              center: stockTransfer.toCenter,
              product: productItem.product,
            });

            if (destinationCenterStock) {
              for (const serialNumber of serialsToTransfer) {
                const originalSerial = sourceCenterStock?.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

                if (originalSerial) {
                  const existingSerial =
                    destinationCenterStock.serialNumbers.find(
                      (sn) => sn.serialNumber === serialNumber
                    );

                  if (!existingSerial) {
                    destinationCenterStock.serialNumbers.push({
                      serialNumber: serialNumber,
                      purchaseId: originalSerial.purchaseId,
                      originalOutlet: originalSerial.originalOutlet,
                      status: "available",
                      currentLocation: stockTransfer.toCenter,
                      transferHistory: [
                        ...originalSerial.transferHistory,
                        {
                          fromCenter: stockTransfer.fromCenter,
                          toCenter: stockTransfer.toCenter,
                          transferDate: new Date(),
                          transferType: "inbound_transfer",
                        },
                      ],
                    });
                  } else {
                    existingSerial.status = "available";
                    existingSerial.currentLocation = stockTransfer.toCenter;
                    existingSerial.transferHistory.push({
                      fromCenter: stockTransfer.fromCenter,
                      toCenter: stockTransfer.toCenter,
                      transferDate: new Date(),
                      transferType: "inbound_transfer",
                    });
                  }
                }
              }

              destinationCenterStock.totalQuantity += serialsToTransfer.length;
              destinationCenterStock.availableQuantity +=
                serialsToTransfer.length;

              await destinationCenterStock.save();
            } else {
              await CenterStock.updateStock(
                stockTransfer.toCenter,
                productItem.product,
                serialsToTransfer.length,
                serialsToTransfer,
                stockTransfer.fromCenter,
                "inbound_transfer"
              );
            }
          }
        }
      }

      if (!stockTransfer.stockStatus.sourceDeducted) {
        await stockTransfer.processSourceDeduction();
      }

      await stockTransfer.processDestinationAddition();

      completedTransfer = await stockTransfer.completeTransfer(
        userId,
        finalProductReceipts
      );
    } else {
      stockTransfer.status = "Completed";
      stockTransfer.receivingInfo = {
        receivedAt: new Date(),
        receivedBy: userId,
      };
      stockTransfer.completionInfo = {
        completedOn: new Date(),
        completedBy: userId,
      };
      stockTransfer.updatedBy = userId;

      completedTransfer = await stockTransfer.save();
    }

    const populatedTransfer = await StockTransfer.findById(
      completedTransfer._id
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("adminApproval.approvedBy", "_id fullName email")
      .populate("centerApproval.approvedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email");

    let transferredSummary = [];
    let returnedSummary = [];

    for (const productItem of completedTransfer.products) {
      const receivedReceipt = finalProductReceipts.find(
        (pr) => pr.productId.toString() === productItem.product.toString()
      );
      const receivedQuantity =
        receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
      const returnedCount = productItem.approvedSerials
        ? productItem.approvedSerials.length - receivedQuantity
        : 0;

      if (receivedQuantity > 0) {
        transferredSummary.push(
          `${receivedQuantity} of ${productItem.approvedQuantity}`
        );
      }
      if (returnedCount > 0) {
        returnedSummary.push(
          `${returnedCount} from ${productItem.approvedQuantity}`
        );
      }
    }

    let message = "Incomplete stock transfer completed successfully. ";
    if (transferredSummary.length > 0) {
      message += `Transferred: ${transferredSummary.join(", ")}. `;
    }
    if (returnedSummary.length > 0) {
      message += `Returned to available: ${returnedSummary.join(", ")}.`;
    }
    if (transferredSummary.length === 0 && returnedSummary.length === 0) {
      message += "No stock operations performed as all quantities were zero.";
    }

    res.status(200).json({
      success: true,
      message: message.trim(),
      data: populatedTransfer,
      transferSummary: {
        transferred: transferredSummary,
        returned: returnedSummary,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (
      error.message.includes("Insufficient stock") ||
      error.message.includes("serial numbers") ||
      error.message.includes("No serial numbers assigned")
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock transfer failed",
        error: error.message,
      });
    }

    console.error("Error completing incomplete stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Error completing incomplete stock transfer",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const rejectStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionRemark, rejectionType = "center" } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (rejectionType === "admin" && stockTransfer.status !== "Submitted") {
      return res.status(400).json({
        success: false,
        message: "Only submitted transfers can be rejected by admin",
      });
    }

    if (rejectionType === "center" && stockTransfer.status !== "Confirmed") {
      return res.status(400).json({
        success: false,
        message: "Only admin approved transfers can be rejected by center",
      });
    }

    const CenterStock = mongoose.model("CenterStock");

    let totalRestoredSerials = 0;
    let totalRestoredNonSerialized = 0;

    for (const productItem of stockTransfer.products) {
      const product = await mongoose
        .model("Product")
        .findById(productItem.product);
      const requiresSerials = product
        ? product.trackSerialNumber === "Yes"
        : false;
      const approvedQuantity =
        productItem.approvedQuantity || productItem.quantity;

      if (
        requiresSerials &&
        productItem.approvedSerials &&
        productItem.approvedSerials.length > 0
      ) {
        const centerStock = await CenterStock.findOne({
          center: stockTransfer.fromCenter,
          product: productItem.product,
        });

        if (centerStock) {
          let restoredCount = 0;

          for (const serialNumber of productItem.approvedSerials) {
            const serial = centerStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (
                serial.status === "in_transit" ||
                serial.status === "transferred"
              ) {
                serial.status = "available";
                serial.currentLocation = stockTransfer.fromCenter;
                restoredCount++;

                serial.transferHistory.push({
                  fromCenter: stockTransfer.fromCenter,
                  toCenter: stockTransfer.toCenter,
                  transferDate: new Date(),
                  transferType: "transfer_rejected",
                  remark: `Transfer rejected: ${
                    rejectionRemark || "No reason provided"
                  }`,
                });
              }
            }
          }

          if (restoredCount > 0) {
            centerStock.inTransitQuantity = Math.max(
              0,
              centerStock.inTransitQuantity - restoredCount
            );
            centerStock.availableQuantity += restoredCount;

            const transferredSerials = productItem.approvedSerials.filter(
              (serialNumber) => {
                const serial = centerStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                return (
                  serial &&
                  serial.status === "available" &&
                  serial.currentLocation?.toString() ===
                    stockTransfer.fromCenter.toString()
                );
              }
            ).length;

            if (transferredSerials > 0) {
              centerStock.totalQuantity += transferredSerials;
            }

            await centerStock.save();
            totalRestoredSerials += restoredCount;

            console.log(
              `[DEBUG] Restored ${restoredCount} serials to available status for product ${productItem.product}`
            );
          }
        }
      } else if (!requiresSerials && approvedQuantity > 0) {
        const centerStock = await CenterStock.findOne({
          center: stockTransfer.fromCenter,
          product: productItem.product,
        });

        if (centerStock) {
          const wasDeducted = centerStock.inTransitQuantity >= approvedQuantity;

          if (wasDeducted) {
            centerStock.availableQuantity += approvedQuantity;
            centerStock.inTransitQuantity -= approvedQuantity;
            totalRestoredNonSerialized += approvedQuantity;
          } else {
            centerStock.availableQuantity += approvedQuantity;
            totalRestoredNonSerialized += approvedQuantity;
          }

          await centerStock.save();
          console.log(
            `[DEBUG] Restored ${approvedQuantity} non-serialized units for product ${productItem.product}`
          );
        }
      }
    }

    if (stockTransfer.stockStatus.sourceDeducted) {
      await stockTransfer.reverseSourceDeduction();
    }

    if (stockTransfer.stockStatus.destinationAdded) {
      await stockTransfer.reverseDestinationAddition();
    }

    let rejectedTransfer;
    if (rejectionType === "admin") {
      rejectedTransfer = await stockTransfer.rejectByAdmin(
        userId,
        rejectionRemark
      );
    } else {
      rejectedTransfer = await stockTransfer.rejectByCenter(
        userId,
        rejectionRemark
      );
    }

    const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("adminApproval.rejectedBy", "_id fullName email")
      .populate("centerApproval.rejectedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email");

    let summaryMessage = `Stock transfer ${rejectionType} rejected successfully. `;

    if (totalRestoredSerials > 0) {
      summaryMessage += `${totalRestoredSerials} serialized items restored to available status. `;
    }

    if (totalRestoredNonSerialized > 0) {
      summaryMessage += `${totalRestoredNonSerialized} non-serialized units regained. `;
    }

    if (totalRestoredSerials === 0 && totalRestoredNonSerialized === 0) {
      summaryMessage += "No stock adjustments were needed.";
    }

    res.status(200).json({
      success: true,
      message: summaryMessage.trim(),
      data: populatedTransfer,
      restorationSummary: {
        serializedItemsRestored: totalRestoredSerials,
        nonSerializedUnitsRegained: totalRestoredNonSerialized,
        totalItemsRestored: totalRestoredSerials + totalRestoredNonSerialized,
        rejectionType: rejectionType,
      },
    });
  } catch (error) {
    console.error("Error rejecting stock transfer:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getAllStockTransfers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      fromCenter,
      toCenter,
      startDate,
      endDate,
      transferNumber,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    const user = await User.findById(req.user.id).populate("center");
    if (user && user.center) {
      filter.$or = [
        { fromCenter: user.center._id },
        { toCenter: user.center._id },
      ];
    }

    if (status) {
      if (Array.isArray(status)) {
        filter.status = { $in: status };
      } else if (status.includes(",")) {
        filter.status = { $in: status.split(",").map((s) => s.trim()) };
      } else {
        filter.status = status;
      }
    }

    if (fromCenter) {
      filter.fromCenter = fromCenter;
    }

    if (toCenter) {
      filter.toCenter = toCenter;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (transferNumber) {
      if (transferNumber.includes(",")) {
        filter.transferNumber = {
          $in: transferNumber.split(",").map((num) => num.trim()),
        };
      } else {
        filter.transferNumber = { $regex: transferNumber, $options: "i" };
      }
    }

    if (search) {
      filter.$or = [
        { transferNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "transferNumber",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const stockTransfers = await StockTransfer.find(filter)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("adminApproval.approvedBy", "_id fullName email")
      .populate("adminApproval.rejectedBy", "_id fullName email")
      .populate("centerApproval.approvedBy", "_id fullName email")
      .populate("adminApproval.rejectedBy", "_id fullName email")
      .populate("centerApproval.rejectedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await StockTransfer.countDocuments(filter);

    const statusCounts = await StockTransfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusStats = {};
    statusCounts.forEach((stat) => {
      statusStats[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      message: "Stock transfers retrieved successfully",
      data: stockTransfers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        status: statusStats,
        total: total,
      },
    });
  } catch (error) {
    console.error("Error retrieving stock transfers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock transfers",
      error: error.message,
    });
  }
};

export const getStockTransferById = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumber"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("adminApproval.approvedBy", "_id fullName email")
      .populate("adminApproval.rejectedBy", "_id fullName email")
      .populate("centerApproval.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .lean();

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock transfer retrieved successfully",
      data: stockTransfer,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    console.error("Error retrieving stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock transfer",
      error: error.message,
    });
  }
};

export const updateStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { fromCenter, transferNumber, remark, products, date } = req.body;

    const existingTransfer = await StockTransfer.findById(id);
    if (!existingTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    if (existingTransfer.status !== "Draft") {
      return res.status(400).json({
        success: false,
        message: "Only draft transfers can be updated",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updateData = {
      updatedBy: userId,
      ...(fromCenter && { fromCenter }),
      ...(transferNumber && { transferNumber: transferNumber.trim() }),
      ...(remark !== undefined && { remark }),
      ...(date && { date: new Date(date) }),
    };

    if (products) {
      updateData.products = products;
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock transfer updated successfully",
      data: updatedTransfer,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Transfer number already exists. Please use a different transfer number.",
      });
    }

    console.error("Error updating stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Error updating stock transfer",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const deleteStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    if (
      stockTransfer.status == "Completed" ||
      stockTransfer.status == "Shipped" ||
      stockTransfer.status == "Rejected"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only Completed, Shipped, Rejected transfers can not be deleted",
      });
    }

    await StockTransfer.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Stock transfer deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    console.error("Error deleting stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting stock transfer",
      error: error.message,
    });
  }
};

export const getPendingAdminApprovalTransfers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pendingTransfers = await StockTransfer.findPendingAdminApproval({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    });

    const total = await StockTransfer.countDocuments({
      status: "Submitted",
      "adminApproval.status": { $exists: false },
    });

    res.status(200).json({
      success: true,
      message: "Pending admin approval transfers retrieved successfully",
      data: pendingTransfers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving pending admin approval transfers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving pending admin approval transfers",
      error: error.message,
    });
  }
};

export const getTransferStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("center");
    let centerId = null;

    if (user && user.center) {
      centerId = user.center._id;
    }

    const stats = await StockTransfer.getTransferStats(centerId);

    res.status(200).json({
      success: true,
      message: "Transfer statistics retrieved successfully",
      data: stats,
    });
  } catch (error) {
    console.error("Error retrieving transfer statistics:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving transfer statistics",
      error: error.message,
    });
  }
};

export const updateShippingInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      shippedDate,
      expectedDeliveryDate,
      shipmentDetails,
      carrierInfo,
      documents,
    } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    if (!["Shipped", "Confirmed"].includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Shipping info can only be updated for Shipped or Confirmed transfers",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updateData = {
      updatedBy: userId,
    };

    const shippingInfoUpdate = { ...stockTransfer.shippingInfo.toObject() };

    if (shippedDate) shippingInfoUpdate.shippedDate = new Date(shippedDate);
    if (expectedDeliveryDate) {
      shippingInfoUpdate.expectedDeliveryDate = new Date(expectedDeliveryDate);
    }
    if (shipmentDetails) shippingInfoUpdate.shipmentDetails = shipmentDetails;
    if (carrierInfo) shippingInfoUpdate.carrierInfo = carrierInfo;
    if (documents) {
      shippingInfoUpdate.documents = Array.isArray(documents)
        ? documents
        : [documents];
    }

    updateData.shippingInfo = shippingInfoUpdate;

    let updatedTransfer;
    try {
      updatedTransfer = await StockTransfer.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });
    } catch (validationError) {
      console.warn(
        "Validation error during shipping update, trying alternative approach:",
        validationError.message
      );

      updatedTransfer = await StockTransfer.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: false,
      });

      try {
        await updatedTransfer.validate();
      } catch (manualValidationError) {
        return res.status(400).json({
          success: false,
          message: "Validation error in shipping information",
          error: manualValidationError.message,
        });
      }
    }

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Shipping information updated successfully",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error updating shipping information:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating shipping information",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const rejectShipping = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionRemark } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    if (stockTransfer.status !== "Shipped") {
      return res.status(400).json({
        success: false,
        message: "Only shipped transfers can have shipping rejected",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const previousShippingInfo = { ...stockTransfer.shippingInfo.toObject() };

    if (stockTransfer.stockStatus.sourceDeducted) {
      await revertStockDeduction(stockTransfer);
    }

    const updateData = {
      status: "Confirmed",
      updatedBy: userId,
      "shippingInfo.shippedAt": null,
      "shippingInfo.shippedBy": null,
      "shippingInfo.shippedDate": null,
      "shippingInfo.expectedDeliveryDate": null,
      "shippingInfo.shipmentDetails": null,
      "shippingInfo.carrierInfo": null,
      "shippingInfo.documents": [],
      "shippingInfo.shipmentRejected.rejectedAt": new Date(),
      "shippingInfo.shipmentRejected.rejectedBy": userId,
      "shippingInfo.shipmentRejected.rejectionRemark": rejectionRemark || "",
      "shippingInfo.shipmentRejected.previousShippingData":
        previousShippingInfo,
      "stockStatus.sourceDeducted": false,
      "stockStatus.deductedAt": null,
      "stockStatus.lastStockCheck": new Date(),
    };

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: false }
    );

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Shipping rejected successfully. Transfer reverted to Confirmed status.",
      data: populatedTransfer,
    });
  } catch (error) {
    console.error("Error rejecting shipping:", error);
    res.status(500).json({
      success: false,
      message: "Error rejecting shipping",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

const revertStockDeduction = async (stockTransfer) => {
  try {
    const CenterStock = mongoose.model("CenterStock");

    for (const item of stockTransfer.products) {
      const centerStock = await CenterStock.findOne({
        center: stockTransfer.fromCenter,
        product: item.product,
      });

      if (centerStock) {
        const quantityToRevert = item.approvedQuantity || item.quantity;

        if (
          item.requiresSerialNumbers &&
          item.serialNumbers &&
          item.serialNumbers.length > 0
        ) {
          await centerStock.revertSerialNumbers(item.serialNumbers);
        } else {
          centerStock.availableQuantity += quantityToRevert;
          centerStock.totalQuantity += quantityToRevert;
          await centerStock.save();
        }
      }
    }
  } catch (error) {
    console.error("Error reverting stock deduction:", error);
    throw new Error(`Failed to revert stock deduction: ${error.message}`);
  }
};

export const getMostRecentTransferNumber = async (req, res) => {
  try {
    const mostRecentTransfer = await StockTransfer.findOne()
      .sort({ createdAt: -1 })
      .select("transferNumber createdAt")
      .lean();

    if (!mostRecentTransfer) {
      return res.status(404).json({
        success: false,
        message: "No stock transfers found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Most recent transfer number retrieved successfully",
      data: {
        transferNumber: mostRecentTransfer.transferNumber,
        createdAt: mostRecentTransfer.createdAt,
      },
    });
  } catch (error) {
    console.error("Error retrieving most recent transfer number:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving most recent transfer number",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const updateApprovedQuantities = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    console.log(`[DEBUG] === UPDATE APPROVED QUANTITIES START ===`);
    console.log(`[DEBUG] Transfer ID: ${id}`);
    console.log(`[DEBUG] Request Body:`, JSON.stringify(req.body, null, 2));

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (
      !productApprovals ||
      !Array.isArray(productApprovals) ||
      productApprovals.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Product approvals array is required and cannot be empty",
      });
    }

    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    console.log(`[DEBUG] === CURRENT TRANSFER STATE ===`);
    console.log(`[DEBUG] Transfer Status: ${stockTransfer.status}`);
    console.log(
      `[DEBUG] Current Products:`,
      stockTransfer.products.map((p) => ({
        product: p.product.toString(),
        quantity: p.quantity,
        approvedQuantity: p.approvedQuantity,
        approvedSerials: p.approvedSerials || [],
        requiresSerialNumbers: p.requiresSerialNumbers,
      }))
    );

    console.log(`[DEBUG] === PROCESSING PRODUCT APPROVALS ===`);

    for (const approval of productApprovals) {
      console.log(`[DEBUG] Processing approval:`, approval);

      if (!approval.productId) {
        return res.status(400).json({
          success: false,
          message: "Each approval must have a productId",
        });
      }

      if (
        approval.approvedQuantity === undefined ||
        approval.approvedQuantity === null
      ) {
        return res.status(400).json({
          success: false,
          message: "Each approval must have an approvedQuantity",
        });
      }

      if (approval.approvedQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Approved quantity cannot be negative",
        });
      }

      const productItem = stockTransfer.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${approval.productId} not found in this transfer`,
        });
      }

      if (approval.approvedQuantity > productItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product`,
        });
      }

      const product = await Product.findById(approval.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${approval.productId} not found`,
        });
      }

      const requiresSerials = product.trackSerialNumber === "Yes";
      console.log(
        `[DEBUG] Product: ${product.productTitle}, Requires Serials: ${requiresSerials}`
      );

      if (requiresSerials) {
        const currentApprovedQuantity =
          productItem.approvedQuantity || productItem.quantity;
        const currentApprovedSerials = productItem.approvedSerials || [];
        const newApprovedQuantity = approval.approvedQuantity;
        const newApprovedSerials = approval.approvedSerials || [];

        console.log(`[DEBUG] Processing product: ${product.productTitle}`);
        console.log(
          `[DEBUG] Current quantity: ${currentApprovedQuantity}, New quantity: ${newApprovedQuantity}`
        );
        console.log(
          `[DEBUG] Current serials: [${currentApprovedSerials.join(", ")}]`
        );
        console.log(`[DEBUG] New serials: [${newApprovedSerials.join(", ")}]`);

        if (
          newApprovedSerials.length > 0 &&
          newApprovedSerials.length !== newApprovedQuantity
        ) {
          return res.status(400).json({
            success: false,
            message: `Number of serial numbers (${newApprovedSerials.length}) must match approved quantity (${newApprovedQuantity}) for product ${product.productTitle}`,
          });
        }

        if (newApprovedSerials.length > 0) {
          const centerStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: approval.productId,
          });

          if (!centerStock) {
            return res.status(400).json({
              success: false,
              message: `No stock found for product ${product.productTitle} in source center`,
            });
          }

          const availableSerials = centerStock.validateAndGetSerials(
            newApprovedSerials,
            stockTransfer.fromCenter
          );

          if (availableSerials.length !== newApprovedSerials.length) {
            const missingSerials = newApprovedSerials.filter(
              (sn) => !availableSerials.includes(sn)
            );
            return res.status(400).json({
              success: false,
              message: `Some serial numbers are not available for product ${
                product.productTitle
              }: ${missingSerials.join(", ")}`,
            });
          }
        }

        await handleApprovalUpdateScenarios(
          stockTransfer.fromCenter,
          approval.productId,
          currentApprovedSerials,
          newApprovedSerials,
          currentApprovedQuantity,
          newApprovedQuantity,
          stockTransfer.toCenter
        );
      }
    }

    console.log(`[DEBUG] === UPDATING TRANSFER DOCUMENT ===`);

    const updatedProducts = await Promise.all(
      stockTransfer.products.map(async (productItem) => {
        const approval = productApprovals.find(
          (pa) =>
            pa.productId &&
            pa.productId.toString() === productItem.product.toString()
        );

        if (approval) {
          const product = await Product.findById(approval.productId);
          const requiresSerials = product
            ? product.trackSerialNumber === "Yes"
            : false;

          const updatedProduct = {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedRemark: approval.approvedRemark || "",
            approvedSerials: requiresSerials
              ? approval.approvedSerials || []
              : [],
            requiresSerialNumbers: requiresSerials,
          };

          console.log(
            `[DEBUG] Product Update - ${
              product?.productTitle || "Unknown Product"
            }:`,
            {
              productId: productItem.product.toString(),
              currentApprovedSerials: productItem.approvedSerials || [],
              newApprovedSerials: updatedProduct.approvedSerials,
              currentApprovedQuantity: productItem.approvedQuantity,
              newApprovedQuantity: updatedProduct.approvedQuantity,
              requiresSerialNumbers: updatedProduct.requiresSerialNumbers,
            }
          );

          return updatedProduct;
        } else {
          console.log(
            `[DEBUG] No approval found for product: ${productItem.product.toString()}`
          );
          return productItem;
        }
      })
    );

    console.log(
      `[DEBUG] Final Updated Products:`,
      JSON.stringify(updatedProducts, null, 2)
    );

    const updateData = {
      products: updatedProducts,
      updatedBy: userId,
    };

    console.log(
      `[DEBUG] Update Data to Save:`,
      JSON.stringify(updateData, null, 2)
    );

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("fromCenter", "_id centerName centerCode")
      .populate("toCenter", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode trackSerialNumbers"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("adminApproval.approvedBy", "_id fullName email");

    console.log(`[DEBUG] === UPDATE COMPLETE ===`);
    console.log(
      `[DEBUG] Final Transfer State:`,
      JSON.stringify(
        updatedTransfer.products.map((p) => ({
          product: p.product._id,
          productTitle: p.product.productTitle,
          approvedQuantity: p.approvedQuantity,
          approvedSerials: p.approvedSerials,
          requiresSerialNumbers: p.requiresSerialNumbers,
        })),
        null,
        2
      )
    );

    res.status(200).json({
      success: true,
      message: "Approved quantities and serial numbers updated successfully",
      data: updatedTransfer,
    });
  } catch (error) {
    console.error("Error updating approved quantities:", error);

    if (
      error.message.includes("Serial number validation failed") ||
      error.message.includes("Number of serial numbers") ||
      error.message.includes("Duplicate serial numbers") ||
      error.message.includes("serial numbers are not available")
    ) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        error: error.message,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID or transfer ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating approved quantities",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

async function handleApprovalUpdateScenarios(
  fromCenter,
  productId,
  currentSerials,
  newSerials,
  currentQuantity,
  newQuantity,
  toCenter
) {
  const CenterStock = mongoose.model("CenterStock");
  const centerStock = await CenterStock.findOne({
    center: fromCenter,
    product: productId,
  });

  if (!centerStock) {
    throw new Error("Source center stock not found for product");
  }

  console.log(`[DEBUG] Handling approval update scenarios`);
  console.log(
    `[DEBUG] Current quantity: ${currentQuantity}, New quantity: ${newQuantity}`
  );
  console.log(`[DEBUG] Current serials: [${currentSerials.join(", ")}]`);
  console.log(`[DEBUG] New serials: [${newSerials.join(", ")}]`);

  let quantityChange = newQuantity - currentQuantity;
  let serialsChanged =
    JSON.stringify(currentSerials) !== JSON.stringify(newSerials);

  console.log(
    `[DEBUG] Quantity change: ${quantityChange}, Serials changed: ${serialsChanged}`
  );

  if (quantityChange < 0) {
    const quantityToRestore = Math.abs(quantityChange);
    console.log(`[DEBUG] CASE 1: Quantity reduced by ${quantityToRestore}`);

    let serialsToRestore = [];

    if (serialsChanged && newSerials.length > 0) {
      serialsToRestore = currentSerials.filter(
        (serial) => !newSerials.includes(serial)
      );
    } else {
      serialsToRestore = currentSerials.slice(newQuantity);
    }

    console.log(
      `[DEBUG] Restoring ${
        serialsToRestore.length
      } serials: [${serialsToRestore.join(", ")}]`
    );

    await restoreSerialsToAvailable(
      centerStock,
      serialsToRestore,
      fromCenter,
      toCenter
    );

    centerStock.availableQuantity += quantityToRestore;
    centerStock.inTransitQuantity -= quantityToRestore;
  } else if (quantityChange > 0) {
    const quantityToAdd = quantityChange;
    console.log(`[DEBUG] CASE 2: Quantity increased by ${quantityToAdd}`);

    if (newSerials.length === 0) {
      throw new Error(
        `Quantity increased from ${currentQuantity} to ${newQuantity}. Please provide ${quantityToAdd} additional serial numbers.`
      );
    }

    let additionalSerials = [];
    if (serialsChanged) {
      additionalSerials = newSerials.slice(currentQuantity);
    } else {
      throw new Error(
        `Quantity increased but no new serial numbers provided. Please provide ${quantityToAdd} additional serial numbers.`
      );
    }

    if (additionalSerials.length !== quantityToAdd) {
      throw new Error(
        `Need exactly ${quantityToAdd} additional serial numbers, but got ${additionalSerials.length}`
      );
    }

    console.log(
      `[DEBUG] Adding ${
        additionalSerials.length
      } new serials: [${additionalSerials.join(", ")}]`
    );

    await markSerialsAsInTransit(
      centerStock,
      additionalSerials,
      fromCenter,
      toCenter
    );

    centerStock.availableQuantity -= quantityToAdd;
    centerStock.inTransitQuantity += quantityToAdd;
  } else if (quantityChange === 0 && serialsChanged) {
    console.log(`[DEBUG] CASE 3: Quantity unchanged, only serials changed`);

    if (currentSerials.length === 0 && newSerials.length > 0) {
      console.log(`[DEBUG] Adding serials for the first time`);

      await markSerialsAsInTransit(
        centerStock,
        newSerials,
        fromCenter,
        toCenter
      );

      centerStock.availableQuantity -= newSerials.length;
      centerStock.inTransitQuantity += newSerials.length;

      console.log(
        `[DEBUG] First-time serial assignment - Available: -${newSerials.length}, InTransit: +${newSerials.length}`
      );
    } else if (currentSerials.length > 0 && newSerials.length > 0) {
      console.log(`[DEBUG] Replacing existing serials`);

      const serialsToRemove = currentSerials.filter(
        (serial) => !newSerials.includes(serial)
      );
      const serialsToAdd = newSerials.filter(
        (serial) => !currentSerials.includes(serial)
      );

      console.log(
        `[DEBUG] Removing ${serialsToRemove.length} serials, Adding ${serialsToAdd.length} serials`
      );

      if (serialsToRemove.length !== serialsToAdd.length) {
        throw new Error(
          `When replacing serials, number to remove (${serialsToRemove.length}) must match number to add (${serialsToAdd.length})`
        );
      }

      await restoreSerialsToAvailable(
        centerStock,
        serialsToRemove,
        fromCenter,
        toCenter
      );
      await markSerialsAsInTransit(
        centerStock,
        serialsToAdd,
        fromCenter,
        toCenter
      );
    } else if (currentSerials.length > 0 && newSerials.length === 0) {
      console.log(`[DEBUG] Removing all serial assignments`);

      await restoreSerialsToAvailable(
        centerStock,
        currentSerials,
        fromCenter,
        toCenter
      );

      centerStock.availableQuantity += currentSerials.length;
      centerStock.inTransitQuantity -= currentSerials.length;

      console.log(
        `[DEBUG] Removed all serial assignments - Available: +${currentSerials.length}, InTransit: -${currentSerials.length}`
      );
    }
  } else {
    console.log(`[DEBUG] CASE 4: No changes detected`);
  }

  await centerStock.save();
  console.log(`[DEBUG] Center stock saved successfully`);
}

async function restoreSerialsToAvailable(
  centerStock,
  serialsToRestore,
  fromCenter,
  toCenter
) {
  let restoredCount = 0;

  for (const serialNumber of serialsToRestore) {
    const serial = centerStock.serialNumbers.find(
      (sn) => sn.serialNumber === serialNumber
    );

    if (
      serial &&
      (serial.status === "in_transit" || serial.status === "transferred")
    ) {
      serial.status = "available";
      serial.currentLocation = fromCenter;
      restoredCount++;

      serial.transferHistory.push({
        fromCenter: fromCenter,
        toCenter: toCenter,
        transferDate: new Date(),
        transferType: "transfer_updated",
        remark: "Restored to available during quantity update",
      });

      console.log(
        `[DEBUG] Restored serial ${serialNumber} to available status`
      );
    }
  }

  return restoredCount;
}

async function markSerialsAsInTransit(
  centerStock,
  serialsToAdd,
  fromCenter,
  toCenter
) {
  let addedCount = 0;

  for (const serialNumber of serialsToAdd) {
    const serial = centerStock.serialNumbers.find(
      (sn) => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serial) {
      serial.status = "in_transit";
      serial.transferHistory.push({
        fromCenter: fromCenter,
        toCenter: toCenter,
        transferDate: new Date(),
        transferType: "outbound_transfer",
        remark: "Added during serial number update",
      });
      addedCount++;

      console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
    } else {
      throw new Error(
        `Serial number ${serialNumber} is not available or not found`
      );
    }
  }

  return addedCount;
}

export const getWarehouseProductSummary = async (req, res) => {
  try {
    const {
      warehouseId,
      productId,
      startDate,
      endDate,
      includeDetails = false,
    } = req.query;

    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID is required",
      });
    }

    const warehouse = await Center.findOne({
      _id: warehouseId,
      centerType: "Outlet",
    });

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found or is not an outlet",
      });
    }

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const currentOutletStock = await OutletStock.find({
      outlet: warehouseId,
    })
      .populate("product", "productTitle productCode trackSerialNumber")
      .lean();

    const centerStockFromWarehouse = await CenterStock.aggregate([
      {
        $match: productId
          ? {
              product: new mongoose.Types.ObjectId(productId),
            }
          : {},
      },
      { $unwind: "$serialNumbers" },
      {
        $match: {
          "serialNumbers.originalOutlet": new mongoose.Types.ObjectId(
            warehouseId
          ),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      {
        $group: {
          _id: "$product",
          productName: {
            $first: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          },
          productCode: {
            $first: { $arrayElemAt: ["$productDetails.productCode", 0] },
          },

          totalInCenters: { $sum: 1 },
          availableInCenters: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "available"] }, 1, 0],
            },
          },
          damagedInCenters: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "damaged"] }, 1, 0],
            },
          },
          consumedInCenters: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "consumed"] }, 1, 0],
            },
          },
          inTransitInCenters: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "in_transit"] }, 1, 0],
            },
          },
          centerDetails: {
            $push: {
              centerId: "$center",
              centerName: { $arrayElemAt: ["$centerDetails.centerName", 0] },
              centerCode: { $arrayElemAt: ["$centerDetails.centerCode", 0] },
              status: "$serialNumbers.status",
              serialNumber: "$serialNumbers.serialNumber",
            },
          },
        },
      },
    ]);

    const purchaseSummary = await StockPurchase.aggregate([
      {
        $match: {
          outlet: new mongoose.Types.ObjectId(warehouseId),
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
      },
      { $unwind: "$products" },
      {
        $match: productId
          ? {
              "products.product": new mongoose.Types.ObjectId(productId),
            }
          : {},
      },
      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $group: {
          _id: "$products.product",
          productName: {
            $first: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          },
          productCode: {
            $first: { $arrayElemAt: ["$productDetails.productCode", 0] },
          },
          totalPurchased: { $sum: "$products.purchasedQuantity" },
          currentAvailableInWarehouse: { $sum: "$products.availableQuantity" },
          purchaseDetails: {
            $push: {
              invoiceNo: "$invoiceNo",
              date: "$date",
              purchasedQty: "$products.purchasedQuantity",
              availableQty: "$products.availableQuantity",
              price: "$products.price",
              status: "$status",
            },
          },
        },
      },
    ]);

    const stockRequestSummary = await StockRequest.aggregate([
      {
        $match: {
          warehouse: new mongoose.Types.ObjectId(warehouseId),
          status: "Completed",
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
      },
      { $unwind: "$products" },
      {
        $match: productId
          ? {
              "products.product": new mongoose.Types.ObjectId(productId),
            }
          : {},
      },
      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      {
        $group: {
          _id: "$products.product",
          totalTransferredOut: { $sum: "$products.receivedQuantity" },
          transferDetails: {
            $push: {
              orderNumber: "$orderNumber",
              date: "$date",
              toCenter: { $arrayElemAt: ["$centerDetails.centerName", 0] },
              toCenterCode: { $arrayElemAt: ["$centerDetails.centerCode", 0] },
              transferredQty: "$products.receivedQuantity",
              serialNumbers: "$products.transferredSerials",
            },
          },
        },
      },
    ]);

    const centerUsageSummary = await StockUsage.aggregate([
      {
        $match: {
          status: "completed",
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
      },
      { $unwind: "$items" },
      {
        $match: productId
          ? {
              "items.product": new mongoose.Types.ObjectId(productId),
            }
          : {},
      },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "items.serialNumbers.originalOutlet",
          foreignField: "_id",
          as: "originalOutletDetails",
        },
      },
      {
        $match: {
          "originalOutletDetails._id": new mongoose.Types.ObjectId(warehouseId),
        },
      },
      {
        $group: {
          _id: "$items.product",
          productName: {
            $first: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          },
          productCode: {
            $first: { $arrayElemAt: ["$productDetails.productCode", 0] },
          },
          totalUsedInCenters: { $sum: "$items.quantity" },
          damageQuantityInCenters: {
            $sum: {
              $cond: [{ $eq: ["$usageType", "Damage"] }, "$items.quantity", 0],
            },
          },
          customerUsageInCenters: {
            $sum: {
              $cond: [
                { $eq: ["$usageType", "Customer"] },
                "$items.quantity",
                0,
              ],
            },
          },
          otherUsageInCenters: {
            $sum: {
              $cond: [
                {
                  $not: {
                    $in: ["$usageType", ["Damage", "Customer"]],
                  },
                },
                "$items.quantity",
                0,
              ],
            },
          },
          usageDetails: {
            $push: {
              date: "$date",
              usageType: "$usageType",
              center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
              centerCode: { $arrayElemAt: ["$centerDetails.centerCode", 0] },
              quantity: "$items.quantity",
              serialNumbers: "$items.serialNumbers",
              remark: "$remark",
            },
          },
        },
      },
    ]);

    const allProductIds = new Set([
      ...currentOutletStock.map((p) => p.product._id.toString()),
      ...centerStockFromWarehouse.map((p) => p._id.toString()),
      ...purchaseSummary.map((p) => p._id.toString()),
      ...stockRequestSummary.map((s) => s._id.toString()),
      ...centerUsageSummary.map((u) => u._id.toString()),
    ]);

    const productSummary = [];

    for (const productId of allProductIds) {
      const outletStock = currentOutletStock.find(
        (p) => p.product._id.toString() === productId
      );

      const centerStock = centerStockFromWarehouse.find(
        (c) => c._id.toString() === productId
      );

      const purchaseData =
        purchaseSummary.find((p) => p._id.toString() === productId) || {};

      const requestData =
        stockRequestSummary.find((s) => s._id.toString() === productId) || {};

      const usageData =
        centerUsageSummary.find((u) => u._id.toString() === productId) || {};

      const currentWarehouseStock = outletStock
        ? {
            total: outletStock.totalQuantity,
            available: outletStock.availableQuantity,
            inTransit: outletStock.inTransitQuantity,
          }
        : {
            total: 0,
            available: 0,
            inTransit: 0,
          };

      const centerStockSummary = centerStock
        ? {
            total: centerStock.totalInCenters,
            available: centerStock.availableInCenters,
            damaged: centerStock.damagedInCenters,
            consumed: centerStock.consumedInCenters,
            inTransit: centerStock.inTransitInCenters,
          }
        : {
            total: 0,
            available: 0,
            damaged: 0,
            consumed: 0,
            inTransit: 0,
          };

      const totalPurchased = purchaseData.totalPurchased || 0;
      const totalTransferredOut = requestData.totalTransferredOut || 0;
      const totalUsageInCenters = usageData.totalUsedInCenters || 0;
      const damageInCenters = usageData.damageQuantityInCenters || 0;

      const totalAccountedFor =
        currentWarehouseStock.total + centerStockSummary.total;
      const purchaseAccuracy =
        totalPurchased > 0 ? (totalAccountedFor / totalPurchased) * 100 : 100;

      productSummary.push({
        productId: new mongoose.Types.ObjectId(productId),
        productName:
          purchaseData.productName ||
          centerStock?.productName ||
          outletStock?.product?.productTitle ||
          usageData.productName,
        productCode:
          purchaseData.productCode ||
          centerStock?.productCode ||
          outletStock?.product?.productCode ||
          usageData.productCode,

        currentStock: {
          warehouse: currentWarehouseStock,
          centers: centerStockSummary,
        },

        historical: {
          totalPurchased,
          totalTransferredToCenters: totalTransferredOut,
          totalUsageInCenters,
          damageInCenters,
        },

        summary: {
          totalStockInSystem:
            currentWarehouseStock.total + centerStockSummary.total,
          totalAvailable:
            currentWarehouseStock.available + centerStockSummary.available,
          totalDamaged: centerStockSummary.damaged + damageInCenters,
          totalConsumed: centerStockSummary.consumed,
          stockAccuracy: purchaseAccuracy,
        },

        details: includeDetails
          ? {
              warehouseStock: outletStock
                ? {
                    total: outletStock.totalQuantity,
                    available: outletStock.availableQuantity,
                    inTransit: outletStock.inTransitQuantity,
                    serialNumbers: outletStock.serialNumbers?.length || 0,
                  }
                : null,
              centerDistribution: centerStock?.centerDetails || [],
              purchases: purchaseData.purchaseDetails || [],
              transfers: requestData.transferDetails || [],
              usage: usageData.usageDetails || [],
            }
          : undefined,
      });
    }

    if (productId) {
      const product = await Product.findById(productId);
      if (
        product &&
        !productSummary.find((p) => p.productId.toString() === productId)
      ) {
        productSummary.push({
          productId: product._id,
          productName: product.productTitle,
          productCode: product.productCode,
          currentStock: {
            warehouse: { total: 0, available: 0, inTransit: 0 },
            centers: {
              total: 0,
              available: 0,
              damaged: 0,
              consumed: 0,
              inTransit: 0,
            },
          },
          historical: {
            totalPurchased: 0,
            totalTransferredToCenters: 0,
            totalUsageInCenters: 0,
            damageInCenters: 0,
          },
          summary: {
            totalStockInSystem: 0,
            totalAvailable: 0,
            totalDamaged: 0,
            totalConsumed: 0,
            stockAccuracy: 0,
          },
          details: includeDetails
            ? {
                warehouseStock: null,
                centerDistribution: [],
                purchases: [],
                transfers: [],
                usage: [],
              }
            : undefined,
        });
      }
    }

    const summaryTotals = {
      totalProducts: productSummary.length,
      totalStockInSystem: productSummary.reduce(
        (sum, p) => sum + p.summary.totalStockInSystem,
        0
      ),
      totalAvailable: productSummary.reduce(
        (sum, p) => sum + p.summary.totalAvailable,
        0
      ),
      totalDamaged: productSummary.reduce(
        (sum, p) => sum + p.summary.totalDamaged,
        0
      ),
      totalConsumed: productSummary.reduce(
        (sum, p) => sum + p.summary.totalConsumed,
        0
      ),
      totalPurchased: productSummary.reduce(
        (sum, p) => sum + p.historical.totalPurchased,
        0
      ),
      totalTransferred: productSummary.reduce(
        (sum, p) => sum + p.historical.totalTransferredToCenters,
        0
      ),
      averageAccuracy:
        productSummary.length > 0
          ? productSummary.reduce(
              (sum, p) => sum + p.summary.stockAccuracy,
              0
            ) / productSummary.length
          : 0,
    };

    res.json({
      success: true,
      message: "Accurate warehouse product summary retrieved successfully",
      data: {
        warehouse: {
          _id: warehouse._id,
          name: warehouse.centerName,
          code: warehouse.centerCode,
          type: warehouse.centerType,
        },
        summary: productSummary,
        summaryTotals,
        stockStatus: {
          inWarehouse: summaryTotals.totalAvailable,
          inCenters:
            summaryTotals.totalStockInSystem - summaryTotals.totalAvailable,
          damaged: summaryTotals.totalDamaged,
          consumed: summaryTotals.totalConsumed,
        },
        period: {
          startDate: startDate || "All time",
          endDate: endDate || "All time",
        },
        generatedAt: new Date().toISOString(),
        dataSources: [
          "OutletStock (Current Warehouse Stock)",
          "CenterStock (Current Center Stock)",
          "StockPurchase (Purchase History)",
          "StockRequest (Transfer History)",
          "StockUsage (Usage History)",
        ],
      },
    });
  } catch (error) {
    console.error("Get accurate warehouse product summary error:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "Error retrieving accurate warehouse product summary",
    });
  }
};

/**
 * Get product stock status across all centers from this warehouse
 */
export const getProductDistribution = async (req, res) => {
  try {
    const { warehouseId, productId } = req.query;

    if (!warehouseId || !productId) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID and Product ID are required",
      });
    }

    const distribution = await CenterStock.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
        },
      },
      { $unwind: "$serialNumbers" },
      {
        $match: {
          "serialNumbers.originalOutlet": new mongoose.Types.ObjectId(
            warehouseId
          ),
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $group: {
          _id: "$center",
          centerName: {
            $first: { $arrayElemAt: ["$centerDetails.centerName", 0] },
          },
          centerCode: {
            $first: { $arrayElemAt: ["$centerDetails.centerCode", 0] },
          },
          productName: {
            $first: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          },
          totalQuantity: { $sum: 1 },
          available: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "available"] }, 1, 0],
            },
          },
          damaged: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "damaged"] }, 1, 0],
            },
          },
          consumed: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "consumed"] }, 1, 0],
            },
          },
          inTransit: {
            $sum: {
              $cond: [{ $eq: ["$serialNumbers.status", "in_transit"] }, 1, 0],
            },
          },
          serialNumbers: {
            $push: {
              serialNumber: "$serialNumbers.serialNumber",
              status: "$serialNumbers.status",
              currentLocation: "$center",
              transferHistory: "$serialNumbers.transferHistory",
            },
          },
        },
      },
      {
        $project: {
          centerId: "$_id",
          centerName: 1,
          centerCode: 1,
          productName: 1,
          quantities: {
            total: "$totalQuantity",
            available: "$available",
            damaged: "$damaged",
            consumed: "$consumed",
            inTransit: "$inTransit",
          },
          utilization: {
            availablePercentage: {
              $multiply: [{ $divide: ["$available", "$totalQuantity"] }, 100],
            },
            damagePercentage: {
              $multiply: [{ $divide: ["$damaged", "$totalQuantity"] }, 100],
            },
          },
          serialNumbers: 1,
        },
      },
      { $sort: { "quantities.total": -1 } },
    ]);

    res.json({
      success: true,
      message: "Product distribution across centers retrieved successfully",
      data: {
        warehouseId,
        productId,
        distribution,
        summary: {
          totalCenters: distribution.length,
          totalUnits: distribution.reduce(
            (sum, d) => sum + d.quantities.total,
            0
          ),
          totalAvailable: distribution.reduce(
            (sum, d) => sum + d.quantities.available,
            0
          ),
          totalDamaged: distribution.reduce(
            (sum, d) => sum + d.quantities.damaged,
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Get product distribution error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error retrieving product distribution",
    });
  }
};
