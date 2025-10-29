import StockPurchase from "../models/StockPurchase.js";
import OutletStock from "../models/OutletStock.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import mongoose from "mongoose";


const checkStockPurchasePermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const purchaseModule = userPermissions.find(
    (perm) => perm.module === "Purchase"
  );

  if (!purchaseModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    add_purchase_stock:
      purchaseModule.permissions.includes("add_purchase_stock"),
    view_own_purchase_stock: purchaseModule.permissions.includes(
      "view_own_purchase_stock"
    ),
    view_all_purchase_stock: purchaseModule.permissions.includes(
      "view_all_purchase_stock"
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

const checkPurchaseCenterAccess = async (
  userId,
  targetOutletId,
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

  if (permissions.view_all_purchase_stock) {
    return targetOutletId || user.center._id;
  }

  if (permissions.view_own_purchase_stock) {
    const userCenterId = user.center._id || user.center;

    if (
      targetOutletId &&
      targetOutletId.toString() !== userCenterId.toString()
    ) {
      throw new Error(
        "Access denied. You can only access your own center's purchase data."
      );
    }

    return userCenterId;
  }

  throw new Error("Insufficient permissions to access purchase data");
};

const getUserOutletId = async (userId) => {
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

const validateUserOutletAccess = async (userId) => {
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

  return user.center._id;
};

export const createStockPurchase = async (req, res) => {
  try {
    const { hasAccess, permissions } = checkStockPurchasePermissions(req, [
      "add_purchase_stock",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. add_purchase_stock permission required.",
      });
    }

    const {
      type,
      date,
      invoiceNo,
      vendor,
      outlet,
      transportAmount = 0,
      remark = "",
      cgst = 0,
      sgst = 0,
      igst = 0,
      products,
    } = req.body;

    let outletId = outlet;
    if (!outletId) {
      outletId = await getUserOutletId(req.user._id, permissions);
    } else {
      outletId = await checkPurchaseCenterAccess(
        req.user._id,
        outletId,
        permissions
      );
    }

    const processedProducts = products.map((product) => {
      const processedProduct = {
        product: product.product,
        price: product.price,
        purchasedQuantity: product.purchasedQuantity,
        availableQuantity: product.purchasedQuantity,
        serialNumbers: [],
      };

      if (product.serialNumbers && product.serialNumbers.length > 0) {
        processedProduct.serialNumbers = product.serialNumbers.map(
          (serialNumber) => ({
            serialNumber:
              typeof serialNumber === "string"
                ? serialNumber
                : serialNumber.serialNumber,
            status: "available",
            currentLocation: outletId,
            transferredTo: null,
            transferDate: null,
          })
        );
      }

      return processedProduct;
    });

    const stockPurchase = new StockPurchase({
      type: type || "new",
      date: date || new Date(),
      invoiceNo: invoiceNo.trim(),
      vendor,
      outlet: outletId,
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products: processedProducts,
    });

    const savedPurchase = await stockPurchase.save();

    for (const productItem of savedPurchase.products) {
      await OutletStock.updateStock(
        outletId,
        productItem.product,
        productItem.purchasedQuantity,
        productItem.serialNumbers,
        savedPurchase._id
      );
    }

    const populatedPurchase = await StockPurchase.findById(savedPurchase._id)
      .populate("vendor", "businessName name email mobile gstNumber")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate(
        "products.product",
        "productTitle productCode productPrice trackSerialNumber"
      );

    res.status(201).json({
      success: true,
      message: "Stock purchase created successfully",
      data: populatedPurchase,
    });
  } catch (error) {
    console.error("Error creating stock purchase:", error);
    handleControllerError(error, res);
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

const buildStockPurchaseFilter = (query, outletId, permissions, userCenter) => {
  const {
    type,
    vendor,
    startDate,
    endDate,
    invoiceNo,
    search,
    dateFilter,
    customStartDate,
    customEndDate,
  } = query;

  const filter = { outlet: outletId };

  if (
    permissions.view_own_purchase_stock &&
    !permissions.view_all_purchase_stock &&
    userCenter
  ) {
    const userCenterId = userCenter._id || userCenter;
    filter.outlet = userCenterId;
  }

  if (type) filter.type = type;

  const vendorFilter = buildArrayFilter(vendor);
  if (vendorFilter) filter.vendor = vendorFilter;

  const dateFilterObj = buildDateFilter(
    dateFilter,
    customStartDate,
    customEndDate,
    startDate,
    endDate
  );
  if (dateFilterObj) filter.date = dateFilterObj;

  const invoiceNoFilter = buildArrayFilter(invoiceNo);
  if (invoiceNoFilter) {
    filter.invoiceNo =
      typeof invoiceNoFilter === "object"
        ? invoiceNoFilter
        : { $regex: invoiceNoFilter, $options: "i" };
  }

  if (search) {
    filter.$or = [
      { invoiceNo: { $regex: search, $options: "i" } },
      { remark: { $regex: search, $options: "i" } },

      { "vendor.businessName": { $regex: search, $options: "i" } },

      { "products.product.productTitle": { $regex: search, $options: "i" } },
      { "products.productRemark": { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

const buildStockPurchaseSortOptions = (
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  const validSortFields = [
    "createdAt",
    "updatedAt",
    "date",
    "invoiceNo",
    "totalAmount",
    "grandTotal",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

const stockPurchasePopulateOptions = [
  { path: "vendor", select: "_id businessName contactPerson phone email" },
  { path: "outlet", select: "_id centerName centerCode centerType" },
  {
    path: "products.product",
    select:
      "_id productTitle productCode productImage productCategory trackSerialNumber",
  },
];


// export const getAllStockPurchases = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } =
//       checkStockPurchasePermissions(req, [
//         "view_own_purchase_stock",
//         "view_all_purchase_stock",
//       ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
//       });
//     }

//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "createdAt",
//       sortOrder = "desc",
//       ...filterParams
//     } = req.query;

//     const outletId = await validateUserOutletAccess(req.user._id);

//     const filter = buildStockPurchaseFilter(
//       filterParams,
//       outletId,
//       permissions,
//       userCenter
//     );

//     const sortOptions = buildStockPurchaseSortOptions(sortBy, sortOrder);

//     const [purchases, total] = await Promise.all([
//       StockPurchase.find(filter)
//         .populate(stockPurchasePopulateOptions)
//         .sort(sortOptions)
//         .limit(parseInt(limit))
//         .skip((parseInt(page) - 1) * parseInt(limit))
//         .lean(),

//       StockPurchase.countDocuments(filter),
//     ]);

//     if (purchases.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No stock purchases found",
//         data: [],
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages: 0,
//           totalItems: 0,
//           itemsPerPage: parseInt(limit),
//         },
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: "Stock purchases retrieved successfully",
//       data: purchases,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving stock purchases:", error);
//     handleControllerError(error, res);
//   }
// };



export const getAllStockPurchases = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      outlet,
      startDate,
      endDate,
      ...otherParams
    } = req.query;

    const filter = {};

    if (permissions.view_all_purchase_stock && outlet) {

      filter.outlet = outlet;
    } else if (permissions.view_own_purchase_stock && !permissions.view_all_purchase_stock) {
      const userOutletId = await validateUserOutletAccess(req.user._id);
      filter.outlet = userOutletId;
    } else if (outlet) {
      filter.outlet = outlet;
    }
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },

        { "vendor.businessName": { $regex: search, $options: "i" } },
        { "vendor.name": { $regex: search, $options: "i" } },
        { "vendor.email": { $regex: search, $options: "i" } },
        { "vendor.mobile": { $regex: search, $options: "i" } },
      
        { "outlet.centerName": { $regex: search, $options: "i" } },
        { "outlet.centerCode": { $regex: search, $options: "i" } },
      
        { "products.product.productTitle": { $regex: search, $options: "i" } },
        { "products.product.productCode": { $regex: search, $options: "i" } },

        { "products.serialNumbers.serialNumber": { $regex: search, $options: "i" } },
      ];
    }
    if (otherParams.type) {
      filter.type = otherParams.type;
    }
    
    if (otherParams.vendor) {
      filter.vendor = otherParams.vendor;
    }

    const sortOptions = buildStockPurchaseSortOptions(sortBy, sortOrder);

    const total = await StockPurchase.countDocuments(filter);

    const purchases = await StockPurchase.find(filter)
      .populate(stockPurchasePopulateOptions)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    if (purchases.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No stock purchases found",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit),
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock purchases retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving stock purchases:", error);
    handleControllerError(error, res);
  }
};

export const getStockPurchaseById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const { id } = req.params;

    const outletId = await validateUserOutletAccess(req.user._id);

    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      filter.outlet = userCenterId;
    }

    const purchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    })
      .populate("vendor", "businessName")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate(
        "products.product",
        "productTitle productCode productPrice productImage"
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock purchase retrieved successfully",
      data: purchase,
    });
  } catch (error) {
    console.error("Error retrieving stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const updateStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;

    const outletId = await validateUserOutletAccess(req.user._id);

    const {
      type,
      date,
      invoiceNo,
      vendor,
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products,
    } = req.body;

    const existingPurchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    });

    if (!existingPurchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    const hasTransfers = existingPurchase.products.some(
      (product) => product.availableQuantity < product.purchasedQuantity
    );

    if (hasTransfers) {
      return res.status(400).json({
        success: false,
        message: "Cannot update stock purchase that has transferred stock",
      });
    }

    for (const productItem of existingPurchase.products) {
      await OutletStock.findOneAndUpdate(
        { outlet: outletId, product: productItem.product },
        {
          $inc: {
            totalQuantity: -productItem.purchasedQuantity,
            availableQuantity: -productItem.purchasedQuantity,
          },
          $pull: {
            serialNumbers: { purchaseId: existingPurchase._id },
          },
        }
      );
    }

    let processedProducts = existingPurchase.products;
    if (products && Array.isArray(products)) {
      processedProducts = products.map((product) => {
        const processedProduct = {
          product: product.product,
          price: product.price,
          purchasedQuantity: product.purchasedQuantity,
          availableQuantity: product.purchasedQuantity,
          serialNumbers: [],
        };

        if (product.serialNumbers && product.serialNumbers.length > 0) {
          processedProduct.serialNumbers = product.serialNumbers.map(
            (serialNumber) => ({
              serialNumber:
                typeof serialNumber === "string"
                  ? serialNumber
                  : serialNumber.serialNumber,
              status: "available",
              currentLocation: outletId,
              transferredTo: null,
              transferDate: null,
            })
          );
        }

        return processedProduct;
      });
    }

    const updateData = {
      ...(type && { type }),
      ...(date && { date }),
      ...(invoiceNo && { invoiceNo: invoiceNo.trim() }),
      ...(vendor && { vendor }),
      ...(transportAmount !== undefined && { transportAmount }),
      ...(remark !== undefined && { remark }),
      ...(cgst !== undefined && { cgst }),
      ...(sgst !== undefined && { sgst }),
      ...(igst !== undefined && { igst }),
      ...(products && { products: processedProducts }),
    };

    const updatedPurchase = await StockPurchase.findOneAndUpdate(
      { _id: id, outlet: outletId },
      updateData,
      { new: true, runValidators: true }
    );

    for (const productItem of updatedPurchase.products) {
      await OutletStock.updateStock(
        outletId,
        productItem.product,
        productItem.purchasedQuantity,
        productItem.serialNumbers,
        updatedPurchase._id
      );
    }

    const populatedPurchase = await StockPurchase.findById(updatedPurchase._id)
      .populate("vendor", "businessName name email mobile")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode productPrice");

    res.status(200).json({
      success: true,
      message: "Stock purchase updated successfully",
      data: populatedPurchase,
    });
  } catch (error) {
    console.error("Error updating stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const deleteStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;

    const outletId = await validateUserOutletAccess(req.user._id);

    const purchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    const hasTransfers = purchase.products.some(
      (product) => product.availableQuantity < product.purchasedQuantity
    );

    if (hasTransfers) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete stock purchase that has transferred stock",
      });
    }

    for (const productItem of purchase.products) {
      await OutletStock.findOneAndUpdate(
        { outlet: outletId, product: productItem.product },
        {
          $inc: {
            totalQuantity: -productItem.purchasedQuantity,
            availableQuantity: -productItem.purchasedQuantity,
          },
          $pull: {
            serialNumbers: { purchaseId: purchase._id },
          },
        }
      );
    }

    await StockPurchase.findOneAndDelete({ _id: id, outlet: outletId });

    res.status(200).json({
      success: true,
      message: "Stock purchase deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const getPurchasesByVendor = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const outletId = await validateUserOutletAccess(req.user._id);

    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      filter.outlet = userCenterId;
    }

    const purchases = await StockPurchase.find({
      vendor: vendorId,
      outlet: outletId,
    })
      .populate("vendor", "businessName name email mobile")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode")
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments({
      vendor: vendorId,
      outlet: outletId,
    });

    res.status(200).json({
      success: true,
      message: "Vendor purchases retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving vendor purchases:", error);
    handleControllerError(error, res);
  }
};

