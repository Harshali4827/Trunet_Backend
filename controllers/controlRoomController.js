
import Center from '../models/Center.js';
import ControlRoom from '../models/ControlRoomModel.js';


export const createControlRoom = async (req, res) => {
  try {
    console.log('Request body:', req.body); 
    console.log('Request headers:', req.headers);
    
    const { center, buildingName, displayName, address1, address2, landmark, pincode } = req.body;
    const centerDoc = await Center.findById(center);
    if (!centerDoc) {
      return res.status(404).json({ success: false, message: 'Center not found' });
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
    const controlRooms = await ControlRoom.find().populate('center', 'centerName centerType');
    res.status(200).json({ success: true, data: controlRooms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getControlRoomById = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findById(req.params.id).populate('center', 'centerName centerType');
    if (!controlRoom) {
      return res.status(404).json({ success: false, message: 'Control Room not found' });
    }
    res.status(200).json({ success: true, data: controlRoom });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateControlRoom = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!controlRoom) {
      return res.status(404).json({ success: false, message: 'Control Room not found' });
    }

    res.status(200).json({ success: true, data: controlRoom });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteControlRoom = async (req, res) => {
  try {
    const controlRoom = await ControlRoom.findByIdAndDelete(req.params.id);
    if (!controlRoom) {
      return res.status(404).json({ success: false, message: 'Control Room not found' });
    }
    res.status(200).json({ success: true, message: 'Control Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
