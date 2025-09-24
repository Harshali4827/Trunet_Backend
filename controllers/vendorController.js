import Vendor from '../models/Vendor.js';
import { validationResult } from 'express-validator';
import path from 'path';
import fs from 'fs';

const deleteOldImage = async (imagePath) => {
  if (imagePath && !imagePath.startsWith('http')) {
    const fullPath = path.join(process.cwd(), imagePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.error('Error deleting old image:', error);
    }
  }
};

export const createVendor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: "Validation failed",
      errors: errors.array() 
    });
  }

  try {
    let vendorLogo = '';
    if (req.file) {
      vendorLogo = `uploads/vendors/${req.file.filename}`;
    }

    const vendorData = {
      ...req.body,
      logo: vendorLogo
    };

    const vendor = await Vendor.create(vendorData);
    res.status(201).json({ 
      success: true, 
      message: "Vendor created successfully",
      data: vendor 
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      await deleteOldImage(`uploads/vendors/${req.file.filename}`);
    }

    const errorResponse = handleVendorError(error, req.body);
    res.status(errorResponse.statusCode).json(errorResponse);
  }
};

const handleVendorError = (error, bodyData = {}) => {
  let statusCode = 500;
  let message = "Internal server error";

  if (error.code === 11000) {
    statusCode = 409;
    const duplicateField = Object.keys(error.keyPattern || {})[0];
    const duplicateValue = bodyData[duplicateField];
    
    if (duplicateField === 'email') {
      message = `Email ${duplicateValue} is already registered. Please use a different email.`;
    } else if (duplicateField === 'mobile') {
      message = `Mobile number ${duplicateValue} is already registered.`;
    } else {
      message = `This ${duplicateField} already exists in the system.`;
    }
  } 
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = "Invalid vendor data provided";
  }
  else if (error.name === 'CastError') {
    statusCode = 400;
    message = "Invalid data format";
  }

  return {
    success: false,
    message,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { debug: error.message })
  };
};

const buildVendorSearchFilters = (queryParams) => {
  const {
    search,
    city,
    state,
    status,
    hasGst,
  } = queryParams;

  const filters = {};

  if (search) {
    filters.$or = [
      { businessName: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { contactNumber: { $regex: search, $options: 'i' } },
      { mobile: { $regex: search, $options: 'i' } },
      { gstNumber: { $regex: search, $options: 'i' } }
    ];
  }

  if (city) {
    filters.city = { $regex: city, $options: 'i' };
  }

  if (state) {
    filters.state = { $regex: state, $options: 'i' };
  }

  if (status && ['Active', 'Inactive'].includes(status)) {
    filters.status = status;
  }

  if (hasGst === 'true') {
    filters.gstNumber = { $exists: true, $ne: '' };
  } else if (hasGst === 'false') {
    filters.$or = [
      { gstNumber: { $exists: false } },
      { gstNumber: '' },
      { gstNumber: null }
    ];
  }

  return filters;
};

export const getAllVendors = async (req, res) => {
  try {
    const {
      search,
      city,
      state,
      status,
      hasGst,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const filters = buildVendorSearchFilters({
      search,
      city,
      state,
      status,
      hasGst,
    });

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [totalVendors, vendors] = await Promise.all([
      Vendor.countDocuments(filters),
      Vendor.find(filters)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select('-__v'),
    ]);

    const totalPages = Math.ceil(totalVendors / limit);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalVendors,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vendors",
      error: error.message,
    });
  }
};

export const getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found" 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      data: vendor 
    });
  } catch (error) {
    const errorResponse = handleVendorError(error);
    res.status(errorResponse.statusCode).json(errorResponse);
  }
};

export const updateVendor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: "Validation failed",
      errors: errors.array() 
    });
  }

  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      // Delete uploaded file if vendor not found
      if (req.file) {
        await deleteOldImage(`uploads/vendors/${req.file.filename}`);
      }
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found" 
      });
    }

    let vendorLogo = vendor.logo;
    if (req.file) {
      // Delete old logo if exists
      if (vendor.logo) {
        await deleteOldImage(vendor.logo);
      }
      vendorLogo = `uploads/vendors/${req.file.filename}`;
    }

    const updateData = {
      ...req.body,
      logo: vendorLogo
    };

    const updatedVendor = await Vendor.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    res.status(200).json({ 
      success: true, 
      message: "Vendor updated successfully",
      data: updatedVendor 
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      await deleteOldImage(`uploads/vendors/${req.file.filename}`);
    }

    const errorResponse = handleVendorError(error, req.body);
    res.status(errorResponse.statusCode).json(errorResponse);
  }
};

export const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found" 
      });
    }

    // Delete logo file if exists
    if (vendor.logo) {
      await deleteOldImage(vendor.logo);
    }

    await Vendor.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ 
      success: true, 
      message: "Vendor deleted successfully" 
    });
  } catch (error) {
    const errorResponse = handleVendorError(error);
    res.status(errorResponse.statusCode).json(errorResponse);
  }
};

