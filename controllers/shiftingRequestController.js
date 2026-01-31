import ShiftingRequest from "../models/ShiftingRequest.js";
import Customer from "../models/Customer.js";
import { validationResult } from "express-validator";
import User from "../models/User.js";
import FilledStock from "../models/FilledStock.js";
import EntityStockUsage from "../models/EntityStockUsage.js"
import mongoose from "mongoose";
const checkShiftingPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const shiftingModule = userPermissions.find(
    (perm) => perm.module === "Shifting"
  );

  if (!shiftingModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_shifting_own_center: shiftingModule.permissions.includes(
      "manage_shifting_own_center"
    ),
    manage_shifting_all_center: shiftingModule.permissions.includes(
      "manage_shifting_all_center"
    ),
    view_shifting_own_center: shiftingModule.permissions.includes(
      "view_shifting_own_center"
    ),
    view_shifting_all_center: shiftingModule.permissions.includes(
      "view_shifting_all_center"
    ),
    accept_shifting_own_center: shiftingModule.permissions.includes(
      "accept_shifting_own_center"
    ),
    accept_shifting_all_center: shiftingModule.permissions.includes(
      "accept_shifting_all_center"
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

export const createShiftingRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["manage_shifting_own_center", "manage_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_shifting_own_center or manage_shifting_all_center permission required.",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { date, customer, address1, address2, city, remark, toCenter } =
      req.body;
    const loginUser = req.user;

    let fromCenterId = loginUser.center?._id || loginUser.center;
    if (!fromCenterId) {
      fromCenterId = await getUserCenterId(req.user._id);
    }

    const customerData = await Customer.findById(customer);
    if (!customerData) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    if (
      permissions.manage_shifting_own_center &&
      !permissions.manage_shifting_all_center
    ) {
      if (String(customerData.center) !== String(fromCenterId)) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only create shifting requests for customers in your center.",
        });
      }
    }

    const existingPendingRequest = await ShiftingRequest.findOne({
      customer: customer,
      status: "Pending",
    });

    if (existingPendingRequest) {
      return res.status(400).json({
        success: false,
        message:
          "There is already a pending shifting request for this customer",
      });
    }

    if (String(customerData.center) === String(toCenter)) {
      return res.status(400).json({
        success: false,
        message: "Customer is already registered in the target center",
      });
    }

    const newRequest = new ShiftingRequest({
      date,
      customer,
      address1,
      address2,
      city,
      remark,
      fromCenter: fromCenterId,
      toCenter: toCenter || fromCenterId,
    });

    await newRequest.save();

    const populatedRequest = await ShiftingRequest.findById(newRequest._id)
      .populate("customer", "name username mobile center")
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode");

    res.status(201).json({
      success: true,
      message: "Shifting request created successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error creating shifting request:", error);
    handleControllerError(error, res);
  }
};

// export const getAllShiftingRequests = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
//       req,
//       ["view_shifting_own_center", "view_shifting_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
//       });
//     }

//     const { search, center, status, page = 1, limit = 100 } = req.query;

//     const query = {};
//     if (
//       permissions.view_shifting_own_center &&
//       !permissions.view_shifting_all_center &&
//       userCenter
//     ) {
//       query.toCenter = userCenter._id || userCenter;
//     } else if (center && permissions.view_shifting_all_center) {
//       query.toCenter = center;
//     }
//     if (search) {
//       query.$or = [
//         { remark: { $regex: search, $options: "i" } },
//         { status: { $regex: search, $options: "i" } },
//         { "customer.name": { $regex: search, $options: "i" } },
//         { "fromCenter.centerName": { $regex: search, $options: "i" } },
//         { "toCenter.centerName": { $regex: search, $options: "i" } },
//       ];
//     }
//     if (status) {
//       query.status = status;
//     }

//     const total = await ShiftingRequest.countDocuments(query);
//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const requests = await ShiftingRequest.find(query)
//       .populate("customer", "name username mobile email center")
//       .populate("fromCenter", "centerName centerCode")
//       .populate("toCenter", "centerName centerCode")
//       .populate("approvedBy", "fullName email")
//       .populate("rejectedBy", "fullName email")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit));

