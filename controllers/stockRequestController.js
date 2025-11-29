import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockPurchase from "../models/StockPurchase.js";
import CenterStock from "../models/CenterStock.js";
import mongoose from "mongoose";

const checkStockRequestPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const indentModule = userPermissions.find((perm) => perm.module === "Indent");

  if (!indentModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_indent: indentModule.permissions.includes("manage_indent"),
    indent_all_center: indentModule.permissions.includes("indent_all_center"),
    indent_own_center: indentModule.permissions.includes("indent_own_center"),
    delete_indent_all_center: indentModule.permissions.includes(
      "delete_indent_all_center"
    ),
    delete_indent_own_center: indentModule.permissions.includes(
      "delete_indent_own_center"
    ),
    stock_transfer_approve_from_outlet: indentModule.permissions.includes(
      "stock_transfer_approve_from_outlet"
    ),
    complete_indent: indentModule.permissions.includes("complete_indent"),
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

const checkCenterAccess = (stockRequest, userCenter, permissions) => {
  if (permissions.indent_all_center) {
    return true;
  }

  if (permissions.indent_own_center && userCenter) {
    const userCenterId = userCenter._id || userCenter;
    const requestCenterId = stockRequest.center._id || stockRequest.center;
    return userCenterId.toString() === requestCenterId.toString();
  }

  return false;
};



const getOutletStockForRequests = async (warehouseId, productIds) => {
  try {
    const OutletStock = mongoose.model("OutletStock");
    
    const outletStockData = await OutletStock.find({
      outlet: warehouseId,
      product: { $in: productIds }
    }).select("product totalQuantity availableQuantity inTransitQuantity serialNumbers");
    const outletStockMap = new Map();
    outletStockData.forEach((item) => {
      outletStockMap.set(item.product.toString(), {
        totalQuantity: item.totalQuantity,
        availableQuantity: item.availableQuantity,
        inTransitQuantity: item.inTransitQuantity,
        serialNumbersCount: item.serialNumbers.length,
        hasSerialNumbers: item.serialNumbers.length > 0,
        availableSerials: item.serialNumbers
          .filter(sn => sn.status === "available")
          .map(sn => sn.serialNumber)
      });
    });

    return outletStockMap;
  } catch (error) {
    console.error("Error fetching outlet stock for requests:", error);
    throw error;
  }
};


export const createStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions } = checkStockRequestPermissions(req, [
      "manage_indent",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }
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

    if (permissions.indent_own_center && !permissions.indent_all_center) {
      const userCenterId = user.center._id || user.center;
    }

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
      centerChallanApproval: "pending",
      warehouseChallanApproval: "pending",
      createdBy: req.user.id,
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
      .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
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

const getDateRange = (rangeType, customStartDate, customEndDate) => {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  switch (rangeType) {
    case "Today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Yesterday":
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Week":
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Week":
      start.setDate(now.getDate() - now.getDay() - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - now.getDay() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Year":
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear() - 1, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case "Custom":
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) end = new Date(customEndDate);
      break;
    default:
      return null;
  }

  return { start, end };
};

const buildArrayFilter = (value) => {
  if (!value) return null;
  return value.includes(",")
    ? { $in: value.split(",").map((item) => item.trim()) }
    : value;
};

const buildDateFilter = (
  dateFilter,
  customStartDate,
  customEndDate,
  startDate,
  endDate
) => {
  if (dateFilter) {
    const dateRange = getDateRange(dateFilter, customStartDate, customEndDate);
    if (dateRange) {
      return {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }
  }

  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    return dateFilter;
  }

  return null;
};

const getBulkCenterStock = async (requests) => {
  const centerProductMap = new Map();

  requests.forEach((request) => {
    if (!request.center?._id) return;

    const centerId = request.center._id.toString();
    const productIds = request.products
      .map((p) => p.product?._id)
      .filter(Boolean);

    if (productIds.length > 0) {
      centerProductMap.set(centerId, [
        ...(centerProductMap.get(centerId) || []),
        ...productIds,
      ]);
    }
  });

  const centerStocks = await StockPurchase.aggregate([
    {
      $match: {
        center: {
          $in: Array.from(centerProductMap.keys()).map(
            (id) => new mongoose.Types.ObjectId(id)
          ),
        },
      },
    },
    {
      $group: {
        _id: {
          center: "$center",
          product: "$product",
        },
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  const stockMap = new Map();
  centerStocks.forEach((stock) => {
    const key = `${stock._id.center}_${stock._id.product}`;
    stockMap.set(key, stock.totalQuantity);
  });

  return stockMap;
};

const buildFilter = (query) => {
  const {
    status,
    center,
    outlet,
    warehouse,
    startDate,
    endDate,
    createdAtStart,
    createdAtEnd,
    orderNumber,
    search,
    dateFilter,
    customStartDate,
    customEndDate,
  } = query;

  const filter = {};

  const statusFilter = buildArrayFilter(status);
  if (statusFilter) filter.status = statusFilter;

  const centerFilter = buildArrayFilter(center);
  if (centerFilter) {
    if (Array.isArray(centerFilter.$in)) {
      filter.center = { 
        $in: centerFilter.$in.map(id => 
          mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        )
      };
    } else if (mongoose.Types.ObjectId.isValid(centerFilter)) {
      filter.center = new mongoose.Types.ObjectId(centerFilter);
    } else {
      filter.center = centerFilter;
    }
  }

  const warehouseParam = outlet || warehouse;
  if (warehouseParam) {
    const warehouseFilter = buildArrayFilter(warehouseParam);
    if (warehouseFilter) {
      if (Array.isArray(warehouseFilter.$in)) {
        filter.warehouse = { 
          $in: warehouseFilter.$in.map(id => 
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          )
        };
      } else if (mongoose.Types.ObjectId.isValid(warehouseFilter)) {
        filter.warehouse = new mongoose.Types.ObjectId(warehouseFilter);
      } else {
        filter.warehouse = warehouseFilter;
      }
    }
  }

  const dateFilterObj = buildDateFilter(
    dateFilter,
    customStartDate,
    customEndDate,
    startDate,
    endDate
  );
  if (dateFilterObj) filter.date = dateFilterObj;
  if (createdAtStart || createdAtEnd) {
    filter.createdAt = {};
    if (createdAtStart) filter.createdAt.$gte = new Date(createdAtStart);
    if (createdAtEnd) filter.createdAt.$lte = new Date(createdAtEnd);
  }

  const orderNumberFilter = buildArrayFilter(orderNumber);
  if (orderNumberFilter) {
    filter.orderNumber =
      typeof orderNumberFilter === "object"
        ? orderNumberFilter
        : { $regex: orderNumberFilter, $options: "i" };
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

  console.log('Final filter:', JSON.stringify(filter, null, 2));
  return filter;
};

const buildSortOptions = (sortBy = "createdAt", sortOrder = "desc") => {
  const validSortFields = [
    "challanNo",
    "challanDate",
    "createdAt",
    "updatedAt",
    "date",
    "orderNumber",
    "status",
    "approvalInfo.approvedAt",
    "shippingInfo.shippedAt",
    "receivingInfo.receivedAt",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

const populateOptions = [
  { path: "warehouse", select: "_id centerName centerCode centerType" },
  { path: "center", select: "_id centerName centerCode centerType",
    populate: {
      path: "reseller",
      select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state "
    },
    populate: {
      path: "area",
      select: "_id areaName"
    }
   },
  {
    path: "products.product",
    select: "_id productTitle productCode productPrice salePrice hsnCode",
  },
  { path: "createdBy", select: "_id fullName email" },
  { path: "updatedBy", select: "_id fullName email" },
  { path: "approvalInfo.approvedBy", select: "_id fullName email" },
  { path: "approvalInfo.warehouseChallanApprovedBy", select: "_id fullName email" },
  { path: "approvalInfo.centerChallanApprovedBy", select: "_id fullName email" },
  { path: "shippingInfo.shippedBy", select: "_id fullName email" },
  { path: "receivingInfo.receivedBy", select: "_id fullName email" },
  { path: "completionInfo.completedBy", select: "_id fullName email" },
  { path: "completionInfo.incompleteBy", select: "_id fullName email" },

];

// export const getAllStockRequests = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }
//     const {
//       page = 1,
//       limit = 100,
//       sortBy = "createdAt",
//       sortOrder = "desc",
//       ...filterParams
//     } = req.query;

//     const filter = buildFilter(filterParams);

//     if (
//       permissions.indent_own_center &&
//       !permissions.indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//       filter.center = userCenterId;
//     }

//     const sortOptions = buildSortOptions(sortBy, sortOrder);

//     const [stockRequests, total, statusCounts] = await Promise.all([
//       StockRequest.find(filter)
//         .populate(populateOptions)
//         .sort(sortOptions)
//         .limit(parseInt(limit))
//         .skip((parseInt(page) - 1) * parseInt(limit))
//         .lean(),

//       StockRequest.countDocuments(filter),

//       StockRequest.aggregate([
//         { $match: filter },
//         { $group: { _id: "$status", count: { $sum: 1 } } },
//       ]),
//     ]);

//     if (stockRequests.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No stock requests found",
//         data: [],
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages: 0,
//           totalItems: 0,
//           itemsPerPage: parseInt(limit),
//         },
//         filters: { status: {}, total: 0 },
//       });
//     }

//     const stockMap = await getBulkCenterStock(stockRequests);

//     const stockRequestsWithCenterStock = stockRequests.map((request) => {
//       const productsWithStock = request.products.map((product) => {
//         if (!product.product?._id || !request.center?._id) return product;

//         const stockKey = `${request.center._id}_${product.product._id}`;
//         const centerStockQuantity = stockMap.get(stockKey) || 0;

//         return {
//           ...product,
//           centerStockQuantity,
//         };
//       });

//       return {
//         ...request,
//         products: productsWithStock,
//       };
//     });

//     const statusStats = statusCounts.reduce((acc, stat) => {
//       acc[stat._id] = stat.count;
//       return acc;
//     }, {});

//     res.status(200).json({
//       success: true,
//       message: "Stock requests retrieved successfully",
//       data: stockRequestsWithCenterStock,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//       filters: {
//         status: statusStats,
//         total: total,
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving stock requests:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock requests",
//       error: error.message,
//     });
//   }
// };



//added reseller filter

export const getAllStockRequests = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }
    
    const {
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
      ...filterParams
    } = req.query;

    let filter = buildFilter(filterParams);

    if (filterParams.reseller) {
      const resellerFilter = buildArrayFilter(filterParams.reseller);
      let centerFilter = {};
      
      if (resellerFilter) {
        if (Array.isArray(resellerFilter.$in)) {
          centerFilter.reseller = { 
            $in: resellerFilter.$in.map(id => 
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            )
          };
        } else if (mongoose.Types.ObjectId.isValid(resellerFilter)) {
          centerFilter.reseller = new mongoose.Types.ObjectId(resellerFilter);
        } else {
          centerFilter.reseller = resellerFilter;
        }

        const matchingCenters = await Center.find(centerFilter).select('_id');
        const centerIds = matchingCenters.map(center => center._id);

        if (centerIds.length > 0) {
          if (filter.center) {
            if (filter.center.$in) {
              filter.center.$in = filter.center.$in.filter(centerId => 
                centerIds.some(matchingId => matchingId.toString() === centerId.toString())
              );
            } else {
    
              if (!centerIds.some(id => id.toString() === filter.center.toString())) {
                filter.center = { $in: [] };
              }
            }
          } else {
            filter.center = { $in: centerIds };
          }
        } else {
          filter.center = { $in: [] };
        }
      }
    }

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (filter.center) {
        if (filter.center.$in) {
          filter.center.$in = filter.center.$in.filter(centerId => 
            centerId.toString() === userCenterId.toString()
          );
        } else {
          if (filter.center.toString() !== userCenterId.toString()) {
            filter.center = { $in: [] };
          }
        }
      } else {
        filter.center = userCenterId;
      }
    }

    const sortOptions = buildSortOptions(sortBy, sortOrder);

    console.log('Final filter for query:', JSON.stringify(filter, null, 2));

    const [stockRequests, total, statusCounts] = await Promise.all([
      StockRequest.find(filter)
        .populate(populateOptions)
        .sort(sortOptions)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),

      StockRequest.countDocuments(filter),

      StockRequest.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    if (stockRequests.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No stock requests found",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit),
        },
        filters: { status: {}, total: 0 },
      });
    }

    const stockMap = await getBulkCenterStock(stockRequests);

    const stockRequestsWithCenterStock = stockRequests.map((request) => {
      const productsWithStock = request.products.map((product) => {
        if (!product.product?._id || !request.center?._id) return product;

        const stockKey = `${request.center._id}_${product.product._id}`;
        const centerStockQuantity = stockMap.get(stockKey) || 0;

        return {
          ...product,
          centerStockQuantity,
        };
      });

      return {
        ...request,
        products: productsWithStock,
      };
    });

    const statusStats = statusCounts.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

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

// export const getStockRequestById = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }

//     const { id } = req.params;

//     const stockRequest = await StockRequest.findById(id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       // .populate("center", "_id centerName centerCode centerType")
//       .populate({
//         path: "center",
//         select: "_id centerName centerCode centerType",
//         populate: [
//           {
//             path: "reseller",
//             select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state"
//           },
//           {
//             path: "area",
//             select: "_id areaName"
//           }
//         ]
//       })
//       .populate(
//         "products.product",
//         "_id productTitle productCode productImage trackSerialNumber"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
//       .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email")
//       .populate("completionInfo.incompleteBy", "_id fullName email")
//       .lean();

//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only view stock requests from your own center.",
//       });
//     }

//     const productIds = stockRequest.products.map((p) => p.product._id);

//     const centerStock = await StockPurchase.aggregate([
//       {
//         $match: {
//           center: stockRequest.center._id,
//           product: { $in: productIds },
//         },
//       },
//       {
//         $group: {
//           _id: "$product",
//           totalQuantity: { $sum: "$quantity" },
//         },
//       },
//     ]);

//     const centerStockMap = {};
//     centerStock.forEach((stock) => {
//       centerStockMap[stock._id.toString()] = stock.totalQuantity;
//     });

//     const productsWithEnhancedData = stockRequest.products.map((product) => ({
//       ...product,
//       centerStockQuantity: centerStockMap[product.product._id.toString()] || 0,

//       approvedSerials: product.approvedSerials || [],
//       serialNumbers: product.serialNumbers || [],
//       transferredSerials: product.transferredSerials || [],

//       serialSummary: {
//         approvedCount: product.approvedSerials?.length || 0,
//         transferredCount: product.transferredSerials?.length || 0,
//         requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
//       },
//     }));

//     const stockRequestWithEnhancedData = {
//       ...stockRequest,
//       products: productsWithEnhancedData,
//     };

//     res.status(200).json({
//       success: true,
//       message: "Stock request retrieved successfully",
//       data: stockRequestWithEnhancedData,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     console.error("Error retrieving stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock request",
//       error: error.message,
//     });
//   }
// };


//fetch stock quantity


export const getStockRequestById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate({
        path: "center",
        select: "_id centerName centerCode centerType",
        populate: [
          {
            path: "reseller",
            select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state"
          },
          {
            path: "area",
            select: "_id areaName"
          }
        ]
      })
      .populate(
        "products.product",
        "_id productTitle productCode productImage trackSerialNumber"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
      .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .populate("rejectionInfo.rejectedBy", "_id fullName email")
      .lean();

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only view stock requests from your own center.",
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

    const outletStockMap = await getOutletStockForRequests(
      stockRequest.warehouse._id,
      productIds
    );

    const productsWithEnhancedData = stockRequest.products.map((product) => {
      const outletStock = outletStockMap.get(product.product._id.toString()) || {
        totalQuantity: 0,
        availableQuantity: 0,
        inTransitQuantity: 0,
      };

      return {
        ...product,
        centerStockQuantity: centerStockMap[product.product._id.toString()] || 0,
        outletStock: {
          totalQuantity: outletStock.totalQuantity,
          availableQuantity: outletStock.availableQuantity,
          inTransitQuantity: outletStock.inTransitQuantity,
        },
        approvedSerials: product.approvedSerials || [],
        serialNumbers: product.serialNumbers || [],
        transferredSerials: product.transferredSerials || [],
        serialSummary: {
          approvedCount: product.approvedSerials?.length || 0,
          transferredCount: product.transferredSerials?.length || 0,
          requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
        },
      };
    });

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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

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
      rejectionReason, 
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(existingRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only manage stock requests from your own center.",
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

    // if (status === "Rejected" && existingRequest.status !== "Rejected") {
    //   await revertStockForRejectedRequest(existingRequest);
    // }

    // Handle rejection with reason separately
    if (status === "Rejected" && existingRequest.status !== "Rejected") {
      if (!rejectionReason || rejectionReason.trim() === '') {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required when rejecting a stock request",
        });
      }

      await revertStockForRejectedRequest(existingRequest);
      // Add rejection info separately (not in completionInfo)
      updateData.rejectionInfo = {
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: rejectionReason.trim(),
      };
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
          // updateData.completionInfo = {
          //   ...existingRequest.completionInfo,
          //   incompleteOn: currentDate,
          //   incompleteBy: userId,
          //   ...completionInfo,
          // };
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
      .populate("completionInfo.incompleteBy", "_id fullName email")
      .populate("rejectionInfo.rejectedBy", "_id fullName email"); 
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

async function revertStockForRejectedRequest(stockRequest) {
  try {
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const productItem of stockRequest.products) {
      if (
        productItem.approvedSerials &&
        productItem.approvedSerials.length > 0
      ) {
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: productItem.product,
        });

        if (outletStock) {
          let revertedCount = 0;

          for (const serialNumber of productItem.approvedSerials) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (serial.status === "in_transit") {
                serial.status = "available";
                serial.currentLocation = stockRequest.warehouse;

                if (serial.transferHistory.length > 0) {
                  const lastTransfer =
                    serial.transferHistory[serial.transferHistory.length - 1];
                  if (lastTransfer.status === "in_transit") {
                    serial.transferHistory.pop();
                  }
                }

                revertedCount++;
                console.log(
                  `Reverted serial ${serialNumber} back to available status due to request rejection`
                );
              } else if (serial.status === "transferred") {
                serial.status = "available";
                serial.currentLocation = stockRequest.warehouse;

                serial.transferHistory = serial.transferHistory.filter(
                  (transfer) =>
                    transfer.toCenter?.toString() !==
                    stockRequest.center.toString()
                );

                revertedCount++;
                console.log(
                  `Reverted transferred serial ${serialNumber} back to available status due to request rejection`
                );
              }
            }
          }

          if (revertedCount > 0) {
            outletStock.availableQuantity += revertedCount;

            const inTransitSerials = productItem.approvedSerials.filter(
              (serialNumber) => {
                const serial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                return serial && serial.status === "in_transit";
              }
            );

            outletStock.inTransitQuantity -= inTransitSerials.length;

            const transferredSerials = productItem.approvedSerials.filter(
              (serialNumber) => {
                const serial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                return serial && serial.status === "transferred";
              }
            );

            outletStock.totalQuantity += transferredSerials.length;

            await outletStock.save();
            console.log(
              `Reverted ${revertedCount} items back to available for product ${productItem.product} due to request rejection`
            );

            if (transferredSerials.length > 0) {
              const centerStock = await CenterStock.findOne({
                center: stockRequest.center,
                product: productItem.product,
              });

              if (centerStock) {
                centerStock.serialNumbers = centerStock.serialNumbers.filter(
                  (sn) => !transferredSerials.includes(sn.serialNumber)
                );

                centerStock.totalQuantity -= transferredSerials.length;
                centerStock.availableQuantity -= transferredSerials.length;

                await centerStock.save();
                console.log(
                  `Removed ${transferredSerials.length} items from center stock for product ${productItem.product} due to request rejection`
                );
              }
            }
          }
        }
      }
    }

    stockRequest.products = stockRequest.products.map((productItem) => ({
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

export const deleteStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["delete_indent_all_center", "delete_indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. delete_indent_own_center or delete_indent_all_center permission required.",
      });
    }

    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (
      permissions.delete_indent_own_center &&
      !permissions.delete_indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      const requestCenterId = stockRequest.center._id || stockRequest.center;
      if (userCenterId.toString() !== requestCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete stock requests from your own center.",
        });
      }
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
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["stock_transfer_approve_from_outlet", "manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only approve stock requests from your own center.",
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
//       const Product = mongoose.model("Product");

//       for (const approval of productApprovals) {
//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === approval.productId.toString()
//         );

//         if (!productItem) {
//           return res.status(400).json({
//             success: false,
//             message: `Product ${approval.productId} not found in stock request`,
//           });
//         }

//         if (
//           approval.approvedQuantity === undefined ||
//           approval.approvedQuantity === null
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity is required for product ${productItem.product}`,
//           });
//         }

//         if (
//           typeof approval.approvedQuantity !== "number" ||
//           isNaN(approval.approvedQuantity)
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity must be a valid number for product ${productItem.product}`,
//           });
//         }

//         if (approval.approvedQuantity < 0) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity cannot be negative for product ${productItem.product}`,
//           });
//         }

//         if (approval.approvedQuantity > productItem.quantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${productItem.product}`,
//           });
//         }

//         if (
//           approval.approvedQuantity === 0 &&
//           (!approval.approvedRemark || approval.approvedRemark.trim() === "")
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
//           });
//         }

//         const productDoc = await Product.findById(approval.productId);
//         const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//         if (tracksSerialNumbers) {
//           if (approval.approvedQuantity > 0) {
//             if (
//               !approval.approvedSerials ||
//               approval.approvedSerials.length === 0
//             ) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers and approved quantity is greater than zero`,
//               });
//             }

//             if (approval.approvedSerials.length !== approval.approvedQuantity) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
//               });
//             }

//             const uniqueSerials = new Set(approval.approvedSerials);
//             if (uniqueSerials.size !== approval.approvedSerials.length) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
//               });
//             }
//           } else {
//             if (
//               approval.approvedSerials &&
//               approval.approvedSerials.length > 0
//             ) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
//               });
//             }
//           }
//         } else {
//           if (approval.approvedSerials && approval.approvedSerials.length > 0) {
//             return res.status(400).json({
//               success: false,
//               message: `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
//             });
//           }
//         }
//       }

//       const productApprovalsWithQuantity = productApprovals.filter(
//         (pa) => pa.approvedQuantity > 0
//       );

//       if (productApprovalsWithQuantity.length > 0) {
//         const validationResults = await stockRequest.validateSerialNumbers(
//           productApprovalsWithQuantity
//         );
//         const invalidResults = validationResults.filter(
//           (result) => !result.valid
//         );

//         if (invalidResults.length > 0) {
//           return res.status(400).json({
//             success: false,
//             message: "Serial number validation failed",
//             validationErrors: invalidResults.map((result) => ({
//               productId: result.productId,
//               productName: result.productName,
//               error: result.error,
//             })),
//           });
//         }
//       }
//     }

//     if (productApprovals && productApprovals.length > 0) {
//       const OutletStock = mongoose.model("OutletStock");

//       for (const approval of productApprovals) {
//         if (
//           approval.approvedQuantity > 0 &&
//           approval.approvedSerials &&
//           approval.approvedSerials.length > 0
//         ) {
//           const outletStock = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: approval.productId,
//           });

//           if (outletStock) {
//             for (const serialNumber of approval.approvedSerials) {
//               const serial = outletStock.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber
//               );

//               if (serial && serial.status === "available") {
//                 serial.status = "in_transit";
//                 serial.currentLocation = stockRequest.warehouse;

//                 serial.transferHistory.push({
//                   fromCenter: stockRequest.warehouse,
//                   toCenter: stockRequest.center,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_center",
//                   status: "in_transit",
//                 });
//               }
//             }

//             const inTransitCount = approval.approvedSerials.length;
//             outletStock.availableQuantity -= inTransitCount;
//             outletStock.inTransitQuantity += inTransitCount;

//             await outletStock.save();
//           }
//         }
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
//       message:
//         "Stock request approved successfully and stock marked as in transit",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error approving stock request:", error);

//     if (
//       error.message.includes("Number of serial numbers") ||
//       error.message.includes("Duplicate serial numbers") ||
//       error.message.includes("serial numbers not available") ||
//       error.message.includes("Approved quantity") ||
//       error.message.includes("Serial numbers are required") ||
//       error.message.includes("Serial numbers should not be provided") ||
//       error.message.includes("Approved quantity is required") ||
//       error.message.includes("Approved quantity must be a valid number") ||
//       error.message.includes("Approved quantity cannot be negative") ||
//       error.message.includes("Approval remark is required")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }
    
//       // Handle duplicate challan number error
//       if (error.code === 11000 && error.keyPattern && error.keyPattern.challanNo) {
//         return res.status(400).json({
//           success: false,
//           message: "Duplicate challan number generated. Please try again.",
//           error: "Challan number conflict",
//         });
//       }

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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["stock_transfer_approve_from_outlet", "manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only approve stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    // NEW VALIDATION: Check if outlet has sufficient stock before approval
    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    // Validate product approvals and check stock availability
    if (productApprovals && productApprovals.length > 0) {
      for (const approval of productApprovals) {
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === approval.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${approval.productId} not found in stock request`,
          });
        }

        // Validate approved quantity
        if (
          approval.approvedQuantity === undefined ||
          approval.approvedQuantity === null
        ) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity is required for product ${productItem.product}`,
          });
        }

        if (
          typeof approval.approvedQuantity !== "number" ||
          isNaN(approval.approvedQuantity)
        ) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity must be a valid number for product ${productItem.product}`,
          });
        }

        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity cannot be negative for product ${productItem.product}`,
          });
        }

        if (approval.approvedQuantity > productItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${productItem.product}`,
          });
        }

        if (
          approval.approvedQuantity === 0 &&
          (!approval.approvedRemark || approval.approvedRemark.trim() === "")
        ) {
          return res.status(400).json({
            success: false,
            message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
          });
        }

        // NEW: Check outlet stock availability
      //   if (approval.approvedQuantity > 0) {
      //     const productDoc = await Product.findById(approval.productId);
      //     const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      //     // Check outlet stock
      //     const outletStock = await OutletStock.findOne({
      //       outlet: stockRequest.warehouse,
      //       product: approval.productId,
      //     });

      //     if (!outletStock) {
      //       return res.status(400).json({
      //         success: false,
      //         message: `No stock available in outlet for product ${productDoc?.productTitle || approval.productId}. Available: 0, Requested: ${approval.approvedQuantity}`,
      //       });
      //     }

      //     if (tracksSerialNumbers) {
      //       if (!approval.approvedSerials || approval.approvedSerials.length === 0) {
      //         return res.status(400).json({
      //           success: false,
      //           message: `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers`,
      //         });
      //       }

      //       if (approval.approvedSerials.length !== approval.approvedQuantity) {
      //         return res.status(400).json({
      //           success: false,
      //           message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
      //         });
      //       }
      //       const availableSerials = outletStock.validateAndGetSerials(
      //         approval.approvedSerials,
      //         stockRequest.warehouse
      //       );

      //       const unavailableSerials = approval.approvedSerials.filter(
      //         (sn) => !availableSerials.includes(sn)
      //       );

      //       if (unavailableSerials.length > 0) {
      //         return res.status(400).json({
      //           success: false,
      //           message: `Some serial numbers are not available in outlet stock for product ${productDoc.productTitle}: ${unavailableSerials.join(", ")}`,
      //           unavailableSerials,
      //           availableQuantity: outletStock.availableQuantity,
      //         });
      //       }
      //     } else {
      //       if (outletStock.availableQuantity < approval.approvedQuantity) {
      //         return res.status(400).json({
      //           success: false,
      //           message: `Insufficient stock in outlet for product ${productDoc?.productTitle || approval.productId}. Available: ${outletStock.availableQuantity}, Requested: ${approval.approvedQuantity}`,
      //           availableQuantity: outletStock.availableQuantity,
      //           requestedQuantity: approval.approvedQuantity,
      //         });
      //       }
      //       if (approval.approvedSerials && approval.approvedSerials.length > 0) {
      //         return res.status(400).json({
      //           success: false,
      //           message: `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
      //         });
      //       }
      //     }
      //   } else {
      //     const productDoc = await Product.findById(approval.productId);
      //     if (approval.approvedSerials && approval.approvedSerials.length > 0) {
      //       return res.status(400).json({
      //         success: false,
      //         message: `Serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
      //       });
      //     }
      //   }


      //added validation for approve stock request (for 0 stock in outlet)

if (approval.approvedQuantity > 0) {
  const productDoc = await Product.findById(approval.productId);
  const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

  // Check outlet stock
  const outletStock = await OutletStock.findOne({
    outlet: stockRequest.warehouse,
    product: approval.productId,
  }).populate('outlet', 'centerName');

  if (!outletStock) {
    const outlet = await Center.findById(stockRequest.warehouse).select('centerName centerCode');
    const outletName = outlet ? `${outlet.centerName}` : 'Unknown Outlet';
    
    return res.status(400).json({
      success: false,
      message: `No stock available in "${outletName}" for product "${productDoc?.productTitle || approval.productId}". Available: 0, Requested: ${approval.approvedQuantity}`,
    });
  }
  const outletName = `${outletStock.outlet.centerName}`;

  if (tracksSerialNumbers) {
    if (!approval.approvedSerials || approval.approvedSerials.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Serial numbers are required for product "${productDoc.productTitle}" as it tracks serial numbers in outlet "${outletName}"`,
      });
    }

    if (approval.approvedSerials.length !== approval.approvedQuantity) {
      return res.status(400).json({
        success: false,
        message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product "${productDoc.productTitle}" in outlet "${outletName}"`,
      });
    }
    const availableSerials = outletStock.validateAndGetSerials(
      approval.approvedSerials,
      stockRequest.warehouse
    );

    const unavailableSerials = approval.approvedSerials.filter(
      (sn) => !availableSerials.includes(sn)
    );

    if (unavailableSerials.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some serial numbers are not available in outlet "${outletName}" for product "${productDoc.productTitle}": ${unavailableSerials.join(", ")}`,
        unavailableSerials,
        availableQuantity: outletStock.availableQuantity,
        outletName: outletName,
      });
    }
  } else {
    if (outletStock.availableQuantity < approval.approvedQuantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock in outlet "${outletName}" for product "${productDoc?.productTitle || approval.productId}". Available: ${outletStock.availableQuantity}, Requested: ${approval.approvedQuantity}`,
        availableQuantity: outletStock.availableQuantity,
        requestedQuantity: approval.approvedQuantity,
        outletName: outletName,
      });
    }

    if (approval.approvedSerials && approval.approvedSerials.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Serial numbers should not be provided for product "${productDoc.productTitle}" in outlet "${outletName}" as it does not track serial numbers`,
      });
    }
  }
} else {
  const productDoc = await Product.findById(approval.productId);

  const outlet = await Center.findById(stockRequest.warehouse).select('centerName centerCode');
  const outletName = outlet ? `${outlet.centerName} (${outlet.centerCode})` : 'Unknown Outlet';
  
  if (approval.approvedSerials && approval.approvedSerials.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Serial numbers should not be provided when approved quantity is zero for product "${productDoc.productTitle}" in outlet "${outletName}"`,
    });
  }
}
}

      const productApprovalsWithQuantity = productApprovals.filter(
        (pa) => pa.approvedQuantity > 0
      );

      if (productApprovalsWithQuantity.length > 0) {
        const validationResults = await stockRequest.validateSerialNumbers(
          productApprovalsWithQuantity
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
    }

    if (productApprovals && productApprovals.length > 0) {
      const OutletStock = mongoose.model("OutletStock");

      for (const approval of productApprovals) {
        if (
          approval.approvedQuantity > 0 &&
          approval.approvedSerials &&
          approval.approvedSerials.length > 0
        ) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: approval.productId,
          });

          if (outletStock) {
            for (const serialNumber of approval.approvedSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && serial.status === "available") {
                serial.status = "in_transit";
                serial.currentLocation = stockRequest.warehouse;

                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  status: "in_transit",
                });
              }
            }

            const inTransitCount = approval.approvedSerials.length;
            outletStock.availableQuantity -= inTransitCount;
            outletStock.inTransitQuantity += inTransitCount;

            await outletStock.save();
          }
        } else if (approval.approvedQuantity > 0) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: approval.productId,
          });

          if (outletStock) {
            outletStock.availableQuantity -= approval.approvedQuantity;
            outletStock.inTransitQuantity += approval.approvedQuantity;
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
      message:
        "Stock request approved successfully and stock marked as in transit",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error approving stock request:", error);

    if (
      error.message.includes("Number of serial numbers") ||
      error.message.includes("Duplicate serial numbers") ||
      error.message.includes("serial numbers not available") ||
      error.message.includes("Approved quantity") ||
      error.message.includes("Serial numbers are required") ||
      error.message.includes("Serial numbers should not be provided") ||
      error.message.includes("Approved quantity is required") ||
      error.message.includes("Approved quantity must be a valid number") ||
      error.message.includes("Approved quantity cannot be negative") ||
      error.message.includes("Approval remark is required") ||
      error.message.includes("No stock available") ||
      error.message.includes("Insufficient stock")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

    if (error.code === 11000 && error.keyPattern && error.keyPattern.challanNo) {
      return res.status(400).json({
        success: false,
        message: "Duplicate challan number generated. Please try again.",
        error: "Challan number conflict",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

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

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only ship stock requests from your own center.",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });f
    }

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

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update shipping info for stock requests from your own center.",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only reject shipments for stock requests from your own center.",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { incompleteRemark, receivedProducts } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only mark stock requests from your own center as incomplete.",
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
      const Product = mongoose.model("Product");

      for (const receivedProduct of receivedProducts) {
        if (!receivedProduct.productId) {
          return res.status(400).json({
            success: false,
            message: "Product ID is required for each received product",
          });
        }

        if (
          receivedProduct.receivedQuantity === undefined ||
          receivedProduct.receivedQuantity === null
        ) {
          return res.status(400).json({
            success: false,
            message: `Received quantity is required for product ${receivedProduct.productId}`,
          });
        }

        if (
          typeof receivedProduct.receivedQuantity !== "number" ||
          isNaN(receivedProduct.receivedQuantity)
        ) {
          return res.status(400).json({
            success: false,
            message: `Received quantity must be a valid number for product ${receivedProduct.productId}`,
          });
        }

        if (receivedProduct.receivedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Received quantity cannot be negative for product ${receivedProduct.productId}`,
          });
        }

        if (!Number.isInteger(receivedProduct.receivedQuantity)) {
          return res.status(400).json({
            success: false,
            message: `Received quantity must be an integer for product ${receivedProduct.productId}`,
          });
        }

        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === receivedProduct.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${receivedProduct.productId} not found in stock request`,
          });
        }

        if (receivedProduct.receivedQuantity > productItem.approvedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Received quantity (${receivedProduct.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${receivedProduct.productId}`,
          });
        }

        const productDoc = await Product.findById(receivedProduct.productId);
        const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
      }

      stockRequest.products = stockRequest.products.map((productItem) => {
        const receivedProduct = receivedProducts.find(
          (rp) => rp.productId.toString() === productItem.product.toString()
        );

        if (receivedProduct) {
          return {
            ...productItem.toObject(),
            receivedQuantity: receivedProduct.receivedQuantity || 0,
            receivedRemark: receivedProduct.receivedRemark || "",
            receivedSerials: receivedProduct.receivedSerials || [],
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

    if (
      error.message.includes("Received quantity") ||
      error.message.includes("Product ID") ||
      error.message.includes("serial numbers") ||
      error.message.includes("exceed approved quantity")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productApprovals, productReceipts } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only complete incomplete stock requests from your own center.",
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

    if (
      (!productApprovals ||
        !Array.isArray(productApprovals) ||
        productApprovals.length === 0) &&
      (!productReceipts ||
        !Array.isArray(productReceipts) ||
        productReceipts.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Either product approvals or product receipts are required",
      });
    }

    const Product = mongoose.model("Product");

    if (productApprovals && productApprovals.length > 0) {
      for (const approval of productApprovals) {
        if (!approval.productId) {
          return res.status(400).json({
            success: false,
            message: "Product ID is required for each product approval",
          });
        }

        if (
          approval.approvedQuantity === undefined ||
          approval.approvedQuantity === null
        ) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity is required for product ${approval.productId}`,
          });
        }

        if (
          typeof approval.approvedQuantity !== "number" ||
          isNaN(approval.approvedQuantity)
        ) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity must be a valid number for product ${approval.productId}`,
          });
        }

        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity cannot be negative for product ${approval.productId}`,
          });
        }

        if (!Number.isInteger(approval.approvedQuantity)) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity must be an integer for product ${approval.productId}`,
          });
        }

        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === approval.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${approval.productId} not found in stock request`,
          });
        }

        if (approval.approvedQuantity > productItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${approval.productId}`,
          });
        }

        if (
          approval.approvedQuantity === 0 &&
          (!approval.approvedRemark || approval.approvedRemark.trim() === "")
        ) {
          return res.status(400).json({
            success: false,
            message: `Approval remark is required when approved quantity is zero for product ${approval.productId}`,
          });
        }

        const productDoc = await Product.findById(approval.productId);
        const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

        if (tracksSerialNumbers) {
          if (approval.approvedQuantity > 0) {
            const approvedSerials = approval.approvedSerials || [];

            if (approvedSerials.length > 0) {
              const uniqueSerials = new Set(approvedSerials);
              if (uniqueSerials.size !== approvedSerials.length) {
                return res.status(400).json({
                  success: false,
                  message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
                });
              }
            }
          } else {
            if (
              approval.approvedSerials &&
              approval.approvedSerials.length > 0
            ) {
              return res.status(400).json({
                success: false,
                message: `Approved serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
              });
            }
          }
        } else {
          if (approval.approvedSerials && approval.approvedSerials.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Approved serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
            });
          }
        }
      }

      const productApprovalsWithQuantity = productApprovals.filter(
        (pa) => pa.approvedQuantity > 0
      );

      if (productApprovalsWithQuantity.length > 0) {
        const validationResults = await stockRequest.validateSerialNumbers(
          productApprovalsWithQuantity
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

    if (productReceipts && productReceipts.length > 0) {
      for (const receipt of productReceipts) {
        if (!receipt.productId) {
          return res.status(400).json({
            success: false,
            message: "Product ID is required for each product receipt",
          });
        }

        if (
          receipt.receivedQuantity === undefined ||
          receipt.receivedQuantity === null
        ) {
          return res.status(400).json({
            success: false,
            message: `Received quantity is required for product ${receipt.productId}`,
          });
        }

        if (
          typeof receipt.receivedQuantity !== "number" ||
          isNaN(receipt.receivedQuantity)
        ) {
          return res.status(400).json({
            success: false,
            message: `Received quantity must be a valid number for product ${receipt.productId}`,
          });
        }

        if (receipt.receivedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Received quantity cannot be negative for product ${receipt.productId}`,
          });
        }

        if (!Number.isInteger(receipt.receivedQuantity)) {
          return res.status(400).json({
            success: false,
            message: `Received quantity must be an integer for product ${receipt.productId}`,
          });
        }

        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === receipt.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${receipt.productId} not found in stock request`,
          });
        }

        let currentApprovedQuantity = productItem.approvedQuantity;

        if (productApprovals && productApprovals.length > 0) {
          const approval = productApprovals.find(
            (pa) => pa.productId.toString() === receipt.productId.toString()
          );
          if (approval) {
            currentApprovedQuantity = approval.approvedQuantity;
          }
        }

        if (receipt.receivedQuantity > currentApprovedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${currentApprovedQuantity}) for product ${receipt.productId}`,
          });
        }
      }
    }

    const productsToComplete =
      productReceipts && productReceipts.length > 0
        ? productReceipts
        : productApprovals.map((approval) => ({
            productId: approval.productId,
            receivedQuantity: approval.approvedQuantity,
            receivedRemark:
              approval.receivedRemark || approval.approvedRemark || "",
          }));

    if (productsToComplete && productsToComplete.length > 0) {
      const OutletStock = mongoose.model("OutletStock");
      const CenterStock = mongoose.model("CenterStock");

      for (const receipt of productsToComplete) {
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === receipt.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${receipt.productId} not found in stock request`,
          });
        }

        const hasApprovedSerials =
          productItem.approvedSerials && productItem.approvedSerials.length > 0;

        if (hasApprovedSerials) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: receipt.productId,
          });

          if (!outletStock) {
            return res.status(400).json({
              success: false,
              message: `No stock found in outlet for product ${receipt.productId}`,
            });
          }

          const approvedCount = productItem.approvedSerials.length;
          const receivedCount = receipt.receivedQuantity;

          const revertCount = approvedCount - receivedCount;

          if (revertCount > 0) {
            const serialsToRevert =
              productItem.approvedSerials.slice(receivedCount);

            for (const serialNumber of serialsToRevert) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && serial.status === "in_transit") {
                serial.status = "available";
                serial.currentLocation = stockRequest.warehouse;

                if (serial.transferHistory.length > 0) {
                  const lastTransfer =
                    serial.transferHistory[serial.transferHistory.length - 1];
                  if (lastTransfer.status === "in_transit") {
                    serial.transferHistory.pop();
                  }
                }

                console.log(
                  `Reverted serial ${serialNumber} back to available status for incomplete request`
                );
              }
            }

            outletStock.availableQuantity += revertCount;
            outletStock.inTransitQuantity -= revertCount;

            console.log(
              `Reverted ${revertCount} items back to available for product ${receipt.productId} in incomplete request`
            );
          }

          if (receivedCount > 0) {
            const serialsToTransfer = productItem.approvedSerials.slice(
              0,
              receivedCount
            );

            for (const serialNumber of serialsToTransfer) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && serial.status === "in_transit") {
                serial.status = "transferred";
                serial.currentLocation = stockRequest.center;

                const lastTransfer =
                  serial.transferHistory[serial.transferHistory.length - 1];
                if (lastTransfer) {
                  lastTransfer.status = "completed";
                  lastTransfer.completedAt = new Date();
                }
              }
            }

            outletStock.inTransitQuantity -= receivedCount;
            outletStock.totalQuantity -= receivedCount;

            await outletStock.save();

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

            productItem.transferredSerials = serialsToTransfer;
            productItem.receivedQuantity = receipt.receivedQuantity;
          } else {
            productItem.transferredSerials = [];
            productItem.receivedQuantity = 0;
          }
        } else {
          productItem.receivedQuantity = receipt.receivedQuantity;
    
          if (receipt.receivedQuantity > 0) {
            await CenterStock.updateStock(
              stockRequest.center,
              receipt.productId,
              receipt.receivedQuantity,
              [],
              stockRequest.warehouse,
              "inbound_transfer"
            );
            const outletStock = await OutletStock.findOne({
              outlet: stockRequest.warehouse,
              product: receipt.productId,
            });
            
            if (outletStock) {
              outletStock.totalQuantity -= receipt.receivedQuantity;
              outletStock.availableQuantity -= receipt.receivedQuantity;
              await outletStock.save();
              
              console.log(
                `Deducted ${receipt.receivedQuantity} items from warehouse stock for product ${receipt.productId} in incomplete request completion`
              );
            }
          }
        }
      }
    }

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
      message:
        "Incomplete stock request completed successfully and stock transferred to center",
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
      error.message.includes("No serial numbers assigned") ||
      error.message.includes("Approved quantity") ||
      error.message.includes("Received quantity") ||
      error.message.includes("Product ID") ||
      error.message.includes("exceed") ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
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

