import Warehouse from '../models/Warehouse.js';

export const createWarehouse = async (req, res) => {
  try {
    const { warehouseName } = req.body;
    if (!warehouseName) {
      return res.status(400).json({ success: false, message: 'Warehouse name is required' });
    }

    const existingWarehouse = await Warehouse.findOne({ warehouseName });
    if (existingWarehouse) {
      return res.status(400).json({ success: false, message: 'Warehouse with this name already exists' });
    }

    const warehouse = new Warehouse({ warehouseName });
    await warehouse.save();
    res.status(201).json({ success: true, data: warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find().sort({ createdAt: -1 }); 
    res.status(200).json({ success: true, data: warehouses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.status(200).json({ success: true, data: warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateWarehouse = async (req, res) => {
  try {
    const { warehouseName } = req.body; 
    
    if (!warehouseName) {
      return res.status(400).json({ success: false, message: 'Warehouse name is required' });
    }

    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      { warehouseName },
      { new: true, runValidators: true }
    );
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.status(200).json({ success: true, data: warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.status(200).json({ success: true, message: 'Warehouse deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};