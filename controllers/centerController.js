import Center from "../models/Center.js";
import Partner from "../models/Partner.js";
import Area from "../models/Area.js";

export const createCenter = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    if (
      !centerModule ||
      !centerModule.permissions.includes("manage_all_center")
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_all_centers permission required to create centers.",
      });
    }

    const {
      partnerId,
      areaId,
      centerType,
      centerName,
      centerCode,
      email,
      mobile,
      status,
      addressLine1,
      addressLine2,
      city,
      state,
      stockVerified,
    } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    }

    const area = await Area.findById(areaId);
    if (!area) {
      return res
        .status(404)
        .json({ success: false, message: "Area not found" });
    }

    const center = new Center({
      partner: partnerId,
      area: areaId,
      centerType,
      centerName,
      centerCode,
      email,
      mobile,
      status,
      addressLine1,
      addressLine2,
      city,
      state,
      stockVerified,
    });

    await center.save();
    res.status(201).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCenters = async (req, res) => {
  try {
    const {
      centerType,
      page = 1,
      limit = 10,
      search,
      sortBy = "centerName",
      sortOrder = "asc",
      partner,
      area,
      status,
    } = req.query;

    const filter = {};

    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    const canViewAll =
      centerModule && centerModule.permissions.includes("view_all_center");
    const canViewOwn =
      centerModule && centerModule.permissions.includes("view_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_center or view_all_centers permission required.",
      });
    }

    if (canViewOwn && !canViewAll && req.user.center) {
      filter._id = req.user.center._id || req.user.center;
    }

    if (centerType) {
      filter.centerType = centerType;
    }

    if (partner) {
      filter.partner = partner;
    }

    if (area) {
      filter.area = area;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { centerName: { $regex: search, $options: "i" } },
        { centerCode: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    const validSortFields = [
      "centerName",
      "centerCode",
      "centerType",
      "createdAt",
      "updatedAt",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "centerName";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const centers = await Center.find(filter)
      .populate("partner", "partnerName")
      .populate("area", "areaName")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Center.countDocuments(filter);

    const centerTypeCounts = await Center.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$centerType",
          count: { $sum: 1 },
        },
      },
    ]);

    const centerTypeStats = {};
    centerTypeCounts.forEach((stat) => {
      centerTypeStats[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      message: "Centers retrieved successfully",
      data: centers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      filters: {
        centerType: centerTypeStats,
        total: total,
      },
    });
  } catch (error) {
    console.error("Error retrieving centers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving centers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getCenterById = async (req, res) => {
  try {
    const center = await Center.findById(req.params.id)
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    if (!center) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    const canViewAll =
      centerModule && centerModule.permissions.includes("view_all_centers");
    const canViewOwn =
      centerModule && centerModule.permissions.includes("view_own_center");

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your own center.",
        });
      }
    }

    res.status(200).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCenter = async (req, res) => {
  try {
    const center = await Center.findById(req.params.id);

    if (!center) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    const canManageAll =
      centerModule && centerModule.permissions.includes("manage_all_centers");
    const canManageOwn =
      centerModule && centerModule.permissions.includes("manage_own_center");

    if (!canManageAll && !canManageOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_own_center or manage_all_centers permission required.",
      });
    }
    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only manage your own center.",
        });
      }
    }
    const updatedCenter = await Center.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    res.status(200).json({ success: true, data: updatedCenter });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCenter = async (req, res) => {
  try {
    const center = await Center.findById(req.params.id);

    if (!center) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    if (
      !centerModule ||
      !centerModule.permissions.includes("manage_all_centers")
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_all_centers permission required to delete centers.",
      });
    }

    await Center.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Center deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCentersByPartner = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    const canViewAll =
      centerModule && centerModule.permissions.includes("view_all_centers");
    const canViewOwn =
      centerModule && centerModule.permissions.includes("view_own_center");

    let filter = { partner: req.params.partnerId };

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenter = await Center.findById(req.user.center);
      if (
        !userCenter ||
        userCenter.partner.toString() !== req.params.partnerId
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view centers in your partner.",
        });
      }
      filter._id = req.user.center._id || req.user.center;
    }

    const centers = await Center.find(filter)
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCentersByArea = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );

    const canViewAll =
      centerModule && centerModule.permissions.includes("view_all_centers");
    const canViewOwn =
      centerModule && centerModule.permissions.includes("view_own_center");

    let filter = { area: req.params.areaId };

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenter = await Center.findById(req.user.center);
      if (!userCenter || userCenter.area.toString() !== req.params.areaId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view centers in your area.",
        });
      }
      filter._id = req.user.center._id || req.user.center;
    }

    const centers = await Center.find(filter)
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