// export const completeStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["complete_indent", "manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. complete_indent or manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productReceipts, receivedRemark } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only complete stock requests from your own center.",
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
//       !productReceipts ||
//       !Array.isArray(productReceipts) ||
//       productReceipts.length === 0
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Product receipts are required",
//       });
//     }

//     const Product = mongoose.model("Product");

//     for (const receipt of productReceipts) {
//       if (!receipt.productId) {
//         return res.status(400).json({
//           success: false,
//           message: "Product ID is required for each product receipt",
//         });
//       }

//       if (
//         receipt.receivedQuantity === undefined ||
//         receipt.receivedQuantity === null
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity is required for product ${receipt.productId}`,
//         });
//       }

//       if (
//         typeof receipt.receivedQuantity !== "number" ||
//         isNaN(receipt.receivedQuantity)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity must be a valid number for product ${receipt.productId}`,
//         });
//       }

//       if (receipt.receivedQuantity < 0) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity cannot be negative for product ${receipt.productId}`,
//         });
//       }

//       if (!Number.isInteger(receipt.receivedQuantity)) {
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity must be an integer for product ${receipt.productId}`,
//         });
//       }

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
//           message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${receipt.productId}`,
//         });
//       }

//       const productDoc = await Product.findById(receipt.productId);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//       if (tracksSerialNumbers) {
//         const receivedSerials = receipt.receivedSerials || [];

