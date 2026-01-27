import Customer from "../models/Customer.js";
import Center from "../models/Center.js";
import csvParser from 'csv-parser';
import { Readable } from 'stream';

// export const createCustomer = async (req, res) => {
//   try {
//     const userPermissions = req.user.role?.permissions || [];
//     const customerModule = userPermissions.find(
//       (perm) => perm.module === "Customer"
//     );

//     const canManageAll =
//       customerModule &&
//       customerModule.permissions.includes("manage_customer_all_center");
//     const canManageOwn =
//       customerModule &&
//       customerModule.permissions.includes("manage_customer_own_center");

//     if (!canManageAll && !canManageOwn) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. manage_customer_own_center or manage_customer_all_center permission required.",
//       });
//     }

//     const {
//       username,
//       name,
//       mobile,
//       email,
//       centerId,
//       address1,
//       address2,
//       city,
//       state,
//     } = req.body;

//     if (canManageOwn && !canManageAll && req.user.center) {
//       const userCenterId = req.user.center._id || req.user.center;
//       if (centerId !== userCenterId.toString()) {
//         return res.status(403).json({
//           success: false,
//           message:
//             "Access denied. You can only create customers in your own center.",
//         });
//       }
//     }

//     const center = await Center.findById(centerId);
//     if (!center) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Center not found" });
//     }

//     const customer = new Customer({
//       username,
//       name,
//       mobile,
//       email,
//       center: centerId,
//       address1,
//       address2,
//       city,
//       state,
//     });

//     await customer.save();
//     res.status(201).json({ success: true, data: customer });
//   } catch (error) {
//     console.error(error);

//     if (error.name === "ValidationError") {
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors: Object.values(error.errors).map((err) => err.message),
//       });
//     }

//     res.status(500).json({ success: false, message: error.message });
//   }
// };


