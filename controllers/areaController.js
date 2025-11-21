import Area from "../models/Area.js";
import Reseller from "../models/Reseller.js";

export const createArea = async (req, res) => {
  try {
    const { resellerId, areaName } = req.body;

    if (!resellerId || !areaName) {
      return res.status(400).json({
        success: false,
        message: "Reseller ID and Area name are required",
      });
    }

    const reseller = await Reseller.findById(resellerId);
    if (!reseller) {
      return res
        .status(404)
        .json({ success: false, message: "Reseller not found" });
    }

    const area = new Area({ reseller: resellerId, areaName });
    await area.save();

    res.status(201).json({ success: true, data: area });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// export const getAreas = async (req, res) => {
//   try {
//     const areas = await Area.find().populate("reseller", "businessName");
//     res.status(200).json({ success: true, data: areas });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const getAreas = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      sortBy = "areaName",
      sortOrder = "asc",
    } = req.query;

    const sortOptions = {};
    const validSortFields = ["areaName", "createdAt", "updatedAt"];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "areaName";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const areas = await Area.find()
      .populate("reseller", "businessName")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalAreas = await Area.countDocuments();

    res.status(200).json({
      success: true,
      message: "Areas retrieved successfully",
      data: {
        areas: areas,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalAreas / limitNum),
          totalItems: totalAreas,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < Math.ceil(totalAreas / limitNum),
          hasPrevPage: pageNum > 1,
          nextPage:
            pageNum < Math.ceil(totalAreas / limitNum) ? pageNum + 1 : null,
          prevPage: pageNum > 1 ? pageNum - 1 : null,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving areas:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving areas",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getAreasByReseller = async (req, res) => {
  try {
    const areas = await Area.find({ reseller: req.params.resellerId }).populate(
      "reseller",
      "businessName"
    );
    res.status(200).json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAreaById = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id).populate(
      "reseller",
      "businessName"
    );
    if (!area)
      return res
        .status(404)
        .json({ success: false, message: "Area not found" });
    res.status(200).json({ success: true, data: area });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// export const updateArea = async (req, res) => {
//   try {
//     const { areaName } = req.body;
//     const area = await Area.findByIdAndUpdate(
//       req.params.id,
//       { areaName },
//       { new: true, runValidators: true }
//     ).populate("reseller", "businessName");

//     if (!area)
//       return res
//         .status(404)
//         .json({ success: false, message: "Area not found" });
//     res.status(200).json({ success: true, data: area });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const updateArea = async (req, res) => {
  try {
    const { areaName, resellerId } = req.body;

    // Build update object dynamically
    const updateData = {};
    if (areaName) updateData.areaName = areaName;
    if (resellerId) {
      // Verify the new reseller exists
      const reseller = await Reseller.findById(resellerId);
      if (!reseller) {
        return res.status(404).json({
          success: false,
          message: "Reseller not found",
        });
      }
      updateData.reseller = resellerId;
    }

    const area = await Area.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate("reseller", "businessName");

    if (!area) {
      return res.status(404).json({
        success: false,
        message: "Area not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Area updated successfully",
      data: area,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const deleteArea = async (req, res) => {
  try {
    const area = await Area.findByIdAndDelete(req.params.id);
    if (!area)
      return res
        .status(404)
        .json({ success: false, message: "Area not found" });
    res
      .status(200)
      .json({ success: true, message: "Area deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
