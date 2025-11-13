
import OutletStock from "../models/OutletStock.js";
import RaisePO from "../models/RaisePO.js";
import User from "../models/User.js";


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

const isAdmin = (req) => {
  console.log('User role check:', {
    role: req.user.role,
    roleTitle: req.user.role?.roleTitle,
    isAdmin: req.user.role?.isAdmin
  });
  
  return req.user.role?.roleTitle?.toLowerCase() === 'admin' || req.user.role?.isAdmin === true;
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



const stockPurchasePopulateOptions = [
  { path: "vendor", select: "_id businessName contactPerson phone email gstNumber state" },
  { path: "outlet", select: "_id centerName centerCode centerType" },
  {
    path: "products.product",
    select:
      "_id productTitle productCode productImage productCategory trackSerialNumber",
  },
  { path: "createdBy", select: "_id fullName email" },
  { path: "approvedBy", select: "_id fullName email" }
];

export const createRaisePO = async (req, res) => {
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

    const { date, voucherNo, vendor, outlet, products } = req.body;

    let outletId = outlet;
    if (!outletId) {
      outletId = await getUserOutletId(req.user._id);
    } else {
      outletId = await checkPOCenterAccess(req.user._id, outletId, permissions);
    }

    const processedProducts = products.map((product) => {
      return {
        product: product.product,
        price: product.price,
        purchasedQuantity: product.purchasedQuantity,
        availableQuantity: product.purchasedQuantity,
      };
    });

    const raisePO = new RaisePO({
      date: date || new Date(),
      voucherNo: voucherNo.trim(),
      vendor: vendor,
      outlet: outletId,
      products: processedProducts,
      createdBy: req.user._id,
      status: "pending" 
    });

    const savedPO = await raisePO.save();

    const populatedPO = await RaisePO.findById(savedPO._id)
      .populate("vendor", "businessName name email mobile gstNumber")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode productPrice")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Purchase Order created successfully and pending approval",
      data: populatedPO,
    });
  } catch (error) {
    console.error("Error creating purchase order:", error);
    handleControllerError(error, res);
  }
};

export const getAllRaisePO = async (req, res) => {
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
      limit = 100,
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
        { voucherNo: { $regex: search, $options: "i" } },
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

    const total = await RaisePO.countDocuments(filter);

    const purchases = await RaisePO.find(filter)
      .populate(stockPurchasePopulateOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    if (purchases.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No raise po found",
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
      message: "Data retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving raise po:", error);
    handleControllerError(error, res);
  }
};

export const deletePO = async (req, res) => {
  try {
    const { id } = req.params;

    const outletId = await validateUserOutletAccess(req.user._id);

    const purchase = await RaisePO.findOne({
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

    await RaisePO.findOneAndDelete({ _id: id, outlet: outletId });

    res.status(200).json({
      success: true,
      message: "po deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting po data:", error);
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


export const approveRaisePO = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only admin can approve
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin can approve POs.",
      });
    }

    const po = await RaisePO.findById(id);
    if (!po) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (po.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `PO is already ${po.status}`,
      });
    }

    // Update PO status and approval info
    po.status = "approved";
    po.approvedBy = req.user._id;
    po.approvedAt = new Date();
    
    const approvedPO = await po.save();

    // NOW update stock after approval
    for (const productItem of approvedPO.products) {
      await OutletStock.updateStock(
        po.outlet,
        productItem.product,
        productItem.purchasedQuantity,
        approvedPO._id
      );
    }

    const populatedPO = await RaisePO.findById(approvedPO._id)
      .populate("vendor", "businessName name email mobile gstNumber")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode productPrice")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.status(200).json({
      success: true,
      message: "Purchase Order approved successfully",
      data: populatedPO,
    });
  } catch (error) {
    console.error("Error approving purchase order:", error);
    handleControllerError(error, res);
  }
};

export const rejectRaisePO = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin can reject POs.",
      });
    }

    const po = await RaisePO.findById(id);
    if (!po) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (po.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `PO is already ${po.status}`,
      });
    }

    po.status = "rejected";
    po.approvedBy = req.user._id;
    po.approvedAt = new Date();
    
    const rejectedPO = await po.save();

    res.status(200).json({
      success: true,
      message: "Purchase Order rejected successfully",
      data: rejectedPO,
    });
  } catch (error) {
    console.error("Error rejecting purchase order:", error);
    handleControllerError(error, res);
  }
};
