import Area from "../models/Area.js";
import Reseller from "../models/Reseller.js";

export const createArea = async (req, res) => {
  try {
    const { resellerId, areaName } = req.body;

    if (!resellerId || !areaName) {
      return res
        .status(400)
        .json({
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

export const getAreas = async (req, res) => {
  try {
    const areas = await Area.find().populate("reseller", "businessName");
    res.status(200).json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

export const updateArea = async (req, res) => {
  try {
    const { areaName } = req.body;
    const area = await Area.findByIdAndUpdate(
      req.params.id,
      { areaName },
      { new: true, runValidators: true }
    ).populate("reseller", "businessName");

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
