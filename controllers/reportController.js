import User from "../models/User.js";
import mongoose from "mongoose";
import StockPurchase from "../models/StockPurchase.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import ReplacementRecord from "../models/ReplacementRecord.js";

const checkReportPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];

  const reportModule = userPermissions.find((perm) => perm.module === "Report");

  if (!reportModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    view_own_report: reportModule.permissions.includes("view_own_report"),
    view_all_report: reportModule.permissions.includes("view_all_report"),
  };

  const hasRequiredPermission = requiredPermissions.some(
    (perm) => permissions[perm]
  );

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: req.user.center,
  };
};

const checkStockCenterAccess = async (userId, targetCenterId, permissions) => {
  if (!userId) {
    throw new Error("User authentication required");
  }

  const user = await User.findById(userId).populate(
    "center",
    "centerName centerCode centerType"
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User is not associated with any center");
  }

  if (permissions.view_all_report) {
    return targetCenterId || user.center._id;
  }

  if (permissions.view_own_report) {
    const userCenterId = user.center._id || user.center;

    if (
      targetCenterId &&
      targetCenterId.toString() !== userCenterId.toString()
    ) {
      throw new Error(
        "Access denied. You can only access your own center's stock data."
      );
    }

    return userCenterId;
  }

  throw new Error("Insufficient permissions to access stock data");
};

const validateUserOutletAccess = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const user = await User.findById(userId).populate("center");

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User center information not found");
  }

  return user.center._id || user.center;
};

const handleControllerError = (error, res) => {
  console.error("Controller Error:", error);

  if (
    error.message.includes("User center information not found") ||
    error.message.includes("User authentication required") ||
    error.message.includes("User not found") ||
    error.message.includes("User ID is required") ||
    error.message.includes("Access denied")
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
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

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal server error",
  });
};