//         if (receipt.receivedQuantity > 0) {
//           if (receivedSerials.length > 0) {
//             const uniqueSerials = new Set(receivedSerials);
//             if (uniqueSerials.size !== receivedSerials.length) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
//               });
//             }
//           }
//         } else {
//           if (receivedSerials.length > 0) {
//             return res.status(400).json({
//               success: false,
//               message: `Received serial numbers should not be provided when received quantity is zero for product ${productDoc.productTitle}`,
//             });
//           }
//         }
//       } else {
//         if (receipt.receivedSerials && receipt.receivedSerials.length > 0) {
//           return res.status(400).json({
//             success: false,
//             message: `Received serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
//           });
//         }
//       }
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       const OutletStock = mongoose.model("OutletStock");
//       const CenterStock = mongoose.model("CenterStock");

//       for (const receipt of productReceipts) {
//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === receipt.productId.toString()
//         );

//         if (!productItem) {
//           return res.status(400).json({
//             success: false,
//             message: `Product ${receipt.productId} not found in stock request`,
//           });
//         }

//         const hasApprovedSerials =
//           productItem.approvedSerials && productItem.approvedSerials.length > 0;

//         if (hasApprovedSerials) {
//           const outletStock = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: receipt.productId,
//           });

//           if (!outletStock) {
//             return res.status(400).json({
//               success: false,
//               message: `No stock found in outlet for product ${receipt.productId}`,
//             });
//           }