export const createCustomer = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (!canManageAll && !canManageOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_customer_own_center or manage_customer_all_center permission required.",
      });
    }

    const {
      username,
      name,
      mobile,
      email,
      centerId,
      address1,
      address2,
      city,
      state,
    } = req.body;

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (centerId !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only create customers in your own center.",
        });
      }
    }

    const center = await Center.findById(centerId);
    if (!center) {
      return res
        .status(404)
        .json({ success: false, message: "Center not found" });
    }
    const existingCustomer = await Customer.findOne({ username });
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: "Username already exists. Please choose a different username.",
        field: "username",
        value: username
      });
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
    console.error(error);

    if (error.code === 11000 || error.name === 'MongoServerError') {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const duplicateValue = error.keyValue ? error.keyValue[duplicateField] : '';
      
      if (duplicateField === 'username') {
        return res.status(400).json({
          success: false,
          message: `Username "${duplicateValue}" is already taken. Please choose a different username.`,
          field: "username",
          value: duplicateValue
        });
      }
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }
    res.status(500).json({ 
      success: false, 
      message: "Error creating customer",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canViewAll =
      customerModule &&
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwn =
      customerModule &&
      customerModule.permissions.includes("view_customer_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_customer_own_center or view_customer_all_center permission required.",
      });
    }

    const {
      search,
      center,
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let filter = {};

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      filter.center = userCenterId;
    } else {
      if (center) {
        filter.center = center;
      }
    }

    if (search?.trim()) {
      const searchTerm = search.trim();
      filter.$or = [
        { username: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { state: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [customers, totalCustomers] = await Promise.all([
      Customer.find(filter)
        .populate({
          path: "center",
          select: "centerName centerType area reseller",
          populate: [
            {
              path: "reseller",
              select: "businessName",
            },
            {
              path: "area",
              select: "areaName",
            }
          ],
        })
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v"),

      Customer.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      success: true,
      data: customers,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCustomers,
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};


export const getCustomersWithoutPagination = async (req, res) => {
  try {
    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canViewAll =
      customerModule &&
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwn =
      customerModule &&
      customerModule.permissions.includes("view_customer_own_center");

    if (!canViewAll && !canViewOwn) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_customer_own_center or view_customer_all_center permission required.",
      });
    }

    const {
      search,
      center,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let filter = {};

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      filter.center = userCenterId;
    } else {
      if (center) {
        filter.center = center;
      }
    }

    if (search?.trim()) {
      const searchTerm = search.trim();
      filter.$or = [
        { username: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { state: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const customers = await Customer.find(filter)
      .populate({
        path: "center",
        select: "centerName centerType area reseller",
        populate: [
          {
            path: "reseller",
            select: "businessName",
          },
          {
            path: "area",
            select: "areaName",
          }
        ],
      })
      .sort(sort)
      .select("-__v");

    const totalCustomers = customers.length;

    res.json({
      success: true,
      data: customers,
      totalCustomers,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate({
      path: "center",
      populate: [
        { path: "reseller", select: "businessName"},
        { path: "area", select: "areaName" },
      ],
    });

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canViewAll =
      customerModule &&
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwn =
      customerModule &&
      customerModule.permissions.includes("view_customer_own_center");

    if (canViewOwn && !canViewAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center._id.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view customers in your own center.",
        });
      }
    }

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// export const updateCustomer = async (req, res) => {
//   try {
//     const customer = await Customer.findById(req.params.id);

//     if (!customer) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Customer not found" });
//     }

//     const userPermissions = req.user.role?.permissions || [];
//     const customerModule = userPermissions.find(
//       (perm) => perm.module === "Customer"
//     );

//     const canManageAll =
//       customerModule &&
//       customerModule.permissions.includes("manage_customer_all_center");
//     const canManageOwn =
//       customerModule &&
//       customerModule.permissions.includes("manage_customer_own_center");

//     if (canManageOwn && !canManageAll && req.user.center) {
//       const userCenterId = req.user.center._id || req.user.center;
//       if (customer.center.toString() !== userCenterId.toString()) {
//         return res.status(403).json({
//           success: false,
//           message:
//             "Access denied. You can only manage customers in your own center.",
//         });
//       }
//     }

//     if (req.body.centerId) {
//       if (canManageOwn && !canManageAll && req.user.center) {
//         const userCenterId = req.user.center._id || req.user.center;
//         if (req.body.centerId !== userCenterId.toString()) {
//           return res.status(403).json({
//             success: false,
//             message:
//               "Access denied. You can only assign customers to your own center.",
//           });
//         }
//       }

//       const center = await Center.findById(req.body.centerId);
//       if (!center) {
//         return res
//           .status(404)
//           .json({ success: false, message: "Center not found" });
//       }
//     }

//     const updateData = { ...req.body };
//     if (req.body.centerId) {
//       updateData.center = req.body.centerId;
//       delete updateData.centerId;
//     }

//     const updatedCustomer = await Customer.findByIdAndUpdate(
//       req.params.id,
//       updateData,
//       {
//         new: true,
//         runValidators: true,
//       }
//     ).populate({
//       path: "center",
//       populate: [
//         { path: "reseller", select: "businessName"},
//         { path: "area", select: "areaName" },
//       ],
//     });

//     res.status(200).json({ success: true, data: updatedCustomer });
//   } catch (error) {
//     if (error.name === "ValidationError") {
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors: Object.values(error.errors).map((err) => err.message),
//       });
//     }
//     res.status(500).json({ success: false, message: error.message });
//   }
// };



export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only manage customers in your own center.",
        });
      }
    }

    if (req.body.centerId) {
      if (canManageOwn && !canManageAll && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (req.body.centerId !== userCenterId.toString()) {
          return res.status(403).json({
            success: false,
            message:
              "Access denied. You can only assign customers to your own center.",
          });
        }
      }

      const center = await Center.findById(req.body.centerId);
      if (!center) {
        return res
          .status(404)
          .json({ success: false, message: "Center not found" });
      }
    }
    if (req.body.username && req.body.username !== customer.username) {
      const existingUsername = await Customer.findOne({ 
        username: req.body.username,
        _id: { $ne: req.params.id } 
      });
      
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: `Username "${req.body.username}" is already taken. Please choose a different username.`,
        });
      }
    }

    const updateData = { ...req.body };
    if (req.body.centerId) {
      updateData.center = req.body.centerId;
      delete updateData.centerId;
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).populate({
      path: "center",
      populate: [
        { path: "reseller", select: "businessName"},
        { path: "area", select: "areaName" },
      ],
    });

    res.status(200).json({ success: true, data: updatedCustomer });
  } catch (error) {
    if (error.code === 11000 || error.name === 'MongoServerError') {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const duplicateValue = error.keyValue ? error.keyValue[duplicateField] : '';
      
      if (duplicateField === 'username') {
        return res.status(400).json({
          success: false,
          message: `Username "${duplicateValue}" is already taken. Please choose a different username.`,
          field: "username",
          value: duplicateValue
        });
      }
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }
    res.status(500).json({ 
      success: false, 
      message: "Error updating customer",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    });
  }
};


