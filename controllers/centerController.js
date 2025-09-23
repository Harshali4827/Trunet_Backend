import Center from '../models/Center.js';
import Partner from '../models/Partner.js';
import Area from '../models/Area.js';

// Create Center
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
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    // validate area
    const area = await Area.findById(areaId);
    if (!area) {
      return res.status(404).json({ success: false, message: 'Area not found' });
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

// Get all centers (with Partner + Area info)
export const getCenters = async (req, res) => {
  try {
    const centers = await Center.find()
      .populate('partner', 'partnerName')
      .populate('area', 'areaName');
    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single center
export const getCenterById = async (req, res) => {
  try {
    const center = await Center.findById(req.params.id)
      .populate('partner', 'partnerName')
      .populate('area', 'areaName');

    if (!center) return res.status(404).json({ success: false, message: 'Center not found' });
    res.status(200).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get centers by Partner
export const getCentersByPartner = async (req, res) => {
  try {
    const centers = await Center.find({ partner: req.params.partnerId })
      .populate('partner', 'partnerName')
      .populate('area', 'areaName');

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get centers by Area
export const getCentersByArea = async (req, res) => {
  try {
    const centers = await Center.find({ area: req.params.areaId })
      .populate('partner', 'partnerName')
      .populate('area', 'areaName');

    res.status(200).json({ success: true, data: centers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update center
export const updateCenter = async (req, res) => {
  try {
    const center = await Center.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('partner', 'partnerName')
      .populate('area', 'areaName');

    if (!center) return res.status(404).json({ success: false, message: 'Center not found' });

    res.status(200).json({ success: true, data: center });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete center
export const deleteCenter = async (req, res) => {
  try {
    const center = await Center.findByIdAndDelete(req.params.id);
    if (!center) return res.status(404).json({ success: false, message: 'Center not found' });
    res.status(200).json({ success: true, message: 'Center deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
