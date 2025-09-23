import Customer from '../models/Customer.js';
import Center from '../models/Center.js';

// Create Customer
export const createCustomer = async (req, res) => {
  try {
    const { username, name, mobile, email, centerId, address1, address2, city, state } = req.body;

    // Validate center
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ success: false, message: 'Center not found' });
    }

    const customer = new Customer({
      username,
      name,
      mobile,
      email,
      center: centerId,
      address1,
      address2,
      city,
      state,
    });

    await customer.save();
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all customers
export const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate({
        path: 'center',
        populate: [
          { path: 'partner', select: 'partnerName' },
          { path: 'area', select: 'areaName' },
        ],
      });
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get customer by ID
export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate({
        path: 'center',
        populate: [
          { path: 'partner', select: 'partnerName' },
          { path: 'area', select: 'areaName' },
        ],
      });

    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: 'center',
        populate: [
          { path: 'partner', select: 'partnerName' },
          { path: 'area', select: 'areaName' },
        ],
      });

    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.status(200).json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
