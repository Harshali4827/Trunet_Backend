import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockPurchase from "../models/StockPurchase.js";
import CenterStock from "../models/CenterStock.js";
import mongoose from "mongoose";

export const createStockRequest = async (req, res) => {
  try {
    const {
      warehouse,
      remark,
      products,
      status = "Draft",
      orderNumber,
      date,
    } = req.body;

    if (!orderNumber || orderNumber.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Order number is required",
      });
    }

    const trimmedOrderNumber = orderNumber.trim();

    const existingRequest = await StockRequest.findOne({
      orderNumber: trimmedOrderNumber,
    });

    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message:
          "Order number already exists. Please use a unique order number.",
        duplicateOrderNumber: trimmedOrderNumber,
        existingRequestId: existingRequest._id,
      });
    }

    let requestDate = new Date();
    if (date) {
      requestDate = new Date(date);
      if (isNaN(requestDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Please provide a valid date.",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const providedDate = new Date(requestDate);
      providedDate.setHours(0, 0, 0, 0);
    }

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;

    const centerExists = await Center.findById(centerId);
    if (!centerExists) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
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

    const stockRequest = new StockRequest({
      orderNumber: trimmedOrderNumber,
      warehouse,
      center: centerId,
      remark: remark || "",
      products,
      date: requestDate,
      status,
      createdBy: req.user.id,
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email");

    res.status(201).json({
      success: true,
      message: "Stock request created successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error creating stock request:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === "orderNumber") {
        return res.status(409).json({
          success: false,
          message:
            "Order number already exists. Please use a unique order number.",
          duplicateOrderNumber: req.body.orderNumber,
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
      message: "Error creating stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getAllStockRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      center,
      warehouse,
      startDate,
      endDate,
      createdAtStart,
      createdAtEnd,
      orderNumber,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (status) {
      if (status.includes(",")) {
        filter.status = { $in: status.split(",") };
      } else {
        filter.status = status;
      }
    }

    if (center) {
      if (center.includes(",")) {
        filter.center = { $in: center.split(",") };
      } else {
        filter.center = center;
      }
    }

    if (warehouse) {
      if (warehouse.includes(",")) {
        filter.warehouse = { $in: warehouse.split(",") };
      } else {
        filter.warehouse = warehouse;
      }
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (createdAtStart || createdAtEnd) {
      filter.createdAt = {};
      if (createdAtStart) filter.createdAt.$gte = new Date(createdAtStart);
      if (createdAtEnd) filter.createdAt.$lte = new Date(createdAtEnd);
    }

    if (orderNumber) {
      if (orderNumber.includes(",")) {
        filter.orderNumber = {
          $in: orderNumber.split(",").map((num) => num.trim()),
        };
      } else {
        filter.orderNumber = { $regex: orderNumber, $options: "i" };
      }
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
        { "receivingInfo.receivedRemark": { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "orderNumber",
      "status",
      "approvalInfo.approvedAt",
      "shippingInfo.shippedAt",
      "receivingInfo.receivedAt",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const stockRequests = await StockRequest.find(filter)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const stockRequestsWithCenterStock = await Promise.all(
      stockRequests.map(async (request) => {
        const productIds = request.products.map((p) => p.product._id);

        const centerStock = await StockPurchase.aggregate([
          {
            $match: {
              center: request.center._id,
              product: { $in: productIds },
            },
          },
          {
            $group: {
              _id: "$product",
              totalQuantity: { $sum: "$quantity" },
            },
          },
        ]);

        const centerStockMap = {};
        centerStock.forEach((stock) => {
          centerStockMap[stock._id.toString()] = stock.totalQuantity;
        });

        const productsWithStock = request.products.map((product) => ({
          ...product,
          centerStockQuantity:
            centerStockMap[product.product._id.toString()] || 0,
        }));

        return {
          ...request,
          products: productsWithStock,
        };
      })
    );

    const total = await StockRequest.countDocuments(filter);

    const statusCounts = await StockRequest.aggregate([
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
      message: "Stock requests retrieved successfully",
      data: stockRequestsWithCenterStock,
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
    console.error("Error retrieving stock requests:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock requests",
      error: error.message,
    });
  }
};

export const getStockRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate(
        "products.product",
        "_id productTitle productCode productImage trackSerialNumber"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .lean();

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const productIds = stockRequest.products.map((p) => p.product._id);

    const centerStock = await StockPurchase.aggregate([
      {
        $match: {
          center: stockRequest.center._id,
          product: { $in: productIds },
        },
      },
      {
        $group: {
          _id: "$product",
          totalQuantity: { $sum: "$quantity" },
        },
      },
    ]);

    const centerStockMap = {};
    centerStock.forEach((stock) => {
      centerStockMap[stock._id.toString()] = stock.totalQuantity;
    });

    const productsWithEnhancedData = stockRequest.products.map((product) => ({
      ...product,
      centerStockQuantity: centerStockMap[product.product._id.toString()] || 0,

      approvedSerials: product.approvedSerials || [],
      serialNumbers: product.serialNumbers || [],
      transferredSerials: product.transferredSerials || [],

      serialSummary: {
        approvedCount: product.approvedSerials?.length || 0,
        transferredCount: product.transferredSerials?.length || 0,
        requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
      },
    }));

    const stockRequestWithEnhancedData = {
      ...stockRequest,
      products: productsWithEnhancedData,
    };

    res.status(200).json({
      success: true,
      message: "Stock request retrieved successfully",
      data: stockRequestWithEnhancedData,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    console.error("Error retrieving stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock request",
      error: error.message,
    });
  }
};

export const updateStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      warehouse,
      center,
      remark,
      products,
      status,
      approvalInfo,
      shippingInfo,
      receivingInfo,
      completionInfo,
      orderNumber,
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
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
      ...(warehouse && { warehouse }),
      ...(center && { center }),
      ...(remark !== undefined && { remark }),
      ...(status && { status }),
      ...(orderNumber && { orderNumber: orderNumber.trim() }),
      ...(approvalInfo && {
        approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo },
      }),
      ...(shippingInfo && {
        shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo },
      }),
      ...(receivingInfo && {
        receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo },
      }),
      ...(completionInfo && {
        completionInfo: {
          ...existingRequest.completionInfo,
          ...completionInfo,
        },
      }),
    };

    // Handle stock status reversion when request is rejected
    if (status === "Rejected" && existingRequest.status !== "Rejected") {
      await revertStockForRejectedRequest(existingRequest);
    }

    if (products) {
      if (["Draft", "Submitted"].includes(existingRequest.status)) {
        updateData.products = products;
      } else {
        updateData.products = existingRequest.products.map(
          (existingProduct, index) => {
            const newProduct = products.find(
              (p) => p.product.toString() === existingProduct.product.toString()
            );
            if (newProduct) {
              return {
                ...existingProduct.toObject(),
                quantity:
                  newProduct.quantity !== undefined
                    ? newProduct.quantity
                    : existingProduct.quantity,
                productRemark:
                  newProduct.productRemark !== undefined
                    ? newProduct.productRemark
                    : existingProduct.productRemark,
                receivedQuantity:
                  newProduct.receivedQuantity !== undefined
                    ? newProduct.receivedQuantity
                    : existingProduct.receivedQuantity,
                receivedRemark:
                  newProduct.receivedRemark !== undefined
                    ? newProduct.receivedRemark
                    : existingProduct.receivedRemark,

                approvedSerials:
                  newProduct.approvedSerials !== undefined
                    ? newProduct.approvedSerials
                    : existingProduct.approvedSerials,
              };
            }
            return existingProduct;
          }
        );
      }
    }

    if (status) {
      const currentDate = new Date();

      switch (status) {
        case "Confirmed":
          updateData.approvalInfo = {
            ...existingRequest.approvalInfo,
            approvedAt: currentDate,
            approvedBy: userId,
            ...approvalInfo,
          };
          break;
        case "Shipped":
          updateData.shippingInfo = {
            ...existingRequest.shippingInfo,
            shippedAt: currentDate,
            shippedBy: userId,
            ...shippingInfo,
          };
          break;
        case "Completed":
          updateData.receivingInfo = {
            ...existingRequest.receivingInfo,
            receivedAt: currentDate,
            receivedBy: userId,
            ...receivingInfo,
          };
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            completedOn: currentDate,
            completedBy: userId,
            ...completionInfo,
          };
          break;
        case "Incompleted":
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            incompleteRemark: completionInfo?.incompleteRemark || "",
            ...completionInfo,
          };
          break;
        case "Rejected":
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            ...completionInfo,
          };
          break;
      }
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request updated successfully",
      data: updatedRequest,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
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
          "Order number already exists. Please use a different order number.",
      });
    }

    console.error("Error updating stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error updating stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

// Helper function to revert stock status when request is rejected
async function revertStockForRejectedRequest(stockRequest) {
  try {
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    // Process each product in the stock request
    for (const productItem of stockRequest.products) {
      if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: productItem.product,
        });

        if (outletStock) {
          let revertedCount = 0;

          // Revert each approved serial number back to "available"
          for (const serialNumber of productItem.approvedSerials) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              // Check current status and revert accordingly
              if (serial.status === "in_transit") {
                serial.status = "available";
                serial.currentLocation = stockRequest.warehouse;
                
                // Remove the pending transfer history entry
                if (serial.transferHistory.length > 0) {
                  const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                  if (lastTransfer.status === "in_transit") {
                    serial.transferHistory.pop();
                  }
                }
                
                revertedCount++;
                console.log(`Reverted serial ${serialNumber} back to available status due to request rejection`);
              } else if (serial.status === "transferred") {
                // If stock was already transferred, revert it back
                serial.status = "available";
                serial.currentLocation = stockRequest.warehouse;
                
                // Remove transfer history entries related to this transfer
                serial.transferHistory = serial.transferHistory.filter(
                  transfer => transfer.toCenter?.toString() !== stockRequest.center.toString()
                );
                
                revertedCount++;
                console.log(`Reverted transferred serial ${serialNumber} back to available status due to request rejection`);
              }
            }
          }

          // Update stock quantities
          if (revertedCount > 0) {
            // Increase available quantity
            outletStock.availableQuantity += revertedCount;
            
            // Decrease in_transit quantity if applicable
            const inTransitSerials = productItem.approvedSerials.filter(serialNumber => {
              const serial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
              return serial && serial.status === "in_transit";
            });
            
            outletStock.inTransitQuantity -= inTransitSerials.length;
            
            // Increase total quantity if stock was transferred
            const transferredSerials = productItem.approvedSerials.filter(serialNumber => {
              const serial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
              return serial && serial.status === "transferred";
            });
            
            outletStock.totalQuantity += transferredSerials.length;

            await outletStock.save();
            console.log(`Reverted ${revertedCount} items back to available for product ${productItem.product} due to request rejection`);

            // Remove stock from center if it was transferred
            if (transferredSerials.length > 0) {
              const centerStock = await CenterStock.findOne({
                center: stockRequest.center,
                product: productItem.product,
              });

              if (centerStock) {
                // Remove the serial numbers from center stock
                centerStock.serialNumbers = centerStock.serialNumbers.filter(
                  sn => !transferredSerials.includes(sn.serialNumber)
                );

                // Update quantities
                centerStock.totalQuantity -= transferredSerials.length;
                centerStock.availableQuantity -= transferredSerials.length;

                await centerStock.save();
                console.log(`Removed ${transferredSerials.length} items from center stock for product ${productItem.product} due to request rejection`);
              }
            }
          }
        }
      }
    }

    // Clear approved serials and quantities in the stock request
    stockRequest.products = stockRequest.products.map(productItem => ({
      ...productItem.toObject(),
      approvedQuantity: 0,
      approvedSerials: [],
      transferredSerials: [],
      receivedQuantity: 0,
      receivedRemark: "",
    }));

    await stockRequest.save();

  } catch (error) {
    console.error("Error reverting stock for rejected request:", error);
    throw new Error(`Failed to revert stock: ${error.message}`);
  }
}

