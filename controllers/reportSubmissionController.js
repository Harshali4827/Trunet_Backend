import StockClosing from "../models/ReportSubmission.js";
import mongoose from "mongoose";
import User from "../models/User.js";

const checkStockClosingPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const closingModule = userPermissions.find(
    (perm) => perm.module === "Closing"
  );

  if (!closingModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_closing_stock_own_center: closingModule.permissions.includes(
      "manage_closing_stock_own_center"
    ),
    manage_closing_stock_all_center: closingModule.permissions.includes(
      "manage_closing_stock_all_center"
    ),
    view_closing_stock_own_center: closingModule.permissions.includes(
      "view_closing_stock_own_center"
    ),
    view_closing_stock_all_center: closingModule.permissions.includes(
      "view_closing_stock_all_center"
    ),
    change_closing_qty:
      closingModule.permissions.includes("change_closing_qty"),
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

const checkClosingCenterAccess = async (
  userId,
  targetCenterId,
  permissions
) => {
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

  if (
    permissions.manage_closing_stock_all_center ||
    permissions.view_closing_stock_all_center
  ) {
    return targetCenterId || user.center._id;
  }

  if (
    permissions.manage_closing_stock_own_center ||
    permissions.view_closing_stock_own_center
  ) {
    const userCenterId = user.center._id || user.center;

    if (
      targetCenterId &&
      targetCenterId.toString() !== userCenterId.toString()
    ) {
      throw new Error(
        "Access denied. You can only access your own center's stock closing data."
      );
    }

    return userCenterId;
  }

  throw new Error("Insufficient permissions to access stock closing data");
};

const getUserCenterId = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const user = await User.findById(userId).populate(
    "center",
    "centerName centerCode centerType"
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User center information not found");
  }

  return user.center._id;
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

  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate entry found",
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

export const createStockClosing = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(
      req,
      ["manage_closing_stock_own_center", "manage_closing_stock_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_closing_stock_own_center or manage_closing_stock_all_center permission required.",
      });
    }

    const {
      date,
      stockClosingForOtherCenter,
      center,
      products,
      status,
      remark,
    } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array with at least one product is required",
      });
    }

    for (const [index, product] of products.entries()) {
      if (
        !product.product ||
        product.productQty === undefined ||
        product.damageQty === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
        });
      }

      if (product.damageQty > product.productQty) {
        return res.status(400).json({
          success: false,
          message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
        });
      }
    }

    let userClosingCenter = userCenter?._id || userCenter;
    if (!userClosingCenter) {
      userClosingCenter = await getUserCenterId(req.user._id);
    }

    if (!userClosingCenter) {
      return res.status(400).json({
        success: false,
        message:
          "User must be associated with a center to create stock closing",
      });
    }

    const Center = mongoose.model("Center");
    const closingCenterData = await Center.findById(userClosingCenter).select(
      "centerType"
    );

    if (!closingCenterData) {
      return res.status(400).json({
        success: false,
        message: "Invalid user center",
      });
    }

    const isOutlet = closingCenterData.centerType === "Outlet";
    const isCenter = closingCenterData.centerType === "Center";

    const actualStockClosingForOtherCenter = Boolean(
      stockClosingForOtherCenter
    );

    if (actualStockClosingForOtherCenter) {
      if (!center) {
        return res.status(400).json({
          success: false,
          message: "Center is required when stock closing is for other center",
        });
      }

      const targetCenter = await Center.findById(center);
      if (!targetCenter) {
        return res.status(400).json({
          success: false,
          message: "Target center not found",
        });
      }

      if (
        permissions.manage_closing_stock_own_center &&
        !permissions.manage_closing_stock_all_center
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You need manage_closing_stock_all_center permission to create stock closing for other centers.",
        });
      }

      if (!isOutlet) {
        return res.status(400).json({
          success: false,
          message:
            "Only outlet users can create stock closing for other centers",
        });
      }
    }

    const mainStockClosingData = {
      date: date || new Date(),
      stockClosingForOtherCenter: actualStockClosingForOtherCenter,
      products,
      status: status || "Draft",
      createdBy: req.user?.id,
      closingCenter: userClosingCenter,
      remark: remark || "",
    };

    if (actualStockClosingForOtherCenter) {
      mainStockClosingData.center = center;
    }

    const mainStockClosing = new StockClosing(mainStockClosingData);
    await mainStockClosing.save();

    let secondaryStockClosing = null;

    if (actualStockClosingForOtherCenter) {
      const secondaryStockClosingData = {
        date: date || new Date(),
        stockClosingForOtherCenter: false,
        products: JSON.parse(JSON.stringify(products)),
        status: status || "Draft",
        createdBy: req.user?.id,
        closingCenter: center,
        remark: remark,
        linkedStockClosing: mainStockClosing._id,
      };

      secondaryStockClosing = new StockClosing(secondaryStockClosingData);
      await secondaryStockClosing.save();

      mainStockClosing.linkedStockClosing = secondaryStockClosing._id;
      await mainStockClosing.save();
    }

    await mainStockClosing.populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode centerType" },
      { path: "closingCenter", select: "centerName centerCode centerType" },
      { path: "createdBy", select: "name email" },
      { path: "linkedStockClosing", select: "_id closingCenter status" },
    ]);

    const responseData = mainStockClosing.toObject();

    delete responseData.totalProductQty;
    delete responseData.totalDamageQty;
    delete responseData.totalQty;
    delete responseData.id;

    if (responseData.products && Array.isArray(responseData.products)) {
      responseData.products.forEach((product) => {
        if (product.product && product.product.id) {
          delete product.product.id;
        }
      });
    }

    let message = "Stock closing created successfully";
    if (actualStockClosingForOtherCenter) {
      message =
        "Stock closing created successfully with secondary entry for target center";
    }

    res.status(201).json({
      success: true,
      message,
      data: responseData,
      ...(secondaryStockClosing && {
        secondaryEntry: {
          _id: secondaryStockClosing._id,
          closingCenter: center,
        },
      }),
    });
  } catch (error) {
    console.error("Create stock closing error:", error);
    handleControllerError(error, res);
  }
};

const centerCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

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

const buildStockClosingFilter = (query, permissions, userCenter) => {
  const {
    startDate,
    endDate,
    stockClosingForOtherCenter,
    center,
    closingCenter,
    product,
    centerType,
    dateFilter,
    customStartDate,
    customEndDate,
    search,
  } = query;

  let filter = {};

  if (
    permissions.view_closing_stock_own_center &&
    !permissions.view_closing_stock_all_center &&
    userCenter
  ) {
    filter = {
      $or: [
        { closingCenter: userCenter._id || userCenter },
        { center: userCenter._id || userCenter },
      ],
    };
  }

  const centerFilter = buildArrayFilter(center);
  if (centerFilter) filter.center = centerFilter;

  const closingCenterFilter = buildArrayFilter(closingCenter);
  if (closingCenterFilter) filter.closingCenter = closingCenterFilter;

  const dateFilterObj = buildDateFilter(
    dateFilter,
    customStartDate,
    customEndDate,
    startDate,
    endDate
  );
  if (dateFilterObj) filter.date = dateFilterObj;

  if (stockClosingForOtherCenter !== undefined) {
    filter.stockClosingForOtherCenter = stockClosingForOtherCenter === "true";
  }

  if (product) {
    filter["products.product"] = product;
  }

  if (search) {
    filter.$or = [
      { remark: { $regex: search, $options: "i" } },
      { "products.productRemark": { $regex: search, $options: "i" } },
      { "center.centerName": { $regex: search, $options: "i" } },
      { "closingCenter.centerName": { $regex: search, $options: "i" } },
      { "products.product.productTitle": { $regex: search, $options: "i" } },
      { "products.product.productCode": { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

const buildStockClosingSortOptions = (sortBy = "date", sortOrder = "desc") => {
  const validSortFields = [
    "createdAt",
    "updatedAt",
    "date",
    "closingCenter",
    "center",
    "status",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

const stockClosingPopulateOptions = [
  {
    path: "products.product",
    select: "productTitle productCode productPrice trackSerialNumber",
  },
  { path: "center", select: "centerName centerCode centerType" },
  { path: "closingCenter", select: "centerName centerCode centerType" },
  { path: "createdBy", select: "fullName email" },
  { path: "linkedStockClosing", select: "_id closingCenter status" },
];

export const getAllStockClosings = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(
      req,
      ["view_closing_stock_own_center", "view_closing_stock_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      sortBy = "date",
      sortOrder = "desc",
      centerType,
      startDate,
      endDate,  
      ...filterParams
    } = req.query;

    const filter = buildStockClosingFilter(
      filterParams,
      permissions,
      userCenter
    );
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    const sortOptions = buildStockClosingSortOptions(sortBy, sortOrder);

    const [stockClosings, totalCount] = await Promise.all([
      StockClosing.find(filter)
        .populate(stockClosingPopulateOptions)
        .sort(sortOptions)
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),

      StockClosing.countDocuments(filter),
    ]);

    const filteredStockClosings = centerType
      ? stockClosings.filter(
          (sc) => sc.closingCenter && sc.closingCenter.centerType === centerType
        )
      : stockClosings;

    const actualTotal = centerType ? filteredStockClosings.length : totalCount;

    if (filteredStockClosings.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No stock closings found",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit),
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    const totalPages = Math.ceil(actualTotal / parseInt(limit));

    res.json({
      success: true,
      message: "Stock closings retrieved successfully",
      data: filteredStockClosings,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: actualTotal,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get all stock closings error:", error);
    handleControllerError(error, res);
  }
};
export const getStockClosingById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(
      req,
      ["view_closing_stock_own_center", "view_closing_stock_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    let filter = { _id: id };

    if (
      permissions.view_closing_stock_own_center &&
      !permissions.view_closing_stock_all_center &&
      userCenter
    ) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter },
        ],
      };
    }

    const stockClosing = await StockClosing.findOne(filter).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice productImage",
      },
      {
        path: "center",
        select: "centerName centerCode centerType addressLine1 city",
      },
      {
        path: "closingCenter",
        select: "centerName centerCode centerType addressLine1 city",
      },
      { path: "createdBy", select: "name email" },
      {
        path: "linkedStockClosing",
        populate: [
          { path: "closingCenter", select: "centerName centerCode centerType" },
          { path: "createdBy", select: "name email" },
        ],
      },
    ]);

    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message:
          "Stock closing not found or you don't have permission to access it",
      });
    }

    res.json({
      success: true,
      message: "Stock closing retrieved successfully",
      data: stockClosing,
    });
  } catch (error) {
    console.error("Get stock closing by ID error:", error);
    handleControllerError(error, res);
  }
};

