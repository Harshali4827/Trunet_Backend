import Area from "../models/Area.js";
import Partner from "../models/Partner.js";

export const createArea = async (req, res) => {
  try {
    const { partnerId, areaName } = req.body;

    if (!partnerId || !areaName) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Partner ID and Area name are required",
        });
    }

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    }

    const area = new Area({ partner: partnerId, areaName });
    await area.save();

    res.status(201).json({ success: true, data: area });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAreas = async (req, res) => {
  try {
    const areas = await Area.find().populate("partner", "partnerName");
    res.status(200).json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAreasByPartner = async (req, res) => {
  try {
    const areas = await Area.find({ partner: req.params.partnerId }).populate(
      "partner",
      "partnerName"
    );
    res.status(200).json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAreaById = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id).populate(
      "partner",
      "partnerName"
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

export const updateArea = async (req, res) => {
  try {
    const { areaName } = req.body;
    const area = await Area.findByIdAndUpdate(
      req.params.id,
      { areaName },
      { new: true, runValidators: true }
    ).populate("partner", "partnerName");

    if (!area)
      return res
        .status(404)
        .json({ success: false, message: "Area not found" });
    res.status(200).json({ success: true, data: area });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
