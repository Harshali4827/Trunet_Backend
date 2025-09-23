import Building from '../models/Building.js';
import Center from '../models/Center.js';


export const createBuilding = async (req, res) => {
  try {
    console.log('Request body:', req.body); 
    console.log('Request headers:', req.headers);
    
    const { center, buildingName, displayName, address1, address2, landmark, pincode } = req.body;
    const centerDoc = await Center.findById(center);
    if (!centerDoc) {
      return res.status(404).json({ success: false, message: 'Center not found' });
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBuildings = async (req, res) => {
  try {
    const buildings = await Building.find().populate('center', 'centerName centerType');
    res.status(200).json({ success: true, data: buildings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getBuildingById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id).populate('center', 'centerName centerType');
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
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
    });

    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
    }

    res.status(200).json({ success: true, data: building });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteBuilding = async (req, res) => {
  try {
    const building = await Building.findByIdAndDelete(req.params.id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
    }
    res.status(200).json({ success: true, message: 'Building deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