// export const updateStockRequest = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       warehouse,
//       center,
//       remark,
//       products,
//       status,
//       approvalInfo,
//       shippingInfo,
//       receivingInfo,
//       completionInfo,
//       orderNumber,
//     } = req.body;

//     const existingRequest = await StockRequest.findById(id);
//     if (!existingRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const updateData = {
//       updatedBy: userId,
//       ...(warehouse && { warehouse }),
//       ...(center && { center }),
//       ...(remark !== undefined && { remark }),
//       ...(status && { status }),
//       ...(orderNumber && { orderNumber: orderNumber.trim() }),
//       ...(approvalInfo && {
//         approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo },
//       }),
//       ...(shippingInfo && {
//         shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo },
//       }),
//       ...(receivingInfo && {
//         receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo },
//       }),
//       ...(completionInfo && {
//         completionInfo: {
//           ...existingRequest.completionInfo,
//           ...completionInfo,
//         },
//       }),
//     };

//     if (products) {
//       if (["Draft", "Submitted"].includes(existingRequest.status)) {
//         updateData.products = products;
//       } else {
//         updateData.products = existingRequest.products.map(
//           (existingProduct, index) => {
//             const newProduct = products.find(
//               (p) => p.product.toString() === existingProduct.product.toString()
//             );
//             if (newProduct) {
//               return {
//                 ...existingProduct.toObject(),
//                 quantity:
//                   newProduct.quantity !== undefined
//                     ? newProduct.quantity
//                     : existingProduct.quantity,
//                 productRemark:
//                   newProduct.productRemark !== undefined
//                     ? newProduct.productRemark
//                     : existingProduct.productRemark,
//                 receivedQuantity:
//                   newProduct.receivedQuantity !== undefined
//                     ? newProduct.receivedQuantity
//                     : existingProduct.receivedQuantity,
//                 receivedRemark:
//                   newProduct.receivedRemark !== undefined
//                     ? newProduct.receivedRemark
//                     : existingProduct.receivedRemark,

