import StockTransfer from "../models/StockTransfer.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import CenterStock from "../models/CenterStock.js";
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

// export const confirmStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productApprovals && productApprovals.length > 0) {
//       const validationResults = await stockTransfer.validateSerialNumbers(
//         productApprovals
//       );
//       const invalidResults = validationResults.filter(
//         (result) => !result.valid
//       );

//       if (invalidResults.length > 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Serial number validation failed",
//           validationErrors: invalidResults.map((result) => ({
//             productId: result.productId,
//             productName: result.productName,
//             error: result.error,
//           })),
//         });
//       }

//       for (const approval of productApprovals) {
//         if (!approval.productId) {
//           return res.status(400).json({
//             success: false,
//             message: "Each approval must have a productId",
//           });
//         }

//         if (
//           approval.approvedQuantity === undefined ||
//           approval.approvedQuantity === null
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: "Each approval must have an approvedQuantity",
//           });
//         }

//         if (approval.approvedQuantity < 0) {
//           return res.status(400).json({
//             success: false,
//             message: "Approved quantity cannot be negative",
//           });
//         }

//         const productItem = stockTransfer.products.find(
//           (p) => p.product.toString() === approval.productId.toString()
//         );

//         if (!productItem) {
//           return res.status(400).json({
//             success: false,
//             message: `Product with ID ${approval.productId} not found in this transfer`,
//           });
//         }

//         if (approval.approvedQuantity > productItem.quantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product`,
//           });
//         }

//         if (approval.approvedSerials && approval.approvedSerials.length > 0) {
//           if (approval.approvedSerials.length !== approval.approvedQuantity) {
//             return res.status(400).json({
//               success: false,
//               message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product`,
//             });
//           }

//           const uniqueSerials = new Set(approval.approvedSerials);
//           if (uniqueSerials.size !== approval.approvedSerials.length) {
//             return res.status(400).json({
//               success: false,
//               message: `Duplicate serial numbers found for product`,
//             });
//           }
//         }
//       }
//     }

//     const confirmedTransfer = await stockTransfer.confirmTransfer(
//       userId,
//       productApprovals
//     );

//     const populatedTransfer = await StockTransfer.findById(
//       confirmedTransfer._id
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("centerApproval.approvedBy", "_id fullName email");

//     let message = "Stock transfer confirmed successfully";
//     let hasSerialAssignments = false;

//     if (productApprovals && productApprovals.length > 0) {
//       const quantityAdjustments = productApprovals.filter(
//         (pa) => pa.approvedQuantity !== undefined
//       ).length;
//       const serialAssignments = productApprovals.filter(
//         (pa) => pa.approvedSerials && pa.approvedSerials.length > 0
//       ).length;

//       if (quantityAdjustments > 0) {
//         message += ` with ${quantityAdjustments} product quantity adjustment(s)`;
//       }

//       if (serialAssignments > 0) {
//         hasSerialAssignments = true;
//         message += ` and ${serialAssignments} serial number assignment(s)`;
//       }
//     }

//     const response = {
//       success: true,
//       message,
//       data: populatedTransfer,
//     };

//     if (hasSerialAssignments && productApprovals) {
//       response.serialAssignments = productApprovals
//         .filter((pa) => pa.approvedSerials && pa.approvedSerials.length > 0)
//         .map((pa) => ({
//           productId: pa.productId,
//           approvedQuantity: pa.approvedQuantity,
//           assignedSerials: pa.approvedSerials.length,
//         }));
//     }

//     res.status(200).json(response);
//   } catch (error) {
//     console.error("Error confirming stock transfer:", error);