//     res.status(200).json({
//       success: true,
//       data: requests,
//       pagination: {
//         total,
//         page: parseInt(page),
//         limit: parseInt(limit),
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching shifting requests:", error);
//     handleControllerError(error, res);
//   }
// };



export const getAllShiftingRequests = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["view_shifting_own_center", "view_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
      });
    }

    const { search, center, status, page = 1, limit = 100 } = req.query;

    const query = {};
    
    // Handle permission-based filtering
    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center &&
      userCenter
    ) {
      // Show requests where user's center is either fromCenter OR toCenter
      const userCenterId = userCenter._id || userCenter;
      query.$or = [
        { fromCenter: userCenterId },
        { toCenter: userCenterId }
      ];
    } else if (center && permissions.view_shifting_all_center) {
      // If admin wants to filter by specific center
      query.$or = [
        { fromCenter: center },
        { toCenter: center }
      ];
    }
    // If user has view_shifting_all_center permission and no center filter is provided,
    // they can see all requests, so no query restriction is added
    
    // Search functionality
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { remark: { $regex: search, $options: "i" } },
          { status: { $regex: search, $options: "i" } },
          { "customer.name": { $regex: search, $options: "i" } },
          { "fromCenter.centerName": { $regex: search, $options: "i" } },
          { "toCenter.centerName": { $regex: search, $options: "i" } },
        ]
      });
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }

    const total = await ShiftingRequest.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await ShiftingRequest.find(query)
      .populate("customer", "name username mobile email center")
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add a field to indicate the relationship of user's center to the request
    const requestsWithRelationship = requests.map(request => {
      const requestObj = request.toObject();
      const userCenterId = userCenter?._id?.toString() || userCenter?.toString();
      const fromCenterId = request.fromCenter?._id?.toString();
      const toCenterId = request.toCenter?._id?.toString();
      
      if (userCenterId) {
        if (fromCenterId === userCenterId && toCenterId === userCenterId) {
          requestObj.centerRelationship = "both";
        } else if (fromCenterId === userCenterId) {
          requestObj.centerRelationship = "from";
        } else if (toCenterId === userCenterId) {
          requestObj.centerRelationship = "to";
        }
      }
      
      return requestObj;
    });

    res.status(200).json({
      success: true,
      data: requestsWithRelationship,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      permissionInfo: {
        hasViewAll: permissions.view_shifting_all_center,
        hasViewOwn: permissions.view_shifting_own_center,
        userCenter: userCenter?._id || userCenter
      }
    });
  } catch (error) {
    console.error("Error fetching shifting requests:", error);
    handleControllerError(error, res);
  }
};

