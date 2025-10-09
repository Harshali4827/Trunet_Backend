import Center from "../models/Center.js";
import ControlRoom from "../models/ControlRoomModel.js";

export const createControlRoom = async (req, res) => {
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getControlRooms = async (req, res) => {
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
            totalControlRooms: 0,
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
              totalControlRooms: 0,
            },
          });
        }
      } else {
        filter.center = { $in: centerIds };
      }
    }

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
        .limit(Number(limit)),

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

    res.status(200).json({ success: true, data: controlRoom });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateControlRoom = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findByIdAndUpdate(
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

    if (!controlRoom) {
      return res
        .status(404)
        .json({ success: false, message: "Control Room not found" });
    }

    res.status(200).json({ success: true, data: controlRoom });
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
    const controlRoom = await ControlRoom.findByIdAndDelete(req.params.id);
    if (!controlRoom) {
      return res
        .status(404)
        .json({ success: false, message: "Control Room not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Control Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
