import Center from "../models/Center.js";
import Partner from "../models/Partner.js";
import Area from "../models/Area.js";

export const createCenter = async (req, res) => {
  try {
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
        { location: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
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

    if (!center)
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    res.status(200).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCentersByPartner = async (req, res) => {
  try {
    const centers = await Center.find({ partner: req.params.partnerId })
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCentersByArea = async (req, res) => {
  try {
    const centers = await Center.find({ area: req.params.areaId })
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCenter = async (req, res) => {
  try {
    const center = await Center.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("partner", "partnerName")
      .populate("area", "areaName");

    if (!center)
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });

    res.status(200).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCenter = async (req, res) => {
  try {
    const center = await Center.findByIdAndDelete(req.params.id);
    if (!center)
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    res
      .status(200)
      .json({ success: true, message: "Center deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
