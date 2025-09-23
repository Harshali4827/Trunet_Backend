import Partner from '../models/Partner.js';

export const createPartner = async (req, res) => {
  try {
    const { partnerName } = req.body;
    if (!partnerName) {
      return res.status(400).json({ success: false, message: 'Partner name is required' });
    }

    const partner = new Partner({ partnerName });
    await partner.save();
    res.status(201).json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPartners = async (req, res) => {
  try {
    const partners = await Partner.find();
    res.status(200).json({ success: true, data: partners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPartnerById = async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.status(200).json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePartner = async (req, res) => {
  try {
    const { partnerName } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { partnerName },
      { new: true, runValidators: true }
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.status(200).json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePartner = async (req, res) => {
  try {
    const partner = await Partner.findByIdAndDelete(req.params.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.status(200).json({ success: true, message: 'Partner deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