//           const approvedCount = productItem.approvedSerials.length;
//           const receivedCount = receipt.receivedQuantity;

//           const revertCount = approvedCount - receivedCount;

//           if (revertCount > 0) {
//             const serialsToRevert =
//               productItem.approvedSerials.slice(receivedCount);

//             for (const serialNumber of serialsToRevert) {
//               const serial = outletStock.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber
//               );

//               if (serial && serial.status === "in_transit") {
//                 serial.status = "available";
//                 serial.currentLocation = stockRequest.warehouse;

//                 serial.transferHistory.pop();

//                 console.log(
//                   `Reverted serial ${serialNumber} back to available status`
//                 );
//               }
//             }

//             outletStock.availableQuantity += revertCount;
//             outletStock.inTransitQuantity -= revertCount;

//             console.log(
//               `Reverted ${revertCount} items back to available for product ${receipt.productId}`
//             );
//           }

//           if (receivedCount > 0) {
//             const serialsToTransfer = productItem.approvedSerials.slice(
//               0,
//               receivedCount
//             );

//             for (const serialNumber of serialsToTransfer) {
//               const serial = outletStock.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber
//               );

//               if (serial && serial.status === "in_transit") {
//                 serial.status = "transferred";
//                 serial.currentLocation = stockRequest.center;