const transferCustomerStockToFilledStock = async (shiftingRequest) => {
  try {
    console.log("=== TRANSFERRING CUSTOMER STOCK TO FILLED STOCK ===");
    
    const { customer, fromCenter, toCenter, _id: shiftingRequestId } = shiftingRequest;

    console.log("Searching for customer stock in StockUsage with:", {
      customer: customer,
      fromCenter: fromCenter
    });
    const StockUsage = mongoose.model("StockUsage");
    const customerStockUsages = await StockUsage.find({
      customer: customer,
      center: fromCenter,
      usageType: "Customer",
      status: "completed"
    })
    .populate("items.product", "productTitle productCode trackSerialNumber")
    .sort({ date: -1 });

    console.log(`Found ${customerStockUsages.length} StockUsage records for customer`);
    const productMap = new Map();

    customerStockUsages.forEach(usage => {
      usage.items.forEach(item => {
        if (item.product && item.quantity > 0) {
          const productId = item.product._id.toString();
          
          if (productMap.has(productId)) {
            const existing = productMap.get(productId);
            existing.quantity += item.quantity;
            if (item.serialNumbers && item.serialNumbers.length > 0) {
              item.serialNumbers.forEach(serial => {
                if (!existing.serialNumbers.includes(serial)) {
                  existing.serialNumbers.push(serial);
                }
              });
            }
            if (usage.date > existing.latestUsageDate) {
              existing.usageReference = usage._id;
              existing.latestUsageDate = usage.date;
            }
          } else {
            productMap.set(productId, {
              product: item.product,
              quantity: item.quantity,
              serialNumbers: item.serialNumbers ? [...item.serialNumbers] : [],
              usageReference: usage._id,
              latestUsageDate: usage.date
            });
          }
        }
      });
    });

    const productsToTransfer = Array.from(productMap.values());
    console.log(`Aggregated ${productsToTransfer.length} unique products to transfer`);

    const transferSummary = [];

    for (const stock of productsToTransfer) {
      console.log(`Processing: ${stock.product?.productTitle}, Quantity: ${stock.quantity}, Serials: ${stock.serialNumbers.length}`);
      
      if (stock.quantity > 0) {
        const filledStockSerials = stock.serialNumbers.map(serial => ({
          serialNumber: serial,
          status: "active",
          assignedDate: new Date(),
          originalUsageId: stock.usageReference
        }));
        const filledStockData = {
          customer: customer,
          product: stock.product._id,
          center: fromCenter, 
          quantity: stock.quantity,
          serialNumbers: filledStockSerials,
          originalUsageId: stock.usageReference,
          shiftingRequestId: shiftingRequestId,
          status: "active",
          lastUpdated: new Date()
        };

        console.log("Creating filled stock for center:", toCenter);
        
        await FilledStock.create(filledStockData);

        console.log(`✓ Added ${stock.quantity} units of ${stock.product?.productTitle} to filled stock for center ${toCenter}`);
        
        transferSummary.push({
          product: stock.product?.productTitle,
          quantity: stock.quantity,
          serialNumbers: stock.serialNumbers.length
        });
      }
    }

    console.log("=== CUSTOMER STOCK ADDED TO FILLED STOCK COMPLETED ===");
    console.log("Transfer Summary:", transferSummary);
    
    return {
      transferredProducts: transferSummary.length,
      totalQuantity: transferSummary.reduce((sum, item) => sum + item.quantity, 0),
      fromCenter: fromCenter,
      toCenter: toCenter,
      details: transferSummary
    };
  } catch (error) {
    console.error("Error adding customer stock to filled stock:", error);
    console.error("Error details:", error.message);
    throw error;
  }
};

export const updateShiftingRequestStatus = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["accept_shifting_own_center", "accept_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. accept_shifting_own_center or accept_shifting_all_center permission required.",
      });
    }

    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const user = req.user;

    if (!["Approve", "Reject"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "Approved" or "Rejected".',
      });
    }

    const request = await ShiftingRequest.findById(id)
      .populate("customer", "name mobile center")
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode");

    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Shifting request not found" });
    }

    const userCenterId = user.center?._id || user.center;

    if (
      permissions.accept_shifting_own_center &&
      !permissions.accept_shifting_all_center
    ) {
      if (String(request.toCenter._id) !== String(userCenterId)) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only approve requests where your center is the destination.",
        });
      }
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `This request is already ${request.status.toLowerCase()}.`,
      });
    }

    if (status === "Approve") {
      const customer = await Customer.findById(request.customer._id);
      if (!customer) {
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });
      }

      const transferSummary = await transferCustomerStockToFilledStock(request);

      customer.shiftingHistory.push({
        fromCenter: request.fromCenter._id,
        toCenter: request.toCenter._id,
        shiftingRequest: request._id,
        shiftedAt: new Date(),
        shiftedBy: user._id,
      });

      customer.center = request.toCenter._id;
      await customer.save();

      request.status = "Approve";
      request.approvedBy = user._id;
      request.approvedAt = new Date();
      request.customerCenterUpdated = true;
      request.customerCenterUpdatedAt = new Date();

      await request.save();

      const updatedRequest = await ShiftingRequest.findById(id)
        .populate("customer", "name username mobile center")
        .populate("fromCenter", "centerName centerCode")
        .populate("toCenter", "centerName centerCode")
        .populate("approvedBy", "fullName email")
        .populate("rejectedBy", "fullName email");

      res.status(200).json({
        success: true,
        message: `Shifting request approved successfully. ${transferSummary.transferredProducts} products added to filled stock for the new center.`,
        data: updatedRequest,
        transferSummary: transferSummary
      });

    } else if (status === "Reject") {
      request.status = "Reject";
      request.rejectedBy = user._id;
      request.rejectedAt = new Date();
      if (rejectionReason) {
        request.remark =
          request.remark + ` | Rejection Reason: ${rejectionReason}`;
      }

      await request.save();

      const updatedRequest = await ShiftingRequest.findById(id)
        .populate("customer", "name username mobile center")
        .populate("fromCenter", "centerName centerCode")
        .populate("toCenter", "centerName centerCode")
        .populate("approvedBy", "fullName email")
        .populate("rejectedBy", "fullName email");

      res.status(200).json({
        success: true,
        message: "Shifting request rejected successfully",
        data: updatedRequest,
      });
    }
  } catch (error) {
    console.error("Error updating shifting request status:", error);
    handleControllerError(error, res);
  }
};


