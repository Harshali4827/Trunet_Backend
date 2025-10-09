import Building from "../models/Building.js";
import Center from "../models/Center.js";

export const createBuilding = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request headers:", req.headers);

    const {
      center,
      buildingName,
      displayName,
      address1,
      address2,
      landmark,
      pincode,
    } = req.body;
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

    if (center) {
      filter.center = center;
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

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    let centerIds = [];
    if (Object.keys(centerFilter).length > 0) {
      const centers = await Center.find(centerFilter).select("_id");
      centerIds = centers.map((center) => center._id);

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
        if (centerIds.includes(filter.center)) {
          filter.center = filter.center;
        } else {
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

    const [buildings, totalBuildings] = await Promise.all([
      Building.find(filter)
        .populate({
          path: "center",
          select: "centerName centerType area partner status",
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
        "centerName centerType area partner addressLine1 addressLine2 city state status",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }

    res.status(200).json({ success: true, data: building });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBuilding = async (req, res) => {
  try {
    const building = await Building.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate({
      path: "center",
      select:
        "centerName centerType area partner addressLine1 addressLine2 city state status",
      populate: [
        { path: "partner", select: "partnerName" },
        { path: "area", select: "areaName" },
      ],
    });

    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }

    res.status(200).json({ success: true, data: building });
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
    const building = await Building.findByIdAndDelete(req.params.id);
    if (!building) {
      return res
        .status(404)
        .json({ success: false, message: "Building not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Building deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