//                 approvedSerials:
//                   newProduct.approvedSerials !== undefined
//                     ? newProduct.approvedSerials
//                     : existingProduct.approvedSerials,
//               };
//             }
//             return existingProduct;
//           }
//         );
//       }
//     }
//     if (status) {
//       const currentDate = new Date();

//       switch (status) {
//         case "Confirmed":
//           updateData.approvalInfo = {
//             ...existingRequest.approvalInfo,
//             approvedAt: currentDate,
//             approvedBy: userId,
//             ...approvalInfo,
//           };
//           break;
//         case "Shipped":
//           updateData.shippingInfo = {
//             ...existingRequest.shippingInfo,
//             shippedAt: currentDate,
//             shippedBy: userId,
//             ...shippingInfo,
//           };
//           break;
//         case "Completed":
//           updateData.receivingInfo = {
//             ...existingRequest.receivingInfo,
//             receivedAt: currentDate,
//             receivedBy: userId,
//             ...receivingInfo,
//           };
//           updateData.completionInfo = {
//             ...existingRequest.completionInfo,
//             completedOn: currentDate,
//             completedBy: userId,
//             ...completionInfo,
//           };
//           break;
//         case "Incompleted":
//           updateData.completionInfo = {
//             ...existingRequest.completionInfo,
//             incompleteOn: currentDate,
//             incompleteBy: userId,
//             incompleteRemark: completionInfo?.incompleteRemark || "",
//             ...completionInfo,
//           };
//           break;
//         case "Rejected":
//           updateData.completionInfo = {
//             ...existingRequest.completionInfo,
//             incompleteOn: currentDate,
//             incompleteBy: userId,
//             ...completionInfo,
//           };
//           break;
//       }
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.incompleteBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request updated successfully",
//       data: updatedRequest,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
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

//     if (error.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Order number already exists. Please use a different order number.",
//       });
//     }

//     console.error("Error updating stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

export const deleteStockRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (
      !["Submitted", "Incompleted", "Draft", "Completed", "Confirmed"].includes(
        stockRequest.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only Submitted, Incompleted, Draft, Confirmed and Completed stock requests can be deleted",
      });
    }

    await StockRequest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Stock request deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    console.error("Error deleting stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting stock request",
      error: error.message,
    });
  }
};