export const getShiftingRequestById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["view_shifting_own_center", "view_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
      });
    }

    const { id } = req.params;

    const query = { _id: id };

    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center &&
      userCenter
    ) {
      query.$or = [
        { fromCenter: userCenter._id || userCenter },
        { toCenter: userCenter._id || userCenter },
      ];
    }

    const request = await ShiftingRequest.findOne(query)
      .populate(
        "customer",
        "name username mobile email center address1 address2 city state shiftingHistory"
      )
      .populate("fromCenter", "centerName centerCode address phone")
      .populate("toCenter", "centerName centerCode address phone")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email");

    if (!request) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Shifting request not found or access denied",
        });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Error fetching shifting request:", error);
    handleControllerError(error, res);
  }
};

export const getCustomerShiftingHistory = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["view_shifting_own_center", "view_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
      });
    }

    const { customerId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const customerQuery = { _id: customerId };
    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center
    ) {
      customerQuery.center = userCenterId;
    }

    const customer = await Customer.findOne(customerQuery);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer",
      });
    }

    const query = { customer: customerId };

    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center
    ) {
      query.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
    }

    const total = await ShiftingRequest.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const history = await ShiftingRequest.find(query)
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: history,
      customer: {
        id: customer._id,
        name: customer.name,
        username: customer.username,
        currentCenter: customer.center,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching customer shifting history:", error);
    handleControllerError(error, res);
  }
};

export const getCustomerCurrentCenter = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["view_shifting_own_center", "view_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
      });
    }

    const { customerId } = req.params;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const customerQuery = { _id: customerId };
    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center
    ) {
      customerQuery.center = userCenterId;
    }

    const customer = await Customer.findOne(customerQuery)
      .populate("center", "centerName centerCode address phone")
      .populate("shiftingHistory.fromCenter", "centerName centerCode")
      .populate("shiftingHistory.toCenter", "centerName centerCode")
      .populate("shiftingHistory.shiftedBy", "fullName email");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          username: customer.username,
          mobile: customer.mobile,
          email: customer.email,
        },
        currentCenter: customer.center,
        shiftingHistory: customer.shiftingHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching customer current center:", error);
    handleControllerError(error, res);
  }
};