export const getAllProductsWithStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
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

export const getAvailableStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const { productId } = req.params;
    let outletId;
    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      outletId = userCenter._id || userCenter;
    } else {
      const user = await User.findById(req.user._id).populate("center");
      if (user && user.center && user.center.centerType === "Outlet") {
        outletId = user.center._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Outlet context required for available stock lookup",
        });
      }
    }

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    })
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("outlet", "centerName centerCode centerType address");

    if (!outletStock) {
      const product = await Product.findById(productId).select(
        "productTitle productCode trackSerialNumber"
      );
      const outlet = await Center.findById(outletId).select(
        "centerName centerCode centerType address"
      );

      return res.status(200).json({
        success: true,
        message: "Available stock retrieved successfully",
        data: {
          product,
          outlet,
          totalAvailable: 0,
          availableByPurchase: [],
        },
      });
    }

    const stockByPurchase = await StockPurchase.aggregate([
      {
        $match: {
          outlet: new mongoose.Types.ObjectId(outletId),
          "products.product": new mongoose.Types.ObjectId(productId),
          "products.availableQuantity": { $gt: 0 },
        },
      },
      { $unwind: "$products" },
      {
        $match: {
          "products.product": new mongoose.Types.ObjectId(productId),
          "products.availableQuantity": { $gt: 0 },
        },
      },
      {
        $project: {
          purchaseId: "$_id",
          date: 1,
          invoiceNo: 1,
          availableQuantity: "$products.availableQuantity",
          serialNumbers: {
            $filter: {
              input: "$products.serialNumbers",
              as: "serial",
              cond: { $eq: ["$$serial.status", "available"] },
            },
          },
        },
      },
      { $sort: { date: 1 } },
    ]);

    const availableByPurchase = stockByPurchase.map((purchase) => ({
      purchaseId: purchase.purchaseId,
      availableQuantity: purchase.availableQuantity,
      serials: purchase.serialNumbers.map((sn) => sn.serialNumber),
      purchaseDate: purchase.date,
      invoiceNo: purchase.invoiceNo,
    }));

    res.status(200).json({
      success: true,
      message: "Available stock retrieved successfully",
      data: {
        product: outletStock.product,
        outlet: outletStock.outlet,
        totalAvailable: outletStock.availableQuantity,
        availableByPurchase,
      },
    });
  } catch (error) {
    console.error("Error retrieving available stock:", error);
    handleControllerError(error, res);
  }
};

