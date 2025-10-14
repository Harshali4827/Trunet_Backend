import Customer from "../models/Customer.js";
import Center from "../models/Center.js";

export const createCustomer = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (!canManageAll && !canManageOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_customer_own_center or manage_customer_all_center permission required.",
      });
    }

    const {
      username,
      name,
      mobile,
      email,
      centerId,
      address1,
      address2,
      city,
      state,
    } = req.body;

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (centerId !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only create customers in your own center.",
        });
      }
    }

    const center = await Center.findById(centerId);
    if (!center) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }

    const customer = new Customer({
      username,
      name,
      mobile,
      email,
      center: centerId,
      address1,
      address2,
      city,
      state,
    });

    await customer.save();
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    console.error(error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canViewAll =
      customerModule &&
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwn =
      customerModule &&
      customerModule.permissions.includes("view_customer_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_customer_own_center or view_customer_all_center permission required.",
      });
    }

    const {
      search,
      center,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let filter = {};

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      filter.center = userCenterId;
    } else {
      if (center) {
        filter.center = center;
      }
    }

    if (search?.trim()) {
      const searchTerm = search.trim();
      filter.$or = [
        { username: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { state: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [customers, totalCustomers] = await Promise.all([
      Customer.find(filter)
        .populate({
          path: "center",
          select: "centerName centerType area partner",
          populate: [
            {
              path: "partner",
              select: "partnerName",
            },
            {
              path: "area",
              select: "areaName",
            },
          ],
        })
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v"),

      Customer.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      success: true,
      data: customers,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCustomers,
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate({
      path: "center",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canViewAll =
      customerModule &&
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwn =
      customerModule &&
      customerModule.permissions.includes("view_customer_own_center");

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view customers in your own center.",
        });
      }
    }

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only manage customers in your own center.",
        });
      }
    }

    if (req.body.centerId) {
      if (canManageOwn && !canManageAll && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (req.body.centerId !== userCenterId.toString()) {
          return res.status(403).json({
            success: false,
            message:
              "Access denied. You can only assign customers to your own center.",
          });
        }
      }

      const center = await Center.findById(req.body.centerId);
      if (!center) {
        return res
          .status(404)
          .json({ success: false, message: "Center not found" });
      }
    }

    const updateData = { ...req.body };
    if (req.body.centerId) {
      updateData.center = req.body.centerId;
      delete updateData.centerId;
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).populate({
      path: "center",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    res.status(200).json({ success: true, data: updatedCustomer });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete customers in your own center.",
        });
      }
    }

    await Customer.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