export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const userPermissions = req.user.role?.permissions || [];
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );

    const canManageAll =
      customerModule &&
      customerModule.permissions.includes("manage_customer_all_center");
    const canManageOwn =
      customerModule &&
      customerModule.permissions.includes("manage_customer_own_center");

    if (canManageOwn && !canManageAll && req.user.center) {
      const userCenterId = req.user.center._id || req.user.center;
      if (customer.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete customers in your own center.",
        });
      }
    }

    await Customer.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const importCustomers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please upload a CSV file.",
      });
    }

    const file = req.file;
    let customersData = [];
    let errors = [];
    let successCount = 0;
    let failedCount = 0;
    
    const processedUsernames = new Set();
    const usernameErrors = new Set();

    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      try {
        await new Promise((resolve, reject) => {
          const stream = Readable.from(file.buffer.toString());
          stream
            .pipe(csvParser())
            .on('data', (row) => {
              const mappedRow = {
                center: row.center_title || row.center, 
                username: row.username,
                name: row.name || '',
                mobile: row.mobile,
                address1: row.address1 || '',
                address2: row.address2 || '',
                city: row.city || '',
                state: row.state || ''
              };
              customersData.push(mappedRow);
            })
            .on('end', resolve)
            .on('error', reject);
        });
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Error reading CSV file. Please ensure it's a valid CSV file.",
          error: error.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Please upload CSV (.csv) file only.",
      });
    }

    const firstRow = customersData[0];
    
    if (!firstRow) {
      return res.status(400).json({
        success: false,
        message: "The file appears to be empty or has no valid data rows.",
      });
    }

    const centerField = firstRow.center ? 'center' : 
                       (firstRow.center_title ? 'center_title' : null);
    
    if (!centerField) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: 'center' or 'center_title'",
        requiredFormat: "center_title, username, name, mobile, address1, address2, city, state",
        note: "CSV must have header row. 'center_title' should contain center name"
      });
    }

    const requiredFields = [centerField, 'username'];
    const missingFields = requiredFields.filter(field => !firstRow[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields in CSV: ${missingFields.join(', ')}`,
        requiredFormat: "center_title, username, name, mobile, address1, address2, city, state",
        note: "CSV must have header row with exact field names as shown above. Mobile is optional and will default to 0000000000 if missing."
      });
    }

    const centerCache = new Map();
    
    const findCenterByName = async (centerName) => {
      const trimmedName = centerName.trim();
      
      if (centerCache.has(trimmedName)) {
        return centerCache.get(trimmedName);
      }
      
      try {
        let center = await Center.findOne({ 
          centerName: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
          status: "Enable"
        });
        
        if (!center) {
          center = await Center.findOne({ 
            centerName: { $regex: trimmedName, $options: 'i' },
            status: "Enable"
          });
        }
        
        if (!center) {
          center = await Center.findOne({ 
            centerCode: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
            status: "Enable"
          });
        }
        
        centerCache.set(trimmedName, center);
        return center;
      } catch (error) {
        console.error(`Error finding center "${centerName}":`, error);
        return null;
      }
    };

    const normalizeMobileNumber = (mobile) => {
      if (!mobile || mobile.toString().trim() === '') {
        return '0000000000';
      }
      
      // Remove any non-digit characters
      const cleaned = mobile.toString().replace(/\D/g, '');
      
      // If after cleaning it's empty, return default
      if (cleaned === '') {
        return '0000000000';
      }
      
      // If it's already 10 digits, return as is
      if (cleaned.length === 10) {
        return cleaned;
      }
      
      // If it's less than 10 digits, pad with zeros at the end
      if (cleaned.length < 10) {
        return cleaned.padEnd(10, '0');
      }
      
      // If it's more than 10 digits, take first 10 digits
      if (cleaned.length > 10) {
        return cleaned.substring(0, 10);
      }
      
      return cleaned;
    };

    const existingUsernames = new Set();

    if (customersData.length > 1000) {
      console.log(`Fetching existing usernames for ${customersData.length} records...`);
      const existingCustomers = await Customer.find({}, 'username');
      existingCustomers.forEach(customer => {
        existingUsernames.add(customer.username);
      });
      console.log(`Found ${existingUsernames.size} existing usernames in database`);
    }

    // Track rows where default mobile was added
    const defaultMobileRows = [];

    for (let i = 0; i < customersData.length; i++) {
      const row = customersData[i];
      const rowNumber = i + 2; 

      try {
        const processedRow = {};
        Object.keys(row).forEach(key => {
          if (typeof row[key] === 'string') {
            processedRow[key] = row[key].trim();
          } else if (row[key] !== null && row[key] !== undefined) {
            processedRow[key] = row[key];
          }
        });

        const centerIdentifier = processedRow.center || processedRow.center_title;
        const username = processedRow.username;
        const name = processedRow.name;
        let mobile = normalizeMobileNumber(processedRow.mobile);
        const address1 = processedRow.address1;
        const address2 = processedRow.address2;
        const city = processedRow.city;
        const state = processedRow.state;

        // Track if default mobile was added
        if (!processedRow.mobile || processedRow.mobile.toString().trim() === '') {
          defaultMobileRows.push({
            row: rowNumber,
            username: username || 'N/A',
            originalMobile: processedRow.mobile || '(empty)',
            defaultMobile: mobile
          });
        }

        // Check for required fields (mobile is now optional)
        if (!username || !centerIdentifier) {
          errors.push({
            row: rowNumber,
            username: username || 'N/A',
            error: `Missing required field(s): ${!username ? 'username, ' : ''}${!centerIdentifier ? 'center' : ''}`
          });
          failedCount++;
          continue;
        }

        // Check for duplicate usernames in the same import file
        if (processedUsernames.has(username)) {
          errors.push({
            row: rowNumber,
            username,
            error: `Duplicate username '${username}' in the same import file.`
          });
          failedCount++;
          continue;
        }
        
        processedUsernames.add(username);

        if (customersData.length > 1000) {
          if (existingUsernames.has(username)) {
            errors.push({
              row: rowNumber,
              username,
              error: `Username '${username}' already exists in database.`
            });
            failedCount++;
            continue;
          }
        } else {
          const existingUsername = await Customer.findOne({ username });
          if (existingUsername) {
            errors.push({
              row: rowNumber,
              username,
              error: `Username '${username}' already exists.`
            });
            failedCount++;
            continue;
          }
        }

        let center;

        if (centerIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
          center = await Center.findById(centerIdentifier);
          if (center && center.status !== "Enable") {
            errors.push({
              row: rowNumber,
              username,
              error: `Center is disabled: ${centerIdentifier}`
            });
            failedCount++;
            continue;
          }
        } else {
          // Find center by name
          center = await findCenterByName(centerIdentifier);
        }

        if (!center) {
          errors.push({
            row: rowNumber,
            username,
            error: `Center not found or disabled: "${centerIdentifier}". Please check the center name.`
          });
          failedCount++;
          continue;
        }

        // Generate email (since your CSV doesn't have email)
        let customerEmail;
        const generatedEmail = `${username}@example.com`;
        
        // For large imports, we might skip email duplication check for performance
        // Or we could generate unique emails
        if (customersData.length > 10000) {
          // For very large imports, use timestamp to ensure uniqueness
          customerEmail = `${username}${Date.now()}${i}@example.com`;
        } else {
          const existingEmail = await Customer.findOne({ email: generatedEmail });
          
          if (existingEmail) {
            // If generated email exists, use a different pattern
            customerEmail = `${username}${Date.now()}${i}@example.com`;
          } else {
            customerEmail = generatedEmail;
          }
        }

        // Validate mobile format (should always be 10 digits after normalization)
        const mobileRegex = /^[0-9]{10}$/;
        if (!mobileRegex.test(mobile)) {
          errors.push({
            row: rowNumber,
            username,
            error: `Invalid mobile number format after normalization: ${mobile}. Should be 10 digits.`
          });
          failedCount++;
          continue;
        }

        // Create customer
        const customer = new Customer({
          username,
          name: name || '',
          mobile,
          email: customerEmail,
          center: center._id,
          address1: address1 || '',
          address2: address2 || '',
          city: city || '',
          state: state || '',
          // Optional: Add a flag to indicate if mobile was default
          mobileWasDefault: (!processedRow.mobile || processedRow.mobile.toString().trim() === '')
        });

        await customer.save();
        successCount++;
        
        // Add to existing usernames set for subsequent checks in this import
        existingUsernames.add(username);

      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        
        let errorMessage = error.message;
        if (error.name === "ValidationError") {
          errorMessage = Object.values(error.errors)
            .map(err => err.message)
            .join(', ');
        }

        errors.push({
          row: rowNumber,
          username: row.username || 'N/A',
          error: errorMessage
        });
        failedCount++;
      }
      
      // Progress logging for large imports
      if (customersData.length > 10000 && i % 1000 === 0) {
        console.log(`Processed ${i} of ${customersData.length} rows...`);
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: `Import completed. Successfully imported ${successCount} customers, ${failedCount} failed.`,
      summary: {
        totalProcessed: customersData.length,
        successCount,
        failedCount,
        successPercentage: customersData.length > 0 ? 
          Math.round((successCount / customersData.length) * 100) : 0
      }
    };

    // Include ALL errors (not limited to 50)
    if (errors.length > 0) {
      response.errors = errors;
      response.totalErrors = errors.length;
      
      // Add error statistics
      const errorTypes = {};
      errors.forEach(error => {
        const errorKey = error.error.split(':')[0] || error.error;
        errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1;
      });
      
      response.errorStatistics = errorTypes;
      
      // If there are too many errors, suggest downloading error report
      if (errors.length > 1000) {
        response.note = `Large import completed with ${errors.length} errors. Consider downloading the error report.`;
        // You could add an endpoint to download errors as CSV
      }
    }

    // Add information about default mobile numbers if any were added
    if (defaultMobileRows.length > 0) {
      response.defaultMobileSummary = {
        count: defaultMobileRows.length,
        rows: defaultMobileRows.slice(0, 50), // Show first 50 rows with default mobile
        note: defaultMobileRows.length > 50 ? 
          `... and ${defaultMobileRows.length - 50} more rows had default mobile added` :
          'All rows with missing mobile numbers received default: 0000000000'
      };
    }

    response.notes = [
      "Email field was not in CSV. Generated email addresses automatically.",
      `Mobile numbers that were missing or invalid were normalized. ${defaultMobileRows.length} rows received default mobile number.`,
      "Center names are matched against enabled centers only.",
      "Duplicate usernames are prevented but duplicate mobile numbers are allowed.",
      `Processed ${customersData.length} records in total.`
    ];

    res.status(200).json(response);

  } catch (error) {
    console.error('Error importing customers:', error);
    res.status(500).json({
      success: false,
      message: "Error importing customers",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
};