export const getOutletStockSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    let outletId;
    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      outletId = userCenter._id || userCenter;
    } else {
      const user = await User.findById(req.user._id).populate("center");
      if (user && user.center && user.center.centerType === "Outlet") {
        outletId = user.center._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "User is not associated with an outlet",
        });
      }
    }

    const outlet = await Center.findById(outletId).select(
      "centerName centerCode centerType address phone email"
    );

    if (!outlet) {
      return res.status(404).json({
        success: false,
        message: "Outlet not found",
      });
    }

    const stockSummary = await OutletStock.find({ outlet: outletId })
      .populate(
        "product",
        "productTitle productCode category trackSerialNumber productImage"
      )
      .populate("outlet", "centerName centerCode centerType")
      .sort({ "product.productTitle": 1 });

    const totalProducts = stockSummary.length;
    const totalQuantity = stockSummary.reduce(
      (sum, item) => sum + item.totalQuantity,
      0
    );
    const availableQuantity = stockSummary.reduce(
      (sum, item) => sum + item.availableQuantity,
      0
    );

    res.status(200).json({
      success: true,
      message: "Outlet stock summary retrieved successfully",
      data: {
        outlet,
        summary: {
          totalProducts,
          totalQuantity,
          availableQuantity,
          inTransitQuantity: totalQuantity - availableQuantity,
        },
        products: stockSummary,
      },
    });
  } catch (error) {
    console.error("Error retrieving outlet stock summary:", error);
    handleControllerError(error, res);
  }
};