export const validateSerialNumbers = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const validationResults = await stockRequest.validateSerialNumbers(
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

// export const approveStockRequest = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
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
//       const validationResults = await stockRequest.validateSerialNumbers(
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
//     }

//     const updatedRequest = await stockRequest.approveRequest(
//       userId,
//       productApprovals
//     );

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request approved successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error approving stock request:", error);

//     if (
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

//     res.status(500).json({
//       success: false,
//       message: "Error approving stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

export const approveStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Validate serial numbers if provided
    if (productApprovals && productApprovals.length > 0) {
      const validationResults = await stockRequest.validateSerialNumbers(
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
    }

    // Update stock status to "in_transit" for approved serial numbers
    if (productApprovals && productApprovals.length > 0) {
      const OutletStock = mongoose.model("OutletStock");
      
      for (const approval of productApprovals) {
        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: approval.productId,
          });

          if (outletStock) {
            // Update serial number status to "in_transit"
            for (const serialNumber of approval.approvedSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );
              
              if (serial && serial.status === "available") {
                serial.status = "in_transit";
                serial.currentLocation = stockRequest.warehouse; // Still at warehouse but in transit
                
                // Add transfer history entry
                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  status: "in_transit"
                });
              }
            }

            // Update stock quantities
            const inTransitCount = approval.approvedSerials.length;
            outletStock.availableQuantity -= inTransitCount;
            outletStock.inTransitQuantity += inTransitCount;
            
            await outletStock.save();
          }
        }
      }
    }

    const updatedRequest = await stockRequest.approveRequest(
      userId,
      productApprovals
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request approved successfully and stock marked as in transit",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error approving stock request:", error);

    if (
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

    res.status(500).json({
      success: false,
      message: "Error approving stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const shipStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      shippedDate,
      expectedDeliveryDate,
      shipmentDetails,
      shipmentRemark,
      documents,
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const shippingDetails = {
      shippedDate: new Date(shippedDate),
      ...(expectedDeliveryDate && {
        expectedDeliveryDate: new Date(expectedDeliveryDate),
      }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && {
        documents: Array.isArray(documents) ? documents : [documents],
      }),
    };

    const updatedRequest = await stockRequest.shipRequest(
      userId,
      shippingDetails
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request shipped successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error shipping stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error shipping stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
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
      shipmentRemark,
      documents,
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

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
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && {
        documents: Array.isArray(documents) ? documents : [documents],
      }),
    };

    const updatedRequest = await stockRequest.updateShippingInfo(
      shippingDetails
    );

    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Shipping information updated successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error updating shipping information:", error);
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

export const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updatedRequest = await stockRequest.rejectShipment(userId);

    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate(
        "shippingInfo.shipmentRejected.rejectedBy",
        "_id fullName email"
      )
      .populate("updatedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error rejecting shipment:", error);
    res.status(500).json({
      success: false,
      message: "Error rejecting shipment",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const markAsIncomplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { incompleteRemark, receivedProducts } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
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
      stockRequest.products = stockRequest.products.map((productItem) => {
        const receivedProduct = receivedProducts.find(
          (rp) => rp.productId.toString() === productItem.product.toString()
        );

        if (receivedProduct) {
          return {
            ...productItem.toObject(),
            receivedQuantity: receivedProduct.receivedQuantity || 0,
            receivedRemark: receivedProduct.receivedRemark || "",
          };
        }
        return productItem;
      });
    }

    const currentDate = new Date();

    stockRequest.status = "Incompleted";
    stockRequest.updatedBy = userId;
    stockRequest.completionInfo = {
      ...stockRequest.completionInfo,
      incompleteOn: currentDate,
      incompleteBy: userId,
      incompleteRemark: incompleteRemark || "",
    };

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request marked as incomplete successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error marking stock request as incomplete:", error);
    res.status(500).json({
      success: false,
      message: "Error marking stock request as incomplete",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const completeIncompleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals, productReceipts } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (stockRequest.status !== "Incompleted") {
      return res.status(400).json({
        success: false,
        message: "Only incomplete stock requests can be completed",
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
      const validationResults = await stockRequest.validateSerialNumbers(
        productApprovals
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

    const finalProductReceipts =
      productReceipts && productReceipts.length > 0
        ? productReceipts
        : productApprovals.map((approval) => ({
            productId: approval.productId,
            receivedQuantity: approval.approvedQuantity,
            receivedRemark:
              approval.receivedRemark || approval.approvedRemark || "",
          }));

    // Update stock status from "in_transit" to "transferred" for incomplete requests
    // and handle quantity reductions
    if (finalProductReceipts && finalProductReceipts.length > 0) {
      const OutletStock = mongoose.model("OutletStock");
      const CenterStock = mongoose.model("CenterStock");
      
      for (const receipt of finalProductReceipts) {
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === receipt.productId.toString()
        );

        if (productItem && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: receipt.productId,
          });

          if (outletStock) {
            const approvedCount = productItem.approvedSerials.length;
            const receivedCount = receipt.receivedQuantity;
            
            // Calculate how many items need to be reverted back to available
            const revertCount = approvedCount - receivedCount;
            
            if (revertCount > 0) {
              // Revert excess serial numbers from "in_transit" back to "available"
              const serialsToRevert = productItem.approvedSerials.slice(receivedCount);
              
              for (const serialNumber of serialsToRevert) {
                const serial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                
                if (serial) {
                  // Check current status and revert accordingly
                  if (serial.status === "in_transit") {
                    serial.status = "available";
                    serial.currentLocation = stockRequest.warehouse;
                    
                    // Remove the pending transfer history entry
                    if (serial.transferHistory.length > 0) {
                      const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                      if (lastTransfer.status === "in_transit") {
                        serial.transferHistory.pop();
                      }
                    }
                    
                    console.log(`Reverted serial ${serialNumber} back to available status for incomplete request`);
                  }
                }
              }

              // Update stock quantities for reverted items
              outletStock.availableQuantity += revertCount;
              outletStock.inTransitQuantity -= revertCount;
              
              console.log(`Reverted ${revertCount} items back to available for product ${receipt.productId} in incomplete request`);
            }

            // Process the received quantity - mark as transferred
            if (receivedCount > 0) {
              const serialsToTransfer = productItem.approvedSerials.slice(0, receivedCount);
              
              for (const serialNumber of serialsToTransfer) {
                const serial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                
                if (serial) {
                  // If status is "in_transit", update to "transferred"
                  if (serial.status === "in_transit") {
                    serial.status = "transferred";
                    serial.currentLocation = stockRequest.center;
                    
                    // Update the last transfer history entry
                    const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                    if (lastTransfer) {
                      lastTransfer.status = "completed";
                      lastTransfer.completedAt = new Date();
                    }
                  }
                }
              }

              // Final stock quantity updates
              outletStock.inTransitQuantity -= receivedCount;
              outletStock.totalQuantity -= receivedCount;
              
              // Update CenterStock only for received quantity
              await CenterStock.updateStock(
                stockRequest.center,
                receipt.productId,
                receivedCount,
                serialsToTransfer,
                stockRequest.warehouse,
                "inbound_transfer"
              );

              productItem.transferredSerials = serialsToTransfer;
            } else {
              // If received quantity is 0, clear transferred serials
              productItem.transferredSerials = [];
            }

            productItem.receivedQuantity = receipt.receivedQuantity;
            
            await outletStock.save();
          }
        }
      }
    }

    // Update product approvals if provided
    if (productApprovals && productApprovals.length > 0) {
      stockRequest.products = stockRequest.products.map((productItem) => {
        const approval = productApprovals.find(
          (pa) => pa.productId.toString() === productItem.product.toString()
        );

        if (approval) {
          return {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedSerials: approval.approvedSerials || [],
          };
        }
        return productItem;
      });
    }

    // Update the stock request
    stockRequest.status = "Completed";
    stockRequest.receivingInfo = {
      receivedAt: new Date(),
      receivedBy: userId,
    };
    stockRequest.completionInfo = {
      completedOn: new Date(),
      completedBy: userId,
    };
    stockRequest.updatedBy = userId;

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Incomplete stock request completed successfully and stock transferred to center",
      data: populatedRequest,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
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
        message: "Stock Request failed",
        error: error.message,
      });
    }

    console.error("Error completing incomplete stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error completing incomplete stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

// export const completeIncompleteRequest = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals, productReceipts } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (stockRequest.status !== "Incompleted") {
//       return res.status(400).json({
//         success: false,
//         message: "Only incomplete stock requests can be completed",
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
//       const validationResults = await stockRequest.validateSerialNumbers(
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

//     const finalProductReceipts =
//       productReceipts && productReceipts.length > 0
//         ? productReceipts
//         : productApprovals.map((approval) => ({
//             productId: approval.productId,
//             receivedQuantity: approval.approvedQuantity,
//             receivedRemark:
//               approval.receivedRemark || approval.approvedRemark || "",
//           }));

//     if (productApprovals && productApprovals.length > 0) {
//       stockRequest.products = stockRequest.products.map((productItem) => {
//         const approval = productApprovals.find(
//           (pa) => pa.productId.toString() === productItem.product.toString()
//         );

//         if (approval) {
//           return {
//             ...productItem.toObject(),
//             approvedQuantity: approval.approvedQuantity,
//           };
//         }
//         return productItem;
//       });
//     }

//     for (const receipt of finalProductReceipts) {
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === receipt.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product ${receipt.productId} not found in stock request`,
//         });
//       }

//       if (receipt.receivedQuantity > productItem.approvedQuantity) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${productItem.product}`,
//         });
//       }
//     }

//     stockRequest.approvalInfo = {
//       ...stockRequest.approvalInfo,
//       approvedAt: stockRequest.approvalInfo.approvedAt || new Date(),
//       approvedBy: stockRequest.approvalInfo.approvedBy || userId,
//     };

//     await stockRequest.save();

//     const updatedRequest = await stockRequest.completeWithStockTransfer(
//       userId,
//       finalProductReceipts
//     );

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message:
//         "Incomplete stock request completed successfully and stock transferred to center",
//       data: populatedRequest,
//       transferSummary: updatedRequest.stockTransferInfo,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
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
//         message: "Stock Request failed",
//         error: error.message,
//       });
//     }

//     console.error("Error completing incomplete stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error completing incomplete stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const completeStockRequest = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productReceipts, receivedRemark } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
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
//         const productItem = stockRequest.products.find(
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

//     const updatedRequest = await stockRequest.completeWithStockTransfer(
//       userId,
//       productReceipts,
//       receivedRemark
//     );

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message:
//         "Stock request completed successfully and stock transferred to center",
//       data: populatedRequest,
//       transferSummary: stockRequest.stockTransferInfo,
//     });
//   } catch (error) {
//     console.error("Error completing stock request:", error);

//     if (
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("serial numbers not available") ||
//       error.message.includes("No serial numbers assigned")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Stock transfer failed",
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error completing stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

export const completeStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { productReceipts, receivedRemark } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
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
        const productItem = stockRequest.products.find(
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

    // Update stock status from "in_transit" to "transferred" and handle quantity reductions
    if (productReceipts && productReceipts.length > 0) {
      const OutletStock = mongoose.model("OutletStock");
      const CenterStock = mongoose.model("CenterStock");
      
      for (const receipt of productReceipts) {
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === receipt.productId.toString()
        );

        if (productItem && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: receipt.productId,
          });

          if (outletStock) {
            const approvedCount = productItem.approvedSerials.length;
            const receivedCount = receipt.receivedQuantity;
            
            // Calculate how many items need to be reverted back to available
            const revertCount = approvedCount - receivedCount;
            
            if (revertCount > 0) {
              // Revert excess serial numbers from "in_transit" back to "available"
              const serialsToRevert = productItem.approvedSerials.slice(receivedCount);
              
              for (const serialNumber of serialsToRevert) {
                const serial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                
                if (serial && serial.status === "in_transit") {
                  serial.status = "available";
                  serial.currentLocation = stockRequest.warehouse;
                  
                  // Remove the last transfer history entry since it's being reverted
                  serial.transferHistory.pop();
                  
                  console.log(`Reverted serial ${serialNumber} back to available status`);
                }
              }

              // Update stock quantities for reverted items
              outletStock.availableQuantity += revertCount;
              outletStock.inTransitQuantity -= revertCount;
              
              console.log(`Reverted ${revertCount} items back to available for product ${receipt.productId}`);
            }

            // Process the received quantity - mark as transferred
            const serialsToTransfer = productItem.approvedSerials.slice(0, receivedCount);
            
            for (const serialNumber of serialsToTransfer) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );
              
              if (serial && serial.status === "in_transit") {
                serial.status = "transferred";
                serial.currentLocation = stockRequest.center;
                
                // Update the last transfer history entry to mark as completed
                const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                if (lastTransfer) {
                  lastTransfer.status = "completed";
                  lastTransfer.completedAt = new Date();
                }
              }
            }

            // Final stock quantity updates
            outletStock.inTransitQuantity -= receivedCount; // Remove from in_transit
            outletStock.totalQuantity -= receivedCount; // Remove from total (transferred out)
            
            await outletStock.save();

            // Update or create CenterStock only for received quantity
            if (receivedCount > 0) {
              await CenterStock.updateStock(
                stockRequest.center,
                receipt.productId,
                receivedCount,
                serialsToTransfer,
                stockRequest.warehouse,
                "inbound_transfer"
              );
            }

            // Update the stock request with transferred serials
            productItem.transferredSerials = serialsToTransfer;
            productItem.receivedQuantity = receipt.receivedQuantity;
          }
        }
      }
    }

    // Update the stock request status and completion info
    stockRequest.status = "Completed";
    stockRequest.receivingInfo = {
      receivedAt: new Date(),
      receivedBy: userId,
      receivedRemark: receivedRemark || "",
    };
    stockRequest.completionInfo = {
      completedOn: new Date(),
      completedBy: userId,
    };
    stockRequest.updatedBy = userId;

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request completed successfully and stock transferred to center",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error completing stock request:", error);

    if (
      error.message.includes("Insufficient stock") ||
      error.message.includes("serial numbers not available") ||
      error.message.includes("No serial numbers assigned")
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock transfer failed",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error completing stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const updateStockRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...additionalInfo } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
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
      status,
      updatedBy: userId,
    };

    const currentDate = new Date();

    switch (status) {
      case "Confirmed":
        if (additionalInfo.productApprovals) {
          const validationResults = await stockRequest.validateSerialNumbers(
            additionalInfo.productApprovals
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

        updateData.approvalInfo = {
          ...stockRequest.approvalInfo,
          approvedAt: currentDate,
          approvedBy: userId,
          approvedRemark: additionalInfo.approvedRemark || "",
          ...additionalInfo,
        };

        if (additionalInfo.productApprovals) {
          updateData.products = stockRequest.products.map((productItem) => {
            const approval = additionalInfo.productApprovals.find(
              (pa) => pa.productId.toString() === productItem.product.toString()
            );
            if (approval) {
              return {
                ...productItem.toObject(),
                approvedQuantity: approval.approvedQuantity,
                approvedRemark: approval.approvedRemark || "",
                approvedSerials: approval.approvedSerials || [],
              };
            }
            return productItem;
          });
        }
        break;

      case "Completed":
        if (additionalInfo.productReceipts) {
          for (const receipt of additionalInfo.productReceipts) {
            const productItem = stockRequest.products.find(
              (p) => p.product.toString() === receipt.productId.toString()
            );

            if (
              productItem &&
              receipt.receivedQuantity > productItem.approvedQuantity
            ) {
              return res.status(400).json({
                success: false,
                message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity})`,
              });
            }
          }
        }

        updateData.receivingInfo = {
          ...stockRequest.receivingInfo,
          receivedAt: currentDate,
          receivedBy: userId,
          receivedRemark: additionalInfo.receivedRemark || "",
          ...additionalInfo,
        };

        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          completedOn: currentDate,
          completedBy: userId,
          ...additionalInfo,
        };

        if (additionalInfo.productReceipts) {
          updateData.products = stockRequest.products.map((productItem) => {
            const receipt = additionalInfo.productReceipts.find(
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
        break;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: `Stock request status updated to ${status}`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating stock request status:", error);

    if (
      error.message.includes("serial numbers") ||
      error.message.includes("Insufficient stock") ||
      error.message.includes("Received quantity cannot exceed")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating stock request status",
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

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (productApprovals && productApprovals.some((pa) => pa.approvedSerials)) {
//       const validationResults = await stockRequest.validateSerialNumbers(
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

//     const updatedProducts = stockRequest.products.map((productItem) => {
//       const approval = productApprovals.find(
//         (pa) => pa.productId.toString() === productItem.product.toString()
//       );

//       if (approval) {
//         return {
//           ...productItem.toObject(),
//           approvedQuantity: approval.approvedQuantity,
//           approvedSerials: approval.approvedSerials || [],
//         };
//       }
//       return productItem;
//     });

//     const updateData = {
//       products: updatedProducts,
//       updatedBy: userId,
//     };

//     if (stockRequest.status === "Submitted") {
//       updateData.status = "Confirmed";
//       updateData.approvalInfo = {
//         ...stockRequest.approvalInfo,
//         approvedBy: userId,
//         approvedAt: new Date(),
//       };
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities updated successfully",
//       data: updatedRequest,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
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

//     if (error.message.includes("serial numbers")) {
//       return res.status(400).json({
//         success: false,
//         message: "Serial number validation failed",
//         error: error.message,
//       });
//     }

//     console.error("Error updating approved quantities:", error);
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

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Custom validation that considers both "available" and "in_transit" status for existing serials
    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");
    
    const validationResults = [];
    
    for (const approval of productApprovals) {
      if (approval.approvedSerials && approval.approvedSerials.length > 0) {
        const product = await Product.findById(approval.productId);
        const productItem = stockRequest.products.find(
          p => p.product.toString() === approval.productId.toString()
        );
        
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });

        if (!outletStock) {
          validationResults.push({
            productId: approval.productId,
            productName: product?.productTitle || 'Unknown Product',
            valid: false,
            availableSerials: [],
            unavailableSerials: approval.approvedSerials,
            error: `No stock found in outlet for this product`
          });
          continue;
        }

        // Custom validation that considers both available and in_transit serials
        const availableSerials = [];
        const unavailableSerials = [];
        
        for (const serialNumber of approval.approvedSerials) {
          const serial = outletStock.serialNumbers.find(
            sn => sn.serialNumber === serialNumber
          );

          if (serial) {
            // Check if serial is either available OR already in_transit for this transfer
            if (serial.status === "available") {
              availableSerials.push(serialNumber);
            } else if (serial.status === "in_transit") {
              // Check if this serial is already assigned to this transfer
              const isAssignedToThisTransfer = productItem?.approvedSerials?.includes(serialNumber);
              if (isAssignedToThisTransfer) {
                availableSerials.push(serialNumber); // It's already assigned to this transfer, so it's valid
              } else {
                unavailableSerials.push(serialNumber); // It's in_transit for a different transfer
              }
            } else {
              unavailableSerials.push(serialNumber); // Status is transferred, sold, etc.
            }
          } else {
            unavailableSerials.push(serialNumber); // Serial not found
          }
        }

        validationResults.push({
          productId: approval.productId,
          productName: product?.productTitle || 'Unknown Product',
          valid: unavailableSerials.length === 0,
          availableSerials: availableSerials,
          unavailableSerials: unavailableSerials,
          error: unavailableSerials.length > 0 
            ? `Serial numbers not available: ${unavailableSerials.join(", ")}`
            : null
        });
      } else {
        // No serial numbers to validate
        const product = await Product.findById(approval.productId);
        validationResults.push({
          productId: approval.productId,
          productName: product?.productTitle || 'Unknown Product',
          valid: true,
          availableSerials: [],
          unavailableSerials: [],
          error: null
        });
      }
    }

    // Check if any validations failed
    const invalidResults = validationResults.filter(result => !result.valid);
    if (invalidResults.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        validationErrors: invalidResults,
      });
    }

    // Process stock updates for quantity changes and serial number changes
    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (productItem) {
        const currentApprovedQuantity = productItem.approvedQuantity || 0;
        const currentApprovedSerials = productItem.approvedSerials || [];
        const newApprovedQuantity = approval.approvedQuantity;
        const newApprovedSerials = approval.approvedSerials || [];

        console.log(`[DEBUG] Processing product update for: ${approval.productId}`);
        console.log(`[DEBUG] Current quantity: ${currentApprovedQuantity}, New quantity: ${newApprovedQuantity}`);
        console.log(`[DEBUG] Current serials: [${currentApprovedSerials.join(', ')}]`);
        console.log(`[DEBUG] New serials: [${newApprovedSerials.join(', ')}]`);

        // Get outlet stock for this product
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });

        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `No stock found in outlet for product ${approval.productId}`,
          });
        }

        // SCENARIO 1: Quantity reduced - restore excess stock to outlet
        if (newApprovedQuantity < currentApprovedQuantity) {
          console.log(`[DEBUG] SCENARIO 1: Quantity reduced from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
          const quantityToRestore = currentApprovedQuantity - newApprovedQuantity;
          console.log(`[DEBUG] Need to restore ${quantityToRestore} items to outlet`);

          let serialsToRestore = [];

          if (JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
            // Serial numbers changed AND quantity reduced
            // Restore serials that are in current but not in new
            serialsToRestore = currentApprovedSerials.filter(serial => !newApprovedSerials.includes(serial));
            console.log(`[DEBUG] Restoring ${serialsToRestore.length} serials that were removed`);
          } else {
            // Only quantity reduced, serials same
            // Restore the last X serials from current list
            serialsToRestore = currentApprovedSerials.slice(newApprovedQuantity);
            console.log(`[DEBUG] Restoring last ${serialsToRestore.length} serials due to quantity reduction`);
          }

          // Restore serials to "available" status in outlet stock
          let restoredCount = 0;
          for (const serialNumber of serialsToRestore) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;
              restoredCount++;

              // Remove the transfer history entry for this transfer
              serial.transferHistory = serial.transferHistory.filter(history => 
                !(history.toCenter?.toString() === stockRequest.center.toString() && 
                  history.transferType === "outlet_to_center")
              );

              console.log(`[DEBUG] Restored serial ${serialNumber} to available status in outlet`);
            }
          }

          // Update outlet stock quantities
          if (restoredCount > 0) {
            outletStock.availableQuantity += restoredCount;
            outletStock.inTransitQuantity -= restoredCount;
            await outletStock.save();
            console.log(`[DEBUG] Updated outlet quantities - Available: +${restoredCount}, InTransit: -${restoredCount}`);
          }
        }

        // SCENARIO 2: Only serial numbers changed (quantity remains same)
        else if (newApprovedQuantity === currentApprovedQuantity && JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
          console.log(`[DEBUG] SCENARIO 2: Only serial numbers changed, quantity same: ${currentApprovedQuantity}`);
          
          // Identify serials to remove and add
          const serialsToRemove = currentApprovedSerials.filter(serial => !newApprovedSerials.includes(serial));
          const serialsToAdd = newApprovedSerials.filter(serial => !currentApprovedSerials.includes(serial));
          
          console.log(`[DEBUG] Serials to remove: ${serialsToRemove.length}, Serials to add: ${serialsToAdd.length}`);

          if (serialsToRemove.length !== serialsToAdd.length) {
            throw new Error(`When changing serial numbers, number of removed serials (${serialsToRemove.length}) must match number of added serials (${serialsToAdd.length})`);
          }

          // Step 1: Restore old serials to available status in outlet
          let restoredCount = 0;
          for (const serialNumber of serialsToRemove) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;
              restoredCount++;

              // Remove the transfer history entry for this transfer
              serial.transferHistory = serial.transferHistory.filter(history => 
                !(history.toCenter?.toString() === stockRequest.center.toString() && 
                  history.transferType === "outlet_to_center")
              );

              console.log(`[DEBUG] Restored serial ${serialNumber} to available status`);
            }
          }

          // Step 2: Mark new serials as in_transit in outlet
          let addedCount = 0;
          for (const serialNumber of serialsToAdd) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (serial.status === "available") {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  remark: "Updated during serial number change"
                });
                addedCount++;
                console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
              } else if (serial.status === "in_transit") {
                // If it's already in_transit and assigned to this transfer, just update the transfer history
                const existingTransfer = serial.transferHistory.find(history => 
                  history.toCenter?.toString() === stockRequest.center.toString()
                );
                
                if (!existingTransfer) {
                  serial.transferHistory.push({
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    remark: "Updated during serial number change"
                  });
                }
                addedCount++;
                console.log(`[DEBUG] Serial ${serialNumber} already in_transit, updated transfer history`);
              }
            } else {
              throw new Error(`Serial number ${serialNumber} not found in outlet stock`);
            }
          }

          // NO quantity changes in this scenario - only status changes
          console.log(`[DEBUG] Serial swap completed - No quantity changes (Restored: ${restoredCount}, Added: ${addedCount})`);
          await outletStock.save();
        }

        // SCENARIO 3: Quantity increased
        else if (newApprovedQuantity > currentApprovedQuantity) {
          console.log(`[DEBUG] SCENARIO 3: Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
          const quantityToAdd = newApprovedQuantity - currentApprovedQuantity;
          
          if (newApprovedSerials.length === 0) {
            throw new Error(`Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}. Please provide ${quantityToAdd} additional serial numbers.`);
          }
          
          // Get additional serials needed
          const additionalSerials = newApprovedSerials.slice(currentApprovedQuantity);
          
          if (additionalSerials.length !== quantityToAdd) {
            throw new Error(`Need ${quantityToAdd} additional serial numbers for quantity increase, but got ${additionalSerials.length}`);
          }
          
          // Mark additional serials as in_transit in outlet
          let addedCount = 0;
          for (const serialNumber of additionalSerials) {
            const serial = outletStock.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (serial.status === "available") {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  remark: "Added during quantity increase"
                });
                addedCount++;
                console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
              } else if (serial.status === "in_transit") {
                // If already in_transit, just ensure it has the correct transfer history
                const existingTransfer = serial.transferHistory.find(history => 
                  history.toCenter?.toString() === stockRequest.center.toString()
                );
                
                if (!existingTransfer) {
                  serial.transferHistory.push({
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    remark: "Added during quantity increase"
                  });
                }
                addedCount++;
                console.log(`[DEBUG] Serial ${serialNumber} already in_transit, updated transfer history`);
              }
            } else {
              throw new Error(`Serial number ${serialNumber} not found in outlet stock`);
            }
          }
          
          // Update outlet stock quantities only if we actually changed status from available to in_transit
          const newlyMarkedInTransit = additionalSerials.filter(serialNumber => {
            const serial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            return serial && serial.status === "in_transit";
          }).length;
          
          if (newlyMarkedInTransit > 0) {
            outletStock.availableQuantity -= newlyMarkedInTransit;
            outletStock.inTransitQuantity += newlyMarkedInTransit;
          }
          
          await outletStock.save();
          console.log(`[DEBUG] Updated outlet quantities - Available: -${newlyMarkedInTransit}, InTransit: +${newlyMarkedInTransit}`);
        }
      }
    }

    // Update the stock request document with new approvals
    const updatedProducts = stockRequest.products.map((productItem) => {
      const approval = productApprovals.find(
        (pa) => pa.productId.toString() === productItem.product.toString()
      );

      if (approval) {
        return {
          ...productItem.toObject(),
          approvedQuantity: approval.approvedQuantity,
          approvedSerials: approval.approvedSerials || [],
        };
      }
      return productItem;
    });

    const updateData = {
      products: updatedProducts,
      updatedBy: userId,
    };

    if (stockRequest.status === "Submitted") {
      updateData.status = "Confirmed";
      updateData.approvalInfo = {
        ...stockRequest.approvalInfo,
        approvedBy: userId,
        approvedAt: new Date(),
      };
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Approved quantities updated successfully",
      data: updatedRequest,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
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

    if (error.message.includes("serial numbers")) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        error: error.message,
      });
    }

    console.error("Error updating approved quantities:", error);
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

//2222 export const updateApprovedQuantities = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     // Validate serial numbers if provided
//     if (productApprovals && productApprovals.some((pa) => pa.approvedSerials)) {
//       const validationResults = await stockRequest.validateSerialNumbers(
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

//     // Process stock updates for quantity changes and serial number changes
//     const OutletStock = mongoose.model("OutletStock");
    
//     for (const approval of productApprovals) {
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === approval.productId.toString()
//       );

//       if (productItem) {
//         const currentApprovedQuantity = productItem.approvedQuantity || 0;
//         const currentApprovedSerials = productItem.approvedSerials || [];
//         const newApprovedQuantity = approval.approvedQuantity;
//         const newApprovedSerials = approval.approvedSerials || [];

//         console.log(`[DEBUG] Processing product update for: ${approval.productId}`);
//         console.log(`[DEBUG] Current quantity: ${currentApprovedQuantity}, New quantity: ${newApprovedQuantity}`);
//         console.log(`[DEBUG] Current serials: [${currentApprovedSerials.join(', ')}]`);
//         console.log(`[DEBUG] New serials: [${newApprovedSerials.join(', ')}]`);

//         // Get outlet stock for this product
//         const outletStock = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: approval.productId,
//         });

//         if (!outletStock) {
//           return res.status(400).json({
//             success: false,
//             message: `No stock found in outlet for product ${approval.productId}`,
//           });
//         }

//         // SCENARIO 1: Quantity reduced - restore excess stock to outlet
//         if (newApprovedQuantity < currentApprovedQuantity) {
//           console.log(`[DEBUG] SCENARIO 1: Quantity reduced from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToRestore = currentApprovedQuantity - newApprovedQuantity;
//           console.log(`[DEBUG] Need to restore ${quantityToRestore} items to outlet`);

//           let serialsToRestore = [];

//           if (JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
//             // Serial numbers changed AND quantity reduced
//             // Restore serials that are in current but not in new
//             serialsToRestore = currentApprovedSerials.filter(serial => !newApprovedSerials.includes(serial));
//             console.log(`[DEBUG] Restoring ${serialsToRestore.length} serials that were removed`);
//           } else {
//             // Only quantity reduced, serials same
//             // Restore the last X serials from current list
//             serialsToRestore = currentApprovedSerials.slice(newApprovedQuantity);
//             console.log(`[DEBUG] Restoring last ${serialsToRestore.length} serials due to quantity reduction`);
//           }

//           // Restore serials to "available" status in outlet stock
//           let restoredCount = 0;
//           for (const serialNumber of serialsToRestore) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (serial && serial.status === "in_transit") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;
//               restoredCount++;

//               // Remove the transfer history entry for this transfer
//               serial.transferHistory = serial.transferHistory.filter(history => 
//                 !(history.toCenter?.toString() === stockRequest.center.toString() && 
//                   history.transferType === "outlet_to_center")
//               );

//               console.log(`[DEBUG] Restored serial ${serialNumber} to available status in outlet`);
//             }
//           }

//           // Update outlet stock quantities
//           if (restoredCount > 0) {
//             outletStock.availableQuantity += restoredCount;
//             outletStock.inTransitQuantity -= restoredCount;
//             await outletStock.save();
//             console.log(`[DEBUG] Updated outlet quantities - Available: +${restoredCount}, InTransit: -${restoredCount}`);
//           }
//         }

//         // SCENARIO 2: Only serial numbers changed (quantity remains same)
//         else if (newApprovedQuantity === currentApprovedQuantity && JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
//           console.log(`[DEBUG] SCENARIO 2: Only serial numbers changed, quantity same: ${currentApprovedQuantity}`);
          
//           // Identify serials to remove and add
//           const serialsToRemove = currentApprovedSerials.filter(serial => !newApprovedSerials.includes(serial));
//           const serialsToAdd = newApprovedSerials.filter(serial => !currentApprovedSerials.includes(serial));
          
//           console.log(`[DEBUG] Serials to remove: ${serialsToRemove.length}, Serials to add: ${serialsToAdd.length}`);

//           if (serialsToRemove.length !== serialsToAdd.length) {
//             throw new Error(`When changing serial numbers, number of removed serials (${serialsToRemove.length}) must match number of added serials (${serialsToAdd.length})`);
//           }

//           // Step 1: Restore old serials to available status in outlet
//           let restoredCount = 0;
//           for (const serialNumber of serialsToRemove) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (serial && serial.status === "in_transit") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;
//               restoredCount++;

//               // Remove the transfer history entry for this transfer
//               serial.transferHistory = serial.transferHistory.filter(history => 
//                 !(history.toCenter?.toString() === stockRequest.center.toString() && 
//                   history.transferType === "outlet_to_center")
//               );

//               console.log(`[DEBUG] Restored serial ${serialNumber} to available status`);
//             }
//           }

//           // Step 2: Mark new serials as in_transit in outlet
//           let addedCount = 0;
//           for (const serialNumber of serialsToAdd) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber && sn.status === "available"
//             );

//             if (serial) {
//               serial.status = "in_transit";
//               serial.transferHistory.push({
//                 fromCenter: stockRequest.warehouse,
//                 toCenter: stockRequest.center,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_center",
//                 remark: "Updated during serial number change"
//               });
//               addedCount++;

//               console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
//             } else {
//               throw new Error(`Serial number ${serialNumber} is not available in outlet stock`);
//             }
//           }

//           // NO quantity changes in this scenario - only status changes
//           console.log(`[DEBUG] Serial swap completed - No quantity changes (Restored: ${restoredCount}, Added: ${addedCount})`);
//           await outletStock.save();
//         }

//         // SCENARIO 3: Quantity increased
//         else if (newApprovedQuantity > currentApprovedQuantity) {
//           console.log(`[DEBUG] SCENARIO 3: Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToAdd = newApprovedQuantity - currentApprovedQuantity;
          
//           if (newApprovedSerials.length === 0) {
//             throw new Error(`Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}. Please provide ${quantityToAdd} additional serial numbers.`);
//           }
          
//           // Get additional serials needed
//           const additionalSerials = newApprovedSerials.slice(currentApprovedQuantity);
          
//           if (additionalSerials.length !== quantityToAdd) {
//             throw new Error(`Need ${quantityToAdd} additional serial numbers for quantity increase, but got ${additionalSerials.length}`);
//           }
          
//           // Mark additional serials as in_transit in outlet
//           let addedCount = 0;
//           for (const serialNumber of additionalSerials) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber && sn.status === "available" 
//             );

//             if (serial) {
//               serial.status = "in_transit";
//               serial.transferHistory.push({
//                 fromCenter: stockRequest.warehouse,
//                 toCenter: stockRequest.center,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_center",
//                 remark: "Added during quantity increase"
//               });
//               addedCount++;

//               console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
//             } else {
//               throw new Error(`Serial number ${serialNumber} is not available in outlet stock`);
//             }
//           }
          
//           // Update outlet stock quantities
//           outletStock.availableQuantity -= quantityToAdd;
//           outletStock.inTransitQuantity += quantityToAdd;
          
//           await outletStock.save();
//           console.log(`[DEBUG] Updated outlet quantities - Available: -${quantityToAdd}, InTransit: +${quantityToAdd}`);
//         }
//       }
//     }

//     // Update the stock request document with new approvals
//     const updatedProducts = stockRequest.products.map((productItem) => {
//       const approval = productApprovals.find(
//         (pa) => pa.productId.toString() === productItem.product.toString()
//       );

//       if (approval) {
//         return {
//           ...productItem.toObject(),
//           approvedQuantity: approval.approvedQuantity,
//           approvedSerials: approval.approvedSerials || [],
//         };
//       }
//       return productItem;
//     });

//     const updateData = {
//       products: updatedProducts,
//       updatedBy: userId,
//     };

//     if (stockRequest.status === "Submitted") {
//       updateData.status = "Confirmed";
//       updateData.approvalInfo = {
//         ...stockRequest.approvalInfo,
//         approvedBy: userId,
//         approvedAt: new Date(),
//       };
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities updated successfully",
//       data: updatedRequest,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
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

//     if (error.message.includes("serial numbers")) {
//       return res.status(400).json({
//         success: false,
//         message: "Serial number validation failed",
//         error: error.message,
//       });
//     }

//     console.error("Error updating approved quantities:", error);
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

export const getMostRecentOrderNumber = async (req, res) => {
  try {
    const mostRecentRequest = await StockRequest.findOne()
      .sort({ createdAt: -1 })
      .select("orderNumber createdAt")
      .lean();

    if (!mostRecentRequest) {
      return res.status(404).json({
        success: false,
        message: "No stock requests found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Most recent order number retrieved successfully",
      data: {
        orderNumber: mostRecentRequest.orderNumber,
        createdAt: mostRecentRequest.createdAt,
      },
    });
  } catch (error) {
    console.error("Error retrieving most recent order number:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving most recent order number",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getCenterSerialNumbers = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;

    const centerStock = await CenterStock.findOne({
      center: centerId,
      product: productId,
    })
      .populate("center", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    if (!centerStock) {
      return res.status(200).json({
        success: true,
        message: "No stock found for the specified product",
        data: {
          center: await Center.findById(centerId).select(
            "centerName centerCode centerType"
          ),
          product: await Product.findById(productId).select(
            "productTitle productCode trackSerialNumber"
          ),
          availableSerials: [],
          totalAvailable: 0,
          stockSummary: {
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          },
        },
      });
    }

    const availableSerials = centerStock.serialNumbers
      .filter((sn) => sn.status === "available")
      .map((sn) => ({
        serialNumber: sn.serialNumber,
        purchaseId: sn.purchaseId,
        originalOutlet: sn.originalOutlet,
        currentLocation: sn.currentLocation,
        status: sn.status,
      }));

    res.status(200).json({
      success: true,
      message: "Center serial numbers retrieved successfully",
      data: {
        centerStock: {
          _id: centerStock._id,
          center: centerStock.center,
          product: centerStock.product,
          totalQuantity: centerStock.totalQuantity,
          availableQuantity: centerStock.availableQuantity,
          inTransitQuantity: centerStock.inTransitQuantity,
          consumedQuantity: centerStock.consumedQuantity,
          lastUpdated: centerStock.lastUpdated,
        },
        availableSerials,
        totalAvailable: availableSerials.length,
      },
    });
  } catch (error) {
    console.error("Error retrieving center serial numbers:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error retrieving center serial numbers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};