//                 const lastTransfer =
//                   serial.transferHistory[serial.transferHistory.length - 1];
//                 if (lastTransfer) {
//                   lastTransfer.status = "completed";
//                   lastTransfer.completedAt = new Date();
//                 }
//               }
//             }

//             outletStock.inTransitQuantity -= receivedCount;
//             outletStock.totalQuantity -= receivedCount;

//             await outletStock.save();
//             if (receivedCount > 0) {
//               await CenterStock.updateStock(
//                 stockRequest.center,
//                 receipt.productId,
//                 receivedCount,
//                 serialsToTransfer,
//                 stockRequest.warehouse,
//                 "inbound_transfer"
//               );
//             }

//             productItem.transferredSerials = serialsToTransfer;
//             productItem.receivedQuantity = receipt.receivedQuantity;
//           } else {
//             productItem.transferredSerials = [];
//             productItem.receivedQuantity = 0;
//           }
//         } else {

//           productItem.receivedQuantity = receipt.receivedQuantity;
//           if (receipt.receivedQuantity > 0) {
//             await CenterStock.updateStock(
//               stockRequest.center,
//               receipt.productId,
//               receipt.receivedQuantity,
//               [],
//               stockRequest.warehouse,
//               "inbound_transfer"
//             );
//     const outletStock = await OutletStock.findOne({
//       outlet: stockRequest.warehouse,
//       product: receipt.productId,
//     });
    
