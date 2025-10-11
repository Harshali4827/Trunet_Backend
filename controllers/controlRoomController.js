import Center from "../models/Center.js";
import ControlRoom from "../models/ControlRoomModel.js";

export const createControlRoom = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_own_center");

    if (!canManageAll && !canManageOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_control_room_own_center or manage_control_room_all_center permission required.",
      });
    }

    const {
      center,
      buildingName,
      displayName,
      address1,
      address2,
      landmark,
      pincode,
    } = req.body;

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (center !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only create control rooms in your own center.",
        });
      }
    }

    const centerDoc = await Center.findById(center);
    if (!centerDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }

    const controlRoom = new ControlRoom({
      center,
      buildingName,
      displayName,
      address1,
      address2,
      landmark,
      pincode,
    });

    await controlRoom.save();
    res.status(201).json({ success: true, data: controlRoom });
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

export const getControlRooms = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canViewAll =
      settingsModule &&
      settingsModule.permissions.includes("view_control_room_all_center");
    const canViewOwn =
      settingsModule &&
      settingsModule.permissions.includes("view_control_room_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_control_room_own_center or view_control_room_all_center permission required.",
      });
    }

    const {
      search,
      center,
      partner,
      area,
      centerType,
      status,
      city,
      state,
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
        { buildingName: { $regex: searchTerm, $options: "i" } },
        { displayName: { $regex: searchTerm, $options: "i" } },
        { address1: { $regex: searchTerm, $options: "i" } },
        { address2: { $regex: searchTerm, $options: "i" } },
        { landmark: { $regex: searchTerm, $options: "i" } },
        { pincode: { $regex: searchTerm, $options: "i" } },
      ];
    }

    let centerFilter = {};
    if (partner) centerFilter.partner = partner;
    if (area) centerFilter.area = area;
    if (centerType) centerFilter.centerType = centerType;
    if (status) centerFilter.status = status;
    if (city) centerFilter.city = { $regex: city, $options: "i" };
    if (state) centerFilter.state = { $regex: state, $options: "i" };

    if (canViewAll && Object.keys(centerFilter).length > 0) {
      const centers = await Center.find(centerFilter).select("_id");
      const centerIds = centers.map((center) => center._id);

      if (centerIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: Number(page),
            totalPages: 0,
            totalControlRooms: 0,
          },
        });
      }

      if (filter.center) {
        if (!centerIds.includes(filter.center)) {
          return res.json({
            success: true,
            data: [],
            pagination: {
              currentPage: Number(page),
              totalPages: 0,
              totalControlRooms: 0,
            },
          });
        }
      } else {
        filter.center = { $in: centerIds };
      }
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [controlRooms, totalControlRooms] = await Promise.all([
      ControlRoom.find(filter)
        .populate({
          path: "center",
          select: "centerName centerType area partner status city state",
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

      ControlRoom.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalControlRooms / limit);

    res.json({
      success: true,
      data: controlRooms,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalControlRooms,
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching control rooms:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching control rooms",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getControlRoomById = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findById(req.params.id).populate({
      path: "center",
      select:
        "centerName centerType area partner addressLine1 addressLine2 city state status",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    if (!controlRoom) {
      return res
        .status(404)
        .json({ success: false, message: "Control Room not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canViewAll =
      settingsModule &&
      settingsModule.permissions.includes("view_control_room_all_center");
    const canViewOwn =
      settingsModule &&
      settingsModule.permissions.includes("view_control_room_own_center");

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (controlRoom.center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view control rooms in your own center.",
        });
      }
    }

    res.status(200).json({ success: true, data: controlRoom });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateControlRoom = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findById(req.params.id);

    if (!controlRoom) {
      return res
        .status(404)
        .json({ success: false, message: "Control Room not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (controlRoom.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only manage control rooms in your own center.",
        });
      }
    }

    const updatedControlRoom = await ControlRoom.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate({
      path: "center",
      select:
        "centerName centerType area partner addressLine1 addressLine2 city state status",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    res.status(200).json({ success: true, data: updatedControlRoom });
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

export const deleteControlRoom = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findById(req.params.id);

    if (!controlRoom) {
      return res
        .status(404)
        .json({ success: false, message: "Control Room not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_control_room_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (controlRoom.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete control rooms in your own center.",
        });
      }
    }

    await ControlRoom.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Control Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};