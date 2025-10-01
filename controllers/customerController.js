import Customer from '../models/Customer.js';
import Center from '../models/Center.js';

export const createCustomer = async (req, res) => {
  try {
    const { username, name, mobile, email, centerId, address1, address2, city, state } = req.body;

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

export const getCustomers = async (req, res) => {
  try {
    const { search, center, page = 1, limit = 1, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    

    const filter = {};

    if (center) {
      filter.center = center;
    }

    if (search?.trim()) {
      const searchTerm = search.trim();
      filter.$or = [
        { username: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } },
        { mobile: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { city: { $regex: searchTerm, $options: 'i' } },
        { state: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    
    const [customers, totalCustomers] = await Promise.all([
      Customer.find(filter)
        .populate({
          path: 'center',
          select: 'centerName centerType area partner',
          populate: [
            { 
              path: 'partner', 
              select: 'partnerName' 
            },
            { 
              path: 'area', 
              select: 'areaName' 
            },
          ],
        })
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select('-__v'),
      
      Customer.countDocuments(filter)
    ]);
    
    const totalPages = Math.ceil(totalCustomers / limit);
    
    res.json({
      success: true,
      data: customers,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCustomers
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
    });
  }
};

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


export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.status(200).json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
