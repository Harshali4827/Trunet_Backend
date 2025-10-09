import PackageDuration from "../models/PackageDuration.js";

export const createPackageDuration = async (req, res) => {
  try {
    const { packageDuration } = req.body;
    if (!packageDuration) {
      return res
        .status(400)
        .json({ success: false, message: "Package Duration is required" });
    }

    const newPackageDuration = new PackageDuration({ packageDuration });
    await newPackageDuration.save();
    res.status(201).json({ success: true, data: newPackageDuration });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPackageDurations = async (req, res) => {
  try {
    const packageDurations = await PackageDuration.find();
    res.status(200).json({ success: true, data: packageDurations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPackageDurationById = async (req, res) => {
  try {
    const packageDuration = await PackageDuration.findById(req.params.id);
    if (!packageDuration)
      return res
        .status(404)
        .json({ success: false, message: "Package Duration not found" });
    res.status(200).json({ success: true, data: packageDuration });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePackageDuration = async (req, res) => {
  try {
    const { packageDuration } = req.body;
    const updatedPackageDuration = await PackageDuration.findByIdAndUpdate(
      req.params.id,
      { packageDuration },
      { new: true, runValidators: true }
    );
    if (!updatedPackageDuration)
      return res
        .status(404)
        .json({ success: false, message: "Package Duration not found" });
    res.status(200).json({ success: true, data: updatedPackageDuration });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePackageDuration = async (req, res) => {
  try {
    const packageDuration = await PackageDuration.findByIdAndDelete(
      req.params.id
    );
    if (!packageDuration)
      return res
        .status(404)
        .json({ success: false, message: "Package Duration not found" });
    res
      .status(200)
      .json({
        success: true,
        message: "Package Duration deleted successfully",
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