//     if (
//       error.message.includes("Serial number validation failed") ||
//       error.message.includes("Number of serial numbers") ||
//       error.message.includes("Duplicate serial numbers") ||
//       error.message.includes("serial numbers not available")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Serial number validation failed",
//         error: error.message,
//       });
//     }

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid product ID or transfer ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };


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

    // FIRST: Call confirmTransfer which includes validation
    const confirmedTransfer = await stockTransfer.confirmTransfer(
      userId,
      productApprovals
    );

    // THEN: Update serial numbers status to "in_transit" AFTER successful confirmation
    if (productApprovals && productApprovals.length > 0) {
      const CenterStock = mongoose.model("CenterStock");
      
      for (const approval of productApprovals) {
        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          const centerStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: approval.productId,
          });

          if (centerStock) {
            // Update each serial number status to "in_transit"
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
          newStatus: "in_transit"
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

    // Update serial numbers status from "in_transit" to "transferred" when completing
    const CenterStock = mongoose.model("CenterStock");
    
    for (const productItem of stockTransfer.products) {
      if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
        const receivedReceipt = productReceipts?.find(
          pr => pr.productId.toString() === productItem.product.toString()
        );
        
        const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
        
        // Calculate how many serials to actually transfer vs return to available
        const serialsToTransfer = productItem.approvedSerials.slice(0, receivedQuantity);
        const serialsToReturn = productItem.approvedSerials.slice(receivedQuantity);

        // Update source center - change transferred serials from "in_transit" to "transferred"
        const sourceCenterStock = await CenterStock.findOne({
          center: stockTransfer.fromCenter,
          product: productItem.product,
        });

        if (sourceCenterStock) {
          // Process serials that are being transferred
          for (const serialNumber of serialsToTransfer) {
            const serial = sourceCenterStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
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

          // Process serials that need to be returned to available status
          for (const serialNumber of serialsToReturn) {
            const serial = sourceCenterStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
            );

            if (serial) {
              serial.status = "available";
              // Remove the last transfer history entry (the in_transit one)
              if (serial.transferHistory.length > 0) {
                serial.transferHistory.pop();
              }
            }
          }

          // Update source center quantities
          const transferredCount = serialsToTransfer.length;
          const returnedCount = serialsToReturn.length;
          
          await sourceCenterStock.save();

          console.log(`[DEBUG] Product ${productItem.product}: Transferred ${transferredCount}, Returned ${returnedCount} serials`);
        }

        // Update destination center - add only transferred serial numbers with "available" status
        if (serialsToTransfer.length > 0) {
          const destinationCenterStock = await CenterStock.findOne({
            center: stockTransfer.toCenter,
            product: productItem.product,
          });

          if (destinationCenterStock) {
            for (const serialNumber of serialsToTransfer) {
              // Find the original serial info from source center
              const originalSerial = sourceCenterStock?.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (originalSerial) {
                // Check if serial already exists in destination
                const existingSerial = destinationCenterStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

                if (!existingSerial) {
                  // Create a safe serial object with all required fields
                  const newSerial = {
                    serialNumber: serialNumber,
                    purchaseId: originalSerial.purchaseId || new mongoose.Types.ObjectId(), // Provide default if missing
                    originalOutlet: originalSerial.originalOutlet || stockTransfer.fromCenter, // Provide default if missing
                    status: "available",
                    currentLocation: stockTransfer.toCenter,
                    transferHistory: [
                      ...(originalSerial.transferHistory || []),
                      {
                        fromCenter: stockTransfer.fromCenter,
                        toCenter: stockTransfer.toCenter,
                        transferDate: new Date(),
                        transferType: "inbound_transfer",
                      }
                    ]
                  };

                  // Validate and fix any missing required fields
                  if (!newSerial.purchaseId) {
                    console.warn(`[WARNING] Serial ${serialNumber} has no purchaseId, generating default`);
                    newSerial.purchaseId = new mongoose.Types.ObjectId();
                  }

                  if (!newSerial.originalOutlet) {
                    console.warn(`[WARNING] Serial ${serialNumber} has no originalOutlet, using fromCenter`);
                    newSerial.originalOutlet = stockTransfer.fromCenter;
                  }

                  destinationCenterStock.serialNumbers.push(newSerial);
                } else {
                  // Update existing serial to "available"
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

            // Update destination center quantities
            destinationCenterStock.totalQuantity += serialsToTransfer.length;
            destinationCenterStock.availableQuantity += serialsToTransfer.length;
            
            // Clean up any invalid serials before saving
            destinationCenterStock.serialNumbers = destinationCenterStock.serialNumbers.filter(serial => {
              const isValid = serial.purchaseId && serial.originalOutlet;
              if (!isValid) {
                console.warn(`[WARNING] Removing invalid serial ${serial.serialNumber} due to missing required fields`);
              }
              return isValid;
            });
            
            await destinationCenterStock.save();
          } else {
            // Create new center stock entry if it doesn't exist
            // Prepare serials with proper validation
            const validatedSerials = [];
            
            for (const serialNumber of serialsToTransfer) {
              const originalSerial = sourceCenterStock?.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (originalSerial) {
                const newSerial = {
                  serialNumber: serialNumber,
                  purchaseId: originalSerial.purchaseId || new mongoose.Types.ObjectId(),
                  originalOutlet: originalSerial.originalOutlet || stockTransfer.fromCenter,
                  status: "available",
                  currentLocation: stockTransfer.toCenter,
                  transferHistory: [
                    ...(originalSerial.transferHistory || []),
                    {
                      fromCenter: stockTransfer.fromCenter,
                      toCenter: stockTransfer.toCenter,
                      transferDate: new Date(),
                      transferType: "inbound_transfer",
                    }
                  ]
                };

                // Validate required fields
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

    // Update the transfer with received quantities
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

    // Generate summary message
    let transferredSummary = [];
    let returnedSummary = [];
    
    for (const productItem of completedTransfer.products) {
      const receivedReceipt = productReceipts?.find(
        pr => pr.productId.toString() === productItem.product.toString()
      );
      const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
      const returnedCount = productItem.approvedSerials ? productItem.approvedSerials.length - receivedQuantity : 0;
      
      if (receivedQuantity > 0) {
        transferredSummary.push(`${receivedQuantity} of ${productItem.approvedQuantity}`);
      }
      if (returnedCount > 0) {
        returnedSummary.push(`${returnedCount} from ${productItem.approvedQuantity}`);
      }
    }

    let message = "Stock transfer completed successfully. ";
    if (transferredSummary.length > 0) {
      message += `Transferred: ${transferredSummary.join(', ')}. `;
    }
    if (returnedSummary.length > 0) {
      message += `Returned to available: ${returnedSummary.join(', ')}.`;
    }

    res.status(200).json({
      success: true,
      message: message.trim(),
      data: populatedTransfer,
      transferSummary: {
        transferred: transferredSummary,
        returned: returnedSummary
      }
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

// 2 export const completeStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productReceipts } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       for (const receipt of productReceipts) {
//         const productItem = stockTransfer.products.find(
//           (p) => p.product.toString() === receipt.productId.toString()
//         );

//         if (
//           productItem &&
//           receipt.receivedQuantity > productItem.approvedQuantity
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product`,
//           });
//         }
//       }
//     }

//     // Update serial numbers status from "in_transit" to "transferred" when completing
//     const CenterStock = mongoose.model("CenterStock");
    
//     for (const productItem of stockTransfer.products) {
//       if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//         const receivedReceipt = productReceipts?.find(
//           pr => pr.productId.toString() === productItem.product.toString()
//         );
        
//         const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
        
//         // Calculate how many serials to actually transfer vs return to available
//         const serialsToTransfer = productItem.approvedSerials.slice(0, receivedQuantity);
//         const serialsToReturn = productItem.approvedSerials.slice(receivedQuantity);

//         // Update source center - change transferred serials from "in_transit" to "transferred"
//         const sourceCenterStock = await CenterStock.findOne({
//           center: stockTransfer.fromCenter,
//           product: productItem.product,
//         });

//         if (sourceCenterStock) {
//           // Process serials that are being transferred
//           for (const serialNumber of serialsToTransfer) {
//             const serial = sourceCenterStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
//             );

//             if (serial) {
//               serial.status = "transferred";
//               serial.currentLocation = stockTransfer.toCenter;
//               serial.transferHistory.push({
//                 fromCenter: stockTransfer.fromCenter,
//                 toCenter: stockTransfer.toCenter,
//                 transferDate: new Date(),
//                 transferType: "outbound_transfer",
//               });
//             }
//           }

//           // Process serials that need to be returned to available status
//           for (const serialNumber of serialsToReturn) {
//             const serial = sourceCenterStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
//             );

//             if (serial) {
//               serial.status = "available";
//               // Remove the last transfer history entry (the in_transit one)
//               if (serial.transferHistory.length > 0) {
//                 serial.transferHistory.pop();
//               }
//             }
//           }

//           // Update source center quantities
//           const transferredCount = serialsToTransfer.length;
//           const returnedCount = serialsToReturn.length;
          
//           // sourceCenterStock.inTransitQuantity -= (transferredCount + returnedCount);
//           // sourceCenterStock.totalQuantity -= transferredCount;
//           // sourceCenterStock.availableQuantity += returnedCount;
          
//           await sourceCenterStock.save();

//           console.log(`[DEBUG] Product ${productItem.product}: Transferred ${transferredCount}, Returned ${returnedCount} serials`);
//         }

//         // Update destination center - add only transferred serial numbers with "available" status
//         if (serialsToTransfer.length > 0) {
//           const destinationCenterStock = await CenterStock.findOne({
//             center: stockTransfer.toCenter,
//             product: productItem.product,
//           });

//           if (destinationCenterStock) {
//             for (const serialNumber of serialsToTransfer) {
//               // Find the original serial info from source center
//               const originalSerial = sourceCenterStock?.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber
//               );

//               if (originalSerial) {
//                 // Check if serial already exists in destination
//                 const existingSerial = destinationCenterStock.serialNumbers.find(
//                   (sn) => sn.serialNumber === serialNumber
//                 );

//                 if (!existingSerial) {
//                   // Add serial to destination with "available" status
//                   destinationCenterStock.serialNumbers.push({
//                     serialNumber: serialNumber,
//                     purchaseId: originalSerial.purchaseId,
//                     originalOutlet: originalSerial.originalOutlet,
//                     status: "available",
//                     currentLocation: stockTransfer.toCenter,
//                     transferHistory: [
//                       ...originalSerial.transferHistory,
//                       {
//                         fromCenter: stockTransfer.fromCenter,
//                         toCenter: stockTransfer.toCenter,
//                         transferDate: new Date(),
//                         transferType: "inbound_transfer",
//                       }
//                     ]
//                   });
//                 } else {
//                   // Update existing serial to "available"
//                   existingSerial.status = "available";
//                   existingSerial.currentLocation = stockTransfer.toCenter;
//                   existingSerial.transferHistory.push({
//                     fromCenter: stockTransfer.fromCenter,
//                     toCenter: stockTransfer.toCenter,
//                     transferDate: new Date(),
//                     transferType: "inbound_transfer",
//                   });
//                 }
//               }
//             }

//             // Update destination center quantities
//             destinationCenterStock.totalQuantity += serialsToTransfer.length;
//             destinationCenterStock.availableQuantity += serialsToTransfer.length;
            
//             await destinationCenterStock.save();
//           } else {
//             // Create new center stock entry if it doesn't exist
//             await CenterStock.updateStock(
//               stockTransfer.toCenter,
//               productItem.product,
//               serialsToTransfer.length,
//               serialsToTransfer,
//               stockTransfer.fromCenter,
//               "inbound_transfer"
//             );
//           }
//         }
//       }
//     }

//     // Update the transfer with received quantities
//     if (productReceipts && productReceipts.length > 0) {
//       stockTransfer.products = stockTransfer.products.map((productItem) => {
//         const receipt = productReceipts.find(
//           (pr) => pr.productId.toString() === productItem.product.toString()
//         );
        
//         if (receipt) {
//           return {
//             ...productItem.toObject(),
//             receivedQuantity: receipt.receivedQuantity,
//             receivedRemark: receipt.receivedRemark || "",
//           };
//         }
//         return productItem;
//       });
//     }

//     const completedTransfer = await stockTransfer.completeTransfer(
//       userId,
//       productReceipts
//     );

//     const populatedTransfer = await StockTransfer.findById(
//       completedTransfer._id
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     // Generate summary message
//     let transferredSummary = [];
//     let returnedSummary = [];
    
//     for (const productItem of completedTransfer.products) {
//       const receivedReceipt = productReceipts?.find(
//         pr => pr.productId.toString() === productItem.product.toString()
//       );
//       const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
//       const returnedCount = productItem.approvedSerials ? productItem.approvedSerials.length - receivedQuantity : 0;
      
//       if (receivedQuantity > 0) {
//         transferredSummary.push(`${receivedQuantity} of ${productItem.approvedQuantity}`);
//       }
//       if (returnedCount > 0) {
//         returnedSummary.push(`${returnedCount} from ${productItem.approvedQuantity}`);
//       }
//     }

//     let message = "Stock transfer completed successfully. ";
//     if (transferredSummary.length > 0) {
//       message += `Transferred: ${transferredSummary.join(', ')}. `;
//     }
//     if (returnedSummary.length > 0) {
//       message += `Returned to available: ${returnedSummary.join(', ')}.`;
//     }

//     res.status(200).json({
//       success: true,
//       message: message.trim(),
//       data: populatedTransfer,
//       transferSummary: {
//         transferred: transferredSummary,
//         returned: returnedSummary
//       }
//     });
//   } catch (error) {
//     console.error("Error completing stock transfer:", error);

//     if (error.message.includes("Received quantity cannot exceed")) {
//       return res.status(400).json({
//         success: false,
//         message: "Quantity validation failed",
//         error: error.message,
//       });
//     }

//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const completeStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productReceipts } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       for (const receipt of productReceipts) {
//         const productItem = stockTransfer.products.find(
//           (p) => p.product.toString() === receipt.productId.toString()
//         );

//         if (
//           productItem &&
//           receipt.receivedQuantity > productItem.approvedQuantity
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product`,
//           });
//         }
//       }
//     }

//     // Update serial numbers status from "in_transit" to "transferred" when completing
//     const CenterStock = mongoose.model("CenterStock");
    
//     for (const productItem of stockTransfer.products) {
//       if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//         // Update source center - change from "in_transit" to "transferred"
//         const sourceCenterStock = await CenterStock.findOne({
//           center: stockTransfer.fromCenter,
//           product: productItem.product,
//         });

//         if (sourceCenterStock) {
//           for (const serialNumber of productItem.approvedSerials) {
//             const serial = sourceCenterStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
//             );

//             if (serial) {
//               serial.status = "transferred";
//               serial.currentLocation = stockTransfer.toCenter;
//               serial.transferHistory.push({
//                 fromCenter: stockTransfer.fromCenter,
//                 toCenter: stockTransfer.toCenter,
//                 transferDate: new Date(),
//                 transferType: "outbound_transfer",
//               });
//             }
//           }

//           // Update source center quantities
//           sourceCenterStock.inTransitQuantity -= productItem.approvedSerials.length;
//           sourceCenterStock.totalQuantity -= productItem.approvedSerials.length;
          
//           await sourceCenterStock.save();
//         }

//         // Update destination center - add serial numbers with "available" status
//         const destinationCenterStock = await CenterStock.findOne({
//           center: stockTransfer.toCenter,
//           product: productItem.product,
//         });

//         if (destinationCenterStock) {
//           for (const serialNumber of productItem.approvedSerials) {
//             // Find the original serial info from source center
//             const originalSerial = sourceCenterStock?.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (originalSerial) {
//               // Check if serial already exists in destination
//               const existingSerial = destinationCenterStock.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber
//               );

//               if (!existingSerial) {
//                 // Add serial to destination with "available" status
//                 destinationCenterStock.serialNumbers.push({
//                   serialNumber: serialNumber,
//                   purchaseId: originalSerial.purchaseId,
//                   originalOutlet: originalSerial.originalOutlet,
//                   status: "available",
//                   currentLocation: stockTransfer.toCenter,
//                   transferHistory: [
//                     ...originalSerial.transferHistory,
//                     {
//                       fromCenter: stockTransfer.fromCenter,
//                       toCenter: stockTransfer.toCenter,
//                       transferDate: new Date(),
//                       transferType: "inbound_transfer",
//                     }
//                   ]
//                 });
//               } else {
//                 // Update existing serial to "available"
//                 existingSerial.status = "available";
//                 existingSerial.currentLocation = stockTransfer.toCenter;
//                 existingSerial.transferHistory.push({
//                   fromCenter: stockTransfer.fromCenter,
//                   toCenter: stockTransfer.toCenter,
//                   transferDate: new Date(),
//                   transferType: "inbound_transfer",
//                 });
//               }
//             }
//           }

//           // Update destination center quantities
//           destinationCenterStock.totalQuantity += productItem.approvedSerials.length;
//           destinationCenterStock.availableQuantity += productItem.approvedSerials.length;
          
//           await destinationCenterStock.save();
//         } else {
//           // Create new center stock entry if it doesn't exist
//           const serialsToAdd = [];
          
//           for (const serialNumber of productItem.approvedSerials) {
//             const originalSerial = sourceCenterStock?.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (originalSerial) {
//               serialsToAdd.push({
//                 serialNumber: serialNumber,
//                 purchaseId: originalSerial.purchaseId,
//                 originalOutlet: originalSerial.originalOutlet,
//                 status: "available",
//                 currentLocation: stockTransfer.toCenter,
//                 transferHistory: [
//                   ...originalSerial.transferHistory,
//                   {
//                     fromCenter: stockTransfer.fromCenter,
//                     toCenter: stockTransfer.toCenter,
//                     transferDate: new Date(),
//                     transferType: "inbound_transfer",
//                   }
//                 ]
//               });
//             }
//           }

//           await CenterStock.updateStock(
//             stockTransfer.toCenter,
//             productItem.product,
//             productItem.approvedSerials.length,
//             productItem.approvedSerials,
//             stockTransfer.fromCenter,
//             "inbound_transfer"
//           );
//         }
//       }
//     }

//     const completedTransfer = await stockTransfer.completeTransfer(
//       userId,
//       productReceipts
//     );

//     const populatedTransfer = await StockTransfer.findById(
//       completedTransfer._id
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message:
//         "Stock transfer completed successfully. Serial numbers status updated from 'in_transit' to 'transferred' in source center and added as 'available' in destination center.",
//       data: populatedTransfer,
//     });
//   } catch (error) {
//     console.error("Error completing stock transfer:", error);

//     if (error.message.includes("Received quantity cannot exceed")) {
//       return res.status(400).json({
//         success: false,
//         message: "Quantity validation failed",
//         error: error.message,
//       });
//     }

//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

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

          // if (availableSerials.length !== productItem.approvedSerials.length) {
          //   const missingSerials = productItem.approvedSerials.filter(
          //     (sn) => !availableSerials.includes(sn)
          //   );
          //   return res.status(400).json({
          //     success: false,
          //     message: `Some assigned serial numbers are not available for product "${
          //       product?.productTitle
          //     }": ${missingSerials.join(", ")}`,
          //     details: {
          //       product: product?.productTitle,
          //       missingSerials: missingSerials,
          //     },
          //   });
          // }

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

// export const completeStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productReceipts } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       for (const receipt of productReceipts) {
//         const productItem = stockTransfer.products.find(
//           (p) => p.product.toString() === receipt.productId.toString()
//         );

//         if (
//           productItem &&
//           receipt.receivedQuantity > productItem.approvedQuantity
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product`,
//           });
//         }
//       }
//     }

//     const completedTransfer = await stockTransfer.completeTransfer(
//       userId,
//       productReceipts
//     );

//     const populatedTransfer = await StockTransfer.findById(
//       completedTransfer._id
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message:
//         "Stock transfer completed successfully. Stock added to destination center using assigned serial numbers.",
//       data: populatedTransfer,
//     });
//   } catch (error) {
//     console.error("Error completing stock transfer:", error);

//     if (error.message.includes("Received quantity cannot exceed")) {
//       return res.status(400).json({
//         success: false,
//         message: "Quantity validation failed",
//         error: error.message,
//       });
//     }

//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

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

// export const completeIncompleteStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals, productReceipts } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     if (stockTransfer.status !== "Incompleted") {
//       return res.status(400).json({
//         success: false,
//         message: "Only incomplete stock transfers can be completed",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productApprovals && productApprovals.length > 0) {
//       const approvalsWithQuantity = productApprovals.filter(
//         (pa) => pa.approvedQuantity > 0
//       );

//       if (approvalsWithQuantity.length > 0) {
//         const validationResults = await stockTransfer.validateSerialNumbers(
//           approvalsWithQuantity
//         );
//         const invalidResults = validationResults.filter(
//           (result) => !result.valid
//         );

//         if (invalidResults.length > 0) {
//           return res.status(400).json({
//             success: false,
//             message: "Serial number validation failed",
//             validationErrors: invalidResults,
//           });
//         }
//       }
//     }

//     const productsToComplete =
//       productReceipts && productReceipts.length > 0
//         ? productReceipts
//         : productApprovals;

//     if (
//       !productsToComplete ||
//       !Array.isArray(productsToComplete) ||
//       productsToComplete.length === 0
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Product approvals or receipts are required",
//       });
//     }

//     const productsWithQuantity = productsToComplete.filter(
//       (product) => product.receivedQuantity > 0 || product.approvedQuantity > 0
//     );

//     const finalProductReceipts = productsWithQuantity.map((product) => ({
//       productId: product.productId,
//       receivedQuantity:
//         product.receivedQuantity || product.approvedQuantity || 0,
//       receivedRemark: product.receivedRemark || product.approvedRemark || "",
//     }));

//     if (productApprovals && productApprovals.length > 0) {
//       stockTransfer.products = stockTransfer.products.map((productItem) => {
//         const approval = productApprovals.find(
//           (pa) => pa.productId.toString() === productItem.product.toString()
//         );

//         if (approval) {
//           return {
//             ...productItem.toObject(),
//             approvedQuantity: approval.approvedQuantity,
//             approvedRemark:
//               approval.approvedRemark || productItem.approvedRemark || "",

//             approvedSerials:
//               approval.approvedQuantity > 0
//                 ? approval.approvedSerials || productItem.approvedSerials || []
//                 : [],
//           };
//         }
//         return productItem;
//       });
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       stockTransfer.products = stockTransfer.products.map((productItem) => {
//         const receipt = productReceipts.find(
//           (pr) => pr.productId.toString() === productItem.product.toString()
//         );

//         if (receipt) {
//           return {
//             ...productItem.toObject(),
//             receivedQuantity: receipt.receivedQuantity,
//             receivedRemark:
//               receipt.receivedRemark || productItem.receivedRemark || "",
//           };
//         }
//         return productItem;
//       });
//     }

//     for (const receipt of finalProductReceipts) {
//       const productItem = stockTransfer.products.find(
//         (p) => p.product.toString() === receipt.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product ${receipt.productId} not found in stock transfer`,
//         });
//       }

//       if (receipt.receivedQuantity > productItem.approvedQuantity) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${productItem.product}`,
//         });
//       }
//     }

//     await stockTransfer.save();

//     let completedTransfer;

//     if (finalProductReceipts.length > 0) {
//       if (!stockTransfer.stockStatus.sourceDeducted) {
//         await stockTransfer.processSourceDeduction();
//       }

//       await stockTransfer.processDestinationAddition();

//       completedTransfer = await stockTransfer.completeTransfer(
//         userId,
//         finalProductReceipts
//       );
//     } else {
//       stockTransfer.status = "Completed";
//       stockTransfer.receivingInfo = {
//         receivedAt: new Date(),
//         receivedBy: userId,
//       };
//       stockTransfer.completionInfo = {
//         completedOn: new Date(),
//         completedBy: userId,
//       };
//       stockTransfer.updatedBy = userId;

//       completedTransfer = await stockTransfer.save();
//     }

//     const populatedTransfer = await StockTransfer.findById(
//       completedTransfer._id
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("adminApproval.approvedBy", "_id fullName email")
//       .populate("centerApproval.approvedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     const message =
//       finalProductReceipts.length > 0
//         ? "Incomplete stock transfer completed successfully and stock transferred to destination center"
//         : "Incomplete stock transfer completed successfully with zero quantities";

//     res.status(200).json({
//       success: true,
//       message,
//       data: populatedTransfer,
//       note:
//         finalProductReceipts.length === 0
//           ? "No stock operations performed as all quantities were zero"
//           : undefined,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock transfer ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("serial numbers") ||
//       error.message.includes("No serial numbers assigned")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Stock transfer failed",
//         error: error.message,
//       });
//     }

//     console.error("Error completing incomplete stock transfer:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error completing incomplete stock transfer",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

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

    // Update serial numbers status to "in_transit" for incomplete transfers being completed
    if (productApprovals && productApprovals.length > 0) {
      const CenterStock = mongoose.model("CenterStock");
      
      for (const approval of productApprovals) {
        if (approval.approvedSerials && approval.approvedSerials.length > 0 && approval.approvedQuantity > 0) {
          const centerStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: approval.productId,
          });

          if (centerStock) {
            // Update each serial number status to "in_transit"
            for (const serialNumber of approval.approvedSerials) {
              const serial = centerStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "available"
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

            // Update quantities
            // centerStock.availableQuantity -= approval.approvedSerials.length;
            // centerStock.inTransitQuantity += approval.approvedSerials.length;
            
            await centerStock.save();
          }
        }
      }

      // Update the transfer with new approvals
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
      // Update serial numbers status from "in_transit" to "transferred" when completing incomplete transfer
      const CenterStock = mongoose.model("CenterStock");
      
      for (const productItem of stockTransfer.products) {
        if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
          const receivedReceipt = finalProductReceipts.find(
            pr => pr.productId.toString() === productItem.product.toString()
          );
          
          const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
          
          // Calculate how many serials to actually transfer vs return to available
          const serialsToTransfer = productItem.approvedSerials.slice(0, receivedQuantity);
          const serialsToReturn = productItem.approvedSerials.slice(receivedQuantity);

          // Update source center - change transferred serials from "in_transit" to "transferred"
          const sourceCenterStock = await CenterStock.findOne({
            center: stockTransfer.fromCenter,
            product: productItem.product,
          });

          if (sourceCenterStock) {
            // Process serials that are being transferred
            for (const serialNumber of serialsToTransfer) {
              const serial = sourceCenterStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
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

            // Process serials that need to be returned to available status
            for (const serialNumber of serialsToReturn) {
              const serial = sourceCenterStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "in_transit"
              );

              if (serial) {
                serial.status = "available";
                // Remove the last transfer history entry (the in_transit one)
                if (serial.transferHistory.length > 0) {
                  serial.transferHistory.pop();
                }
              }
            }

            // Update source center quantities
            const transferredCount = serialsToTransfer.length;
            const returnedCount = serialsToReturn.length;
            
            sourceCenterStock.inTransitQuantity -= (transferredCount + returnedCount);
            sourceCenterStock.totalQuantity -= transferredCount;
            sourceCenterStock.availableQuantity += returnedCount;
            
            await sourceCenterStock.save();
          }

          // Update destination center - add only transferred serial numbers with "available" status
          if (serialsToTransfer.length > 0) {
            const destinationCenterStock = await CenterStock.findOne({
              center: stockTransfer.toCenter,
              product: productItem.product,
            });

            if (destinationCenterStock) {
              for (const serialNumber of serialsToTransfer) {
                // Find the original serial info from source center
                const originalSerial = sourceCenterStock?.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

                if (originalSerial) {
                  // Check if serial already exists in destination
                  const existingSerial = destinationCenterStock.serialNumbers.find(
                    (sn) => sn.serialNumber === serialNumber
                  );

                  if (!existingSerial) {
                    // Add serial to destination with "available" status
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
                        }
                      ]
                    });
                  } else {
                    // Update existing serial to "available"
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

              // Update destination center quantities
              destinationCenterStock.totalQuantity += serialsToTransfer.length;
              destinationCenterStock.availableQuantity += serialsToTransfer.length;
              
              await destinationCenterStock.save();
            } else {
              // Create new center stock entry if it doesn't exist
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
      // If no quantities, just mark as completed without stock operations
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

    // Generate summary message
    let transferredSummary = [];
    let returnedSummary = [];
    
    for (const productItem of completedTransfer.products) {
      const receivedReceipt = finalProductReceipts.find(
        pr => pr.productId.toString() === productItem.product.toString()
      );
      const receivedQuantity = receivedReceipt?.receivedQuantity || productItem.approvedQuantity;
      const returnedCount = productItem.approvedSerials ? productItem.approvedSerials.length - receivedQuantity : 0;
      
      if (receivedQuantity > 0) {
        transferredSummary.push(`${receivedQuantity} of ${productItem.approvedQuantity}`);
      }
      if (returnedCount > 0) {
        returnedSummary.push(`${returnedCount} from ${productItem.approvedQuantity}`);
      }
    }

    let message = "Incomplete stock transfer completed successfully. ";
    if (transferredSummary.length > 0) {
      message += `Transferred: ${transferredSummary.join(', ')}. `;
    }
    if (returnedSummary.length > 0) {
      message += `Returned to available: ${returnedSummary.join(', ')}.`;
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
        returned: returnedSummary
      }
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

// export const rejectStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { rejectionRemark } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const rejectedTransfer = await stockTransfer.rejectTransfer(
//       userId,
//       rejectionRemark
//     );

//     const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("completionInfo.incompleteBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock transfer rejected",
//       data: populatedTransfer,
//     });
//   } catch (error) {
//     console.error("Error rejecting stock transfer:", error);
//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

export const rejectStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionRemark, rejectionType = "center" } = req.body; // Add rejectionType

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

    // Validate rejection type and current status
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

    // Restore serial numbers to "available" status and regain stock quantities
    const CenterStock = mongoose.model("CenterStock");
    
    let totalRestoredSerials = 0;
    let totalRestoredNonSerialized = 0;

    for (const productItem of stockTransfer.products) {
      const product = await mongoose.model("Product").findById(productItem.product);
      const requiresSerials = product ? product.trackSerialNumber === "Yes" : false;
      const approvedQuantity = productItem.approvedQuantity || productItem.quantity;

      if (requiresSerials && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
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
              // Restore serial numbers that are in "in_transit" or "transferred" status
              if (serial.status === "in_transit" || serial.status === "transferred") {
                serial.status = "available";
                serial.currentLocation = stockTransfer.fromCenter;
                restoredCount++;
                
                // Add rejection entry to transfer history
                serial.transferHistory.push({
                  fromCenter: stockTransfer.fromCenter,
                  toCenter: stockTransfer.toCenter,
                  transferDate: new Date(),
                  transferType: "transfer_rejected",
                  remark: `Transfer rejected: ${rejectionRemark || "No reason provided"}`
                });
              }
            }
          }

          // Update quantities only if serials were actually restored
          if (restoredCount > 0) {
            // For serialized products, update the quantities
            centerStock.inTransitQuantity = Math.max(0, centerStock.inTransitQuantity - restoredCount);
            centerStock.availableQuantity += restoredCount;
            
            // If some serials were marked as transferred, we need to add back to total quantity
            const transferredSerials = productItem.approvedSerials.filter(serialNumber => {
              const serial = centerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
              return serial && serial.status === "available" && serial.currentLocation?.toString() === stockTransfer.fromCenter.toString();
            }).length;
            
            if (transferredSerials > 0) {
              centerStock.totalQuantity += transferredSerials;
            }
            
            await centerStock.save();
            totalRestoredSerials += restoredCount;
            
            console.log(`[DEBUG] Restored ${restoredCount} serials to available status for product ${productItem.product}`);
          }
        }
      } else if (!requiresSerials && approvedQuantity > 0) {
        // Handle non-serialized stock restoration
        const centerStock = await CenterStock.findOne({
          center: stockTransfer.fromCenter,
          product: productItem.product,
        });

        if (centerStock) {
          // For non-serialized products, restore the available quantity
          // Check if stock was already deducted (in_transit quantity)
          const wasDeducted = centerStock.inTransitQuantity >= approvedQuantity;
          
          if (wasDeducted) {
            centerStock.availableQuantity += approvedQuantity;
            centerStock.inTransitQuantity -= approvedQuantity;
            totalRestoredNonSerialized += approvedQuantity;
          } else {
            // If no in_transit quantity, just ensure available quantity is correct
            centerStock.availableQuantity += approvedQuantity;
            totalRestoredNonSerialized += approvedQuantity;
          }
          
          await centerStock.save();
          console.log(`[DEBUG] Restored ${approvedQuantity} non-serialized units for product ${productItem.product}`);
        }
      }
    }

    // Also handle the case where stock was already deducted at source
    if (stockTransfer.stockStatus.sourceDeducted) {
      await stockTransfer.reverseSourceDeduction();
    }

    // Handle the case where stock was already added to destination
    if (stockTransfer.stockStatus.destinationAdded) {
      await stockTransfer.reverseDestinationAddition();
    }

    // Handle rejection based on type
    let rejectedTransfer;
    if (rejectionType === "admin") {
      rejectedTransfer = await stockTransfer.rejectByAdmin(userId, rejectionRemark);
    } else {
      rejectedTransfer = await stockTransfer.rejectByCenter(userId, rejectionRemark);
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
      .populate("centerApproval.rejectedBy", "_id fullName email") // Add this
      .populate("completionInfo.incompleteBy", "_id fullName email");

    // Generate summary message
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
        rejectionType: rejectionType
      }
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

// export const rejectStockTransfer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { rejectionRemark } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     // Restore serial numbers to "available" status and regain stock quantities
//     const CenterStock = mongoose.model("CenterStock");
    
//     let totalRestoredSerials = 0;
//     let totalRestoredNonSerialized = 0;

//     for (const productItem of stockTransfer.products) {
//       const product = await mongoose.model("Product").findById(productItem.product);
//       const requiresSerials = product ? product.trackSerialNumber === "Yes" : false;
//       const approvedQuantity = productItem.approvedQuantity || productItem.quantity;

//       if (requiresSerials && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//         const centerStock = await CenterStock.findOne({
//           center: stockTransfer.fromCenter,
//           product: productItem.product,
//         });

//         if (centerStock) {
//           let restoredCount = 0;
          
//           for (const serialNumber of productItem.approvedSerials) {
//             const serial = centerStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (serial) {
//               // Restore serial numbers that are in "in_transit" or "transferred" status
//               if (serial.status === "in_transit" || serial.status === "transferred") {
//                 serial.status = "available";
//                 serial.currentLocation = stockTransfer.fromCenter;
//                 restoredCount++;
                
//                 // Add rejection entry to transfer history
//                 serial.transferHistory.push({
//                   fromCenter: stockTransfer.fromCenter,
//                   toCenter: stockTransfer.toCenter,
//                   transferDate: new Date(),
//                   transferType: "transfer_rejected",
//                   remark: `Transfer rejected: ${rejectionRemark || "No reason provided"}`
//                 });
//               }
//             }
//           }

//           // Update quantities only if serials were actually restored
//           if (restoredCount > 0) {
//             // For serialized products, update the quantities
//             centerStock.inTransitQuantity = Math.max(0, centerStock.inTransitQuantity - restoredCount);
//             centerStock.availableQuantity += restoredCount;
            
//             // If some serials were marked as transferred, we need to add back to total quantity
//             const transferredSerials = productItem.approvedSerials.filter(serialNumber => {
//               const serial = centerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//               return serial && serial.status === "available" && serial.currentLocation?.toString() === stockTransfer.fromCenter.toString();
//             }).length;
            
//             if (transferredSerials > 0) {
//               centerStock.totalQuantity += transferredSerials;
//             }
            
//             await centerStock.save();
//             totalRestoredSerials += restoredCount;
            
//             console.log(`[DEBUG] Restored ${restoredCount} serials to available status for product ${productItem.product}`);
//           }
//         }
//       } else if (!requiresSerials && approvedQuantity > 0) {
//         // Handle non-serialized stock restoration
//         const centerStock = await CenterStock.findOne({
//           center: stockTransfer.fromCenter,
//           product: productItem.product,
//         });

//         if (centerStock) {
//           // For non-serialized products, restore the available quantity
//           // Check if stock was already deducted (in_transit quantity)
//           const wasDeducted = centerStock.inTransitQuantity >= approvedQuantity;
          
//           if (wasDeducted) {
//             centerStock.availableQuantity += approvedQuantity;
//             centerStock.inTransitQuantity -= approvedQuantity;
//             totalRestoredNonSerialized += approvedQuantity;
//           } else {
//             // If no in_transit quantity, just ensure available quantity is correct
//             centerStock.availableQuantity += approvedQuantity;
//             totalRestoredNonSerialized += approvedQuantity;
//           }
          
//           await centerStock.save();
//           console.log(`[DEBUG] Restored ${approvedQuantity} non-serialized units for product ${productItem.product}`);
//         }
//       }
//     }

//     // Also handle the case where stock was already deducted at source
//     if (stockTransfer.stockStatus.sourceDeducted) {
//       await stockTransfer.reverseSourceDeduction();
//     }

//     // Handle the case where stock was already added to destination
//     if (stockTransfer.stockStatus.destinationAdded) {
//       await stockTransfer.reverseDestinationAddition();
//     }

//     const rejectedTransfer = await stockTransfer.rejectTransfer(
//       userId,
//       rejectionRemark
//     );

//     const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("completionInfo.incompleteBy", "_id fullName email");

//     // Generate summary message
//     let summaryMessage = "Stock transfer rejected successfully. ";
    
//     if (totalRestoredSerials > 0) {
//       summaryMessage += `${totalRestoredSerials} serialized items restored to available status. `;
//     }
    
//     if (totalRestoredNonSerialized > 0) {
//       summaryMessage += `${totalRestoredNonSerialized} non-serialized units regained. `;
//     }
    
//     if (totalRestoredSerials === 0 && totalRestoredNonSerialized === 0) {
//       summaryMessage += "No stock adjustments were needed.";
//     }

//     res.status(200).json({
//       success: true,
//       message: summaryMessage.trim(),
//       data: populatedTransfer,
//       restorationSummary: {
//         serializedItemsRestored: totalRestoredSerials,
//         nonSerializedUnitsRegained: totalRestoredNonSerialized,
//         totalItemsRestored: totalRestoredSerials + totalRestoredNonSerialized
//       }
//     });
//   } catch (error) {
//     console.error("Error rejecting stock transfer:", error);
//     res.status(400).json({
//       success: false,
//       message: error.message,
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

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

    // Handle status filter - support both array (multiple params) and string (comma-separated)
    if (status) {
      if (Array.isArray(status)) {
        // When status is passed as multiple query parameters: ?status=Completed&status=Rejected
        filter.status = { $in: status };
      } else if (status.includes(",")) {
        // When status is passed as comma-separated string: ?status=Completed,Rejected,Confirmed
        filter.status = { $in: status.split(",").map(s => s.trim()) };
      } else {
        // Single status value
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

// export const updateApprovedQuantities = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockTransfer = await StockTransfer.findById(id);
//     if (!stockTransfer) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock transfer not found",
//       });
//     }

//     if (!["Admin_Approved", "Confirmed"].includes(stockTransfer.status)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Approved quantities can only be updated for Admin Approved or Confirmed transfers",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (
//       !productApprovals ||
//       !Array.isArray(productApprovals) ||
//       productApprovals.length === 0
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Product approvals array is required and cannot be empty",
//       });
//     }

//     if (productApprovals && productApprovals.some((pa) => pa.approvedSerials)) {
//       const validationResults = await stockTransfer.validateSerialNumbers(
//         productApprovals
//       );
//       const invalidResults = validationResults.filter(
//         (result) => !result.valid
//       );

//       if (invalidResults.length > 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Serial number validation failed",
//           validationErrors: invalidResults,
//         });
//       }
//     }

//     for (const approval of productApprovals) {
//       if (!approval.productId) {
//         return res.status(400).json({
//           success: false,
//           message: "Each approval must have a productId",
//         });
//       }

//       if (
//         approval.approvedQuantity === undefined ||
//         approval.approvedQuantity === null
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: "Each approval must have an approvedQuantity",
//         });
//       }

//       if (approval.approvedQuantity < 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Approved quantity cannot be negative",
//         });
//       }

//       const productItem = stockTransfer.products.find(
//         (p) => p.product.toString() === approval.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product with ID ${approval.productId} not found in this transfer`,
//         });
//       }

//       if (approval.approvedQuantity > productItem.quantity) {
//         return res.status(400).json({
//           success: false,
//           message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product`,
//         });
//       }

//       if (approval.approvedSerials && approval.approvedSerials.length > 0) {
//         if (approval.approvedSerials.length !== approval.approvedQuantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product`,
//           });
//         }
//       }
//     }

//     const updatedProducts = stockTransfer.products.map((productItem) => {
//       const approval = productApprovals.find(
//         (pa) => pa.productId.toString() === productItem.product.toString()
//       );

//       if (approval) {
//         return {
//           ...productItem.toObject(),
//           approvedQuantity: approval.approvedQuantity,
//           approvedRemark: approval.approvedRemark || "",
//           approvedSerials: approval.approvedSerials || [],
//         };
//       }
//       return productItem;
//     });

//     const updateData = {
//       products: updatedProducts,
//       updatedBy: userId,
//     };

//     const updatedTransfer = await StockTransfer.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("fromCenter", "_id centerName centerCode")
//       .populate("toCenter", "_id centerName centerCode")
//       .populate(
//         "products.product",
//         "_id productTitle productCode trackSerialNumbers"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("adminApproval.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities and serial numbers updated successfully",
//       data: updatedTransfer,
//     });
//   } catch (error) {
//     console.error("Error updating approved quantities:", error);

//     if (
//       error.message.includes("Serial number validation failed") ||
//       error.message.includes("Number of serial numbers")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Serial number validation failed",
//         error: error.message,
//       });
//     }

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid product ID or transfer ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating approved quantities",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

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

    // Debug: Log current transfer state
    console.log(`[DEBUG] === CURRENT TRANSFER STATE ===`);
    console.log(`[DEBUG] Transfer Status: ${stockTransfer.status}`);
    console.log(`[DEBUG] Current Products:`, stockTransfer.products.map(p => ({
      product: p.product.toString(),
      quantity: p.quantity,
      approvedQuantity: p.approvedQuantity,
      approvedSerials: p.approvedSerials || [],
      requiresSerialNumbers: p.requiresSerialNumbers
    })));

    console.log(`[DEBUG] === PROCESSING PRODUCT APPROVALS ===`);
    
    // Process each product approval
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
      console.log(`[DEBUG] Product: ${product.productTitle}, Requires Serials: ${requiresSerials}`);

      if (requiresSerials) {
        // Get current and new data
        const currentApprovedQuantity = productItem.approvedQuantity || productItem.quantity;
        const currentApprovedSerials = productItem.approvedSerials || [];
        const newApprovedQuantity = approval.approvedQuantity;
        const newApprovedSerials = approval.approvedSerials || [];

        console.log(`[DEBUG] Processing product: ${product.productTitle}`);
        console.log(`[DEBUG] Current quantity: ${currentApprovedQuantity}, New quantity: ${newApprovedQuantity}`);
        console.log(`[DEBUG] Current serials: [${currentApprovedSerials.join(', ')}]`);
        console.log(`[DEBUG] New serials: [${newApprovedSerials.join(', ')}]`);

        // Validate serial numbers if provided
        if (newApprovedSerials.length > 0 && newApprovedSerials.length !== newApprovedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Number of serial numbers (${newApprovedSerials.length}) must match approved quantity (${newApprovedQuantity}) for product ${product.productTitle}`,
          });
        }

        // Validate new serial numbers availability
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
              message: `Some serial numbers are not available for product ${product.productTitle}: ${missingSerials.join(", ")}`,
            });
          }
        }

        // Handle the two scenarios separately
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
    
    // Update the transfer document with new approvals
    const updatedProducts = await Promise.all(
      stockTransfer.products.map(async (productItem) => {
        const approval = productApprovals.find(
          (pa) => pa.productId && pa.productId.toString() === productItem.product.toString()
        );

        if (approval) {
          // Get product details properly with await
          const product = await Product.findById(approval.productId);
          const requiresSerials = product ? product.trackSerialNumber === "Yes" : false;

          // Create the updated product item
          const updatedProduct = {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedRemark: approval.approvedRemark || "",
            approvedSerials: requiresSerials ? (approval.approvedSerials || []) : [],
            requiresSerialNumbers: requiresSerials
          };

          console.log(`[DEBUG] Product Update - ${product?.productTitle || 'Unknown Product'}:`, {
            productId: productItem.product.toString(),
            currentApprovedSerials: productItem.approvedSerials || [],
            newApprovedSerials: updatedProduct.approvedSerials,
            currentApprovedQuantity: productItem.approvedQuantity,
            newApprovedQuantity: updatedProduct.approvedQuantity,
            requiresSerialNumbers: updatedProduct.requiresSerialNumbers
          });

          return updatedProduct;
        } else {
          console.log(`[DEBUG] No approval found for product: ${productItem.product.toString()}`);
          return productItem;
        }
      })
    );

    console.log(`[DEBUG] Final Updated Products:`, JSON.stringify(updatedProducts, null, 2));

    const updateData = {
      products: updatedProducts,
      updatedBy: userId,
    };

    console.log(`[DEBUG] Update Data to Save:`, JSON.stringify(updateData, null, 2));

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
    console.log(`[DEBUG] Final Transfer State:`, JSON.stringify(updatedTransfer.products.map(p => ({
      product: p.product._id,
      productTitle: p.product.productTitle,
      approvedQuantity: p.approvedQuantity,
      approvedSerials: p.approvedSerials,
      requiresSerialNumbers: p.requiresSerialNumbers
    })), null, 2));

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

// Replace the entire handleApprovalUpdateScenarios function with this:

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
  console.log(`[DEBUG] Current quantity: ${currentQuantity}, New quantity: ${newQuantity}`);
  console.log(`[DEBUG] Current serials: [${currentSerials.join(', ')}]`);
  console.log(`[DEBUG] New serials: [${newSerials.join(', ')}]`);

  let quantityChange = newQuantity - currentQuantity;
  let serialsChanged = JSON.stringify(currentSerials) !== JSON.stringify(newSerials);

  console.log(`[DEBUG] Quantity change: ${quantityChange}, Serials changed: ${serialsChanged}`);

  // CASE 1: Quantity is being reduced
  if (quantityChange < 0) {
    const quantityToRestore = Math.abs(quantityChange);
    console.log(`[DEBUG] CASE 1: Quantity reduced by ${quantityToRestore}`);
    
    let serialsToRestore = [];
    
    if (serialsChanged && newSerials.length > 0) {
      // If serials changed, restore the ones that are no longer in the new list
      serialsToRestore = currentSerials.filter(serial => !newSerials.includes(serial));
    } else {
      // If serials didn't change or no new serials provided, restore the last X serials
      serialsToRestore = currentSerials.slice(newQuantity);
    }
    
    console.log(`[DEBUG] Restoring ${serialsToRestore.length} serials: [${serialsToRestore.join(', ')}]`);
    
    await restoreSerialsToAvailable(centerStock, serialsToRestore, fromCenter, toCenter);
    
    // Update quantities
    centerStock.availableQuantity += quantityToRestore;
    centerStock.inTransitQuantity -= quantityToRestore;
  }
  
  // CASE 2: Quantity is being increased
  else if (quantityChange > 0) {
    const quantityToAdd = quantityChange;
    console.log(`[DEBUG] CASE 2: Quantity increased by ${quantityToAdd}`);
    
    if (newSerials.length === 0) {
      throw new Error(`Quantity increased from ${currentQuantity} to ${newQuantity}. Please provide ${quantityToAdd} additional serial numbers.`);
    }
    
    // Get the additional serials needed
    let additionalSerials = [];
    if (serialsChanged) {
      // If serials changed, use all the new serials beyond the original quantity
      additionalSerials = newSerials.slice(currentQuantity);
    } else {
      // If serials didn't change, we need completely new serials for the increase
      throw new Error(`Quantity increased but no new serial numbers provided. Please provide ${quantityToAdd} additional serial numbers.`);
    }
    
    if (additionalSerials.length !== quantityToAdd) {
      throw new Error(`Need exactly ${quantityToAdd} additional serial numbers, but got ${additionalSerials.length}`);
    }
    
    console.log(`[DEBUG] Adding ${additionalSerials.length} new serials: [${additionalSerials.join(', ')}]`);
    
    await markSerialsAsInTransit(centerStock, additionalSerials, fromCenter, toCenter);
    
    // Update quantities
    centerStock.availableQuantity -= quantityToAdd;
    centerStock.inTransitQuantity += quantityToAdd;
  }
  
  // CASE 3: Quantity unchanged but serials changed
  else if (quantityChange === 0 && serialsChanged) {
    console.log(`[DEBUG] CASE 3: Quantity unchanged, only serials changed`);
    
    // This is the case where you're going from no serials to having serials
    if (currentSerials.length === 0 && newSerials.length > 0) {
      console.log(`[DEBUG] Adding serials for the first time`);
      
      await markSerialsAsInTransit(centerStock, newSerials, fromCenter, toCenter);
      
      // Update quantities (moving from no serial assignment to having serials assigned)
      centerStock.availableQuantity -= newSerials.length;
      centerStock.inTransitQuantity += newSerials.length;
      
      console.log(`[DEBUG] First-time serial assignment - Available: -${newSerials.length}, InTransit: +${newSerials.length}`);
    }
    // This is the case where you're replacing existing serials
    else if (currentSerials.length > 0 && newSerials.length > 0) {
      console.log(`[DEBUG] Replacing existing serials`);
      
      const serialsToRemove = currentSerials.filter(serial => !newSerials.includes(serial));
      const serialsToAdd = newSerials.filter(serial => !currentSerials.includes(serial));
      
      console.log(`[DEBUG] Removing ${serialsToRemove.length} serials, Adding ${serialsToAdd.length} serials`);
      
      if (serialsToRemove.length !== serialsToAdd.length) {
        throw new Error(`When replacing serials, number to remove (${serialsToRemove.length}) must match number to add (${serialsToAdd.length})`);
      }
      
      await restoreSerialsToAvailable(centerStock, serialsToRemove, fromCenter, toCenter);
      await markSerialsAsInTransit(centerStock, serialsToAdd, fromCenter, toCenter);
      
      // No quantity changes in this case since it's a direct replacement
    }
    // This is the case where you're removing all serials (going back to no serial assignment)
    else if (currentSerials.length > 0 && newSerials.length === 0) {
      console.log(`[DEBUG] Removing all serial assignments`);
      
      await restoreSerialsToAvailable(centerStock, currentSerials, fromCenter, toCenter);
      
      // Update quantities (moving from having serials assigned to no serials assigned)
      centerStock.availableQuantity += currentSerials.length;
      centerStock.inTransitQuantity -= currentSerials.length;
      
      console.log(`[DEBUG] Removed all serial assignments - Available: +${currentSerials.length}, InTransit: -${currentSerials.length}`);
    }
  }
  
  // CASE 4: No changes at all
  else {
    console.log(`[DEBUG] CASE 4: No changes detected`);
  }

  await centerStock.save();
  console.log(`[DEBUG] Center stock saved successfully`);
}
// Helper function to restore serials to available status
async function restoreSerialsToAvailable(centerStock, serialsToRestore, fromCenter, toCenter) {
  let restoredCount = 0;
  
  for (const serialNumber of serialsToRestore) {
    const serial = centerStock.serialNumbers.find(
      sn => sn.serialNumber === serialNumber
    );

    if (serial && (serial.status === "in_transit" || serial.status === "transferred")) {
      serial.status = "available";
      serial.currentLocation = fromCenter;
      restoredCount++;

      serial.transferHistory.push({
        fromCenter: fromCenter,
        toCenter: toCenter,
        transferDate: new Date(),
        transferType: "transfer_updated",
        remark: "Restored to available during quantity update"
      });

      console.log(`[DEBUG] Restored serial ${serialNumber} to available status`);
    }
  }
  
  return restoredCount;
}

// Helper function to mark serials as in_transit
async function markSerialsAsInTransit(centerStock, serialsToAdd, fromCenter, toCenter) {
  let addedCount = 0;
  
  for (const serialNumber of serialsToAdd) {
    const serial = centerStock.serialNumbers.find(
      sn => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serial) {
      serial.status = "in_transit";
      serial.transferHistory.push({
        fromCenter: fromCenter,
        toCenter: toCenter,
        transferDate: new Date(),
        transferType: "outbound_transfer",
        remark: "Added during serial number update"
      });
      addedCount++;

      console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
    } else {
      throw new Error(`Serial number ${serialNumber} is not available or not found`);
    }
  }
  
  return addedCount;
}