export const updateStockClosing = async (req, res) => {
  try {
    const { hasAccess } = checkStockClosingPermissions(req, [
      "change_closing_qty",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. change_closing_qty permission required.",
      });
    }

    const { id } = req.params;
    const {
      date,
      stockClosingForOtherCenter,
      center,
      products,
      status,
      remark,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    const { permissions, userCenter } = checkStockClosingPermissions(req, [
      "view_closing_stock_own_center",
      "view_closing_stock_all_center",
    ]);

    let filter = { _id: id };

    if (
      permissions.view_closing_stock_own_center &&
      !permissions.view_closing_stock_all_center &&
      userCenter
    ) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter },
        ],
      };
    }

    const existingStockClosing = await StockClosing.findOne(filter).populate(
      "closingCenter"
    );
    if (!existingStockClosing) {
      return res.status(404).json({
        success: false,
        message:
          "Stock closing not found or you don't have permission to update it",
      });
    }

    if (existingStockClosing.linkedStockClosing) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot update linked stock closing entry directly. Update the main entry instead.",
      });
    }

    const isOutlet =
      existingStockClosing.closingCenter?.centerType === "Outlet";
    const userIsClosingCenter =
      existingStockClosing.closingCenter?._id?.toString() ===
      (userCenter?._id?.toString() || userCenter?.toString());

    if (stockClosingForOtherCenter !== undefined && !userIsClosingCenter) {
      return res.status(400).json({
        success: false,
        message:
          "Only the closing center can update stockClosingForOtherCenter field",
      });
    }

    if (products && Array.isArray(products)) {
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Products array cannot be empty",
        });
      }

      for (const [index, product] of products.entries()) {
        if (
          !product.product ||
          product.productQty === undefined ||
          product.damageQty === undefined
        ) {
          return res.status(400).json({
            success: false,
            message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
          });
        }

        if (product.damageQty > product.productQty) {
          return res.status(400).json({
            success: false,
            message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
          });
        }
      }
    }

    const actualStockClosingForOtherCenter = Boolean(
      stockClosingForOtherCenter
    );

    if (actualStockClosingForOtherCenter) {
      if (!center) {
        return res.status(400).json({
          success: false,
          message: "Center is required when stock closing is for other center",
        });
      }

      if (
        permissions.view_closing_stock_own_center &&
        !permissions.view_closing_stock_all_center
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You need view_closing_stock_all_center permission to update stock closing for other centers.",
        });
      }

      if (!isOutlet) {
        return res.status(400).json({
          success: false,
          message:
            "Only outlet users can update stock closing for other centers",
        });
      }
    }

    const updateData = {};

    if (date !== undefined) updateData.date = date;
    if (products !== undefined) updateData.products = products;
    if (status !== undefined) updateData.status = status;
    if (remark !== undefined) updateData.remark = remark;

    if (stockClosingForOtherCenter !== undefined && userIsClosingCenter) {
      updateData.stockClosingForOtherCenter = actualStockClosingForOtherCenter;
    }

    if (actualStockClosingForOtherCenter && userIsClosingCenter) {
      updateData.center = center;
    } else if (stockClosingForOtherCenter === false && userIsClosingCenter) {
      updateData.center = undefined;
    }

    const updatedStockClosing = await StockClosing.findOneAndUpdate(
      filter,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode centerType" },
      { path: "closingCenter", select: "centerName centerCode centerType" },
      { path: "createdBy", select: "name email" },
      { path: "linkedStockClosing", select: "_id closingCenter status" },
    ]);

    res.json({
      success: true,
      message: "Stock closing updated successfully",
      data: updatedStockClosing,
    });
  } catch (error) {
    console.error("Update stock closing error:", error);
    handleControllerError(error, res);
  }
};

