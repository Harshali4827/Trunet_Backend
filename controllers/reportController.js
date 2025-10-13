import User from "../models/User.js";
import mongoose from "mongoose";
import StockPurchase from "../models/StockPurchase.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";

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
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.outlet = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.outlet = center;
    }

    if (type) filter.type = type;
    if (vendor) filter.vendor = vendor;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: "i" };
    }

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "vendor.businessName": { $regex: search, $options: "i" } },
      ];
    }

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

    const purchases = await StockPurchase.find(filter)
      .populate("vendor", "businessName")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Stock purchases reports retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
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

    if (warehouse) {
      filter.warehouse = warehouse;
    }

    if (center && permissions.view_all_report) {
      filter.center = center;
    }

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) filter[dateField].$gte = new Date(startDate);
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

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
        { "shippingInfo.shipmentDetails": { $regex: search, $options: "i" } },
      ];
    }

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

    populateOptions.push({
      path: "products.product",
      select:
        "productTitle productPrice productCode productImage trackSerialNumber",
    });

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

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    };

    const stockRequests = await StockRequest.find(filter)
      .sort(sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate(populateOptions)
      .lean();

    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const request of stockRequests) {
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

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    const response = {
      success: true,
      message: "Stock requests retrieved successfully",
      data: stockRequests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        status: statusFilters,
        total: total,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock requests:", error);
    handleControllerError(error, res);
  }
};

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
      warehouse,
      product,
      page = 1,
      limit = 50,
    } = req.query;

    const currentDate = new Date();
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

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const filter = {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = center;
    }

    if (warehouse) {
      filter.warehouse = warehouse;
    }

    if (product) {
      filter["products.product"] = product;
    }

    const aggregationPipeline = [
      { $match: filter },

      { $unwind: "$products" },

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
          parentCenter: { $arrayElemAt: ["$warehouseDetails.centerName", 0] },
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          quantity: "$products.quantity",
          orderNumber: 1,
          status: 1,
          date: 1,
        },
      },

      {
        $group: {
          _id: {
            center: "$center",
            parentCenter: "$parentCenter",
            product: "$product",
            productCode: "$productCode",
          },
          totalQty: { $sum: "$quantity" },
          requestCount: { $sum: 1 },
          orderNumbers: { $push: "$orderNumber" },
          statuses: { $push: "$status" },
        },
      },

      {
        $project: {
          _id: 0,
          center: "$_id.center",
          parentCenter: "$_id.parentCenter",
          product: "$_id.product",
          productCode: "$_id.productCode",
          totalQty: 1,
          requestCount: 1,
          orderNumbers: 1,
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
      },
    ];

    const skip = (page - 1) * limit;
    aggregationPipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const monthlySummary = await StockRequest.aggregate(aggregationPipeline);

    const countPipeline = [
      { $match: filter },
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            center: "$center",
            warehouse: "$warehouse",
            product: "$products.product",
          },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await StockRequest.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const statsPipeline = [
      { $match: filter },
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalProductsRequested: { $sum: "$products.quantity" },
          totalRequests: { $sum: 1 },
          uniqueProducts: { $addToSet: "$products.product" },
          uniqueCenters: { $addToSet: "$center" },
        },
      },
      {
        $project: {
          totalProductsRequested: 1,
          totalRequests: 1,
          uniqueProductsCount: { $size: "$uniqueProducts" },
          uniqueCentersCount: { $size: "$uniqueCenters" },
        },
      },
    ];

    const statsResult = await StockRequest.aggregate(statsPipeline);
    const stats =
      statsResult.length > 0
        ? statsResult[0]
        : {
            totalProductsRequested: 0,
            totalRequests: 0,
            uniqueProductsCount: 0,
            uniqueCentersCount: 0,
          };

    const response = {
      success: true,
      message: `Monthly stock requests summary for ${currentMonth}/${currentYear} retrieved successfully`,
      data: monthlySummary.map((item) => ({
        Center: item.center,
        ParentCenter: item.parentCenter,
        Product: item.product,
        ProductCode: item.productCode,
        TotalQty: item.totalQty,
        RequestCount: item.requestCount,
      })),
      summary: {
        period: `${currentMonth}/${currentYear}`,
        totalProductsRequested: stats.totalProductsRequested,
        totalRequests: stats.totalRequests,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueCenters: stats.uniqueCentersCount,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
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
      status,
      page = 1,
      limit = 50,
    } = req.query;

    const currentDate = new Date();
    const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const currentYear = year ? parseInt(year) : currentDate.getFullYear();

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const filter = {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
      }
    } else if (permissions.view_all_report) {
      if (fromCenter) filter.fromCenter = fromCenter;
      if (toCenter) filter.toCenter = toCenter;
    }

    if (product) filter["products.product"] = product;
    if (status) filter.status = status;

    const aggregationPipeline = [
      { $match: filter },

      { $unwind: "$products" },

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
          toCenter: { $arrayElemAt: ["$toCenterDetails.centerName", 0] },
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
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
            toCenter: "$toCenter",
            product: "$product",
            productCode: "$productCode",
          },
          totalRequestedQty: { $sum: "$quantity" },
          totalApprovedQty: { $sum: "$approvedQuantity" },
          totalReceivedQty: { $sum: { $ifNull: ["$receivedQuantity", 0] } },
          transferCount: { $sum: 1 },
          transferNumbers: { $push: "$transferNumber" },
          statuses: { $push: "$status" },
        },
      },

      {
        $project: {
          _id: 0,
          FromCenter: "$_id.fromCenter",
          ToCenter: "$_id.toCenter",
          Product: "$_id.product",
          ProductCode: "$_id.productCode",
          TotalRequestedQty: "$totalRequestedQty",
          TotalApprovedQty: "$totalApprovedQty",
          TotalReceivedQty: "$totalReceivedQty",
          TransferCount: "$transferCount",
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
          FromCenter: 1,
          ToCenter: 1,
          Product: 1,
        },
      },
    ];

    const skip = (page - 1) * limit;
    aggregationPipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const monthlySummary = await StockTransfer.aggregate(aggregationPipeline);

    const countPipeline = [
      { $match: filter },
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            fromCenter: "$fromCenter",
            toCenter: "$toCenter",
            product: "$products.product",
          },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await StockTransfer.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const statsPipeline = [
      { $match: filter },
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalProductsTransferred: { $sum: "$products.quantity" },
          totalTransfers: { $sum: 1 },
          uniqueProducts: { $addToSet: "$products.product" },
          uniqueFromCenters: { $addToSet: "$fromCenter" },
          uniqueToCenters: { $addToSet: "$toCenter" },
        },
      },
      {
        $project: {
          totalProductsTransferred: 1,
          totalTransfers: 1,
          uniqueProductsCount: { $size: "$uniqueProducts" },
          uniqueFromCentersCount: { $size: "$uniqueFromCenters" },
          uniqueToCentersCount: { $size: "$uniqueToCenters" },
        },
      },
    ];

    const statsResult = await StockTransfer.aggregate(statsPipeline);
    const stats =
      statsResult.length > 0
        ? statsResult[0]
        : {
            totalProductsTransferred: 0,
            totalTransfers: 0,
            uniqueProductsCount: 0,
            uniqueFromCentersCount: 0,
            uniqueToCentersCount: 0,
          };

    const response = {
      success: true,
      message: `Monthly stock transfers summary for ${currentMonth}/${currentYear} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: `${currentMonth}/${currentYear}`,
        totalProductsTransferred: stats.totalProductsTransferred,
        totalTransfers: stats.totalTransfers,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueFromCenters: stats.uniqueFromCentersCount,
        uniqueToCenters: stats.uniqueToCentersCount,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
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

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
      }
    } else if (permissions.view_all_report) {
      if (fromCenter) filter.fromCenter = fromCenter;
      if (toCenter) filter.toCenter = toCenter;
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

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) filter[dateField].$gte = new Date(startDate);
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
      filter["adminApproval.approvedBy"] = approvedBy;
    }

    if (shippedBy) {
      filter["shippingInfo.shippedBy"] = shippedBy;
    }

    if (receivedBy) {
      filter["receivingInfo.receivedBy"] = receivedBy;
    }

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
      ];
    }

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

    populateOptions.push({
      path: "products.product",
      select:
        "productTitle productPrice productCode productImage trackSerialNumber",
    });

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

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    };

    const stockTransfers = await StockTransfer.find(filter)
      .sort(sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate(populateOptions)
      .lean();

    const CenterStock = mongoose.model("CenterStock");

    for (const transfer of stockTransfers) {
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

    const response = {
      success: true,
      message: "Stock transfers retrieved successfully",
      data: stockTransfers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        status: statusFilters,
        total: total,
        uniqueFromCenters: centerStats[0]?.fromCenters[0]?.total || 0,
        uniqueToCenters: centerStats[0]?.toCenters[0]?.total || 0,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock transfers:", error);
    handleControllerError(error, res);
  }
};

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
      usageType,
      product,
      status,
      page = 1,
      limit = 50,
    } = req.query;

    const currentDate = new Date();
    const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const currentYear = year ? parseInt(year) : currentDate.getFullYear();

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const filter = {
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = center;
    }

    if (usageType) filter.usageType = usageType;
    if (product) filter["items.product"] = product;
    if (status) filter.status = status;

    const aggregationPipeline = [
      { $match: filter },

      { $unwind: "$items" },

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
        },
      },

      {
        $sort: {
          Center: 1,
          UsageType: 1,
          Product: 1,
        },
      },
    ];

    const skip = (page - 1) * limit;
    aggregationPipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const monthlySummary = await StockUsage.aggregate(aggregationPipeline);

    const countPipeline = [
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            center: "$center",
            usageType: "$usageType",
            product: "$items.product",
          },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await StockUsage.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const basicStats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalProductsUsed: { $sum: "$items.quantity" },
          totalUsages: { $sum: 1 },
        },
      },
    ]);

    const usageTypeStats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
    ]);

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
        },
      },
    ]);

    const uniqueProductsResult = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
        },
      },
      { $count: "total" },
    ]);

    const uniqueCentersResult = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$center",
        },
      },
      { $count: "total" },
    ]);

    const usageTypeBreakdown = {};
    usageTypeStats.forEach((stat) => {
      usageTypeBreakdown[stat._id] = {
        count: stat.count,
        totalQuantity: stat.totalQuantity,
      };
    });

    const stats = {
      totalProductsUsed:
        basicStats.length > 0 ? basicStats[0].totalProductsUsed : 0,
      totalUsages: basicStats.length > 0 ? basicStats[0].totalUsages : 0,
      totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
      uniqueProductsCount:
        uniqueProductsResult.length > 0 ? uniqueProductsResult[0].total : 0,
      uniqueCentersCount:
        uniqueCentersResult.length > 0 ? uniqueCentersResult[0].total : 0,
      usageTypeBreakdown: usageTypeBreakdown,
    };

    const response = {
      success: true,
      message: `Monthly stock usage summary for ${currentMonth}/${currentYear} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: `${currentMonth}/${currentYear}`,
        totalProductsUsed: stats.totalProductsUsed,
        totalUsages: stats.totalUsages,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueCenters: stats.uniqueCentersCount,
        totalRevenue: stats.totalRevenue,
        usageTypeBreakdown: stats.usageTypeBreakdown,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
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

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) filter[dateField].$gte = new Date(startDate);
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
        total: total,
        totalRevenue:
          revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        totalCustomerUsages:
          revenueStats.length > 0 ? revenueStats[0].totalCustomerUsages : 0,
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

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = center;
    }

    if (stolenFrom) filter.usageType = stolenFrom;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) filter[dateField].$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter[dateField].$lte = endDateObj;
      }
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (search) {
      filter.$or = [
        { remark: { $regex: search, $options: "i" } },
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

    populateOptions.push({
      path: "items.product",
      select:
        "productTitle productPrice productCode productImage trackSerialNumber",
    });

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

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    };

    const stolenStockReports = await StockUsage.find(filter)
      .sort(sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate(populateOptions)
      .lean();

    const CenterStock = mongoose.model("CenterStock");

    for (const report of stolenStockReports) {
      delete report.packageAmount;
      delete report.onuCharges;
      delete report.installationCharges;
      delete report.shiftingAmount;
      delete report.wireChangeAmount;

      for (const item of report.items) {
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

      report.totalStolenQuantity = report.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
    }

    const total = await StockUsage.countDocuments(filter);

    const response = {
      success: true,
      message: "Stolen stock reports retrieved successfully",
      data: stolenStockReports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      statistics: {
        total: total,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stolen stock reports:", error);
    handleControllerError(error, res);
  }
};

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
      sortBy = 'lastUpdated',
      sortOrder = 'desc',
    } = req.query;

    // Build filter for CenterStock
    const filter = {};

    // Apply permission-based filtering
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = center;
    }

    // Product filter
    if (product) {
      filter.product = product;
    }

    // Date range filtering
    if (startDate || endDate) {
      filter.lastUpdated = {};
      if (startDate) filter.lastUpdated.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.lastUpdated.$lte = endDateObj;
      }
    }

    // Search functionality for serial numbers
    if (search) {
      filter['serialNumbers.serialNumber'] = { $regex: search, $options: 'i' };
    }

    // Specific serial number filter
    if (serialNumber) {
      filter['serialNumbers.serialNumber'] = serialNumber;
    }

    // Status filter for serial numbers
    if (status) {
      filter['serialNumbers.status'] = status;
    }

    // Build population options
    const populateOptions = [
      {
        path: 'center',
        select: 'centerName centerCode centerType address phone'
      },
      {
        path: 'product',
        select: 'productTitle productCode productPrice productImage productCategory trackSerialNumber'
      },
      {
        path: 'serialNumbers.purchaseId',
        select: 'invoiceNo purchaseDate vendor'
      },
      {
        path: 'serialNumbers.originalOutlet',
        select: 'centerName centerCode centerType'
      },
      {
        path: 'serialNumbers.currentLocation',
        select: 'centerName centerCode centerType'
      },
      {
        path: 'serialNumbers.consumedBy',
        select: 'fullName email'
      },
    //   {
    //     path: 'serialNumbers.transferHistory.fromCenter',
    //     select: 'centerName centerCode'
    //   },
    //   {
    //     path: 'serialNumbers.transferHistory.toCenter',
    //     select: 'centerName centerCode'
    //   }
    ];

    // Build sort object
    const sort = {};
    const validSortFields = [
      'lastUpdated', 'createdAt', 'center', 'product'
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'lastUpdated';
    sort[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort
    };

    // Find center stocks with serial numbers
    const centerStocks = await CenterStock.find(filter)
      .sort(sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate(populateOptions)
      .lean();

    // Process the data to get serial-wise details
    const serialDetails = [];

    for (const centerStock of centerStocks) {
      for (const serial of centerStock.serialNumbers) {
        // Apply additional filters at the serial level
        if (serialNumber && serial.serialNumber !== serialNumber) {
          continue;
        }
        if (status && serial.status !== status) {
          continue;
        }
        if (search && !serial.serialNumber.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        // Get the latest action from transfer history
        const latestTransfer = serial.transferHistory && serial.transferHistory.length > 0 
          ? serial.transferHistory[serial.transferHistory.length - 1]
          : null;

        // Determine the action details
        let actionAt = '';
        let actionType = '';
        let actionDate = '';

        if (latestTransfer) {
          actionAt = latestTransfer.toCenter ? 
            `${latestTransfer.fromCenter?.centerName || 'Unknown'} → ${latestTransfer.toCenter?.centerName || 'Unknown'}` : 
            `${latestTransfer.fromCenter?.centerName || 'Unknown'}`;
          actionType = latestTransfer.transferType || 'transfer';
          actionDate = latestTransfer.transferDate || centerStock.lastUpdated;
        } else if (serial.consumedDate) {
          actionAt = 'Consumed';
          actionType = 'consumption';
          actionDate = serial.consumedDate;
        } else if (serial.status === 'available') {
          actionAt = centerStock.center.centerName;
          actionType = 'available';
          actionDate = centerStock.lastUpdated;
        } else {
          actionAt = centerStock.center.centerName;
          actionType = serial.status;
          actionDate = centerStock.lastUpdated;
        }

        // Create the serial detail object
        const serialDetail = {
          Serial: serial.serialNumber,
          PurchaseCenter: serial.originalOutlet?.centerName || 'Unknown Outlet',
          Center: centerStock.center.centerName,
          Product: centerStock.product.productTitle,
          ProductCode: centerStock.product.productCode,
          ProductPrice: centerStock.product.productPrice,
          Status: serial.status,
          CurrentLocation: serial.currentLocation?.centerName || centerStock.center.centerName,
          ActionDate: actionDate,
          PurchaseInfo: serial.purchaseId ? {
            invoiceNo: serial.purchaseId.invoiceNo,
            purchaseDate: serial.purchaseId.purchaseDate,
            vendor: serial.purchaseId.vendor
          } : null,
         
        
        };

        serialDetails.push(serialDetail);
      }
    }

    // Sort serial details by ActionDate (most recent first)
    serialDetails.sort((a, b) => new Date(b.ActionDate) - new Date(a.ActionDate));

    // Apply pagination to serial details
    const startIndex = (options.page - 1) * options.limit;
    const endIndex = startIndex + options.limit;
    const paginatedSerialDetails = serialDetails.slice(startIndex, endIndex);

    // Get total count for pagination (count of serial numbers, not center stocks)
    const totalCountPipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" }
    ];

    // Add serial-level filters to count pipeline
    if (serialNumber) {
      totalCountPipeline.push({
        $match: { "serialNumbers.serialNumber": serialNumber }
      });
    }
    if (status) {
      totalCountPipeline.push({
        $match: { "serialNumbers.status": status }
      });
    }
    if (search) {
      totalCountPipeline.push({
        $match: { "serialNumbers.serialNumber": { $regex: search, $options: 'i' } }
      });
    }

    totalCountPipeline.push({ $count: "total" });

    const totalResult = await CenterStock.aggregate(totalCountPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    // Get statistics
    const statsPipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" },
      {
        $group: {
          _id: "$serialNumbers.status",
          count: { $sum: 1 }
        }
      }
    ];

    const statsResult = await CenterStock.aggregate(statsPipeline);
    const statusStats = {};
    statsResult.forEach(item => {
      statusStats[item._id] = item.count;
    });

    // Response data
    const response = {
      success: true,
      message: "Product details by serial number retrieved successfully",
      data: paginatedSerialDetails,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      statistics: {
        totalSerials: total,
        statusBreakdown: statusStats
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching product details by serial number:', error);
    handleControllerError(error, res);
  }
};