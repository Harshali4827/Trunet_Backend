import Building from "../models/Building.js";
import Center from "../models/Center.js";

export const createBuilding = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_own_center");

    if (!canManageAll && !canManageOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_building_own_center or manage_building_all_center permission required.",
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
            "Access denied. You can only create buildings in your own center.",
        });
      }
    }

    const centerDoc = await Center.findById(center);
    if (!centerDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }

    const building = new Building({
      center,
      buildingName,
      displayName,
      address1,
      address2,
      landmark,
      pincode,
    });

    await building.save();
    res.status(201).json({ success: true, data: building });
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

export const getBuildings = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canViewAll =
      settingsModule &&
      settingsModule.permissions.includes("view_building_all_center");
    const canViewOwn =
      settingsModule &&
      settingsModule.permissions.includes("view_building_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_building_own_center or view_building_all_center permission required.",
      });
    }

    const {
      search,
      center,
      reseller,
      area,
      centerType,
      status,
      city,
      state,
      page = 1,
      limit = 100,
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
    if (reseller) centerFilter.reseller = reseller;
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
            totalBuildings: 0,
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
              totalBuildings: 0,
            },
          });
        }
      } else {
        filter.center = { $in: centerIds };
      }
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [buildings, totalBuildings] = await Promise.all([
      Building.find(filter)
        .populate({
          path: "center",
          select: "centerName centerType area reseller status",
          populate: [
            {
              path: "reseller",
              select: "businessName",
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

      Building.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalBuildings / limit);

    res.json({
      success: true,
      data: buildings,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalBuildings,
      },
    });
  } catch (error) {
    console.error("Error fetching buildings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching buildings",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getBuildingById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id).populate({
      path: "center",
      select:
        "centerName centerType area reseller addressLine1 addressLine2 city state status",
      populate: [
        { path: "reseller", select: "businessName" },
        { path: "area", select: "areaName" },
      ],
    });

    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canViewAll =
      settingsModule &&
      settingsModule.permissions.includes("view_building_all_center");
    const canViewOwn =
      settingsModule &&
      settingsModule.permissions.includes("view_building_own_center");

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (building.center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view buildings in your own center.",
        });
      }
    }

    res.status(200).json({ success: true, data: building });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBuilding = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (building.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only manage buildings in your own center.",
        });
      }
    }

    const updatedBuilding = await Building.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate({
      path: "center",
      select:
        "centerName centerType area reseller addressLine1 addressLine2 city state status",
      populate: [
        { path: "reseller", select: "resellerName" },
        { path: "area", select: "areaName" },
      ],
    });

    res.status(200).json({ success: true, data: updatedBuilding });
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

export const deleteBuilding = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canManageAll =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_all_center");
    const canManageOwn =
      settingsModule &&
      settingsModule.permissions.includes("manage_building_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (building.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete buildings in your own center.",
        });
      }
    }

    await Building.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Building deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