export const deleteStockClosing = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(
      req,
      ["manage_closing_stock_own_center", "manage_closing_stock_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_closing_stock_own_center or manage_closing_stock_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    let filter = { _id: id };

    if (
      permissions.manage_closing_stock_own_center &&
      !permissions.manage_closing_stock_all_center &&
      userCenter
    ) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter },
        ],
      };
    }

    const stockClosing = await StockClosing.findOne(filter);
    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message:
          "Stock closing not found or you don't have permission to delete it",
      });
    }

    if (stockClosing.linkedStockClosing) {
      await StockClosing.findByIdAndDelete(stockClosing.linkedStockClosing);
    }

    await StockClosing.updateMany(
      { linkedStockClosing: stockClosing._id },
      { $unset: { linkedStockClosing: "" } }
    );

    await StockClosing.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Stock closing deleted successfully",
    });
  } catch (error) {
    console.error("Delete stock closing error:", error);
    handleControllerError(error, res);
  }
};

export const getMyCenterStockClosings = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(
      req,
      ["view_closing_stock_own_center", "view_closing_stock_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
    } = req.query;

    if (!userCenter) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with any center",
      });
    }

    const filter = {
      closingCenter: userCenter._id || userCenter,
    };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [stockClosings, totalCount] = await Promise.all([
      StockClosing.find(filter)
        .populate([
          {
            path: "products.product",
            select: "productTitle productCode productPrice",
          },
          { path: "center", select: "centerName centerCode centerType" },
          { path: "closingCenter", select: "centerName centerCode centerType" },
          { path: "createdBy", select: "name email" },
          { path: "linkedStockClosing", select: "_id closingCenter status" },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      StockClosing.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      message: "My center stock closings retrieved successfully",
      data: {
        stockClosings,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNext,
          hasPrev,
        },
      },
    });
  } catch (error) {
    console.error("Get my center stock closings error:", error);
    handleControllerError(error, res);
  }
};