export const getCenterStockSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const { centerId } = req.params;

    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (centerId !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view your own center's stock summary.",
        });
      }
    }

    const center = await Center.findById(centerId).select(
      "centerName centerCode centerType address phone email"
    );

    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    const stockSummary = await CenterStock.getCenterStockSummary(centerId);

    const responseData = Array.isArray(stockSummary)
      ? stockSummary.map((item) => ({
          ...item,
          center: center,
        }))
      : stockSummary;

    res.status(200).json({
      success: true,
      message: "Center stock summary retrieved successfully",
      data: {
        center,
        stockSummary: responseData,
      },
    });
  } catch (error) {
    console.error("Error retrieving center stock summary:", error);
    handleControllerError(error, res);
  }
};


export const getOutletSerialNumbers = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockPurchasePermissions(req, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required.",
      });
    }

    const { productId, outletId } = req.params;

    if (
      permissions.view_own_purchase_stock &&
      !permissions.view_all_purchase_stock &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (outletId !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view serial numbers from your own outlet.",
        });
      }
    }

    if (!outletId) {
      return res.status(400).json({
        success: false,
        message: "Outlet ID is required",
      });
    }

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    })
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    if (!outletStock) {
      return res.status(200).json({
        success: true,
        message: "No stock found for the specified product",
        data: {
          outlet: await Center.findById(outletId).select(
            "centerName centerCode centerType"
          ),
          product: await Product.findById(productId).select(
            "productTitle productCode trackSerialNumber"
          ),
          availableSerials: [],
          totalAvailable: 0,
        },
      });
    }

    const availableSerials = outletStock.serialNumbers
      .filter((sn) => sn.status === "available")
      .map((sn) => ({
        serialNumber: sn.serialNumber,
        purchaseId: sn.purchaseId,
        currentLocation: sn.currentLocation,
        status: sn.status,
      }));

    res.status(200).json({
      success: true,
      message: "Available serial numbers retrieved successfully",
      data: {
        outletStock: {
          _id: outletStock._id,
          outlet: outletStock.outlet,
          product: outletStock.product,
          totalQuantity: outletStock.totalQuantity,
          availableQuantity: outletStock.availableQuantity,
        },
        availableSerials,
        totalAvailable: availableSerials.length,
      },
    });
  } catch (error) {
    console.error("Error retrieving outlet serial numbers:", error);
    handleControllerError(error, res);
  }
};