//     if (outletStock) {
//       outletStock.totalQuantity -= receipt.receivedQuantity;
//       outletStock.availableQuantity -= receipt.receivedQuantity;
//       await outletStock.save();
      
//       console.log(
//         `Deducted ${receipt.receivedQuantity} items from warehouse stock for product ${receipt.productId}`
//       );
//     }
//           }
//         }
//       }
//     }

//     stockRequest.status = "Completed";
//     stockRequest.receivingInfo = {
//       receivedAt: new Date(),
//       receivedBy: userId,
//       receivedRemark: receivedRemark || "",
//     };
//     stockRequest.completionInfo = {
//       completedOn: new Date(),
//       completedBy: userId,
//     };
//     stockRequest.updatedBy = userId;

//     const updatedRequest = await stockRequest.save();

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
//     });
//   } catch (error) {
//     console.error("Error completing stock request:", error);

//     if (
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("serial numbers not available") ||
//       error.message.includes("No serial numbers assigned") ||
//       error.message.includes("Received quantity") ||
//       error.message.includes("Product ID") ||
//       error.message.includes("exceed approved quantity") ||
//       error.message.includes("Cannot read properties of undefined")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["complete_indent", "manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. complete_indent or manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productReceipts, receivedRemark } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only complete stock requests from your own center.",
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
      !productReceipts ||
      !Array.isArray(productReceipts) ||
      productReceipts.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Product receipts are required",
      });
    }

    const Product = mongoose.model("Product");

    // Validate product receipts
    for (const receipt of productReceipts) {
      if (!receipt.productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required for each product receipt",
        });
      }

      if (
        receipt.receivedQuantity === undefined ||
        receipt.receivedQuantity === null
      ) {
        return res.status(400).json({
          success: false,
          message: `Received quantity is required for product ${receipt.productId}`,
        });
      }

      if (
        typeof receipt.receivedQuantity !== "number" ||
        isNaN(receipt.receivedQuantity)
      ) {
        return res.status(400).json({
          success: false,
          message: `Received quantity must be a valid number for product ${receipt.productId}`,
        });
      }

      if (receipt.receivedQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: `Received quantity cannot be negative for product ${receipt.productId}`,
        });
      }

      if (!Number.isInteger(receipt.receivedQuantity)) {
        return res.status(400).json({
          success: false,
          message: `Received quantity must be an integer for product ${receipt.productId}`,
        });
      }

      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${receipt.productId} not found in stock request`,
        });
      }

      if (receipt.receivedQuantity > productItem.approvedQuantity) {
        return res.status(400).json({
          success: false,
          message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${receipt.productId}`,
        });
      }

      const productDoc = await Product.findById(receipt.productId);
      const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      if (tracksSerialNumbers) {
        const receivedSerials = receipt.receivedSerials || [];

        if (receipt.receivedQuantity > 0) {
          if (receivedSerials.length > 0) {
            const uniqueSerials = new Set(receivedSerials);
            if (uniqueSerials.size !== receivedSerials.length) {
              return res.status(400).json({
                success: false,
                message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
              });
            }
          }
        } else {
          if (receivedSerials.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Received serial numbers should not be provided when received quantity is zero for product ${productDoc.productTitle}`,
            });
          }
        }
      } else {
        if (receipt.receivedSerials && receipt.receivedSerials.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Received serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
          });
        }
      }
    }

    // Process stock transfer
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const receipt of productReceipts) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${receipt.productId} not found in stock request`,
        });
      }

      const hasApprovedSerials =
        productItem.approvedSerials && productItem.approvedSerials.length > 0;

      if (hasApprovedSerials) {
        // Handle serialized products
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: receipt.productId,
        });

        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `No stock found in outlet for product ${receipt.productId}`,
          });
        }

        const approvedCount = productItem.approvedSerials.length;
        const receivedCount = receipt.receivedQuantity;

        // Calculate how many items to revert (if received quantity is less than approved)
        const revertCount = approvedCount - receivedCount;

        if (revertCount > 0) {
          // Revert unused serials back to available status
          const serialsToRevert = productItem.approvedSerials.slice(receivedCount);

          for (const serialNumber of serialsToRevert) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;

              // Remove the transfer history entry
              if (serial.transferHistory.length > 0) {
                const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                if (lastTransfer.status === "in_transit") {
                  serial.transferHistory.pop();
                }
              }

              console.log(
                `Reverted serial ${serialNumber} back to available status`
              );
            }
          }

          // Update outlet stock quantities
          outletStock.availableQuantity += revertCount;
          outletStock.inTransitQuantity -= revertCount;

          console.log(
            `Reverted ${revertCount} items back to available for product ${receipt.productId}`
          );
        }

        if (receivedCount > 0) {
          // Process received serials - mark as transferred and add to center stock
          const serialsToTransfer = productItem.approvedSerials.slice(0, receivedCount);

          for (const serialNumber of serialsToTransfer) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "transferred";
              serial.currentLocation = stockRequest.center;

              // Update transfer history to mark as completed
              const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
              if (lastTransfer) {
                lastTransfer.status = "completed";
                lastTransfer.completedAt = new Date();
              }
            }
          }

          // Update outlet stock - only reduce inTransitQuantity, NOT totalQuantity
          outletStock.inTransitQuantity -= receivedCount;
          // DON'T reduce totalQuantity here - it was already reduced during approval

          await outletStock.save();

          // Add stock to center
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

          productItem.transferredSerials = serialsToTransfer;
          productItem.receivedQuantity = receipt.receivedQuantity;
        } else {
          productItem.transferredSerials = [];
          productItem.receivedQuantity = 0;
        }
      } else {
        // Handle non-serialized products
        productItem.receivedQuantity = receipt.receivedQuantity;
        
        if (receipt.receivedQuantity > 0) {
          // Add stock to center
          await CenterStock.updateStock(
            stockRequest.center,
            receipt.productId,
            receipt.receivedQuantity,
            [],
            stockRequest.warehouse,
            "inbound_transfer"
          );

          // For non-serialized products, update outlet stock - only reduce inTransitQuantity
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: receipt.productId,
          });
          
          if (outletStock) {
            outletStock.inTransitQuantity -= receipt.receivedQuantity;
            // DON'T reduce totalQuantity or availableQuantity here
            await outletStock.save();
            
            console.log(
              `Updated outlet in-transit quantity for product ${receipt.productId}: -${receipt.receivedQuantity}`
            );
          }
        }
      }
    }

    // Update stock request status
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
      message:
        "Stock request completed successfully and stock transferred to center",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error completing stock request:", error);

    if (
      error.message.includes("Insufficient stock") ||
      error.message.includes("serial numbers not available") ||
      error.message.includes("No serial numbers assigned") ||
      error.message.includes("Received quantity") ||
      error.message.includes("Product ID") ||
      error.message.includes("exceed approved quantity") ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { status, ...additionalInfo } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update status for stock requests from your own center.",
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

export const updateApprovedQuantities = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update approved quantities for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    const validationResults = [];

    for (const approval of productApprovals) {
      if (approval.approvedSerials && approval.approvedSerials.length > 0) {
        const product = await Product.findById(approval.productId);
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === approval.productId.toString()
        );

        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });

        if (!outletStock) {
          validationResults.push({
            productId: approval.productId,
            productName: product?.productTitle || "Unknown Product",
            valid: false,
            availableSerials: [],
            unavailableSerials: approval.approvedSerials,
            error: `No stock found in outlet for this product`,
          });
          continue;
        }

        const availableSerials = [];
        const unavailableSerials = [];

        for (const serialNumber of approval.approvedSerials) {
          const serial = outletStock.serialNumbers.find(
            (sn) => sn.serialNumber === serialNumber
          );

          if (serial) {
            if (serial.status === "available") {
              availableSerials.push(serialNumber);
            } else if (serial.status === "in_transit") {
              const isAssignedToThisTransfer =
                productItem?.approvedSerials?.includes(serialNumber);
              if (isAssignedToThisTransfer) {
                availableSerials.push(serialNumber);
              } else {
                unavailableSerials.push(serialNumber);
              }
            } else {
              unavailableSerials.push(serialNumber);
            }
          } else {
            unavailableSerials.push(serialNumber);
          }
        }

        validationResults.push({
          productId: approval.productId,
          productName: product?.productTitle || "Unknown Product",
          valid: unavailableSerials.length === 0,
          availableSerials: availableSerials,
          unavailableSerials: unavailableSerials,
          error:
            unavailableSerials.length > 0
              ? `Serial numbers not available: ${unavailableSerials.join(", ")}`
              : null,
        });
      } else {
        const product = await Product.findById(approval.productId);
        validationResults.push({
          productId: approval.productId,
          productName: product?.productTitle || "Unknown Product",
          valid: true,
          availableSerials: [],
          unavailableSerials: [],
          error: null,
        });
      }
    }

    const invalidResults = validationResults.filter((result) => !result.valid);
    if (invalidResults.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Serial number validation failed",
        validationErrors: invalidResults,
      });
    }

    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (productItem) {
        const currentApprovedQuantity = productItem.approvedQuantity || 0;
        const currentApprovedSerials = productItem.approvedSerials || [];
        const newApprovedQuantity = approval.approvedQuantity;
        const newApprovedSerials = approval.approvedSerials || [];

        console.log(
          `[DEBUG] Processing product update for: ${approval.productId}`
        );
        console.log(
          `[DEBUG] Current quantity: ${currentApprovedQuantity}, New quantity: ${newApprovedQuantity}`
        );
        console.log(
          `[DEBUG] Current serials: [${currentApprovedSerials.join(", ")}]`
        );
        console.log(`[DEBUG] New serials: [${newApprovedSerials.join(", ")}]`);

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

        if (newApprovedQuantity < currentApprovedQuantity) {
          console.log(
            `[DEBUG] SCENARIO 1: Quantity reduced from ${currentApprovedQuantity} to ${newApprovedQuantity}`
          );

          const quantityToRestore =
            currentApprovedQuantity - newApprovedQuantity;
          console.log(
            `[DEBUG] Need to restore ${quantityToRestore} items to outlet`
          );

          let serialsToRestore = [];

          if (
            JSON.stringify(currentApprovedSerials) !==
            JSON.stringify(newApprovedSerials)
          ) {
            serialsToRestore = currentApprovedSerials.filter(
              (serial) => !newApprovedSerials.includes(serial)
            );
            console.log(
              `[DEBUG] Restoring ${serialsToRestore.length} serials that were removed`
            );
          } else {
            serialsToRestore =
              currentApprovedSerials.slice(newApprovedQuantity);
            console.log(
              `[DEBUG] Restoring last ${serialsToRestore.length} serials due to quantity reduction`
            );
          }

          let restoredCount = 0;
          for (const serialNumber of serialsToRestore) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;
              restoredCount++;

              serial.transferHistory = serial.transferHistory.filter(
                (history) =>
                  !(
                    history.toCenter?.toString() ===
                      stockRequest.center.toString() &&
                    history.transferType === "outlet_to_center"
                  )
              );

              console.log(
                `[DEBUG] Restored serial ${serialNumber} to available status in outlet`
              );
            }
          }

          if (restoredCount > 0) {
            outletStock.availableQuantity += restoredCount;
            outletStock.inTransitQuantity -= restoredCount;
            await outletStock.save();
            console.log(
              `[DEBUG] Updated outlet quantities - Available: +${restoredCount}, InTransit: -${restoredCount}`
            );
          }
        } else if (
          newApprovedQuantity === currentApprovedQuantity &&
          JSON.stringify(currentApprovedSerials) !==
            JSON.stringify(newApprovedSerials)
        ) {
          console.log(
            `[DEBUG] SCENARIO 2: Only serial numbers changed, quantity same: ${currentApprovedQuantity}`
          );

          const serialsToRemove = currentApprovedSerials.filter(
            (serial) => !newApprovedSerials.includes(serial)
          );
          const serialsToAdd = newApprovedSerials.filter(
            (serial) => !currentApprovedSerials.includes(serial)
          );

          console.log(
            `[DEBUG] Serials to remove: ${serialsToRemove.length}, Serials to add: ${serialsToAdd.length}`
          );

          let restoredCount = 0;
          for (const serialNumber of serialsToRemove) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial && serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;
              restoredCount++;

              serial.transferHistory = serial.transferHistory.filter(
                (history) =>
                  !(
                    history.toCenter?.toString() ===
                      stockRequest.center.toString() &&
                    history.transferType === "outlet_to_center"
                  )
              );

              console.log(
                `[DEBUG] Restored serial ${serialNumber} to available status`
              );
            }
          }

          let addedCount = 0;
          for (const serialNumber of serialsToAdd) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (serial.status === "available") {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  remark: "Updated during serial number change",
                });
                addedCount++;
                console.log(
                  `[DEBUG] Marked serial ${serialNumber} as in_transit`
                );
              } else if (serial.status === "in_transit") {
                const existingTransfer = serial.transferHistory.find(
                  (history) =>
                    history.toCenter?.toString() ===
                    stockRequest.center.toString()
                );

                if (!existingTransfer) {
                  serial.transferHistory.push({
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    remark: "Updated during serial number change",
                  });
                }
                addedCount++;
                console.log(
                  `[DEBUG] Serial ${serialNumber} already in_transit, updated transfer history`
                );
              }
            } else {
              throw new Error(
                `Serial number ${serialNumber} not found in outlet stock`
              );
            }
          }

          console.log(
            `[DEBUG] Serial swap completed - No quantity changes (Restored: ${restoredCount}, Added: ${addedCount})`
          );
          await outletStock.save();
        } else if (newApprovedQuantity > currentApprovedQuantity) {
          console.log(
            `[DEBUG] SCENARIO 3: Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}`
          );

          const quantityToAdd = newApprovedQuantity - currentApprovedQuantity;

          if (newApprovedSerials.length === 0) {
            throw new Error(
              `Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}. Please provide ${quantityToAdd} additional serial numbers.`
            );
          }

          const additionalSerials = newApprovedSerials.slice(
            currentApprovedQuantity
          );

          if (additionalSerials.length !== quantityToAdd) {
            throw new Error(
              `Need ${quantityToAdd} additional serial numbers for quantity increase, but got ${additionalSerials.length}`
            );
          }

          let addedCount = 0;
          for (const serialNumber of additionalSerials) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (serial) {
              if (serial.status === "available") {
                serial.status = "in_transit";
                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  remark: "Added during quantity increase",
                });
                addedCount++;
                console.log(
                  `[DEBUG] Marked serial ${serialNumber} as in_transit`
                );
              } else if (serial.status === "in_transit") {
                const existingTransfer = serial.transferHistory.find(
                  (history) =>
                    history.toCenter?.toString() ===
                    stockRequest.center.toString()
                );

                if (!existingTransfer) {
                  serial.transferHistory.push({
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    remark: "Added during quantity increase",
                  });
                }
                addedCount++;
                console.log(
                  `[DEBUG] Serial ${serialNumber} already in_transit, updated transfer history`
                );
              }
            } else {
              throw new Error(
                `Serial number ${serialNumber} not found in outlet stock`
              );
            }
          }

          const newlyMarkedInTransit = additionalSerials.filter(
            (serialNumber) => {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );
              return serial && serial.status === "in_transit";
            }
          ).length;

          if (newlyMarkedInTransit > 0) {
            outletStock.availableQuantity -= newlyMarkedInTransit;
            outletStock.inTransitQuantity += newlyMarkedInTransit;
          }

          await outletStock.save();
          console.log(
            `[DEBUG] Updated outlet quantities - Available: -${newlyMarkedInTransit}, InTransit: +${newlyMarkedInTransit}`
          );
        }
      }
    }

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