export const updateStockClosingStatus = async (req, res) => {
  try {
    const { hasAccess } = checkStockClosingPermissions(req, [
      "manage_closing_stock_own_center", 
      "manage_closing_stock_all_center"
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_closing_stock_own_center or manage_closing_stock_all_center permission required.",
      });
    }

    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required in request body",
      });
    }

    const validStatuses = ["Submitted", "Approved", "Duplicate"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const { permissions, userCenter } = checkStockClosingPermissions(req, [
      "view_closing_stock_own_center",
      "view_closing_stock_all_center",
    ]);

    let filter = { _id: id };

    if (
      permissions.manage_closing_stock_own_center &&
      !permissions.manage_closing_stock_all_center &&
      userCenter
    ) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter },
        ],
      };
    }

    const existingStockClosing = await StockClosing.findOne(filter);
    
    if (!existingStockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found or you don't have permission to update it",
      });
    }

    if (existingStockClosing.status === status) {
      return res.status(400).json({
        success: false,
        message: `Stock closing is already in "${status}" status`,
      });
    }

    // Determine the approvedRemark based on status
    let approvedRemark = "";
    if (status === "Approved") {
      approvedRemark = "Approved By Admin";
    } else if (status === "Duplicate") {
      approvedRemark = "Duplicate Entry";
    }

    const updateData = { 
      status,
      ...(approvedRemark && { approvedRemark })
    };

    let mainStockClosingId = id;
    let linkedStockClosingId = null;

    // Check if this is a linked entry (has linkedStockClosing reference)
    if (existingStockClosing.linkedStockClosing) {
      // This is a secondary/linked entry - we need to find and update the main entry
      const mainEntry = await StockClosing.findOne({ 
        linkedStockClosing: id 
      });
      
      if (mainEntry) {
        mainStockClosingId = mainEntry._id;
        linkedStockClosingId = id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Cannot update status of linked stock closing entry directly. Update the main entry instead.",
        });
      }
    } else {
      // This is a main entry - check if it has a linked entry
      linkedStockClosingId = existingStockClosing.linkedStockClosing;
    }

    // Update the main entry
    const updatedStockClosing = await StockClosing.findOneAndUpdate(
      { _id: mainStockClosingId },
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode centerType" },
      { path: "closingCenter", select: "centerName centerCode centerType" },
      { path: "createdBy", select: "name email" },
      { path: "linkedStockClosing", select: "_id closingCenter status" },
    ]);

    // Update the linked entry if it exists
    if (linkedStockClosingId) {
      await StockClosing.findByIdAndUpdate(
        linkedStockClosingId,
        updateData,
        { new: true, runValidators: true }
      );
    }

    res.json({
      success: true,
      message: `Stock closing status updated to "${status}" successfully`,
      data: updatedStockClosing,
    });

  } catch (error) {
    console.error("Update stock closing status error:", error);
    handleControllerError(error, res);
  }
};