export const getAllStockPurchasesReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      type,
      vendor,
      startDate,
      endDate,
      invoiceNo,
      search,
      center,
      centerId,
      product,
      productId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // Center/Outlet filtering
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.outlet = userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      // Support both center and centerId parameters
      const centerFilterValue = center || centerId;
      filter.outlet = centerFilterValue;
    }

    // Product filtering
    const productFilterValue = product || productId;
    if (productFilterValue) {
      filter["products.product"] = productFilterValue;
    }

    // Type and Vendor filtering
    if (type) filter.type = type;
    if (vendor) filter.vendor = vendor;

    // Date range filtering
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    // Invoice number filtering
    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: "i" };
    }

    // General search filtering
    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "vendor.businessName": { $regex: search, $options: "i" } },
        { "products.product.productTitle": { $regex: search, $options: "i" } },
        { "outlet.centerName": { $regex: search, $options: "i" } },
        { "outlet.centerCode": { $regex: search, $options: "i" } },
      ];
    }

    console.log('Stock Purchase Filter:', JSON.stringify(filter, null, 2));

    // Sort options
    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "invoiceNo",
      "totalAmount",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Use regular find with populate for better compatibility
    let query = StockPurchase.find(filter)
      .populate("vendor", "businessName")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // If product filter is applied, we need to filter the products array
    if (productFilterValue) {
      // This will be handled in post-processing
    }

    const [purchases, total] = await Promise.all([
      query.lean(),
      StockPurchase.countDocuments(filter)
    ]);

    // Post-process to filter products array if product filter is applied
    let processedPurchases = purchases;
    if (productFilterValue) {
      processedPurchases = purchases.map(purchase => {
        const filteredProducts = purchase.products.filter(productItem => {
          const productId = productItem.product?._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...purchase,
          products: filteredProducts
        };
      }).filter(purchase => purchase.products.length > 0); // Remove purchases with no matching products
    }

    // Get summary statistics - FIXED VERSION
    const summaryPipeline = [
      { $match: filter },
      { $unwind: "$products" }
    ];

    // Add product filter to summary if applied
    if (productFilterValue) {
      const productObjectId = mongoose.Types.ObjectId.isValid(productFilterValue) 
        ? new mongoose.Types.ObjectId(productFilterValue)
        : productFilterValue;
      
      summaryPipeline.push({
        $match: {
          "products.product": productObjectId
        }
      });
    }

    summaryPipeline.push(
      {
        $group: {
          _id: null,
          totalPurchases: { $addToSet: "$_id" }, // Get unique purchase IDs
          totalAmount: { $sum: "$totalAmount" },
          totalTransportAmount: { $sum: "$transportAmount" },
          totalQuantity: { $sum: "$products.purchasedQuantity" }
        }
      },
      {
        $project: {
          totalPurchases: { $size: "$totalPurchases" }, // Count unique purchases
          totalAmount: 1,
          totalTransportAmount: 1,
          totalQuantity: 1,
          grandTotal: { $add: ["$totalAmount", "$totalTransportAmount"] }
        }
      }
    );

    const summaryStats = await StockPurchase.aggregate(summaryPipeline);
    
    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalPurchases: 0,
      totalAmount: 0,
      totalTransportAmount: 0,
      totalQuantity: 0,
      grandTotal: 0
    };

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedPurchases.length : total;

    res.status(200).json({
      success: true,
      message: "Stock purchases reports retrieved successfully",
      data: processedPurchases,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        type: type || "all",
        vendor: vendor || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        invoiceNo: invoiceNo || "all",
        search: search || ""
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    });
  } catch (error) {
    console.error("Error retrieving stock purchases reports:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockRequestsReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      status,
      warehouse,
      center,
      centerId,
      product,
      productId,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      shippedBy,
      receivedBy,
      dateField = "createdAt",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      statuses,
      stockTransferStatus,
    } = req.query;

    const filter = {};

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate
    });

    // Center filtering with permission check
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      // Support both center and centerId parameters
      const centerFilterValue = center || centerId;
      filter.center = centerFilterValue;
    }

    // Product filtering - use regular find approach
    const productFilterValue = product || productId;

    // Status filtering
    if (status) {
      filter.status = status;
    }

    if (statuses) {
      const statusArray = Array.isArray(statuses)
        ? statuses
        : statuses.split(",");
      filter.status = { $in: statusArray };
    }

    if (warehouse) {
      filter.warehouse = warehouse;
    }

    // Date range filtering with proper time boundaries
    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField].$lte = end;
      }
    }

    // User filtering
    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (approvedBy) {
      filter["approvalInfo.approvedBy"] = approvedBy;
    }

    if (shippedBy) {
      filter["shippingInfo.shippedBy"] = shippedBy;
    }

    if (receivedBy) {
      filter["receivingInfo.receivedBy"] = receivedBy;
    }

    if (stockTransferStatus) {
      filter.stockTransferStatus = stockTransferStatus;
    }

    // Search filtering
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
        { "shippingInfo.shipmentDetails": { $regex: search, $options: "i" } },
      ];
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Use regular find with populate for better compatibility
    let query = StockRequest.find(filter);

    // Populate options
    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "warehouse",
        select: "centerName centerCode centerType",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
      },
      {
        path: "products.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "updatedBy", select: "fullName email" },
        { path: "approvalInfo.approvedBy", select: "fullName email" },
        { path: "shippingInfo.shippedBy", select: "fullName email" },
        { path: "receivingInfo.receivedBy", select: "fullName email" },
        { path: "completionInfo.completedBy", select: "fullName email" },
        { path: "completionInfo.incompleteBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const centerIndex = populateOptions.findIndex((p) => p.path === "center");
      const warehouseIndex = populateOptions.findIndex(
        (p) => p.path === "warehouse"
      );

      if (centerIndex !== -1) {
        populateOptions[centerIndex].select += " address phone";
      }
      if (warehouseIndex !== -1) {
        populateOptions[warehouseIndex].select += " address phone";
      }
    }

    // Sort options
    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "orderNumber",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [stockRequests, total] = await Promise.all([
      query
        .populate(populateOptions)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockRequest.countDocuments(filter)
    ]);

    console.log(`Found ${stockRequests.length} records out of ${total} total`);

    // Post-process to filter products array if product filter is applied
    let processedRequests = stockRequests;
    if (productFilterValue) {
      processedRequests = stockRequests.map(request => {
        const filteredProducts = request.products.filter(productItem => {
          if (!productItem.product) return false;
          const productId = productItem.product._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...request,
          products: filteredProducts
        };
      }).filter(request => request.products.length > 0); // Remove requests with no matching products
    }

    // Fetch stock data for each product
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const request of processedRequests) {
      for (const productItem of request.products) {
        if (productItem.product && request.warehouse && request.center) {
          try {
            const outletStock = await OutletStock.findOne({
              outlet: request.warehouse._id,
              product: productItem.product._id,
            })
              .select("availableQuantity totalQuantity inTransitQuantity")
              .lean();

            const centerStock = await CenterStock.findOne({
              center: request.center._id,
              product: productItem.product._id,
            })
              .select(
                "availableQuantity totalQuantity inTransitQuantity consumedQuantity"
              )
              .lean();

            productItem.outletStock = outletStock
              ? {
                  availableQuantity: outletStock.availableQuantity || 0,
                  totalQuantity: outletStock.totalQuantity || 0,
                  inTransitQuantity: outletStock.inTransitQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                };

            productItem.centerStock = centerStock
              ? {
                  availableQuantity: centerStock.availableQuantity || 0,
                  totalQuantity: centerStock.totalQuantity || 0,
                  inTransitQuantity: centerStock.inTransitQuantity || 0,
                  consumedQuantity: centerStock.consumedQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                  consumedQuantity: 0,
                };

            if (outletStock) {
              productItem.isStockSufficient =
                productItem.quantity <= outletStock.availableQuantity;
              productItem.stockShortage = Math.max(
                0,
                productItem.quantity - outletStock.availableQuantity
              );
              productItem.fulfillmentPercentage =
                outletStock.availableQuantity > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (productItem.quantity / outletStock.availableQuantity) *
                          100
                      )
                    )
                  : 0;
            } else {
              productItem.isStockSufficient = false;
              productItem.stockShortage = productItem.quantity;
              productItem.fulfillmentPercentage = 0;
            }

            if (centerStock) {
              productItem.projectedCenterStock = {
                availableQuantity:
                  centerStock.availableQuantity +
                  (productItem.receivedQuantity || 0),
                totalQuantity:
                  centerStock.totalQuantity +
                  (productItem.receivedQuantity || 0),
              };
            } else {
              productItem.projectedCenterStock = {
                availableQuantity: productItem.receivedQuantity || 0,
                totalQuantity: productItem.receivedQuantity || 0,
              };
            }
          } catch (error) {
            console.error(
              `Error fetching stock data for product ${productItem.product._id}:`,
              error
            );

            productItem.outletStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
            };
            productItem.centerStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
            };
            productItem.isStockSufficient = false;
            productItem.stockShortage = productItem.quantity;
            productItem.fulfillmentPercentage = 0;
            productItem.projectedCenterStock = {
              availableQuantity: productItem.receivedQuantity || 0,
              totalQuantity: productItem.receivedQuantity || 0,
            };
          }
        } else {
          productItem.outletStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
          };
          productItem.centerStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          };
          productItem.isStockSufficient = false;
          productItem.stockShortage = productItem.quantity;
          productItem.fulfillmentPercentage = 0;
          productItem.projectedCenterStock = {
            availableQuantity: productItem.receivedQuantity || 0,
            totalQuantity: productItem.receivedQuantity || 0,
          };
        }
      }
    }

    // Get summary statistics
    const summaryStats = await StockRequest.aggregate([
      { $match: filter },
      { $unwind: "$products" },
      ...(productFilterValue ? [{
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalRequests: { $addToSet: "$_id" },
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$products.quantity" },
          totalReceived: { $sum: "$products.receivedQuantity" }
        }
      },
      {
        $project: {
          totalRequests: { $size: "$totalRequests" },
          totalProducts: 1,
          totalQuantity: 1,
          totalReceived: 1,
          pendingQuantity: { $subtract: ["$totalQuantity", "$totalReceived"] }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalRequests: 0,
      totalProducts: 0,
      totalQuantity: 0,
      totalReceived: 0,
      pendingQuantity: 0
    };

    const statusCounts = await StockRequest.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedRequests.length : total;

    const response = {
      success: true,
      message: "Stock requests retrieved successfully",
      data: processedRequests,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        status: statusFilters,
        startDate: startDate || "all",
        endDate: endDate || "all",
        warehouse: warehouse || "all",
        total: finalTotal,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock requests:", error);
    handleControllerError(error, res);
  }
};



// export const getMonthlyStockRequestsSummary = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
//       "view_own_report",
//       "view_all_report",
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_own_report or view_all_report permission required.",
//       });
//     }

//     const {
//       month,
//       year,
//       center,
//       warehouse,
//       product,
//       page = 1,
//       limit = 50,
//     } = req.query;

//     const currentDate = new Date();
//     const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
//     const currentYear = year ? parseInt(year) : currentDate.getFullYear();

//     if (currentMonth < 1 || currentMonth > 12) {
//       return res.status(400).json({
//         success: false,
//         message: "Month must be between 1 and 12",
//       });
//     }

//     if (currentYear < 2000 || currentYear > 2100) {
//       return res.status(400).json({
//         success: false,
//         message: "Year must be between 2000 and 2100",
//       });
//     }

//     const startDate = new Date(currentYear, currentMonth - 1, 1);
//     const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

//     const filter = {
//       createdAt: {
//         $gte: startDate,
//         $lte: endDate,
//       },
//     };

//     if (permissions.view_own_report && !permissions.view_all_report) {
//       const userCenterId = userCenter?._id || userCenter;
//       if (userCenterId) {
//         filter.center = userCenterId;
//       }
//     } else if (permissions.view_all_report && center) {
//       filter.center = center;
//     }

//     if (warehouse) {
//       filter.warehouse = warehouse;
//     }

//     if (product) {
//       filter["products.product"] = product;
//     }

//     const aggregationPipeline = [
//       { $match: filter },

//       { $unwind: "$products" },

//       {
//         $lookup: {
//           from: "centers",
//           localField: "center",
//           foreignField: "_id",
//           as: "centerDetails",
//         },
//       },

//       {
//         $lookup: {
//           from: "centers",
//           localField: "warehouse",
//           foreignField: "_id",
//           as: "warehouseDetails",
//         },
//       },

//       {
//         $lookup: {
//           from: "products",
//           localField: "products.product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },

//       {
//         $project: {
//           center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
//           parentCenter: { $arrayElemAt: ["$warehouseDetails.centerName", 0] },
//           product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
//           productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
//           quantity: "$products.quantity",
//           orderNumber: 1,
//           status: 1,
//           date: 1,
//         },
//       },

//       {
//         $group: {
//           _id: {
//             center: "$center",
//             parentCenter: "$parentCenter",
//             product: "$product",
//             productCode: "$productCode",
//           },
//           totalQty: { $sum: "$quantity" },
//           requestCount: { $sum: 1 },
//           orderNumbers: { $push: "$orderNumber" },
//           statuses: { $push: "$status" },
//         },
//       },

//       {
//         $project: {
//           _id: 0,
//           center: "$_id.center",
//           parentCenter: "$_id.parentCenter",
//           product: "$_id.product",
//           productCode: "$_id.productCode",
//           totalQty: 1,
//           requestCount: 1,
//           orderNumbers: 1,
//           statusBreakdown: {
//             $arrayToObject: {
//               $map: {
//                 input: "$statuses",
//                 as: "status",
//                 in: {
//                   k: "$$status",
//                   v: {
//                     $size: {
//                       $filter: {
//                         input: "$statuses",
//                         as: "s",
//                         cond: { $eq: ["$$s", "$$status"] },
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },

//       {
//         $sort: {
//           center: 1,
//           parentCenter: 1,
//           product: 1,
//         },
//       },
//     ];

//     const skip = (page - 1) * limit;
//     aggregationPipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

//     const monthlySummary = await StockRequest.aggregate(aggregationPipeline);

//     const countPipeline = [
//       { $match: filter },
//       { $unwind: "$products" },
//       {
//         $group: {
//           _id: {
//             center: "$center",
//             warehouse: "$warehouse",
//             product: "$products.product",
//           },
//         },
//       },
//       { $count: "total" },
//     ];

//     const totalResult = await StockRequest.aggregate(countPipeline);
//     const total = totalResult.length > 0 ? totalResult[0].total : 0;

//     const statsPipeline = [
//       { $match: filter },
//       { $unwind: "$products" },
//       {
//         $group: {
//           _id: null,
//           totalProductsRequested: { $sum: "$products.quantity" },
//           totalRequests: { $sum: 1 },
//           uniqueProducts: { $addToSet: "$products.product" },
//           uniqueCenters: { $addToSet: "$center" },
//         },
//       },
//       {
//         $project: {
//           totalProductsRequested: 1,
//           totalRequests: 1,
//           uniqueProductsCount: { $size: "$uniqueProducts" },
//           uniqueCentersCount: { $size: "$uniqueCenters" },
//         },
//       },
//     ];

//     const statsResult = await StockRequest.aggregate(statsPipeline);
//     const stats =
//       statsResult.length > 0
//         ? statsResult[0]
//         : {
//             totalProductsRequested: 0,
//             totalRequests: 0,
//             uniqueProductsCount: 0,
//             uniqueCentersCount: 0,
//           };

//     const response = {
//       success: true,
//       message: `Monthly stock requests summary for ${currentMonth}/${currentYear} retrieved successfully`,
//       data: monthlySummary.map((item) => ({
//         Center: item.center,
//         ParentCenter: item.parentCenter,
//         Product: item.product,
//         ProductCode: item.productCode,
//         TotalQty: item.totalQty,
//         RequestCount: item.requestCount,
//       })),
//       summary: {
//         period: `${currentMonth}/${currentYear}`,
//         totalProductsRequested: stats.totalProductsRequested,
//         totalRequests: stats.totalRequests,
//         uniqueProducts: stats.uniqueProductsCount,
//         uniqueCenters: stats.uniqueCentersCount,
//         dateRange: {
//           start: startDate,
//           end: endDate,
//         },
//       },
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//     };

//     res.status(200).json(response);
//   } catch (error) {
//     console.error("Error fetching monthly stock requests summary:", error);
//     handleControllerError(error, res);
//   }
// };




export const getMonthlyStockRequestsSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      center,
      centerId,
      warehouse,
      product,
      productId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate, month, year, warehouse
    });
    let dateFilter = {};
    const currentDate = new Date();
    
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lte: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      };
    }
    const baseFilter = {
      createdAt: dateFilter,
    };

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        baseFilter.center = mongoose.Types.ObjectId.isValid(userCenterId) 
          ? new mongoose.Types.ObjectId(userCenterId)
          : userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      const centerFilterValue = center || centerId;
      baseFilter.center = mongoose.Types.ObjectId.isValid(centerFilterValue) 
        ? new mongoose.Types.ObjectId(centerFilterValue)
        : centerFilterValue;
    }
    if (warehouse) {
      baseFilter.warehouse = mongoose.Types.ObjectId.isValid(warehouse) 
        ? new mongoose.Types.ObjectId(warehouse)
        : warehouse;
    }

    console.log('Base filter:', JSON.stringify(baseFilter, null, 2));

    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    const productFilterValue = product || productId;
    if (productFilterValue) {
      aggregationPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }
    aggregationPipeline.push(
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
          localField: "warehouse",
          foreignField: "_id",
          as: "warehouseDetails",
        },
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
        $project: {
          center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
          centerId: "$center",
          parentCenter: { $arrayElemAt: ["$warehouseDetails.centerName", 0] },
          parentCenterId: "$warehouse",
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$products.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          quantity: "$products.quantity",
          approvedQuantity: "$products.approvedQuantity",
          receivedQuantity: "$products.receivedQuantity",
          orderNumber: 1,
          status: 1,
          date: 1,
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: {
            center: "$center",
            centerId: "$centerId",
            parentCenter: "$parentCenter",
            parentCenterId: "$parentCenterId",
            product: "$product",
            productId: "$productId",
            productCode: "$productCode",
          },
          totalQty: { $sum: "$quantity" },
          totalApproved: { $sum: "$approvedQuantity" },
          totalReceived: { $sum: "$receivedQuantity" },
          requestCount: { $sum: 1 },
          orderNumbers: { $push: "$orderNumber" },
          statuses: { $push: "$status" },
          dates: { $push: "$date" },
        },
      },
      {
        $project: {
          _id: 0,
          center: "$_id.center",
          centerId: "$_id.centerId",
          parentCenter: "$_id.parentCenter",
          parentCenterId: "$_id.parentCenterId",
          product: "$_id.product",
          productId: "$_id.productId",
          productCode: "$_id.productCode",
          totalQty: 1,
          totalApproved: 1,
          totalReceived: 1,
          requestCount: 1,
          orderNumbers: 1,
          pendingQuantity: { $subtract: ["$totalQty", "$totalReceived"] },
          approvalRate: {
            $cond: {
              if: { $gt: ["$totalQty", 0] },
              then: { $multiply: [{ $divide: ["$totalApproved", "$totalQty"] }, 100] },
              else: 0
            }
          },
          fulfillmentRate: {
            $cond: {
              if: { $gt: ["$totalQty", 0] },
              then: { $multiply: [{ $divide: ["$totalReceived", "$totalQty"] }, 100] },
              else: 0
            }
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$statuses",
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statuses",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          center: 1,
          parentCenter: 1,
          product: 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedPipeline = [...aggregationPipeline, { $skip: skip }, { $limit: limitNum }];

    const monthlySummary = await StockRequest.aggregate(paginatedPipeline);
    const countPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    if (productFilterValue) {
      countPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    countPipeline.push({
      $group: {
        _id: {
          center: "$center",
          warehouse: "$warehouse",
          product: "$products.product",
        },
      },
    },
    { $count: "total" });

    const totalResult = await StockRequest.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    if (productFilterValue) {
      statsPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    statsPipeline.push({
      $group: {
        _id: null,
        totalProductsRequested: { $sum: "$products.quantity" },
        totalApproved: { $sum: "$products.approvedQuantity" },
        totalReceived: { $sum: "$products.receivedQuantity" },
        totalRequests: { $sum: 1 },
        uniqueProducts: { $addToSet: "$products.product" },
        uniqueCenters: { $addToSet: "$center" },
        uniqueWarehouses: { $addToSet: "$warehouse" },
      },
    },
    {
      $project: {
        totalProductsRequested: 1,
        totalApproved: 1,
        totalReceived: 1,
        totalRequests: 1,
        uniqueProductsCount: { $size: "$uniqueProducts" },
        uniqueCentersCount: { $size: "$uniqueCenters" },
        uniqueWarehousesCount: { $size: "$uniqueWarehouses" },
        pendingQuantity: { $subtract: ["$totalProductsRequested", "$totalReceived"] },
        overallApprovalRate: {
          $cond: {
            if: { $gt: ["$totalProductsRequested", 0] },
            then: { $multiply: [{ $divide: ["$totalApproved", "$totalProductsRequested"] }, 100] },
            else: 0
          }
        },
        overallFulfillmentRate: {
          $cond: {
            if: { $gt: ["$totalProductsRequested", 0] },
            then: { $multiply: [{ $divide: ["$totalReceived", "$totalProductsRequested"] }, 100] },
            else: 0
          }
        },
      },
    });

    const statsResult = await StockRequest.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalProductsRequested: 0,
      totalApproved: 0,
      totalReceived: 0,
      totalRequests: 0,
      uniqueProductsCount: 0,
      uniqueCentersCount: 0,
      uniqueWarehousesCount: 0,
      pendingQuantity: 0,
      overallApprovalRate: 0,
      overallFulfillmentRate: 0,
    };
    let periodDisplay = '';
    if (startDate && endDate) {
      periodDisplay = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    const response = {
      success: true,
      message: `Monthly stock requests summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        dateRange: dateFilter,
        totalProductsRequested: stats.totalProductsRequested,
        totalApproved: stats.totalApproved,
        totalReceived: stats.totalReceived,
        totalRequests: stats.totalRequests,
        pendingQuantity: stats.pendingQuantity,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueCenters: stats.uniqueCentersCount,
        uniqueWarehouses: stats.uniqueWarehousesCount,
        overallApprovalRate: Math.round(stats.overallApprovalRate * 100) / 100,
        overallFulfillmentRate: Math.round(stats.overallFulfillmentRate * 100) / 100,
      },
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        warehouse: warehouse || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock requests summary:", error);
    handleControllerError(error, res);
  }
};

export const getMonthlyStockTransfersSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      fromCenter,
      toCenter,
      product,
      productId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    console.log('Received query params:', {
      fromCenter, toCenter, product, productId, startDate, endDate, month, year, status
    });

    // Date range handling - support both month/year and startDate/endDate
    let dateFilter = {};
    const currentDate = new Date();
    
    if (startDate || endDate) {
      // Use custom date range if provided
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    } else {
      // Use month/year if no custom date range provided
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lte: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      };
    }

    // Build base filter
    const baseFilter = {
      createdAt: dateFilter,
    };

    // Center filtering with permission check
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        baseFilter.$or = [
          { fromCenter: mongoose.Types.ObjectId.isValid(userCenterId) 
            ? new mongoose.Types.ObjectId(userCenterId)
            : userCenterId 
          },
          { toCenter: mongoose.Types.ObjectId.isValid(userCenterId) 
            ? new mongoose.Types.ObjectId(userCenterId)
            : userCenterId 
          }
        ];
      }
    } else if (permissions.view_all_report) {
      // From Center filter
      if (fromCenter) {
        baseFilter.fromCenter = mongoose.Types.ObjectId.isValid(fromCenter) 
          ? new mongoose.Types.ObjectId(fromCenter)
          : fromCenter;
      }
      
      // To Center filter
      if (toCenter) {
        baseFilter.toCenter = mongoose.Types.ObjectId.isValid(toCenter) 
          ? new mongoose.Types.ObjectId(toCenter)
          : toCenter;
      }
    }

    // Status filter
    if (status) {
      baseFilter.status = status;
    }

    console.log('Base filter:', JSON.stringify(baseFilter, null, 2));

    // Build aggregation pipeline
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    // Add product filter if applied
    const productFilterValue = product || productId;
    if (productFilterValue) {
      aggregationPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    // Continue with the rest of the pipeline
    aggregationPipeline.push(
      {
        $lookup: {
          from: "centers",
          localField: "fromCenter",
          foreignField: "_id",
          as: "fromCenterDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "toCenter",
          foreignField: "_id",
          as: "toCenterDetails",
        },
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
        $project: {
          fromCenter: { $arrayElemAt: ["$fromCenterDetails.centerName", 0] },
          fromCenterId: "$fromCenter",
          toCenter: { $arrayElemAt: ["$toCenterDetails.centerName", 0] },
          toCenterId: "$toCenter",
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$products.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          quantity: "$products.quantity",
          approvedQuantity: "$products.approvedQuantity",
          receivedQuantity: "$products.receivedQuantity",
          transferNumber: 1,
          status: 1,
          date: 1,
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: {
            fromCenter: "$fromCenter",
            fromCenterId: "$fromCenterId",
            toCenter: "$toCenter",
            toCenterId: "$toCenterId",
            product: "$product",
            productId: "$productId",
            productCode: "$productCode",
          },
          totalRequestedQty: { $sum: "$quantity" },
          totalApprovedQty: { $sum: "$approvedQuantity" },
          totalReceivedQty: { $sum: { $ifNull: ["$receivedQuantity", 0] } },
          transferCount: { $sum: 1 },
          transferNumbers: { $push: "$transferNumber" },
          statuses: { $push: "$status" },
          dates: { $push: "$date" },
        },
      },
      {
        $project: {
          _id: 0,
          fromCenter: "$_id.fromCenter",
          fromCenterId: "$_id.fromCenterId",
          toCenter: "$_id.toCenter",
          toCenterId: "$_id.toCenterId",
          product: "$_id.product",
          productId: "$_id.productId",
          productCode: "$_id.productCode",
          totalRequestedQty: 1,
          totalApprovedQty: 1,
          totalReceivedQty: 1,
          transferCount: 1,
          transferNumbers: 1,
          pendingQuantity: { $subtract: ["$totalRequestedQty", "$totalReceivedQty"] },
          approvalRate: {
            $cond: {
              if: { $gt: ["$totalRequestedQty", 0] },
              then: { $multiply: [{ $divide: ["$totalApprovedQty", "$totalRequestedQty"] }, 100] },
              else: 0
            }
          },
          fulfillmentRate: {
            $cond: {
              if: { $gt: ["$totalRequestedQty", 0] },
              then: { $multiply: [{ $divide: ["$totalReceivedQty", "$totalRequestedQty"] }, 100] },
              else: 0
            }
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$statuses",
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statuses",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          fromCenter: 1,
          toCenter: 1,
          product: 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Apply pagination
    const paginatedPipeline = [...aggregationPipeline, { $skip: skip }, { $limit: limitNum }];

    const monthlySummary = await StockTransfer.aggregate(paginatedPipeline);

    // Count pipeline (similar structure but without pagination)
    const countPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    if (productFilterValue) {
      countPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    countPipeline.push({
      $group: {
        _id: {
          fromCenter: "$fromCenter",
          toCenter: "$toCenter",
          product: "$products.product",
        },
      },
    },
    { $count: "total" });

    const totalResult = await StockTransfer.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    // Enhanced statistics pipeline
    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    if (productFilterValue) {
      statsPipeline.push({
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    statsPipeline.push({
      $group: {
        _id: null,
        totalProductsTransferred: { $sum: "$products.quantity" },
        totalApproved: { $sum: "$products.approvedQuantity" },
        totalReceived: { $sum: "$products.receivedQuantity" },
        totalTransfers: { $sum: 1 },
        uniqueProducts: { $addToSet: "$products.product" },
        uniqueFromCenters: { $addToSet: "$fromCenter" },
        uniqueToCenters: { $addToSet: "$toCenter" },
        uniqueStatuses: { $addToSet: "$status" },
      },
    },
    {
      $project: {
        totalProductsTransferred: 1,
        totalApproved: 1,
        totalReceived: 1,
        totalTransfers: 1,
        uniqueProductsCount: { $size: "$uniqueProducts" },
        uniqueFromCentersCount: { $size: "$uniqueFromCenters" },
        uniqueToCentersCount: { $size: "$uniqueToCenters" },
        uniqueStatusesCount: { $size: "$uniqueStatuses" },
        pendingQuantity: { $subtract: ["$totalProductsTransferred", "$totalReceived"] },
        overallApprovalRate: {
          $cond: {
            if: { $gt: ["$totalProductsTransferred", 0] },
            then: { $multiply: [{ $divide: ["$totalApproved", "$totalProductsTransferred"] }, 100] },
            else: 0
          }
        },
        overallFulfillmentRate: {
          $cond: {
            if: { $gt: ["$totalProductsTransferred", 0] },
            then: { $multiply: [{ $divide: ["$totalReceived", "$totalProductsTransferred"] }, 100] },
            else: 0
          }
        },
      },
    });

    const statsResult = await StockTransfer.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalProductsTransferred: 0,
      totalApproved: 0,
      totalReceived: 0,
      totalTransfers: 0,
      uniqueProductsCount: 0,
      uniqueFromCentersCount: 0,
      uniqueToCentersCount: 0,
      uniqueStatusesCount: 0,
      pendingQuantity: 0,
      overallApprovalRate: 0,
      overallFulfillmentRate: 0,
    };

    // Determine period display
    let periodDisplay = '';
    if (startDate && endDate) {
      periodDisplay = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    const response = {
      success: true,
      message: `Monthly stock transfers summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        dateRange: dateFilter,
        totalProductsTransferred: stats.totalProductsTransferred,
        totalApproved: stats.totalApproved,
        totalReceived: stats.totalReceived,
        totalTransfers: stats.totalTransfers,
        pendingQuantity: stats.pendingQuantity,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueFromCenters: stats.uniqueFromCentersCount,
        uniqueToCenters: stats.uniqueToCentersCount,
        uniqueStatuses: stats.uniqueStatusesCount,
        overallApprovalRate: Math.round(stats.overallApprovalRate * 100) / 100,
        overallFulfillmentRate: Math.round(stats.overallFulfillmentRate * 100) / 100,
      },
      filters: {
        fromCenter: fromCenter || "all",
        toCenter: toCenter || "all",
        product: product || productId || "all",
        status: status || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock transfers summary:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockTransfersReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      status,
      fromCenter,
      toCenter,
      center,
      centerId,
      product,
      productId,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      shippedBy,
      receivedBy,
      dateField = "createdAt",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      statuses,
    } = req.query;

    const filter = {};

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate, fromCenter, toCenter
    });

    // Center filtering with permission check
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
      }
    } else if (permissions.view_all_report) {
      // Support center filter for both fromCenter and toCenter
      const centerFilterValue = center || centerId;
      if (centerFilterValue) {
        filter.$or = [
          { fromCenter: centerFilterValue },
          { toCenter: centerFilterValue }
        ];
      } else {
        // Individual center filters
        if (fromCenter) filter.fromCenter = fromCenter;
        if (toCenter) filter.toCenter = toCenter;
      }
    }

    // Product filtering
    const productFilterValue = product || productId;
    if (productFilterValue) {
      filter["products.product"] = productFilterValue;
    }

    // Status filtering
    if (status) {
      filter.status = status;
    }

    if (statuses) {
      const statusArray = Array.isArray(statuses)
        ? statuses
        : statuses.split(",");
      filter.status = { $in: statusArray };
    }

    // Date range filtering with proper time boundaries
    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField].$lte = end;
      }
    }

    // User filtering
    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (approvedBy) {
      filter["adminApproval.approvedBy"] = approvedBy;
    }

    if (shippedBy) {
      filter["shippingInfo.shippedBy"] = shippedBy;
    }

    if (receivedBy) {
      filter["receivingInfo.receivedBy"] = receivedBy;
    }

    // Enhanced search filtering
    if (search) {
      filter.$or = [
        { transferNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "shippingInfo.shipmentDetails": { $regex: search, $options: "i" } },
        {
          "shippingInfo.carrierInfo.trackingNumber": {
            $regex: search,
            $options: "i",
          },
        },
        { "products.product.productTitle": { $regex: search, $options: "i" } },
        { "fromCenter.centerName": { $regex: search, $options: "i" } },
        { "fromCenter.centerCode": { $regex: search, $options: "i" } },
        { "toCenter.centerName": { $regex: search, $options: "i" } },
        { "toCenter.centerCode": { $regex: search, $options: "i" } },
      ];
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Use regular find with populate for better compatibility
    let query = StockTransfer.find(filter);

    // Populate options
    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "fromCenter",
        select: "centerName centerCode centerType",
      },
      {
        path: "toCenter",
        select: "centerName centerCode centerType",
      },
      {
        path: "products.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "updatedBy", select: "fullName email" },
        { path: "adminApproval.approvedBy", select: "fullName email" },
        { path: "adminApproval.rejectedBy", select: "fullName email" },
        { path: "shippingInfo.shippedBy", select: "fullName email" },
        { path: "receivingInfo.receivedBy", select: "fullName email" },
        { path: "completionInfo.completedBy", select: "fullName email" },
        { path: "completionInfo.incompleteBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const fromCenterIndex = populateOptions.findIndex(
        (p) => p.path === "fromCenter"
      );
      const toCenterIndex = populateOptions.findIndex(
        (p) => p.path === "toCenter"
      );

      if (fromCenterIndex !== -1) {
        populateOptions[fromCenterIndex].select += " address phone";
      }
      if (toCenterIndex !== -1) {
        populateOptions[toCenterIndex].select += " address phone";
      }
    }

    // Sort options
    const sort = {};
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
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [stockTransfers, total] = await Promise.all([
      query
        .populate(populateOptions)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockTransfer.countDocuments(filter)
    ]);

    console.log(`Found ${stockTransfers.length} records out of ${total} total`);

    // Post-process to filter products array if product filter is applied
    let processedTransfers = stockTransfers;
    if (productFilterValue) {
      processedTransfers = stockTransfers.map(transfer => {
        const filteredProducts = transfer.products.filter(productItem => {
          if (!productItem.product) return false;
          const productId = productItem.product._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...transfer,
          products: filteredProducts
        };
      }).filter(transfer => transfer.products.length > 0); // Remove transfers with no matching products
    }

    // Fetch stock data for each product
    const CenterStock = mongoose.model("CenterStock");

    for (const transfer of processedTransfers) {
      for (const productItem of transfer.products) {
        if (productItem.product && transfer.fromCenter && transfer.toCenter) {
          try {
            const fromCenterStock = await CenterStock.findOne({
              center: transfer.fromCenter._id,
              product: productItem.product._id,
            })
              .select(
                "availableQuantity totalQuantity inTransitQuantity consumedQuantity"
              )
              .lean();

            const toCenterStock = await CenterStock.findOne({
              center: transfer.toCenter._id,
              product: productItem.product._id,
            })
              .select(
                "availableQuantity totalQuantity inTransitQuantity consumedQuantity"
              )
              .lean();

            productItem.fromCenterStock = fromCenterStock
              ? {
                  availableQuantity: fromCenterStock.availableQuantity || 0,
                  totalQuantity: fromCenterStock.totalQuantity || 0,
                  inTransitQuantity: fromCenterStock.inTransitQuantity || 0,
                  consumedQuantity: fromCenterStock.consumedQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                  consumedQuantity: 0,
                };

            productItem.toCenterStock = toCenterStock
              ? {
                  availableQuantity: toCenterStock.availableQuantity || 0,
                  totalQuantity: toCenterStock.totalQuantity || 0,
                  inTransitQuantity: toCenterStock.inTransitQuantity || 0,
                  consumedQuantity: toCenterStock.consumedQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                  consumedQuantity: 0,
                };
          } catch (error) {
            console.error(
              `Error fetching center stock data for product ${productItem.product._id}:`,
              error
            );

            productItem.fromCenterStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
            };
            productItem.toCenterStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
            };
          }
        } else {
          productItem.fromCenterStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          };
          productItem.toCenterStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          };
        }
      }
    }

    // Get summary statistics
    const summaryStats = await StockTransfer.aggregate([
      { $match: filter },
      { $unwind: "$products" },
      ...(productFilterValue ? [{
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalTransfers: { $addToSet: "$_id" },
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$products.quantity" },
          totalShipped: { $sum: "$products.shippedQuantity" },
          totalReceived: { $sum: "$products.receivedQuantity" }
        }
      },
      {
        $project: {
          totalTransfers: { $size: "$totalTransfers" },
          totalProducts: 1,
          totalQuantity: 1,
          totalShipped: 1,
          totalReceived: 1,
          pendingShipment: { $subtract: ["$totalQuantity", "$totalShipped"] },
          pendingReceipt: { $subtract: ["$totalShipped", "$totalReceived"] }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalTransfers: 0,
      totalProducts: 0,
      totalQuantity: 0,
      totalShipped: 0,
      totalReceived: 0,
      pendingShipment: 0,
      pendingReceipt: 0
    };

    const statusCounts = await StockTransfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    const centerStats = await StockTransfer.aggregate([
      { $match: filter },
      {
        $facet: {
          fromCenters: [
            { $group: { _id: "$fromCenter", count: { $sum: 1 } } },
            { $count: "total" },
          ],
          toCenters: [
            { $group: { _id: "$toCenter", count: { $sum: 1 } } },
            { $count: "total" },
          ],
        },
      },
    ]);

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedTransfers.length : total;

    const response = {
      success: true,
      message: "Stock transfers retrieved successfully",
      data: processedTransfers,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        fromCenter: fromCenter || "all",
        toCenter: toCenter || "all",
        status: statusFilters,
        startDate: startDate || "all",
        endDate: endDate || "all",
        total: finalTotal,
        uniqueFromCenters: centerStats[0]?.fromCenters[0]?.total || 0,
        uniqueToCenters: centerStats[0]?.toCenters[0]?.total || 0,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock transfers:", error);
    handleControllerError(error, res);
  }
};

// export const getMonthlyStockUsageSummary = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
//       "view_own_report",
//       "view_all_report",
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_own_report or view_all_report permission required.",
//       });
//     }

//     const {
//       month,
//       year,
//       center,
//       usageType,
//       product,
//       status,
//       page = 1,
//       limit = 50,
//     } = req.query;

//     const currentDate = new Date();
//     const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
//     const currentYear = year ? parseInt(year) : currentDate.getFullYear();

//     const startDate = new Date(currentYear, currentMonth - 1, 1);
//     const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

//     const filter = {
//       date: {
//         $gte: startDate,
//         $lte: endDate,
//       },
//     };

//     if (permissions.view_own_report && !permissions.view_all_report) {
//       const userCenterId = userCenter?._id || userCenter;
//       if (userCenterId) {
//         filter.center = userCenterId;
//       }
//     } else if (permissions.view_all_report && center) {
//       filter.center = center;
//     }

//     if (usageType) filter.usageType = usageType;
//     if (product) filter["items.product"] = product;
//     if (status) filter.status = status;

//     const aggregationPipeline = [
//       { $match: filter },

//       { $unwind: "$items" },

//       {
//         $lookup: {
//           from: "centers",
//           localField: "center",
//           foreignField: "_id",
//           as: "centerDetails",
//         },
//       },

//       {
//         $lookup: {
//           from: "products",
//           localField: "items.product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },

//       {
//         $lookup: {
//           from: "customers",
//           localField: "customer",
//           foreignField: "_id",
//           as: "customerDetails",
//         },
//       },

//       {
//         $project: {
//           center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
//           centerId: "$center",
//           usageType: 1,
//           product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
//           productId: "$items.product",
//           productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
//           customer: { $arrayElemAt: ["$customerDetails.name", 0] },
//           quantity: "$items.quantity",
//           oldStock: "$items.oldStock",
//           newStock: "$items.newStock",
//           totalStock: "$items.totalStock",
//           status: 1,
//           date: 1,
//           remark: 1,
//           connectionType: 1,
//           packageAmount: 1,
//           onuCharges: 1,
//           installationCharges: 1,
//           shiftingAmount: 1,
//           wireChangeAmount: 1,
//         },
//       },

//       {
//         $group: {
//           _id: {
//             center: "$center",
//             centerId: "$centerId",
//             usageType: "$usageType",
//             product: "$product",
//             productId: "$productId",
//             productCode: "$productCode",
//           },
//           totalQuantity: { $sum: "$quantity" },
//           totalOldStock: { $avg: "$oldStock" },
//           totalNewStock: { $avg: "$newStock" },
//           totalStockValue: { $avg: "$totalStock" },
//           usageCount: { $sum: 1 },
//           totalPackageAmount: { $sum: "$packageAmount" },
//           totalOnuCharges: { $sum: "$onuCharges" },
//           totalInstallationCharges: { $sum: "$installationCharges" },
//           totalShiftingAmount: { $sum: "$shiftingAmount" },
//           totalWireChangeAmount: { $sum: "$wireChangeAmount" },
//           statuses: { $push: "$status" },
//           customerUsageCount: {
//             $sum: {
//               $cond: [{ $eq: ["$usageType", "Customer"] }, 1, 0],
//             },
//           },
//         },
//       },

//       {
//         $project: {
//           _id: 0,
//           Center: "$_id.center",
//           CenterId: "$_id.centerId",
//           UsageType: "$_id.usageType",
//           Product: "$_id.product",
//           ProductId: "$_id.productId",
//           ProductCode: "$_id.productCode",
//           TotalQuantity: "$totalQuantity",
//         },
//       },

//       {
//         $sort: {
//           Center: 1,
//           UsageType: 1,
//           Product: 1,
//         },
//       },
//     ];

//     const skip = (page - 1) * limit;
//     aggregationPipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

//     const monthlySummary = await StockUsage.aggregate(aggregationPipeline);

//     const countPipeline = [
//       { $match: filter },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: {
//             center: "$center",
//             usageType: "$usageType",
//             product: "$items.product",
//           },
//         },
//       },
//       { $count: "total" },
//     ];

//     const totalResult = await StockUsage.aggregate(countPipeline);
//     const total = totalResult.length > 0 ? totalResult[0].total : 0;

//     const basicStats = await StockUsage.aggregate([
//       { $match: filter },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: null,
//           totalProductsUsed: { $sum: "$items.quantity" },
//           totalUsages: { $sum: 1 },
//         },
//       },
//     ]);

//     const usageTypeStats = await StockUsage.aggregate([
//       { $match: filter },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: "$usageType",
//           count: { $sum: 1 },
//           totalQuantity: { $sum: "$items.quantity" },
//         },
//       },
//     ]);

//     const revenueStats = await StockUsage.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: null,
//           totalRevenue: {
//             $sum: {
//               $add: [
//                 "$packageAmount",
//                 "$onuCharges",
//                 "$installationCharges",
//                 "$shiftingAmount",
//                 "$wireChangeAmount",
//               ],
//             },
//           },
//         },
//       },
//     ]);

//     const uniqueProductsResult = await StockUsage.aggregate([
//       { $match: filter },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: "$items.product",
//         },
//       },
//       { $count: "total" },
//     ]);

//     const uniqueCentersResult = await StockUsage.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: "$center",
//         },
//       },
//       { $count: "total" },
//     ]);

//     const usageTypeBreakdown = {};
//     usageTypeStats.forEach((stat) => {
//       usageTypeBreakdown[stat._id] = {
//         count: stat.count,
//         totalQuantity: stat.totalQuantity,
//       };
//     });

//     const stats = {
//       totalProductsUsed:
//         basicStats.length > 0 ? basicStats[0].totalProductsUsed : 0,
//       totalUsages: basicStats.length > 0 ? basicStats[0].totalUsages : 0,
//       totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
//       uniqueProductsCount:
//         uniqueProductsResult.length > 0 ? uniqueProductsResult[0].total : 0,
//       uniqueCentersCount:
//         uniqueCentersResult.length > 0 ? uniqueCentersResult[0].total : 0,
//       usageTypeBreakdown: usageTypeBreakdown,
//     };

//     const response = {
//       success: true,
//       message: `Monthly stock usage summary for ${currentMonth}/${currentYear} retrieved successfully`,
//       data: monthlySummary,
//       summary: {
//         period: `${currentMonth}/${currentYear}`,
//         totalProductsUsed: stats.totalProductsUsed,
//         totalUsages: stats.totalUsages,
//         uniqueProducts: stats.uniqueProductsCount,
//         uniqueCenters: stats.uniqueCentersCount,
//         totalRevenue: stats.totalRevenue,
//         usageTypeBreakdown: stats.usageTypeBreakdown,
//         dateRange: {
//           start: startDate,
//           end: endDate,
//         },
//       },
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//     };

//     res.status(200).json(response);
//   } catch (error) {
//     console.error("Error fetching monthly stock usage summary:", error);
//     handleControllerError(error, res);
//   }
// };



export const getMonthlyStockUsageSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      center,
      centerId,
      usageType,
      product,
      productId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    console.log('Received query params:', {
      center, centerId, usageType, product, productId, status, startDate, endDate, month, year
    });
    let dateFilter = {};
    const currentDate = new Date();
    
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lte: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      };
    }
    const baseFilter = {
      date: dateFilter,
    };
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        baseFilter.center = mongoose.Types.ObjectId.isValid(userCenterId) 
          ? new mongoose.Types.ObjectId(userCenterId)
          : userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      const centerFilterValue = center || centerId;
      baseFilter.center = mongoose.Types.ObjectId.isValid(centerFilterValue) 
        ? new mongoose.Types.ObjectId(centerFilterValue)
        : centerFilterValue;
    }
    if (usageType) baseFilter.usageType = usageType;

    if (status) baseFilter.status = status;

    console.log('Base filter:', JSON.stringify(baseFilter, null, 2));
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$items" }
    ];

    const productFilterValue = product || productId;
    if (productFilterValue) {
      aggregationPipeline.push({
        $match: {
          "items.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }
    aggregationPipeline.push(
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
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      {
        $project: {
          center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
          centerId: "$center",
          usageType: 1,
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$items.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          customer: { $arrayElemAt: ["$customerDetails.name", 0] },
          quantity: "$items.quantity",
          oldStock: "$items.oldStock",
          newStock: "$items.newStock",
          totalStock: "$items.totalStock",
          status: 1,
          date: 1,
          remark: 1,
          connectionType: 1,
          packageAmount: 1,
          onuCharges: 1,
          installationCharges: 1,
          shiftingAmount: 1,
          wireChangeAmount: 1,
        },
      },
      {
        $group: {
          _id: {
            center: "$center",
            centerId: "$centerId",
            usageType: "$usageType",
            product: "$product",
            productId: "$productId",
            productCode: "$productCode",
          },
          totalQuantity: { $sum: "$quantity" },
          totalOldStock: { $avg: "$oldStock" },
          totalNewStock: { $avg: "$newStock" },
          totalStockValue: { $avg: "$totalStock" },
          usageCount: { $sum: 1 },
          totalPackageAmount: { $sum: "$packageAmount" },
          totalOnuCharges: { $sum: "$onuCharges" },
          totalInstallationCharges: { $sum: "$installationCharges" },
          totalShiftingAmount: { $sum: "$shiftingAmount" },
          totalWireChangeAmount: { $sum: "$wireChangeAmount" },
          statuses: { $push: "$status" },
          customerUsageCount: {
            $sum: {
              $cond: [{ $eq: ["$usageType", "Customer"] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          Center: "$_id.center",
          CenterId: "$_id.centerId",
          UsageType: "$_id.usageType",
          Product: "$_id.product",
          ProductId: "$_id.productId",
          ProductCode: "$_id.productCode",
          TotalQuantity: "$totalQuantity",
          AverageOldStock: { $round: ["$totalOldStock", 2] },
          AverageNewStock: { $round: ["$totalNewStock", 2] },
          AverageTotalStock: { $round: ["$totalStockValue", 2] },
          UsageCount: "$usageCount",
          CustomerUsageCount: "$customerUsageCount",
          TotalPackageAmount: "$totalPackageAmount",
          TotalOnuCharges: "$totalOnuCharges",
          TotalInstallationCharges: "$totalInstallationCharges",
          TotalShiftingAmount: "$totalShiftingAmount",
          TotalWireChangeAmount: "$totalWireChangeAmount",
          TotalRevenue: {
            $add: [
              "$totalPackageAmount",
              "$totalOnuCharges",
              "$totalInstallationCharges",
              "$totalShiftingAmount",
              "$totalWireChangeAmount"
            ]
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$statuses",
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statuses",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          Center: 1,
          UsageType: 1,
          Product: 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const paginatedPipeline = [...aggregationPipeline, { $skip: skip }, { $limit: limitNum }];

    const monthlySummary = await StockUsage.aggregate(paginatedPipeline);

    const countPipeline = [
      { $match: baseFilter },
      { $unwind: "$items" }
    ];

    if (productFilterValue) {
      countPipeline.push({
        $match: {
          "items.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    countPipeline.push({
      $group: {
        _id: {
          center: "$center",
          usageType: "$usageType",
          product: "$items.product",
        },
      },
    },
    { $count: "total" });

    const totalResult = await StockUsage.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$items" }
    ];

    if (productFilterValue) {
      statsPipeline.push({
        $match: {
          "items.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      });
    }

    statsPipeline.push({
      $group: {
        _id: null,
        totalProductsUsed: { $sum: "$items.quantity" },
        totalUsages: { $sum: 1 },
        totalRevenue: {
          $sum: {
            $add: [
              "$packageAmount",
              "$onuCharges",
              "$installationCharges",
              "$shiftingAmount",
              "$wireChangeAmount",
            ],
          },
        },
        uniqueProducts: { $addToSet: "$items.product" },
        uniqueCenters: { $addToSet: "$center" },
        uniqueUsageTypes: { $addToSet: "$usageType" },
        customerUsages: {
          $sum: {
            $cond: [{ $eq: ["$usageType", "Customer"] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        totalProductsUsed: 1,
        totalUsages: 1,
        totalRevenue: 1,
        uniqueProductsCount: { $size: "$uniqueProducts" },
        uniqueCentersCount: { $size: "$uniqueCenters" },
        uniqueUsageTypesCount: { $size: "$uniqueUsageTypes" },
        customerUsages: 1,
      },
    });

    const statsResult = await StockUsage.aggregate(statsPipeline);
    const basicStats = statsResult.length > 0 ? statsResult[0] : {
      totalProductsUsed: 0,
      totalUsages: 0,
      totalRevenue: 0,
      uniqueProductsCount: 0,
      uniqueCentersCount: 0,
      uniqueUsageTypesCount: 0,
      customerUsages: 0,
    };
    const usageTypeStats = await StockUsage.aggregate([
      { $match: baseFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: {
            $sum: {
              $add: [
                "$packageAmount",
                "$onuCharges",
                "$installationCharges",
                "$shiftingAmount",
                "$wireChangeAmount",
              ],
            },
          },
        },
      },
    ]);

    const usageTypeBreakdown = {};
    usageTypeStats.forEach((stat) => {
      usageTypeBreakdown[stat._id] = {
        count: stat.count,
        totalQuantity: stat.totalQuantity,
        totalRevenue: stat.totalRevenue,
      };
    });
    let periodDisplay = '';
    if (startDate && endDate) {
      periodDisplay = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    const response = {
      success: true,
      message: `Monthly stock usage summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        dateRange: dateFilter,
        totalProductsUsed: basicStats.totalProductsUsed,
        totalUsages: basicStats.totalUsages,
        totalRevenue: basicStats.totalRevenue,
        uniqueProducts: basicStats.uniqueProductsCount,
        uniqueCenters: basicStats.uniqueCentersCount,
        uniqueUsageTypes: basicStats.uniqueUsageTypesCount,
        customerUsages: basicStats.customerUsages,
        usageTypeBreakdown: usageTypeBreakdown,
      },
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        usageType: usageType || "all",
        status: status || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock usage summary:", error);
    handleControllerError(error, res);
  }
};


export const getAllStockUsageReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      status,
      center,
      usageType,
      product,
      connectionType,
      customer,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      rejectedBy,
      dateField = "date",
      search,
      sortBy = "date",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      includeCustomerDetails = false,
      includeBuildingDetails = false,
      includeControlRoomDetails = false,
      statuses,
    } = req.query;

    console.log('Received query params:', {
      center, usageType, product, connectionType, customer, startDate, endDate, status
    });

    const filter = {};

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = center;
    }

    if (status) {
      filter.status = status;
    }

    if (statuses) {
      const statusArray = Array.isArray(statuses)
        ? statuses
        : statuses.split(",");
      filter.status = { $in: statusArray };
    }

    if (usageType) {
      filter.usageType = usageType;
    }
    if (customer) {
      filter.customer = mongoose.Types.ObjectId.isValid(customer) 
        ? new mongoose.Types.ObjectId(customer)
        : customer;
    }

    if (product) {
      filter["items.product"] = mongoose.Types.ObjectId.isValid(product) 
        ? new mongoose.Types.ObjectId(product)
        : product;
    }
    if (connectionType) {
      filter.connectionType = connectionType;
    }

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter[dateField].$lte = endDateObj;
      }
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (approvedBy) {
      filter.approvedBy = approvedBy;
    }

    if (rejectedBy) {
      filter.rejectedBy = rejectedBy;
    }

    if (search) {
      filter.$or = [
        { remark: { $regex: search, $options: "i" } },
        { approvalRemark: { $regex: search, $options: "i" } },
        { rejectionRemark: { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } },
      ];
    }

    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
      },
    ];

    if (usageType) {
      switch (usageType) {
        case "Customer":
          populateOptions.push({
            path: "customer",
            select:
              "username name email mobile address1 address2 city state connectionType",
          });
          break;
        case "Building":
          populateOptions.push({
            path: "fromBuilding",
            select:
              "buildingName displayName address1 address2 landmark pincode",
          });
          break;
        case "Building to Building":
          populateOptions.push(
            {
              path: "fromBuilding",
              select:
                "buildingName displayName address1 address2 landmark pincode",
            },
            {
              path: "toBuilding",
              select:
                "buildingName displayName address1 address2 landmark pincode",
            }
          );
          break;
        case "Control Room":
          populateOptions.push({
            path: "fromControlRoom",
            select:
              "buildingName displayName address1 address2 landmark pincode",
          });
          break;
        case "Damage":
        case "Stolen from Center":
        case "Stolen from Field":
        case "Other":
          break;
      }
    } else {
      populateOptions.push(
        {
          path: "customer",
          select:
            "username name email mobile address1 address2 city state connectionType",
        },
        {
          path: "fromBuilding",
          select: "buildingName displayName address1 address2 landmark pincode",
        },
        {
          path: "toBuilding",
          select: "buildingName displayName address1 address2 landmark pincode",
        },
        {
          path: "fromControlRoom",
          select: "buildingName displayName address1 address2 landmark pincode",
        }
      );
    }

    if (includeUserDetails) {
      populateOptions.push(
        { path: "approvedBy", select: "fullName email" },
        { path: "rejectedBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const centerIndex = populateOptions.findIndex((p) => p.path === "center");
      if (centerIndex !== -1) {
        populateOptions[centerIndex].select += " address phone";
      }
    }

    if (includeCustomerDetails && !usageType) {
      const customerIndex = populateOptions.findIndex(
        (p) => p.path === "customer"
      );
      if (customerIndex === -1) {
        populateOptions.push({
          path: "customer",
          select:
            "username name email mobile address1 address2 city state connectionType",
        });
      }
    }

    if (includeBuildingDetails && !usageType) {
      const fromBuildingIndex = populateOptions.findIndex(
        (p) => p.path === "fromBuilding"
      );
      const toBuildingIndex = populateOptions.findIndex(
        (p) => p.path === "toBuilding"
      );

      if (fromBuildingIndex === -1) {
        populateOptions.push({
          path: "fromBuilding",
          select: "buildingName displayName address1 address2 landmark pincode",
        });
      }
      if (toBuildingIndex === -1) {
        populateOptions.push({
          path: "toBuilding",
          select: "buildingName displayName address1 address2 landmark pincode",
        });
      }
    }

    if (includeControlRoomDetails && !usageType) {
      const controlRoomIndex = populateOptions.findIndex(
        (p) => p.path === "fromControlRoom"
      );
      if (controlRoomIndex === -1) {
        populateOptions.push({
          path: "fromControlRoom",
          select: "buildingName displayName address1 address2 landmark pincode",
        });
      }
    }

    populateOptions.push({
      path: "items.product",
      select:
        "productTitle productPrice productCode productImage productCategory trackSerialNumber",
      populate: {
        path: "productCategory",
        select: "productCategory",
      },
    });

    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "usageType",
      "status",
      "connectionType"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    };
    const stockUsages = await StockUsage.find(filter)
      .sort(sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate(populateOptions)
      .lean();

    const CenterStock = mongoose.model("CenterStock");

    for (const usage of stockUsages) {
      for (const item of usage.items) {
        if (item.product && usage.center) {
          try {
            const centerStock = await CenterStock.findOne({
              center: usage.center._id,
              product: item.product._id,
            })
              .select(
                "availableQuantity totalQuantity inTransitQuantity consumedQuantity"
              )
              .lean();

            item.currentCenterStock = centerStock
              ? {
                  availableQuantity: centerStock.availableQuantity || 0,
                  totalQuantity: centerStock.totalQuantity || 0,
                  inTransitQuantity: centerStock.inTransitQuantity || 0,
                  consumedQuantity: centerStock.consumedQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                  consumedQuantity: 0,
                };
          } catch (error) {
            console.error(
              `Error fetching center stock for product ${item.product._id}:`,
              error
            );
            item.currentCenterStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
            };
          }
        } else {
          item.currentCenterStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          };
        }
      }

      usage.totalRevenue =
        (usage.packageAmount || 0) +
        (usage.onuCharges || 0) +
        (usage.installationCharges || 0) +
        (usage.shiftingAmount || 0) +
        (usage.wireChangeAmount || 0);

      usage.totalQuantityUsed = usage.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      usage.usageDetails = getUsageTypeDetails(usage);
    }
    const total = await StockUsage.countDocuments(filter);

    const statusCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    const usageTypeCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQuantity: { $sum: { $sum: "$items.quantity" } },
        },
      },
    ]);

    const connectionTypeCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $match: { usageType: "Customer" }
      },
      {
        $group: {
          _id: "$connectionType",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    const usageTypeFilters = {};
    usageTypeCounts.forEach((item) => {
      usageTypeFilters[item._id] = {
        count: item.count,
        totalQuantity: item.totalQuantity,
      };
    });

    const connectionTypeFilters = {};
    connectionTypeCounts.forEach((item) => {
      connectionTypeFilters[item._id] = item.count;
    });

    const revenueStats = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $add: [
                "$packageAmount",
                "$onuCharges",
                "$installationCharges",
                "$shiftingAmount",
                "$wireChangeAmount",
              ],
            },
          },
          totalCustomerUsages: {
            $sum: { $cond: [{ $eq: ["$usageType", "Customer"] }, 1, 0] },
          },
        },
      },
    ]);

    const response = {
      success: true,
      message: "Stock usage reports retrieved successfully",
      data: stockUsages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        status: statusFilters,
        usageType: usageTypeFilters,
        connectionType: connectionTypeFilters,
        total: total,
        totalRevenue:
          revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        totalCustomerUsages:
          revenueStats.length > 0 ? revenueStats[0].totalCustomerUsages : 0,
      },
      appliedFilters: {
        center: center || "all",
        usageType: usageType || "all",
        product: product || "all",
        connectionType: connectionType || "all",
        customer: customer || "all",
        startDate: startDate || "none",
        endDate: endDate || "none",
        status: status || "all",
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock usage reports:", error);
    handleControllerError(error, res);
  }
};

function getUsageTypeDetails(usage) {
  const details = {
    entityName: "",
    entityAddress: "",
    entityContact: "",
    entityType: usage.usageType,
  };

  switch (usage.usageType) {
    case "Customer":
      if (usage.customer) {
        details.entityName = usage.customer.name || usage.customer.username;
        details.entityAddress = `${usage.customer.address1 || ""} ${
          usage.customer.address2 || ""
        } ${usage.customer.city || ""} ${usage.customer.state || ""}`.trim();
        details.entityContact = usage.customer.mobile || usage.customer.email;
        details.connectionType = usage.connectionType;
      }
      break;

    case "Building":
      if (usage.fromBuilding) {
        details.entityName = usage.fromBuilding.buildingName;
        details.entityAddress = `${usage.fromBuilding.address1 || ""} ${
          usage.fromBuilding.address2 || ""
        } ${usage.fromBuilding.landmark || ""} ${
          usage.fromBuilding.pincode || ""
        }`.trim();
        details.displayName = usage.fromBuilding.displayName;
      }
      break;

    case "Building to Building":
      if (usage.fromBuilding && usage.toBuilding) {
        details.entityName = `${usage.fromBuilding.buildingName} → ${usage.toBuilding.buildingName}`;
        details.entityAddress = `From: ${
          usage.fromBuilding.address1 || ""
        } | To: ${usage.toBuilding.address1 || ""}`;
        details.fromBuilding = usage.fromBuilding.buildingName;
        details.toBuilding = usage.toBuilding.buildingName;
      }
      break;

    case "Control Room":
      if (usage.fromControlRoom) {
        details.entityName = usage.fromControlRoom.buildingName;
        details.entityAddress = `${usage.fromControlRoom.address1 || ""} ${
          usage.fromControlRoom.address2 || ""
        } ${usage.fromControlRoom.landmark || ""} ${
          usage.fromControlRoom.pincode || ""
        }`.trim();
        details.displayName = usage.fromControlRoom.displayName;
      }
      break;

    case "Damage":
      details.entityName = "Damage Report";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Stolen from Center":
      details.entityName = "Stolen from Center";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Stolen from Field":
      details.entityName = "Stolen from Field";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Other":
      details.entityName = "Other Usage";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;
  }

  return details;
}

export const getAllStolenStockReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      center,
      centerId,
      product,
      productId,
      stolenFrom,
      status,
      startDate,
      endDate,
      createdBy,
      dateField = "date",
      search,
      sortBy = "date",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
    } = req.query;

    const filter = {
      usageType: {
        $in: ["Stolen from Center", "Stolen from Field"],
      },
    };

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate, stolenFrom, status
    });

    // Center filtering with permission check
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      // Support both center and centerId parameters
      const centerFilterValue = center || centerId;
      filter.center = centerFilterValue;
    }

    // Product filtering
    const productFilterValue = product || productId;
    if (productFilterValue) {
      filter["items.product"] = productFilterValue;
    }

    // Stolen from and status filtering
    if (stolenFrom) filter.usageType = stolenFrom;
    if (status) filter.status = status;

    // Date range filtering with proper time boundaries
    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField].$lte = end;
      }
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    // Enhanced search filtering
    if (search) {
      filter.$or = [
        { remark: { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } },
        { "items.product.productTitle": { $regex: search, $options: "i" } },
        { "items.product.productCode": { $regex: search, $options: "i" } },
        { "center.centerName": { $regex: search, $options: "i" } },
        { "center.centerCode": { $regex: search, $options: "i" } },
      ];
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Use regular find with populate for better compatibility
    let query = StockUsage.find(filter);

    // Populate options
    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
      },
      {
        path: "items.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "approvedBy", select: "fullName email" },
        { path: "rejectedBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const centerIndex = populateOptions.findIndex((p) => p.path === "center");
      if (centerIndex !== -1) {
        populateOptions[centerIndex].select += " address phone";
      }
    }

    // Sort options
    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "usageType",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [stolenStockReports, total] = await Promise.all([
      query
        .populate(populateOptions)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockUsage.countDocuments(filter)
    ]);

    console.log(`Found ${stolenStockReports.length} records out of ${total} total`);

    // Post-process to filter items array if product filter is applied
    let processedReports = stolenStockReports;
    if (productFilterValue) {
      processedReports = stolenStockReports.map(report => {
        const filteredItems = report.items.filter(item => {
          if (!item.product) return false;
          const productId = item.product._id?.toString() || item.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...report,
          items: filteredItems
        };
      }).filter(report => report.items.length > 0); // Remove reports with no matching items
    }

    // Fetch stock data for each product and calculate totals
    const CenterStock = mongoose.model("CenterStock");

    for (const report of processedReports) {
      // Remove unnecessary fields
      delete report.packageAmount;
      delete report.onuCharges;
      delete report.installationCharges;
      delete report.shiftingAmount;
      delete report.wireChangeAmount;

      for (const item of report.items) {
        // Remove unnecessary fields
        delete item.oldStock;
        delete item.newStock;

        if (item.product && report.center) {
          try {
            const centerStock = await CenterStock.findOne({
              center: report.center._id,
              product: item.product._id,
            })
              .select("availableQuantity totalQuantity")
              .lean();

            item.currentCenterStock = centerStock
              ? {
                  availableQuantity: centerStock.availableQuantity || 0,
                  totalQuantity: centerStock.totalQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                };
          } catch (error) {
            console.error(
              `Error fetching center stock for stolen product ${item.product._id}:`,
              error
            );
            item.currentCenterStock = {
              availableQuantity: 0,
              totalQuantity: 0,
            };
          }
        } else {
          item.currentCenterStock = {
            availableQuantity: 0,
            totalQuantity: 0,
          };
        }
      }

      // Calculate total stolen quantity for this report
      report.totalStolenQuantity = report.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
    }

    // Get summary statistics
    const summaryStats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      ...(productFilterValue ? [{
        $match: {
          "items.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalReports: { $addToSet: "$_id" },
          totalItems: { $sum: 1 },
          totalStolenQuantity: { $sum: "$items.quantity" },
          byStolenFrom: {
            $push: {
              type: "$usageType",
              quantity: "$items.quantity"
            }
          }
        }
      },
      {
        $project: {
          totalReports: { $size: "$totalReports" },
          totalItems: 1,
          totalStolenQuantity: 1,
          stolenFromCenter: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$byStolenFrom",
                    as: "item",
                    cond: { $eq: ["$$item.type", "Stolen from Center"] }
                  }
                },
                as: "centerItem",
                in: "$$centerItem.quantity"
              }
            }
          },
          stolenFromField: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$byStolenFrom",
                    as: "item",
                    cond: { $eq: ["$$item.type", "Stolen from Field"] }
                  }
                },
                as: "fieldItem",
                in: "$$fieldItem.quantity"
              }
            }
          }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalReports: 0,
      totalItems: 0,
      totalStolenQuantity: 0,
      stolenFromCenter: 0,
      stolenFromField: 0
    };

    // Get status counts
    const statusCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    // Get stolen from counts
    const stolenFromCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
        },
      },
    ]);

    const stolenFromFilters = {};
    stolenFromCounts.forEach((item) => {
      stolenFromFilters[item._id] = item.count;
    });

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedReports.length : total;

    const response = {
      success: true,
      message: "Stolen stock reports retrieved successfully",
      data: processedReports,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        stolenFrom: stolenFrom || "all",
        status: status || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        createdBy: createdBy || "all",
        total: finalTotal,
        statusCounts: statusFilters,
        stolenFromCounts: stolenFromFilters,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stolen stock reports:", error);
    handleControllerError(error, res);
  }
};


// export const getProductDetailsBySerialNumber = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
//       "view_own_report",
//       "view_all_report",
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_own_report or view_all_report permission required.",
//       });
//     }

//     const {
//       page = 1,
//       limit = 50,
//       serialNumber,
//       center,
//       product,
//       status,
//       startDate,
//       endDate,
//       search,
//       sortBy = "lastUpdated",
//       sortOrder = "desc",
//     } = req.query;

//     const filter = {};

//     if (permissions.view_own_report && !permissions.view_all_report) {
//       const userCenterId = userCenter?._id || userCenter;
//       if (userCenterId) {
//         filter.center = userCenterId;
//       }
//     } else if (permissions.view_all_report && center) {
//       filter.center = center;
//     }

//     if (product) {
//       filter.product = product;
//     }

//     if (startDate || endDate) {
//       filter.lastUpdated = {};
//       if (startDate) filter.lastUpdated.$gte = new Date(startDate);
//       if (endDate) {
//         const endDateObj = new Date(endDate);
//         endDateObj.setHours(23, 59, 59, 999);
//         filter.lastUpdated.$lte = endDateObj;
//       }
//     }

//     if (search) {
//       filter["serialNumbers.serialNumber"] = { $regex: search, $options: "i" };
//     }

//     if (serialNumber) {
//       filter["serialNumbers.serialNumber"] = serialNumber;
//     }

//     if (status) {
//       filter["serialNumbers.status"] = status;
//     }

//     const populateOptions = [
//       {
//         path: "center",
//         select: "_id centerName centerCode centerType address phone",
//       },
//       {
//         path: "product",
//         select:
//           "_id productTitle productCode productPrice productImage productCategory trackSerialNumber",
//       },
//       {
//         path: "serialNumbers.purchaseId",
//         select: "_id invoiceNo purchaseDate vendor",
//         populate: {
//           path: "vendor",
//           select: "_id name",
//         },
//       },
//       {
//         path: "serialNumbers.originalOutlet",
//         select: "_id centerName centerCode centerType",
//       },
//       {
//         path: "serialNumbers.currentLocation",
//         select: "_id centerName centerCode centerType",
//       },
//       {
//         path: "serialNumbers.consumedBy",
//         select: "_id fullName email",
//       },
//     ];

//     const sort = {};
//     const validSortFields = ["lastUpdated", "createdAt", "center", "product"];
//     const actualSortBy = validSortFields.includes(sortBy)
//       ? sortBy
//       : "lastUpdated";
//     sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

//     const options = {
//       page: parseInt(page),
//       limit: parseInt(limit),
//       sort,
//     };

//     const centerStocks = await CenterStock.find(filter)
//       .sort(sort)
//       .skip((options.page - 1) * options.limit)
//       .limit(options.limit)
//       .populate(populateOptions)
//       .lean();

//     const serialDetails = [];

//     for (const centerStock of centerStocks) {
//       for (const serial of centerStock.serialNumbers) {
//         if (serialNumber && serial.serialNumber !== serialNumber) {
//           continue;
//         }
//         if (status && serial.status !== status) {
//           continue;
//         }
//         if (
//           search &&
//           !serial.serialNumber.toLowerCase().includes(search.toLowerCase())
//         ) {
//           continue;
//         }

//         let consumptionDetails = null;
//         if (serial.status === "consumed" || serial.status === "damaged") {
//           consumptionDetails = await getConsumptionDetails(serial.serialNumber);
//         }

//         const latestTransfer =
//           serial.transferHistory && serial.transferHistory.length > 0
//             ? serial.transferHistory[serial.transferHistory.length - 1]
//             : null;

//         let actionAt = "";
//         let actionType = "";
//         let actionDate = "";

//         if (latestTransfer) {
//           actionAt = latestTransfer.toCenter
//             ? `${latestTransfer.fromCenter?.centerName || "Unknown"} → ${
//                 latestTransfer.toCenter?.centerName || "Unknown"
//               }`
//             : `${latestTransfer.fromCenter?.centerName || "Unknown"}`;
//           actionType = latestTransfer.transferType || "transfer";
//           actionDate = latestTransfer.transferDate || centerStock.lastUpdated;
//         } else if (serial.consumedDate) {
//           actionAt = "Consumed";
//           actionType = "consumption";
//           actionDate = serial.consumedDate;
//         } else if (serial.status === "available") {
//           actionAt = centerStock.center.centerName;
//           actionType = "available";
//           actionDate = centerStock.lastUpdated;
//         } else {
//           actionAt = centerStock.center.centerName;
//           actionType = serial.status;
//           actionDate = centerStock.lastUpdated;
//         }

//         const serialDetail = {
//           _id: serial._id,
//           Serial: serial.serialNumber,
//           PurchaseCenter: serial.originalOutlet
//             ? {
//                 _id: serial.originalOutlet._id,
//                 name: serial.originalOutlet.centerName,
//               }
//             : "Unknown Outlet",
//           Center: centerStock.center
//             ? {
//                 _id: centerStock.center._id,
//                 name: centerStock.center.centerName,
//               }
//             : null,
//           Product: centerStock.product
//             ? {
//                 _id: centerStock.product._id,
//                 name: centerStock.product.productTitle,
//                 code: centerStock.product.productCode,
//                 price: centerStock.product.productPrice,
//               }
//             : null,
//           ProductCode: centerStock.product.productCode,
//           ProductPrice: centerStock.product.productPrice,
//           Status: serial.status,
//           CurrentLocation: serial.currentLocation
//             ? {
//                 _id: serial.currentLocation._id,
//                 name: serial.currentLocation.centerName,
//               }
//             : centerStock.center
//             ? {
//                 _id: centerStock.center._id,
//                 name: centerStock.center.centerName,
//               }
//             : null,
//           ActionDate: actionDate,
//           PurchaseInfo: serial.purchaseId
//             ? {
//                 _id: serial.purchaseId._id,
//                 invoiceNo: serial.purchaseId.invoiceNo,
//                 purchaseDate: serial.purchaseId.purchaseDate,
//                 vendor: serial.purchaseId.vendor
//                   ? {
//                       _id: serial.purchaseId.vendor._id,
//                       name: serial.purchaseId.vendor.name,
//                     }
//                   : null,
//               }
//             : null,

//           ConsumptionDetails: consumptionDetails,
//         };

//         serialDetails.push(serialDetail);
//       }
//     }

//     serialDetails.sort(
//       (a, b) => new Date(b.ActionDate) - new Date(a.ActionDate)
//     );

//     const startIndex = (options.page - 1) * options.limit;
//     const endIndex = startIndex + options.limit;
//     const paginatedSerialDetails = serialDetails.slice(startIndex, endIndex);

//     const totalCountPipeline = [
//       { $match: filter },
//       { $unwind: "$serialNumbers" },
//     ];

//     if (serialNumber) {
//       totalCountPipeline.push({
//         $match: { "serialNumbers.serialNumber": serialNumber },
//       });
//     }
//     if (status) {
//       totalCountPipeline.push({
//         $match: { "serialNumbers.status": status },
//       });
//     }
//     if (search) {
//       totalCountPipeline.push({
//         $match: {
//           "serialNumbers.serialNumber": { $regex: search, $options: "i" },
//         },
//       });
//     }

//     totalCountPipeline.push({ $count: "total" });

//     const totalResult = await CenterStock.aggregate(totalCountPipeline);
//     const total = totalResult.length > 0 ? totalResult[0].total : 0;

//     const statsPipeline = [
//       { $match: filter },
//       { $unwind: "$serialNumbers" },
//       {
//         $group: {
//           _id: "$serialNumbers.status",
//           count: { $sum: 1 },
//         },
//       },
//     ];

//     const statsResult = await CenterStock.aggregate(statsPipeline);
//     const statusStats = {};
//     statsResult.forEach((item) => {
//       statusStats[item._id] = item.count;
//     });

//     const response = {
//       success: true,
//       message: "Product details by serial number retrieved successfully",
//       data: paginatedSerialDetails,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / options.limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//       statistics: {
//         totalSerials: total,
//         statusBreakdown: statusStats,
//       },
//     };

//     res.status(200).json(response);
//   } catch (error) {
//     console.error("Error fetching product details by serial number:", error);
//     handleControllerError(error, res);
//   }
// };



export const getProductDetailsBySerialNumber = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 50,
      serialNumber,
      center,
      product,
      status,
      startDate,
      endDate,
      search,
    } = req.query;

    const filter = {};
    
    if (status === "Own Product") {
      if (req.user && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (userCenterId) {
          filter.center = userCenterId;
        }
      }
    } else if (status === "Not in Use") {
      filter["serialNumbers.status"] = { $nin: ["consumed", "damaged"] };
    } else if (status && status !== "all") {
      filter["serialNumbers.status"] = status;
    }
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center && status !== "Own Product") {
      filter.center = center;
    }

    if (product) {
      filter.product = product;
    }

    if (startDate || endDate) {
      filter.lastUpdated = {};
      if (startDate) filter.lastUpdated.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.lastUpdated.$lte = endDateObj;
      }
    }

    if (search) {
      filter["serialNumbers.serialNumber"] = { $regex: search, $options: "i" };
    }

    if (serialNumber) {
      filter["serialNumbers.serialNumber"] = serialNumber;
    }

    const totalCountPipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" },
    ];

    if (serialNumber) {
      totalCountPipeline.push({
        $match: { "serialNumbers.serialNumber": serialNumber },
      });
    }
  
    if (status && status !== "all" && status !== "Own Product" && status !== "Not in Use") {
      totalCountPipeline.push({
        $match: { "serialNumbers.status": status },
      });
    }
    
    if (status === "Not in Use") {
      totalCountPipeline.push({
        $match: { "serialNumbers.status": { $nin: ["consumed", "damaged"] } }
      });
    }
    
    if (search) {
      totalCountPipeline.push({
        $match: {
          "serialNumbers.serialNumber": { $regex: search, $options: "i" },
        },
      });
    }

    totalCountPipeline.push({ $count: "total" });

    const totalResult = await CenterStock.aggregate(totalCountPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);
    const totalPages = Math.ceil(total / itemsPerPage);
    const skip = (currentPage - 1) * itemsPerPage;

    const centerStocks = await CenterStock.find(filter)
      .populate([
        {
          path: "center",
          select: "_id centerName centerCode centerType address phone",
        },
        {
          path: "product",
          select: "_id productTitle productCode productPrice productImage productCategory trackSerialNumber",
        },
        {
          path: "serialNumbers.purchaseId",
          select: "_id invoiceNo purchaseDate vendor",
          populate: {
            path: "vendor",
            select: "_id name",
          },
        },
        {
          path: "serialNumbers.originalOutlet",
          select: "_id centerName centerCode centerType",
        },
        {
          path: "serialNumbers.currentLocation",
          select: "_id centerName centerCode centerType",
        },
        {
          path: "serialNumbers.consumedBy",
          select: "_id fullName email",
        },
      ])
      .lean();

    const serialDetails = [];

    for (const centerStock of centerStocks) {
      for (const serial of centerStock.serialNumbers) {
        if (serialNumber && serial.serialNumber !== serialNumber) {
          continue;
        }

        if (status && status !== "all" && status !== "Own Product" && status !== "Not in Use" && serial.status !== status) {
          continue;
        }
        
        if (status === "Not in Use" && (serial.status === "consumed" || serial.status === "damaged")) {
          continue;
        }
        
        if (search && !serial.serialNumber.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        let consumptionDetails = null;
        if (serial.status === "consumed" || serial.status === "damaged") {
          consumptionDetails = await getConsumptionDetails(serial.serialNumber);
        }

        const latestTransfer = serial.transferHistory && serial.transferHistory.length > 0
          ? serial.transferHistory[serial.transferHistory.length - 1]
          : null;

        let actionAt = "";
        let actionType = "";
        let actionDate = "";

        if (latestTransfer) {
          actionAt = latestTransfer.toCenter
            ? `${latestTransfer.fromCenter?.centerName || "Unknown"} → ${latestTransfer.toCenter?.centerName || "Unknown"}`
            : `${latestTransfer.fromCenter?.centerName || "Unknown"}`;
          actionType = latestTransfer.transferType || "transfer";
          actionDate = latestTransfer.transferDate || centerStock.lastUpdated;
        } else if (serial.consumedDate) {
          actionAt = "Consumed";
          actionType = "consumption";
          actionDate = serial.consumedDate;
        } else if (serial.status === "available") {
          actionAt = centerStock.center.centerName;
          actionType = "available";
          actionDate = centerStock.lastUpdated;
        } else {
          actionAt = centerStock.center.centerName;
          actionType = serial.status;
          actionDate = centerStock.lastUpdated;
        }

        const serialDetail = {
          _id: serial._id,
          Serial: serial.serialNumber,
          PurchaseCenter: serial.originalOutlet
            ? {
                _id: serial.originalOutlet._id,
                name: serial.originalOutlet.centerName,
              }
            : "Unknown Outlet",
          Center: centerStock.center
            ? {
                _id: centerStock.center._id,
                name: centerStock.center.centerName,
              }
            : null,
          Product: centerStock.product
            ? {
                _id: centerStock.product._id,
                name: centerStock.product.productTitle,
                code: centerStock.product.productCode,
                price: centerStock.product.productPrice,
              }
            : null,
          ProductCode: centerStock.product?.productCode,
          ProductPrice: centerStock.product?.productPrice,
          Status: serial.status,
          CurrentLocation: serial.currentLocation
            ? {
                _id: serial.currentLocation._id,
                name: serial.currentLocation.centerName,
              }
            : centerStock.center
            ? {
                _id: centerStock.center._id,
                name: centerStock.center.centerName,
              }
            : null,
          ActionDate: actionDate,
          PurchaseInfo: serial.purchaseId
            ? {
                _id: serial.purchaseId._id,
                invoiceNo: serial.purchaseId.invoiceNo,
                purchaseDate: serial.purchaseId.purchaseDate,
                vendor: serial.purchaseId.vendor
                  ? {
                      _id: serial.purchaseId.vendor._id,
                      name: serial.purchaseId.vendor.name,
                    }
                  : null,
              }
            : null,
          ConsumptionDetails: consumptionDetails,
        };

        serialDetails.push(serialDetail);
      }
    }

    serialDetails.sort((a, b) => new Date(b.ActionDate) - new Date(a.ActionDate));

    const paginatedSerialDetails = serialDetails.slice(skip, skip + itemsPerPage);

    const statsPipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" },
      {
        $group: {
          _id: "$serialNumbers.status",
          count: { $sum: 1 },
        },
      },
    ];

    const statsResult = await CenterStock.aggregate(statsPipeline);
    const statusStats = {};
    statsResult.forEach((item) => {
      statusStats[item._id] = item.count;
    });

    const response = {
      success: true,
      message: "Product details by serial number retrieved successfully",
      data: paginatedSerialDetails,
      pagination: {
        currentPage: currentPage,
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: itemsPerPage,
      },
      statistics: {
        totalSerials: total,
        statusBreakdown: statusStats,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching product details by serial number:", error);
    handleControllerError(error, res);
  }
};


async function getConsumptionDetails(serialNumber) {
  try {
    const stockUsage = await StockUsage.findOne({
      "items.serialNumbers": serialNumber,
      status: { $in: ["completed", "pending"] },
    })
      .populate([
        {
          path: "center",
          select: "_id centerName centerCode centerType",
        },
        {
          path: "customer",
          select: "_id name customerCode phone",
        },
        {
          path: "fromBuilding",
          select: "_id buildingName buildingCode",
        },
        {
          path: "toBuilding",
          select: "_id buildingName buildingCode",
        },
        {
          path: "fromControlRoom",
          select: "_id controlRoomName controlRoomCode",
        },
        {
          path: "createdBy",
          select: "_id fullName email",
        },
        {
          path: "approvedBy",
          select: "_id fullName email",
        },
        {
          path: "rejectedBy",
          select: "_id fullName email",
        },
        {
          path: "items.product",
          select: "_id productTitle productCode",
        },
      ])
      .lean();

    if (!stockUsage) {
      return null;
    }

    const consumedItem = stockUsage.items.find(
      (item) => item.serialNumbers && item.serialNumbers.includes(serialNumber)
    );

    if (!consumedItem) {
      return null;
    }

    return {
      usageType: stockUsage.usageType,
      usageDate: stockUsage.date,
      center: stockUsage.center
        ? {
            _id: stockUsage.center._id,
            name: stockUsage.center.centerName,
            code: stockUsage.center.centerCode,
            type: stockUsage.center.centerType,
          }
        : null,
      customer: stockUsage.customer
        ? {
            _id: stockUsage.customer._id,
            name: stockUsage.customer.name,
            code: stockUsage.customer.customerCode,
            phone: stockUsage.customer.phone,
          }
        : null,
      fromBuilding: stockUsage.fromBuilding
        ? {
            _id: stockUsage.fromBuilding._id,
            name: stockUsage.fromBuilding.buildingName,
            code: stockUsage.fromBuilding.buildingCode,
          }
        : null,
      toBuilding: stockUsage.toBuilding
        ? {
            _id: stockUsage.toBuilding._id,
            name: stockUsage.toBuilding.buildingName,
            code: stockUsage.toBuilding.buildingCode,
          }
        : null,
      fromControlRoom: stockUsage.fromControlRoom
        ? {
            _id: stockUsage.fromControlRoom._id,
            name: stockUsage.fromControlRoom.controlRoomName,
            code: stockUsage.fromControlRoom.controlRoomCode,
          }
        : null,
      connectionType: stockUsage.connectionType,
      reason: stockUsage.reason,
      remark: stockUsage.remark,
      packageAmount: stockUsage.packageAmount,
      packageDuration: stockUsage.packageDuration,
      onuCharges: stockUsage.onuCharges,
      installationCharges: stockUsage.installationCharges,
      shiftingAmount: stockUsage.shiftingAmount,
      wireChangeAmount: stockUsage.wireChangeAmount,
      status: stockUsage.status,
      createdBy: stockUsage.createdBy
        ? {
            _id: stockUsage.createdBy._id,
            name: stockUsage.createdBy.fullName,
            email: stockUsage.createdBy.email,
          }
        : null,
      approvedBy: stockUsage.approvedBy
        ? {
            _id: stockUsage.approvedBy._id,
            name: stockUsage.approvedBy.fullName,
            email: stockUsage.approvedBy.email,
          }
        : null,
      rejectedBy: stockUsage.rejectedBy
        ? {
            _id: stockUsage.rejectedBy._id,
            name: stockUsage.rejectedBy?.fullName,
            email: stockUsage.rejectedBy?.email,
          }
        : null,
      approvalRemark: stockUsage.approvalRemark,
      approvalDate: stockUsage.approvalDate,
      rejectionRemark: stockUsage.rejectionRemark,
      rejectionDate: stockUsage.rejectionDate,
      product: consumedItem.product
        ? {
            _id: consumedItem.product._id,
            name: consumedItem.product.productTitle,
            code: consumedItem.product.productCode,
          }
        : null,
      quantity: consumedItem.quantity,
      oldStock: consumedItem.oldStock,
      newStock: consumedItem.newStock,
      totalStock: consumedItem.totalStock,
      stockUsageId: stockUsage._id,
    };
  } catch (error) {
    console.error("Error fetching consumption details:", error);
    return null;
  }
}

// export const getONUTrackReport = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
//       "view_own_report",
//       "view_all_report",
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_own_report or view_all_report permission required.",
//       });
//     }

//     const {
//       center,
//       usageType,
//       status,
//       dateFilter,
//       startDate,
//       endDate,
//       customer,
//       search,
//       page = 1,
//       limit = 10,
//       sortBy = "date",
//       sortOrder = "desc",
//     } = req.query;

//     const filter = {};

//     // 🔹 Center logic
//     if (
//       permissions.view_usage_own_center &&
//       !permissions.view_usage_all_center &&
//       userCenter
//     ) {
//       filter.center = userCenter._id || userCenter;
//     } else if (center) {
//       filter.center = center;
//     }

//     // 🔹 Filters
//     if (usageType) filter.usageType = usageType;
//     if (status) filter.status = status;
//     if (customer) filter.customer = customer;
//     if (dateFilter || startDate || endDate) {
//       filter.date = buildDateFilter(dateFilter, startDate, endDate);
//     }

//     // 🔹 Search filter
//     if (search) {
//       filter.$or = [
//         { "center.centerName": { $regex: search, $options: "i" } },
//         { "customer.name": { $regex: search, $options: "i" } },
//         { "items.product.productTitle": { $regex: search, $options: "i" } },
//       ];
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;
//     const sort = {};
//     sort[sortBy] = sortOrder === "desc" ? -1 : 1;

//     // 🔹 Fetch stock usage data
//     const stockUsage = await StockUsage.find(filter)
//       .populate({
//         path: "center",
//         select: "centerName centerCode partner area",
//         populate: [
//           { path: "partner", select: "partnerName" },
//           { path: "area", select: "areaName" },
//         ],
//       })
//       .populate("customer", "username name mobile")
//       .populate("createdBy", "name email")
//       .populate({
//         path: "items.product",
//         select: "productTitle productCode _id productPrice trackSerialNumber",
//         transform: (doc) => {
//           if (doc) {
//             return {
//               productId: doc._id,
//               productTitle: doc.productTitle,
//               productCode: doc.productCode,
//               productPrice: doc.productPrice,
//               trackSerialNumber: doc.trackSerialNumber,
//             };
//           }
//           return doc;
//         },
//       })
//       .sort(sort)
//       .skip(skip)
//       .limit(limitNum)
//       .lean();

//     // 🔹 Collect center/product combinations
//     const centerProductPairs = [];
//     stockUsage.forEach((usage) => {
//       usage.items.forEach((item) => {
//         if (item.product && item.product.productId && usage.center?._id) {
//           centerProductPairs.push({
//             center: usage.center._id.toString(),
//             product: item.product.productId.toString(),
//           });
//         }
//       });
//     });

//     // 🔹 Fetch all relevant CenterStock documents once
//     const uniquePairs = Array.from(
//       new Set(centerProductPairs.map((p) => `${p.center}_${p.product}`))
//     ).map((key) => {
//       const [center, product] = key.split("_");
//       return { center, product };
//     });

//     const centerStocks = await CenterStock.find({
//       $or: uniquePairs.map((p) => ({
//         center: p.center,
//         product: p.product,
//       })),
//     })
//       .select("center product serialNumbers.serialNumber serialNumbers.status serialNumbers.currentLocation serialNumbers.purchaseId")
//       .lean();

//     // 🔹 Build lookup map: { centerId_productId: { serialNumber: {status, currentLocation, purchaseId} } }
//     const centerStockMap = {};
//     centerStocks.forEach((cs) => {
//       const key = `${cs.center.toString()}_${cs.product.toString()}`;
//       centerStockMap[key] = {};
//       cs.serialNumbers.forEach((sn) => {
//         centerStockMap[key][sn.serialNumber] = {
//           status: sn.status,
//           currentLocation: sn.currentLocation,
//           purchaseId: sn.purchaseId,
//         };
//       });
//     });

//     // 🔹 Merge updated serial statuses into response
//     const filteredStockUsage = stockUsage.map((usage) => {
//       const updatedItems = usage.items.map((item) => {
//         const key = `${usage.center._id}_${item.product.productId}`;
//         const stockMap = centerStockMap[key] || {};

//         const updatedSerials = (item.serialNumbers || []).map((sn) => {
//           const serialData = stockMap[sn];
//           return {
//             serialNumber: sn,
//             status: serialData ? serialData.status : "unknown",
//             currentLocation: serialData ? serialData.currentLocation : null,
//             purchaseId: serialData ? serialData.purchaseId : null,
//           };
//         });

//         return { ...item, serialNumbers: updatedSerials };
//       });

//       return { ...usage, items: updatedItems };
//     });

//     // 🔹 Pagination count
//     const total = await StockUsage.countDocuments(filter);
//     const totalPages = Math.ceil(total / limitNum);

//     // 🔹 Response
//     res.json({
//       success: true,
//       data: filteredStockUsage,
//       pagination: {
//         currentPage: pageNum,
//         totalPages,
//         totalRecords: total,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//     });
//   } catch (error) {
//     console.error("Get All Stock Usage Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch stock usage data",
//       error: error.message,
//     });
//   }
// };


export const getONUTrackReport = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      center,
      usageType,
      status,
      dateFilter,
      startDate,
      endDate,
      customer,
      search,
      product,
      partner,
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // 🔹 Status filter logic
    if (status === "Own Product") {
      // Show data only for the logged-in user's center/outlet
      if (req.user && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (userCenterId) {
          filter.center = userCenterId;
        }
      }
    } else if (status === "Not in Use") {
      // Filter for serial numbers that are NOT consumed or damaged
      // This will be handled in the post-processing stage
    } else if (status && status !== "all") {
      // Handle specific status filters (consumed, damaged, etc.)
      // This will be handled in the post-processing stage
    }
    // If status is "all" or empty, show all data

    // 🔹 Center logic (only apply if not in "Own Product" mode)
    if (status !== "Own Product") {
      if (
        permissions.view_usage_own_center &&
        !permissions.view_usage_all_center &&
        userCenter
      ) {
        filter.center = userCenter._id || userCenter;
      } else if (center) {
        filter.center = center;
      }
    }

    // 🔹 Partner filter
    if (partner) {
      filter["center.partner"] = partner;
    }

    // 🔹 Product filter
    if (product) {
      filter["items.product"] = product;
    }

    // 🔹 Other filters
    if (usageType) filter.usageType = usageType;
    if (customer) filter.customer = customer;
    if (dateFilter || startDate || endDate) {
      filter.date = buildDateFilter(dateFilter, startDate, endDate);
    }

    // 🔹 Search filter
    if (search) {
      filter.$or = [
        { "center.centerName": { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "items.product.productTitle": { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } }, // Search in serial numbers
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // 🔹 Fetch stock usage data
    const stockUsage = await StockUsage.find(filter)
      .populate({
        path: "center",
        select: "centerName centerCode partner area centerType",
        populate: [
          { path: "partner", select: "partnerName" },
          { path: "area", select: "areaName" },
        ],
      })
      .populate("customer", "username name mobile")
      .populate("createdBy", "name email")
      .populate({
        path: "items.product",
        select: "productTitle productCode _id productPrice trackSerialNumber",
        transform: (doc) => {
          if (doc) {
            return {
              productId: doc._id,
              productTitle: doc.productTitle,
              productCode: doc.productCode,
              productPrice: doc.productPrice,
              trackSerialNumber: doc.trackSerialNumber,
            };
          }
          return doc;
        },
      })
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // 🔹 Collect center/product combinations
    const centerProductPairs = [];
    stockUsage.forEach((usage) => {
      usage.items.forEach((item) => {
        if (item.product && item.product.productId && usage.center?._id) {
          centerProductPairs.push({
            center: usage.center._id.toString(),
            product: item.product.productId.toString(),
          });
        }
      });
    });

    // 🔹 Fetch all relevant CenterStock documents once
    const uniquePairs = Array.from(
      new Set(centerProductPairs.map((p) => `${p.center}_${p.product}`))
    ).map((key) => {
      const [center, product] = key.split("_");
      return { center, product };
    });

    const centerStocks = await CenterStock.find({
      $or: uniquePairs.map((p) => ({
        center: p.center,
        product: p.product,
      })),
    })
      .select("center product serialNumbers.serialNumber serialNumbers.status serialNumbers.currentLocation serialNumbers.purchaseId")
      .lean();

    // 🔹 Build lookup map: { centerId_productId: { serialNumber: {status, currentLocation, purchaseId} } }
    const centerStockMap = {};
    centerStocks.forEach((cs) => {
      const key = `${cs.center.toString()}_${cs.product.toString()}`;
      centerStockMap[key] = {};
      cs.serialNumbers.forEach((sn) => {
        centerStockMap[key][sn.serialNumber] = {
          status: sn.status,
          currentLocation: sn.currentLocation,
          purchaseId: sn.purchaseId,
        };
      });
    });

    // 🔹 Merge updated serial statuses into response and apply status filters
    const filteredStockUsage = stockUsage.map((usage) => {
      const updatedItems = usage.items.map((item) => {
        const key = `${usage.center._id}_${item.product.productId}`;
        const stockMap = centerStockMap[key] || {};

        const updatedSerials = (item.serialNumbers || []).map((sn) => {
          const serialData = stockMap[sn];
          return {
            serialNumber: sn,
            status: serialData ? serialData.status : "unknown",
            currentLocation: serialData ? serialData.currentLocation : null,
            purchaseId: serialData ? serialData.purchaseId : null,
          };
        }).filter(serial => {
          // Apply status filtering
          if (status === "all" || !status) {
            return true; // Show all
          } else if (status === "consumed") {
            return serial.status === "consumed";
          } else if (status === "damaged") {
            return serial.status === "damaged";
          } else if (status === "Not in Use") {
            return serial.status !== "consumed" && serial.status !== "damaged";
          } else if (status === "Own Product") {
            return true; // Already filtered by center
          }
          return true;
        });

        return { 
          ...item, 
          serialNumbers: updatedSerials,
          // Remove item if all serials were filtered out
          hasVisibleSerials: updatedSerials.length > 0
        };
      }).filter(item => item.hasVisibleSerials); // Remove items with no visible serials

      return { 
        ...usage, 
        items: updatedItems,
        // Remove usage record if all items were filtered out
        hasVisibleItems: updatedItems.length > 0
      };
    }).filter(usage => usage.hasVisibleItems); // Remove usage records with no visible items

    // 🔹 Pagination count (we need to count after filtering)
    let total = 0;
    
    if (status && status !== "all" && status !== "Own Product") {
      // For status filters, we need to count after applying the filters
      // This is less efficient but necessary for accurate pagination
      const allStockUsage = await StockUsage.find(filter)
        .populate({
          path: "center",
          select: "centerName centerCode partner area centerType",
          populate: [
            { path: "partner", select: "partnerName" },
            { path: "area", select: "areaName" },
          ],
        })
        .populate({
          path: "items.product",
          select: "productTitle productCode _id productPrice trackSerialNumber",
        })
        .lean();

      // Apply the same filtering logic to count
      const filteredCount = allStockUsage.filter(usage => {
        const hasVisibleItems = usage.items.some(item => {
          const key = `${usage.center._id}_${item.product.productId}`;
          const stockMap = centerStockMap[key] || {};
          
          const hasVisibleSerials = (item.serialNumbers || []).some(sn => {
            const serialData = stockMap[sn];
            const serialStatus = serialData ? serialData.status : "unknown";
            
            if (status === "consumed") return serialStatus === "consumed";
            if (status === "damaged") return serialStatus === "damaged";
            if (status === "Not in Use") return serialStatus !== "consumed" && serialStatus !== "damaged";
            return true;
          });
          
          return hasVisibleSerials;
        });
        
        return hasVisibleItems;
      }).length;
      
      total = filteredCount;
    } else {
      // For "all" or "Own Product" status, we can use the original count
      total = await StockUsage.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / limitNum);

    // 🔹 Response
    res.json({
      success: true,
      data: filteredStockUsage,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: {
        status: status || 'all',
        product: product || '',
        partner: partner || '',
        search: search || '',
        usageType: usageType || '',
        customer: customer || ''
      }
    });
  } catch (error) {
    console.error("Get All Stock Usage Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock usage data",
      error: error.message,
    });
  }
};

export const getReplacementRecords = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      startDate,
      endDate,
      usageType,
      product,
      center,
      customerName,
      buildingName,
      statusReason,
      connectionType,
      reason,
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc"
    } = req.query;

    console.log('Received query params:', {
      center, product, startDate, endDate, usageType, connectionType
    });

    const filter = {};

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = mongoose.Types.ObjectId.isValid(center) 
        ? new mongoose.Types.ObjectId(center)
        : center;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    if (product) {
      filter.product = mongoose.Types.ObjectId.isValid(product) 
        ? new mongoose.Types.ObjectId(product)
        : product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    const validSortFields = [
      "date",
      "usageType",
      "connectionType",
      "createdAt",
      "customerName",
      "buildingName"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    const replacementRecords = await ReplacementRecord.find(filter)
      .populate("product", "productTitle productCode productCategory")
      .populate("center", "centerName centerCode centerType address phone")
      .populate("replacedBy", "name email fullName username")
      .populate("originalUsageId", "usageType remark date customer connectionType")
      .populate("entityId")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await ReplacementRecord.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    const statsPipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalQty: { $sum: "$qty" },
          totalDamageQty: { $sum: "$damageQty" },
          totalPackageAmount: { $sum: "$packageAmount" },
          totalOnuCharges: { $sum: "$onuCharges" },
          totalInstallationCharges: { $sum: "$installationCharges" },
        }
      }
    ];

    const statsResult = await ReplacementRecord.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalRecords: 0,
      totalQty: 0,
      totalDamageQty: 0,
      totalPackageAmount: 0,
      totalOnuCharges: 0,
      totalInstallationCharges: 0,
    };

    const usageTypeStats = await ReplacementRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQty: { $sum: "$qty" }
        }
      }
    ]);

    const usageTypeBreakdown = {};
    usageTypeStats.forEach(stat => {
      usageTypeBreakdown[stat._id] = {
        count: stat.count,
        totalQty: stat.totalQty
      };
    });

    const connectionTypeStats = await ReplacementRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$connectionType",
          count: { $sum: 1 }
        }
      }
    ]);

    const connectionTypeBreakdown = {};
    connectionTypeStats.forEach(stat => {
      connectionTypeBreakdown[stat._id] = stat.count;
    });

    const formattedRecords = replacementRecords.map(record => ({
      _id: record._id,
      date: record.date,
      usageType: record.usageType,
      connectionType: record.connectionType,
      reason: record.reason,
      connectionDescription: getConnectionDescription(record.connectionType, record.reason),
      packageAmount: record.packageAmount,
      packageDuration: record.packageDuration,
      onuCharges: record.onuCharges,
      installationCharges: record.installationCharges,
      product: record.product,
      replaceFor: record.replaceFor,
      replaceProductName: record.replaceProductName,
      qty: record.qty,
      damageQty: record.damageQty,
      buildingName: record.buildingName,
      customerName: record.customerName,
      mobile: record.mobile,
      statusReason: record.statusReason,
      oldSerialNumber: record.oldSerialNumber,
      newSerialNumber: record.newSerialNumber,
      center: record.center,
      replacedBy: record.replacedBy,
      originalUsage: record.originalUsageId,
      createdAt: record.createdAt
    }));

    res.json({
      success: true,
      data: formattedRecords,
      summary: {
        totalRecords: stats.totalRecords,
        totalQty: stats.totalQty,
        totalDamageQty: stats.totalDamageQty,
        totalPackageAmount: stats.totalPackageAmount,
        totalOnuCharges: stats.totalOnuCharges,
        totalInstallationCharges: stats.totalInstallationCharges,
        usageTypeBreakdown: usageTypeBreakdown,
        connectionTypeBreakdown: connectionTypeBreakdown
      },
      filters: {
        center: center || "all",
        product: product || "all",
        startDate: startDate || "none",
        endDate: endDate || "none",
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get replacement records error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch replacement records",
    });
  }
};

const getConnectionDescription = (connectionType, reason) => {
  const descriptions = {
    "NC": "New Connection",
    "Convert": "Conversion", 
    "Shifting": "Shifting",
    "Repair": "Repair"
  };
  return descriptions[connectionType] || descriptions[reason] || "Other";
};