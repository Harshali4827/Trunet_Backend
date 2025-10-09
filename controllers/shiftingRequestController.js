// import ShiftingRequest from "../models/ShiftingRequest.js";
// import Customer from "../models/Customer.js";
// import { validationResult } from "express-validator";

// export const createShiftingRequest = async (req, res) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ success: false, errors: errors.array() });
//     }

//     const { date, customer, address1, address2, city, remark } = req.body;
//     const loginUser = req.user;

//     const customerData = await Customer.findById(customer);
//     if (!customerData) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Customer not found" });
//     }

//     const newRequest = new ShiftingRequest({
//       date,
//       customer,
//       address1,
//       address2,
//       city,
//       remark,
//       fromCenter: customerData.center,
//       toCenter: loginUser.center,
//     });

//     await newRequest.save();

//     res.status(201).json({
//       success: true,
//       message: "Shifting request created successfully",
//       data: newRequest,
//     });
//   } catch (error) {
//     console.error("Error creating shifting request:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// export const getAllShiftingRequests = async (req, res) => {
//   try {
//     const { search, center, page = 1, limit = 10 } = req.query;

//     const query = {};

//     if (search) {
//       query.$or = [
//         { remark: { $regex: search, $options: "i" } },
//         { status: { $regex: search, $options: "i" } },
//         { "customer.name": { $regex: search, $options: "i" } },
//         { "toCenter.centerName": { $regex: search, $options: "i" } },
//       ];
//     }

//     if (center) {
//       query.$or = [{ fromCenter: center }, { toCenter: center }];
//     }

//     const total = await ShiftingRequest.countDocuments(query);
//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const requests = await ShiftingRequest.find(query)
//       .populate("customer", "name center")
//       .populate("fromCenter", "centerName")
//       .populate("toCenter", "centerName")
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
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// export const updateShiftingRequestStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;
//     const user = req.user;

//     if (!["Approve", "Reject"].includes(status)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid status. Must be "Approve" or "Reject".',
//       });
//     }

//     const request = await ShiftingRequest.findById(id)
//       .populate("customer", "name mobile center")
//       .populate("fromCenter", "centerName centerCode")
//       .populate("toCenter", "centerName centerCode");

//     if (!request) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Shifting request not found" });
//     }

//     if (String(request.toCenter._id) !== String(user.center._id)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. Only the destination center can approve or reject this request.",
//       });
//     }

//     if (request.status !== "Pending") {
//       return res.status(400).json({
//         success: false,
//         message: `This request is already ${request.status.toLowerCase()}.`,
//       });
//     }

//     if (status === "Approve") {
//       const customer = await Customer.findById(request.customer);
//       if (!customer) {
//         return res
//           .status(404)
//           .json({ success: false, message: "Customer not found" });
//       }

//       customer.center = request.toCenter;
//       await customer.save();

//       request.status = "Approve";
//       request.approvedBy = user._id;
//       request.approvedAt = new Date();
//     } else if (status === "Reject") {
//       request.status = "Reject";
//       request.rejectedBy = user._id;
//       request.rejectedAt = new Date();
//     }

//     await request.save();

//     res.status(200).json({
//       success: true,
//       message: `Shifting request ${
//         status === "Approve" ? "approved" : "rejected"
//       } successfully`,
//       data: request,
//     });
//   } catch (error) {
//     console.error("Error updating shifting request status:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };


import ShiftingRequest from "../models/ShiftingRequest.js";
import Customer from "../models/Customer.js";
import { validationResult } from "express-validator";

