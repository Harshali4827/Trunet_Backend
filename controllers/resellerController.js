
import Center from "../models/Center.js";
import Reseller from "../models/Reseller.js";

const buildResellerSearchFilters = ({ search, city, state }) => {
  const filters = {};

  if (search) {
    filters.$or = [
      { resellerName: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { contactNumber: { $regex: search, $options: "i" } },
      { gstNumber: { $regex: search, $options: "i" } },
    ];
  }

  if (city) filters.city = { $regex: city, $options: "i" };
  if (state) filters.state = { $regex: state, $options: "i" };

  return filters;
};

const generateCenterCode = async (businessName) => {
  const baseCode = businessName
    .replace(/\s+/g, '')
    .substring(0, 4)
    .toUpperCase();
  
  let counter = 1;
  let centerCode = `${baseCode}${counter.toString().padStart(3, '0')}`;
  
  while (await Center.findOne({ centerCode })) {
    counter++;
    centerCode = `${baseCode}${counter.toString().padStart(3, '0')}`;
  }
  
  return centerCode;
};

export const createReseller = async (req, res) => {
  try {

    const reseller = await Reseller.create(req.body);

    const centerCode = await generateCenterCode(reseller.businessName);

    const centerData = {
      reseller: reseller._id,
      centerType: "Outlet",
      centerName: reseller.businessName,
      centerCode:centerCode,
      email: reseller.email || "",
      mobile: reseller.mobile || reseller.contactNumber || "",
      addressLine1: reseller.address1 || "",
      addressLine2: reseller.address2 || "",
      city: reseller.city || "",
      state: reseller.state || "",
      area: null,
      status: "Enable"
    };

    const center = await Center.create(centerData);

    res.status(201).json({
      success: true,
      message: "Reseller created successfully with auto-generated outlet",
      data: {
        reseller: reseller,
        center: center
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field} already exists`, 
        error: `The ${field} '${error.keyValue[field]}' is already registered` 
      });
    }
    
    res.status(400).json({ 
      success: false, 
      message: "Error creating reseller", 
      error: error.message 
    });
  }
};

export const getResellers = async (req, res) => {
  try {
    const {
      search,
      city,
      state,
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filters = buildResellerSearchFilters({ search, city, state });

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [totalResellers, resellers] = await Promise.all([
      Reseller.countDocuments(filters),
      Reseller.find(filters)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v"),
    ]);

    const totalPages = Math.ceil(totalResellers / limit);

    res.status(200).json({
      success: true,
      data: resellers,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalResellers,
        limit: Number(limit),
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching resellers",
      error: error.message,
    });
  }
};

// Get Single Reseller by ID
export const getResellerById = async (req, res) => {
  try {
    const reseller = await Reseller.findById(req.params.id);
    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }
    res.status(200).json({ success: true, data: reseller });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching reseller", error });
  }
};

// Update Reseller
export const updateReseller = async (req, res) => {
  try {
    const reseller = await Reseller.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }
    res.status(200).json({
      success: true,
      message: "Reseller updated successfully",
      data: reseller
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Error updating reseller", error });
  }
};

//*********************   Delete Reseller    ******************/

export const deleteReseller = async (req, res) => {
  try {
    const reseller = await Reseller.findByIdAndDelete(req.params.id);
    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }
    res.status(200).json({ success: true, message: "Reseller deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting reseller", error });
  }
};