export const getMostRecentOrderNumber = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
    }
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
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    const { productId } = req.params;

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (userCenterId.toString() !== centerId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view serial numbers from your own center.",
        });
      }
    }

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




export const getStockRequestCount = async (req, res) => {
  try {
    const match = {};

    if (req.query.center) {
      match.center = req.query.center;
    }
    if (req.query.warehouse) {
      match.warehouse = req.query.warehouse;
    }
    if (req.query.startDate && req.query.endDate) {
      match.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const summary = await StockRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    const totalRequests = summary.reduce((acc, cur) => acc + cur.count, 0);

    const completed =
      summary.find((s) => s._id === "Completed")?.count || 0;
    const incomplete =
      summary.find((s) => s._id === "Incompleted")?.count || 0;

    return res.status(200).json({
      success: true,
      totalRequests,
      completed,
      incomplete,
      summary: summary.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Error fetching stock request summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock request summary",
      error: error.message,
    });
  }
};

export const getStockRequestNotifications = async (req, res) => {
  try {
    const {
      type,
      center,
      days = 7
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);
    
    const filter = {
      createdAt: { $gte: startDate }
    };
    
    if (center) {
      filter.center = center;
    }
    
    if (type && type !== 'all') {
      switch (type) {
        case 'submitted':
          filter.status = 'Submitted';
          break;
        case 'completed':
          filter.status = 'Completed';
          break;
        case 'confirmed':
          filter.status = 'Confirmed';
          break;
        case 'shipped':
          filter.status = 'Shipped';
          break;
        case 'incompleted':
          filter.status = 'Incompleted';
          break;
      }
    }

    const stockRequests = await StockRequest.find(filter)
      .populate("center", "centerName centerCode")
      .populate("createdBy", "fullName")
      .populate("approvalInfo.approvedBy", "fullName")
      .populate("completionInfo.completedBy", "fullName")
      .populate("completionInfo.incompleteBy", "fullName")
      .sort({ createdAt: -1 })
      .lean();

    // Filter out requests with missing center data and format notifications
    const validStockRequests = stockRequests.filter(request => 
      request.center && request.center.centerName
    );

    const notifications = validStockRequests.map(request => {
      return formatStockRequestToNotification(request);
    });

    res.status(200).json({
      success: true,
      message: "Stock request notifications retrieved successfully",
      data: notifications,
      totalCount: notifications.length
    });

  } catch (error) {
    console.error("Error retrieving stock request notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
};


const formatStockRequestToNotification = (stockRequest) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  let title = '';
  let message = '';
  let notificationType = '';
  let timestamp = stockRequest.createdAt;

  const centerName = stockRequest.center?.centerName || 'Unknown Center';
  const orderNumber = stockRequest.orderNumber || 'N/A';
  const createdByName = stockRequest.createdBy?.fullName || 'Unknown User';

  switch (stockRequest.status) {
    case 'Submitted':
      notificationType = 'new_request';
      title = 'New Stock Request Submitted';
      message = `New Stock Request No. ${orderNumber} had been Submitted From ${centerName} By ${createdByName} - ${formatDate(stockRequest.createdAt)}`;
      break;

    case 'Completed':
      notificationType = 'request_completed';
      title = 'Stock Request Completed';
      const completedBy = stockRequest.completionInfo?.completedBy?.fullName || 
                         stockRequest.receivingInfo?.receivedBy?.fullName || 
                         'System';
      message = `Your indent Request No. ${orderNumber} had been Completed From ${centerName} By ${completedBy} - ${formatDate(stockRequest.completionInfo?.completedOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.completedOn || stockRequest.updatedAt;
      break;

    case 'Confirmed':
      notificationType = 'request_approved';
      title = 'Stock Request Approved';
      const approvedBy = stockRequest.approvalInfo?.approvedBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Approved From ${centerName} By ${approvedBy} - ${formatDate(stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt;
      break;

    case 'Shipped':
      notificationType = 'request_shipped';
      title = 'Stock Request Shipped';
      const shippedBy = stockRequest.shippingInfo?.shippedBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Shipped From ${centerName} By ${shippedBy} - ${formatDate(stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt;
      break;

    case 'Incompleted':
      notificationType = 'request_incompleted';
      title = 'Stock Request Incompleted';
      const incompletedBy = stockRequest.completionInfo?.incompleteBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Marked Incomplete From ${centerName} By ${incompletedBy} - ${formatDate(stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt;
      break;

    case 'Rejected':
      notificationType = 'request_rejected';
      title = 'Stock Request Rejected';
      message = `Stock Request No. ${orderNumber} has been Rejected From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      break;

    default:
      notificationType = 'status_updated';
      title = 'Stock Request Updated';
      message = `Stock Request No. ${orderNumber} status updated to ${stockRequest.status} From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      timestamp = stockRequest.updatedAt;
  }

  return {
    id: stockRequest._id,
    type: notificationType,
    title,
    message,
    stockRequestId: stockRequest._id,
    orderNumber: stockRequest.orderNumber,
    center: stockRequest.center,
    status: stockRequest.status,
    timestamp,
    createdAt: stockRequest.createdAt,
    isRead: false
  };
};


//Challan Approval

export const updateWarehouseChallanApproval = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent", "stock_transfer_approve_from_outlet"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
      });
    }

    const { id } = req.params;
    const {warehouseChallanApproval } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update challan approval for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!["pending", "approved", "rejected"].includes(warehouseChallanApproval)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
      });
    }

    const updateData = {
      warehouseChallanApproval,
      updatedBy: userId,
      approvalInfo: {
        ...stockRequest.approvalInfo,
      },
    };

    if (warehouseChallanApproval === "approved" || warehouseChallanApproval === "rejected") {
      updateData.approvalInfo.warehouseChallanApprovedAt = new Date();
      updateData.approvalInfo.warehouseChallanApprovedBy = userId;

    } else {

      updateData.approvalInfo.warehouseChallanApprovedAt = undefined;
      updateData.approvalInfo.warehouseChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");
    res.status(200).json({
      success: true,
      message: `Challan approval status updated to ${warehouseChallanApproval} successfully`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating challan approval:", error);

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

    res.status(500).json({
      success: false,
      message: "Error updating challan approval",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};


export const updateCenterChallanApproval = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent", "stock_transfer_approve_from_outlet"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
      });
    }

    const { id } = req.params;
    const { centerChallanApproval } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update challan approval for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!["pending", "approved", "rejected"].includes(centerChallanApproval)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
      });
    }

    const updateData = {
      centerChallanApproval,
      updatedBy: userId,
      approvalInfo: {
        ...stockRequest.approvalInfo,
      },
    };

    if (centerChallanApproval === "approved" || centerChallanApproval === "rejected") {
      updateData.approvalInfo.centerChallanApprovedAt = new Date();
      updateData.approvalInfo.centerChallanApprovedBy = userId;
    } else {

      updateData.approvalInfo.centerChallanApprovedAt = undefined;
      updateData.approvalInfo.centerChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

      res.status(200).json({
      success: true,
      message: `Challan approval status updated to ${centerChallanApproval} successfully`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating challan approval:", error);

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

    res.status(500).json({
      success: false,
      message: "Error updating challan approval",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    })
  }
};  