export const createShiftingRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { date, customer, address1, address2, city, remark, toCenter } = req.body;
    const loginUser = req.user;

    // Validate customer exists
    const customerData = await Customer.findById(customer);
    if (!customerData) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    // Check if there's already a pending request for this customer
    const existingPendingRequest = await ShiftingRequest.findOne({
      customer: customer,
      status: 'Pending'
    });

    if (existingPendingRequest) {
      return res.status(400).json({
        success: false,
        message: "There is already a pending shifting request for this customer"
      });
    }

    // Validate that fromCenter and toCenter are different
    if (String(customerData.center) === String(toCenter)) {
      return res.status(400).json({
        success: false,
        message: "Customer is already registered in the target center"
      });
    }

    const newRequest = new ShiftingRequest({
      date,
      customer,
      address1,
      address2,
      city,
      remark,
      fromCenter: loginUser.center,
      toCenter: toCenter || loginUser.center,
    });

    await newRequest.save();

    // Populate the response with customer and center details
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
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllShiftingRequests = async (req, res) => {
  try {
    const { search, center, status, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { remark: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "fromCenter.centerName": { $regex: search, $options: "i" } },
        { "toCenter.centerName": { $regex: search, $options: "i" } },
      ];
    }

    if (center) {
      query.$or = [
        { fromCenter: center }, 
        { toCenter: center }
      ];
    }

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

    res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching shifting requests:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateShiftingRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const user = req.user;

    if (!["Approved", "Rejected"].includes(status)) {
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

    // Check if user has permission (either from center or to center admin)
    const userCenterId = user.center?._id || user.center;
    if (
      String(request.fromCenter._id) !== String(userCenterId) &&
      String(request.toCenter._id) !== String(userCenterId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only manage requests related to your center.",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `This request is already ${request.status.toLowerCase()}.`,
      });
    }

    if (status === "Approved") {
      // Update customer's center
      const customer = await Customer.findById(request.customer._id);
      if (!customer) {
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });
      }

      // Record the shift in customer's history
      customer.shiftingHistory.push({
        fromCenter: request.fromCenter._id,
        toCenter: request.toCenter._id,
        shiftingRequest: request._id,
        shiftedAt: new Date(),
        shiftedBy: user._id
      });

      // Update customer's current center
      customer.center = request.toCenter._id;
      await customer.save();

      // Update shifting request
      request.status = "Approved";
      request.approvedBy = user._id;
      request.approvedAt = new Date();
      request.customerCenterUpdated = true;
      request.customerCenterUpdatedAt = new Date();
      
    } else if (status === "Rejected") {
      request.status = "Rejected";
      request.rejectedBy = user._id;
      request.rejectedAt = new Date();
      if (rejectionReason) {
        request.remark = request.remark + ` | Rejection Reason: ${rejectionReason}`;
      }
    }

    await request.save();

    // Populate the response data
    const updatedRequest = await ShiftingRequest.findById(id)
      .populate("customer", "name username mobile center")
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email");

    res.status(200).json({
      success: true,
      message: `Shifting request ${
        status === "Approved" ? "approved" : "rejected"
      } successfully`,
      data: updatedRequest,
    });

  } catch (error) {
    console.error("Error updating shifting request status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getShiftingRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await ShiftingRequest.findById(id)
      .populate("customer", "name username mobile email center address1 address2 city state shiftingHistory")
      .populate("fromCenter", "centerName centerCode address phone")
      .populate("toCenter", "centerName centerCode address phone")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email");

    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Shifting request not found" });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Error fetching shifting request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getCustomerShiftingHistory = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Verify customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const query = { customer: customerId };
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
        currentCenter: customer.center
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
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getCustomerCurrentCenter = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findById(customerId)
      .populate("center", "centerName centerCode address phone")
      .populate("shiftingHistory.fromCenter", "centerName centerCode")
      .populate("shiftingHistory.toCenter", "centerName centerCode")
      .populate("shiftingHistory.shiftedBy", "fullName email");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
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
          email: customer.email
        },
        currentCenter: customer.center,
        shiftingHistory: customer.shiftingHistory
      }
    });
  } catch (error) {
    console.error("Error fetching customer current center:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const updateShiftingRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { date, address1, address2, city, remark, toCenter } = req.body;
    const user = req.user;

    // Find the shifting request
    const request = await ShiftingRequest.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Shifting request not found" });
    }

    // Check if user has permission to update (only from center can update pending requests)
    const userCenterId = user.center?._id || user.center;
    if (String(request.fromCenter) !== String(userCenterId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update requests from your center.",
      });
    }

    // Check if request is already approved or rejected
    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot update a request that is already ${request.status.toLowerCase()}.`,
      });
    }

    // Update fields
    if (date) request.date = date;
    if (address1) request.address1 = address1;
    if (address2) request.address2 = address2;
    if (city) request.city = city;
    if (remark) request.remark = remark;
    
    // If toCenter is being updated, validate it's different from current center
    if (toCenter && String(toCenter) !== String(request.toCenter)) {
      // Check if customer is already in the target center
      const customer = await Customer.findById(request.customer);
      if (String(customer.center) === String(toCenter)) {
        return res.status(400).json({
          success: false,
          message: "Customer is already registered in the target center"
        });
      }
      request.toCenter = toCenter;
    }

    await request.save();

    // Populate the updated request
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
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteShiftingRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Find the shifting request
    const request = await ShiftingRequest.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Shifting request not found" });
    }

    // Check if user has permission to delete
    const userCenterId = user.center?._id || user.center;
    if (
      String(request.fromCenter) !== String(userCenterId) &&
      String(request.toCenter) !== String(userCenterId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete requests related to your center.",
      });
    }

    // Check if request is already approved
    if (request.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an approved shifting request.",
      });
    }

    // If request is rejected, allow deletion but with warning
    if (request.status === "Rejected") {
      // Optional: Add confirmation logic here if needed
    }

    // Delete the shifting request
    await ShiftingRequest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Shifting request deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting shifting request:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const getShiftingRequestsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      status,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc' 
    } = req.query;

    // Get center from authenticated user
    const userCenter = req.user.center?._id || req.user.center;
    
    if (!userCenter) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center"
      });
    }

    // Validate customer exists AND belongs to user's center
    const customer = await Customer.findOne({
      _id: customerId,
      center: userCenter
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer"
      });
    }

    // Build query with center enforcement
    // Users can see shifting requests where:
    // 1. They are the fromCenter (source center) OR
    // 2. They are the toCenter (destination center) OR  
    // 3. The customer currently belongs to their center
    const query = { 
      customer: customerId,
      $or: [
        { fromCenter: userCenter },    // Requests from user's center
        { toCenter: userCenter },      // Requests to user's center
        { customer: customerId }       // Customer belongs to user's center (additional safety)
      ]
    };

    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add date range filter if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const total = await ShiftingRequest.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch shifting requests with required fields
    const shiftingRequests = await ShiftingRequest.find(query)
      .populate("toCenter", "centerName centerCode") // Center To
      .populate("fromCenter", "centerName centerCode address1 address2 city") // For Old Address
      .populate("approvedBy", "fullName")
      .populate("rejectedBy", "fullName")
      .select('date status remark address1 address2 city fromCenter toCenter approvedBy rejectedBy approvedAt rejectedAt createdAt')
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    // Transform data to match requested fields
    const formattedRequests = shiftingRequests.map(request => {
      // Build status detail based on status and related information
      let statusDetail = '';
      switch (request.status) {
        case 'Approved':
          statusDetail = `Approved by ${request.approvedBy?.fullName || 'Unknown'} on ${request.approvedAt?.toLocaleDateString() || 'Unknown date'}`;
          break;
        case 'Rejected':
          statusDetail = `Rejected by ${request.rejectedBy?.fullName || 'Unknown'} on ${request.rejectedAt?.toLocaleDateString() || 'Unknown date'}`;
          break;
        case 'Pending':
          statusDetail = 'Waiting for approval';
          break;
        default:
          statusDetail = request.status;
      }

      // Build addresses
      const oldAddress = [
        request.fromCenter?.address1,
        request.fromCenter?.address2,
        request.fromCenter?.city
      ].filter(Boolean).join(', ');

      const currentAddress = [
        request.address1,
        request.address2,
        request.city
      ].filter(Boolean).join(', ');

      // Determine if user can take action on this request
      const canTakeAction = (
        request.status === 'Pending' && 
        request.toCenter?._id?.toString() === userCenter.toString()
      );

      return {
        _id: request._id,
        "Center To": request.toCenter?.centerName || 'Unknown Center',
        "Center From": request.fromCenter?.centerName || 'Unknown Center',
        "Date": request.date.toLocaleDateString(),
        "status": request.status,
        "Status Detail": statusDetail,
        "Old Address": oldAddress || 'Not available',
        "Current Address": currentAddress || 'Not available',
        "Remark": request.remark,
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
        currentCenter: customer.center
      },
      userCenter: {
        id: userCenter,
        name: req.user.center?.centerName || 'User Center'
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || 'all',
        startDate: startDate || 'all',
        endDate: endDate || 'all'
      },
      accessInfo: {
        canViewAll: true, // Since we're filtering by customer who belongs to user's center
        description: "Viewing shifting requests for customer in your center"
      }
    });

  } catch (error) {
    console.error("Error fetching shifting requests by customer:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
};