export const updateOutletSerialNumber = async (req, res) => {
  try {
    const { productId, serialNumber } = req.params;
    const { newSerialNumber } = req.body;

    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    });

    if (!outletStock) {
      return res.status(404).json({
        success: false,
        message: "Outlet stock not found for the specified product",
      });
    }

    const serialIndex = outletStock.serialNumbers.findIndex(
      (sn) => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serialIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Serial number not found or not available",
      });
    }

    const oldSerialNumber = outletStock.serialNumbers[serialIndex].serialNumber;
    outletStock.serialNumbers[serialIndex].serialNumber = newSerialNumber;
    outletStock.lastUpdated = new Date();

    await outletStock.save();

    await StockPurchase.updateOne(
      {
        outlet: outletId,
        "products.product": productId,
        "products.serialNumbers.serialNumber": oldSerialNumber,
      },
      {
        $set: {
          "products.$[product].serialNumbers.$[serial].serialNumber":
            newSerialNumber,
        },
      },
      {
        arrayFilters: [
          { "product.product": new mongoose.Types.ObjectId(productId) },
          { "serial.serialNumber": oldSerialNumber },
        ],
      }
    );

    const updatedStock = await OutletStock.findById(outletStock._id)
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    res.status(200).json({
      success: true,
      message: "Serial number updated successfully",
      data: {
        outletStock: updatedStock,
        oldSerialNumber,
        newSerialNumber,
        updatedAt: outletStock.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error updating outlet serial number:", error);
    handleControllerError(error, res);
  }
};

export const deleteOutletSerialNumber = async (req, res) => {
  try {
    const { productId, serialNumber } = req.params;

    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    });

    if (!outletStock) {
      return res.status(404).json({
        success: false,
        message: "Outlet stock not found for the specified product",
      });
    }

    const serialIndex = outletStock.serialNumbers.findIndex(
      (sn) => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serialIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Serial number not found or not available",
      });
    }

    outletStock.serialNumbers.splice(serialIndex, 1);
    outletStock.totalQuantity -= 1;
    outletStock.availableQuantity -= 1;
    outletStock.lastUpdated = new Date();

    await outletStock.save();

    await StockPurchase.updateOne(
      {
        outlet: outletId,
        "products.product": productId,
        "products.serialNumbers.serialNumber": serialNumber,
      },
      {
        $pull: {
          "products.$[product].serialNumbers": { serialNumber: serialNumber },
        },
        $inc: {
          "products.$[product].availableQuantity": -1,
          "products.$[product].purchasedQuantity": -1,
        },
      },
      {
        arrayFilters: [
          { "product.product": new mongoose.Types.ObjectId(productId) },
        ],
      }
    );

    const updatedStock = await OutletStock.findById(outletStock._id)
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    res.status(200).json({
      success: true,
      message: "Serial number deleted and stock adjusted successfully",
      data: {
        outletStock: updatedStock,
        deletedSerialNumber: serialNumber,
        stockAdjustment: {
          totalQuantity: -1,
          availableQuantity: -1,
        },
        updatedAt: outletStock.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error deleting outlet serial number:", error);
    handleControllerError(error, res);
  }
};

const handleControllerError = (error, res) => {
  console.error("Controller Error:", error);

  if (
    error.message.includes("User center information not found") ||
    error.message.includes("User authentication required") ||
    error.message.includes("User not found") ||
    error.message.includes("User ID is required")
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
      message: "Duplicate invoice number found",
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
