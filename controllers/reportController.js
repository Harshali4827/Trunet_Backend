import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import StockUsage from "../models/StockUsage.js";
import mongoose from "mongoose";

const checkAvailableStockPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  console.log(userPermissions);
  const availableStockModule = userPermissions.find(
    (perm) => perm.module === "Available Stock"
  );

  if (!availableStockModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    available_stock_own_center: availableStockModule.permissions.includes(
      "available_stock_own_center"
    ),
    available_stock_all_center: availableStockModule.permissions.includes(
      "available_stock_all_center"
    ),
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

  if (permissions.available_stock_all_center) {
    return targetCenterId || user.center._id;
  }

  if (permissions.available_stock_own_center) {
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

export const getCenterAllStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      centerId,
      product,
      search,
      sortBy = "productName",
      sortOrder = "asc",
      includeSerials = false,
      lowStockThreshold = 10,
    } = req.query;

    let filter = {};

    if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (centerId) {
      filter.center = centerId;
    }

    if (product) {
      filter.product = product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const aggregationPipeline = [
      { $match: filter },
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
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$centerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          center: 1,
          product: 1,
          totalQuantity: 1,
          availableQuantity: 1,
          inTransitQuantity: 1,
          consumedQuantity: 1,
          lastUpdated: 1,
          productName: "$productDetails.productTitle",
          productCode: "$productDetails.productCode",
          productCategory: "$productDetails.category",
          trackSerialNumber: "$productDetails.trackSerialNumber",
          centerName: "$centerDetails.centerName",
          centerCode: "$centerDetails.centerCode",
          centerType: "$centerDetails.centerType",
          serialNumbers: includeSerials === "true" ? "$serialNumbers" : [],
          stockStatus: {
            $cond: {
              if: { $lt: ["$availableQuantity", lowStockThreshold] },
              then: "low_stock",
              else: {
                $cond: {
                  if: { $eq: ["$availableQuantity", 0] },
                  then: "out_of_stock",
                  else: "in_stock",
                },
              },
            },
          },
        },
      },
    ];

    if (search) {
      aggregationPipeline.unshift({
        $match: {
          $or: [
            {
              "productDetails.productTitle": { $regex: search, $options: "i" },
            },
            { "productDetails.productCode": { $regex: search, $options: "i" } },
            { "centerDetails.centerName": { $regex: search, $options: "i" } },
            { "centerDetails.centerCode": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const countPipeline = [...aggregationPipeline, { $count: "total" }];

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;
    aggregationPipeline.push({ $sort: sortConfig });

    aggregationPipeline.push({ $skip: skip }, { $limit: limitNum });

    const [stockData, countResult] = await Promise.all([
      CenterStock.aggregate(aggregationPipeline),
      CenterStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    const summaryStats = await CenterStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
          totalAvailable: { $sum: "$availableQuantity" },
          totalInTransit: { $sum: "$inTransitQuantity" },
          totalConsumed: { $sum: "$consumedQuantity" },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ["$availableQuantity", lowStockThreshold] },
                    { $gt: ["$availableQuantity", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockItems: {
            $sum: {
              $cond: [{ $eq: ["$availableQuantity", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    const summary =
      summaryStats.length > 0
        ? summaryStats[0]
        : {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalInTransit: 0,
            totalConsumed: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
          };

    let centerInfo = null;
    if (filter.center) {
      centerInfo = await Center.findById(filter.center).select(
        "centerName centerCode centerType address phone email"
      );
    } else if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      userCenter
    ) {
      centerInfo = await Center.findById(userCenter._id || userCenter).select(
        "centerName centerCode centerType address phone email"
      );
    }

    res.status(200).json({
      success: true,
      message: "Center stock data retrieved successfully",
      data: {
        stock: stockData,
        summary: {
          ...summary,
          inStockItems:
            summary.totalProducts -
            summary.lowStockItems -
            summary.outOfStockItems,
        },
        center: centerInfo,
        filters: {
          centerId: filter.center || "all",
          product: product || "all",
          search: search || "",
          lowStockThreshold: parseInt(lowStockThreshold),
        },
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          itemsPerPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving center stock:", error);
    handleControllerError(error, res);
  }
};

export const getAllAvailableProductsWithStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const { page = 1, limit = 50, search, category } = req.query;

    const user = await User.findById(req.user._id).populate(
      "center",
      "centerName centerCode centerType"
    );

    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;
    const centerType = user.center.centerType;

    const canViewAllCenters = permissions.view_all_purchase_stock;

    const productFilter = {};

    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      productFilter.category = category;
    }

    const products = await Product.find(productFilter)
      .select(
        "productTitle productCode description category productPrice trackSerialNumber productImage"
      )
      .sort({ productTitle: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalProducts = await Product.countDocuments(productFilter);

    let stockData = [];
    let centerDetails = null;

    if (centerType === "Outlet") {
      centerDetails = await Center.findById(centerId).select(
        "_id partner area centerType centerName centerCode"
      );

      const productIds = products.map((product) => product._id);

      const outletStockData = await OutletStock.find({
        outlet: centerId,
        product: { $in: productIds },
      }).select(
        "product totalQuantity availableQuantity inTransitQuantity serialNumbers"
      );

      const purchaseData = await StockPurchase.aggregate([
        {
          $match: {
            outlet: centerId,
            "products.product": { $in: productIds },
          },
        },
        {
          $unwind: "$products",
        },
        {
          $match: {
            "products.product": { $in: productIds },
          },
        },
        {
          $group: {
            _id: "$products.product",
            totalPurchased: { $sum: "$products.purchasedQuantity" },
            totalAvailable: { $sum: "$products.availableQuantity" },
            purchaseCount: { $sum: 1 },
          },
        },
      ]);

      const outletStockMap = new Map();
      outletStockData.forEach((item) => {
        outletStockMap.set(item.product.toString(), {
          currentTotalQuantity: item.totalQuantity,
          currentAvailableQuantity: item.availableQuantity,
          currentInTransitQuantity: item.inTransitQuantity,
          serialNumbersCount: item.serialNumbers.length,
          hasSerialNumbers: item.serialNumbers.length > 0,
        });
      });

      const purchaseMap = new Map();
      purchaseData.forEach((item) => {
        purchaseMap.set(item._id.toString(), {
          totalPurchased: item.totalPurchased,
          totalAvailable: item.totalAvailable,
          purchaseCount: item.purchaseCount,
        });
      });

      stockData = productIds.map((productId) => {
        const outletStock = outletStockMap.get(productId.toString());
        const purchaseInfo = purchaseMap.get(productId.toString());

        return {
          _id: productId,
          totalPurchased: purchaseInfo?.totalPurchased || 0,
          totalAvailable: purchaseInfo?.totalAvailable || 0,
          purchaseCount: purchaseInfo?.purchaseCount || 0,
          currentTotalQuantity: outletStock?.currentTotalQuantity || 0,
          currentAvailableQuantity: outletStock?.currentAvailableQuantity || 0,
          currentInTransitQuantity: outletStock?.currentInTransitQuantity || 0,
          serialNumbersCount: outletStock?.serialNumbersCount || 0,
          hasSerialNumbers: outletStock?.hasSerialNumbers || false,
        };
      });
    } else if (centerType === "Center") {
      centerDetails = await Center.findById(centerId).select(
        "_id partner area centerType centerName centerCode"
      );

      const productIds = products.map((product) => product._id);

      stockData = await CenterStock.aggregate([
        {
          $match: {
            center: centerId,
            product: { $in: productIds },
          },
        },
        {
          $group: {
            _id: "$product",
            totalQuantity: { $sum: "$totalQuantity" },
            availableQuantity: { $sum: "$availableQuantity" },
            inTransitQuantity: { $sum: "$inTransitQuantity" },
            stockEntries: { $sum: 1 },
          },
        },
      ]);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid center type",
      });
    }

    const stockMap = new Map();
    stockData.forEach((item) => {
      if (centerType === "Outlet") {
        stockMap.set(item._id.toString(), {
          totalPurchased: item.totalPurchased,
          totalAvailable: item.totalAvailable,
          purchaseCount: item.purchaseCount,
          currentTotalQuantity: item.currentTotalQuantity,
          currentAvailableQuantity: item.currentAvailableQuantity,
          currentInTransitQuantity: item.currentInTransitQuantity,
          serialNumbersCount: item.serialNumbersCount,
          hasSerialNumbers: item.hasSerialNumbers,
        });
      } else {
        stockMap.set(item._id.toString(), {
          totalQuantity: item.totalQuantity,
          availableQuantity: item.availableQuantity,
          inTransitQuantity: item.inTransitQuantity,
          stockEntries: item.stockEntries,
        });
      }
    });

    const productsWithStock = products.map((product) => {
      const productId = product._id.toString();

      if (centerType === "Outlet") {
        const stockData = stockMap.get(productId) || {
          totalPurchased: 0,
          totalAvailable: 0,
          purchaseCount: 0,
          currentTotalQuantity: 0,
          currentAvailableQuantity: 0,
          currentInTransitQuantity: 0,
          serialNumbersCount: 0,
          hasSerialNumbers: false,
        };

        const stockInfo = {
          totalPurchased: stockData.totalPurchased,
          totalAvailable: stockData.totalAvailable,
          purchaseCount: stockData.purchaseCount,

          currentTotalQuantity: stockData.currentTotalQuantity,
          currentAvailableQuantity: stockData.currentAvailableQuantity,
          currentInTransitQuantity: stockData.currentInTransitQuantity,

          serialNumbersCount: stockData.serialNumbersCount,
          hasSerialNumbers: stockData.hasSerialNumbers,

          currentStock: stockData.currentAvailableQuantity,
        };

        return {
          ...product.toObject(),
          stock: stockInfo,
        };
      } else {
        const stockData = stockMap.get(productId) || {
          totalQuantity: 0,
          availableQuantity: 0,
          inTransitQuantity: 0,
          stockEntries: 0,
        };

        const stockInfo = {
          totalQuantity: stockData.totalQuantity,
          availableQuantity: stockData.availableQuantity,
          inTransitQuantity: stockData.inTransitQuantity,
          stockEntries: stockData.stockEntries,
          currentStock: stockData.availableQuantity,
        };

        return {
          ...product.toObject(),
          stock: stockInfo,
        };
      }
    });

    const totalStockSummary = {
      totalProducts: productsWithStock.length,
      totalItemsInStock: 0,
      totalAvailableItems: 0,
      totalInTransitItems: 0,
    };

    productsWithStock.forEach((product) => {
      if (centerType === "Outlet") {
        totalStockSummary.totalItemsInStock +=
          product.stock.currentTotalQuantity;
        totalStockSummary.totalAvailableItems +=
          product.stock.currentAvailableQuantity;
        totalStockSummary.totalInTransitItems +=
          product.stock.currentInTransitQuantity;
      } else {
        totalStockSummary.totalItemsInStock += product.stock.totalQuantity;
        totalStockSummary.totalAvailableItems +=
          product.stock.availableQuantity;
        totalStockSummary.totalInTransitItems +=
          product.stock.inTransitQuantity;
      }
    });

    res.status(200).json({
      success: true,
      message: `Products with stock information retrieved successfully for ${centerType.toLowerCase()}`,
      data: productsWithStock,
      center: centerDetails,
      stockSummary: {
        centerType,
        ...totalStockSummary,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving products with stock:", error);
    handleControllerError(error, res);
  }
};

export const getStockUsageByCenter = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
       "available_stock_own_center", "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      usageType,
      status,
      product,
      sortBy = "date",
      sortOrder = "desc",
      centerId,
    } = req.query;

    let targetCenterId;

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center
    ) {
      targetCenterId = userCenter?._id || userCenter;
    } else if (permissions.view_usage_all_center && centerId) {
      targetCenterId = centerId;
    } else {
      targetCenterId = userCenter?._id || userCenter;
    }

    if (!targetCenterId) {
      return res.status(400).json({
        success: false,
        message: "Center information not available",
      });
    }

    if (permissions.view_usage_all_center && centerId) {
      const targetCenter = await Center.findById(centerId);
      if (!targetCenter) {
        return res.status(404).json({
          success: false,
          message: "Specified center not found",
        });
      }
    }

    const center = await Center.findById(targetCenterId);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    const query = { center: targetCenterId };

    if (usageType && usageType !== "all") query.usageType = usageType;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (status && status !== "all") query.status = status;
    if (product) query["items.product"] = product;

    const total = await StockUsage.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsages = await StockUsage.find(query)
      .populate("customer", "name username mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const formattedData = [];

    stockUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        let damageQty = 0;
        if (usage.usageType === "Damage" && usage.status === "completed") {
          damageQty = item.quantity;
        }

        let entityName = "N/A";
        switch (usage.usageType) {
          case "Customer":
            entityName = usage.customer?.name || "Unknown Customer";
            break;
          case "Building":
            entityName = usage.fromBuilding?.buildingName || "Unknown Building";
            break;
          case "Building to Building":
            entityName = `${usage.fromBuilding?.buildingName || "Unknown"} → ${
              usage.toBuilding?.buildingName || "Unknown"
            }`;
            break;
          case "Control Room":
            entityName =
              usage.fromControlRoom?.buildingName || "Unknown Control Room";
            break;
          default:
            entityName = usage.usageType;
        }

        formattedData.push({
          _id: usage._id,
          Date: usage.date.toLocaleDateString(),
          Type: usage.usageType,
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": damageQty,
          "New Stock": item.newStock || 0,
          Entity: entityName,
          Remark: usage.remark || "",
          Status: usage.status,
          "Created By": usage.createdBy?.name || "Unknown",
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    const summaryStats = await StockUsage.aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$usageType",
          totalUsage: { $sum: "$items.quantity" },
          totalDamage: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$usageType", "Damage"] },
                    { $eq: ["$status", "completed"] },
                  ],
                },
                "$items.quantity",
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalUsage = formattedData.reduce((sum, item) => sum + item.Qty, 0);
    const totalDamage = formattedData.reduce(
      (sum, item) => sum + item["Damage Qty"],
      0
    );

    res.status(200).json({
      success: true,
      message: "Stock usage by center retrieved successfully",
      data: formattedData,
      center: {
        id: center._id,
        name: center.centerName,
        code: center.centerCode,
        type: center.centerType,
      },
      summary: {
        totalRecords: total,
        totalUsage,
        totalDamage,
        byUsageType: summaryStats,
      },
      permissions: {
        canViewAllCenters: permissions.view_usage_all_center,
        canViewOwnCenter: permissions.view_usage_own_center,
        currentAccess: permissions.view_usage_all_center
          ? "all_centers"
          : "own_center",
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        usageType: usageType || "all",
        status: status || "all",
        product: product || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        center: centerId || "user_center",
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by center:", error);
    handleControllerError(error, res);
  }
};