export const updateShiftingRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["manage_shifting_own_center", "manage_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_shifting_own_center or manage_shifting_all_center permission required.",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { date, address1, address2, city, remark, toCenter } = req.body;
    const user = req.user;

    const query = { _id: id };

    if (
      permissions.manage_shifting_own_center &&
      !permissions.manage_shifting_all_center &&
      userCenter
    ) {
      query.fromCenter = userCenter._id || userCenter;
    }

    const request = await ShiftingRequest.findOne(query);
    if (!request) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Shifting request not found or access denied",
        });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot update a request that is already ${request.status.toLowerCase()}.`,
      });
    }

    if (date) request.date = date;
    if (address1) request.address1 = address1;
    if (address2) request.address2 = address2;
    if (city) request.city = city;
    if (remark) request.remark = remark;

    if (toCenter && String(toCenter) !== String(request.toCenter)) {
      const customer = await Customer.findById(request.customer);
      if (String(customer.center) === String(toCenter)) {
        return res.status(400).json({
          success: false,
          message: "Customer is already registered in the target center",
        });
      }
      request.toCenter = toCenter;
    }

    await request.save();

    const updatedRequest = await ShiftingRequest.findById(id)
      .populate("customer", "name username mobile center")
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode");

    res.status(200).json({
      success: true,
      message: "Shifting request updated successfully",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating shifting request:", error);
    handleControllerError(error, res);
  }
};

export const deleteShiftingRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["manage_shifting_own_center", "manage_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_shifting_own_center or manage_shifting_all_center permission required.",
      });
    }

    const { id } = req.params;
    const user = req.user;

    const query = { _id: id };

    if (
      permissions.manage_shifting_own_center &&
      !permissions.manage_shifting_all_center &&
      userCenter
    ) {
      query.$or = [
        { fromCenter: userCenter._id || userCenter },
        { toCenter: userCenter._id || userCenter },
      ];
    }

    const request = await ShiftingRequest.findOne(query);
    if (!request) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Shifting request not found or access denied",
        });
    }

    if (request.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an approved shifting request.",
      });
    }

    await ShiftingRequest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Shifting request deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting shifting request:", error);
    handleControllerError(error, res);
  }
};

export const getShiftingRequestsByCustomer = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkShiftingPermissions(
      req,
      ["view_shifting_own_center", "view_shifting_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_shifting_own_center or view_shifting_all_center permission required.",
      });
    }

    const { customerId } = req.params;
    const {
      page = 1,
      limit = 100,
      status,
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const customerQuery = { _id: customerId };
    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center
    ) {
      customerQuery.center = userCenterId;
    }

    const customer = await Customer.findOne(customerQuery);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer",
      });
    }

    const query = {
      customer: customerId,
    };

    if (
      permissions.view_shifting_own_center &&
      !permissions.view_shifting_all_center
    ) {
      query.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const total = await ShiftingRequest.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const shiftingRequests = await ShiftingRequest.find(query)
      .populate("toCenter", "centerName centerCode")
      .populate("fromCenter", "centerName centerCode address1 address2 city")
      .populate("approvedBy", "fullName")
      .populate("rejectedBy", "fullName")
      .select(
        "date status remark address1 address2 city fromCenter toCenter approvedBy rejectedBy approvedAt rejectedAt createdAt"
      )
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const formattedRequests = shiftingRequests.map((request) => {
      let statusDetail = "";
      switch (request.status) {
        case "Approved":
          statusDetail = `Approved by ${
            request.approvedBy?.fullName || "Unknown"
          } on ${request.approvedAt?.toLocaleDateString() || "Unknown date"}`;
          break;
        case "Rejected":
          statusDetail = `Rejected by ${
            request.rejectedBy?.fullName || "Unknown"
          } on ${request.rejectedAt?.toLocaleDateString() || "Unknown date"}`;
          break;
        case "Pending":
          statusDetail = "Waiting for approval";
          break;
        default:
          statusDetail = request.status;
      }

      const oldAddress = [
        request.fromCenter?.address1,
        request.fromCenter?.address2,
        request.fromCenter?.city,
      ]
        .filter(Boolean)
        .join(", ");

      const currentAddress = [request.address1, request.address2, request.city]
        .filter(Boolean)
        .join(", ");

      const canTakeAction =
        request.status === "Pending" &&
        request.toCenter?._id?.toString() === userCenterId.toString();

      return {
        _id: request._id,
        "Center To": request.toCenter?.centerName || "Unknown Center",
        "Center From": request.fromCenter?.centerName || "Unknown Center",
        Date: request.date.toLocaleDateString(),
        status: request.status,
        "Status Detail": statusDetail,
        "Old Address": oldAddress || "Not available",
        "Current Address": currentAddress || "Not available",
        Remark: request.remark,
        "Created At": request.createdAt.toLocaleDateString(),
      };
    });

    res.status(200).json({
      success: true,
      data: formattedRequests,
      customer: {
        id: customer._id,
        name: customer.name,
        username: customer.username,
        mobile: customer.mobile,
        email: customer.email,
        currentCenter: customer.center,
      },
      userCenter: {
        id: userCenterId,
        name: req.user.center?.centerName || "User Center",
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
      },
      accessInfo: {
        canViewAll: permissions.view_shifting_all_center,
        description: permissions.view_shifting_all_center
          ? "Viewing all shifting requests for customer"
          : "Viewing shifting requests for customer in your center",
      },
    });
  } catch (error) {
    console.error("Error fetching shifting requests by customer:", error);
    handleControllerError(error, res);
  }
};
