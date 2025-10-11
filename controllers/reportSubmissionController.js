// import StockClosing from "../models/ReportSubmission.js";
// import mongoose from "mongoose";

// export const createStockClosing = async (req, res) => {
//   try {
//     const { date, stockClosingForOtherCenter, center, products, status, remark } = req.body;

//     if (!products || !Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Products array with at least one product is required",
//       });
//     }

//     for (const [index, product] of products.entries()) {
//       if (
//         !product.product ||
//         product.productQty === undefined ||
//         product.damageQty === undefined
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
//         });
//       }

//       if (product.damageQty > product.productQty) {
//         return res.status(400).json({
//           success: false,
//           message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
//         });
//       }
//     }

//     // Get closing center from user's center (always use logged-in user's center)
//     const userClosingCenter = req.user?.center;
//     if (!userClosingCenter) {
//       return res.status(400).json({
//         success: false,
//         message: "User must be associated with a center to create stock closing",
//       });
//     }

//     // Fetch closing center details to check type
//     const Center = mongoose.model("Center");
//     const closingCenterData = await Center.findById(userClosingCenter).select("centerType");
    
//     if (!closingCenterData) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid user center",
//       });
//     }

//     const isOutlet = closingCenterData.centerType === 'Outlet';
//     const isCenter = closingCenterData.centerType === 'Center';

//     // Validate if user can create stock closing for other center
//     const actualStockClosingForOtherCenter = Boolean(stockClosingForOtherCenter);
    
//     if (actualStockClosingForOtherCenter) {
//       if (!center) {
//         return res.status(400).json({
//           success: false,
//           message: "Center is required when stock closing is for other center",
//         });
//       }

//       // Validate the target center exists
//       const targetCenter = await Center.findById(center);
//       if (!targetCenter) {
//         return res.status(400).json({
//           success: false,
//           message: "Target center not found",
//         });
//       }

//       // Only outlets can create stock closing for other centers
//       if (!isOutlet) {
//         return res.status(400).json({
//           success: false,
//           message: "Only outlet users can create stock closing for other centers",
//         });
//       }
//     }

//     // Create main stock closing entry (for the user's center)
//     const mainStockClosingData = {
//       date: date || new Date(),
//       stockClosingForOtherCenter: actualStockClosingForOtherCenter,
//       products,
//       status: status || "Draft",
//       createdBy: req.user?.id,
//       closingCenter: userClosingCenter, // Always the user's center
//       remark: remark || "",
//     };

//     // If stockClosingForOtherCenter is true, set the center field
//     if (actualStockClosingForOtherCenter) {
//       mainStockClosingData.center = center;
//     }

//     const mainStockClosing = new StockClosing(mainStockClosingData);
//     await mainStockClosing.save();

//     let secondaryStockClosing = null;

//     // If stockClosingForOtherCenter is true, create a secondary entry for the target center
//     if (actualStockClosingForOtherCenter) {
//       const secondaryStockClosingData = {
//         date: date || new Date(),
//         stockClosingForOtherCenter: false, // This is the actual closing for the target center
//         products: JSON.parse(JSON.stringify(products)), // Clone products data
//         status: status || "Draft",
//         createdBy: req.user?.id,
//         closingCenter: center, // The target center becomes the closing center
//         remark: `Created by ${closingCenterData.centerName} - ${remark || "Stock closing for other center"}`,
//         linkedStockClosing: mainStockClosing._id
//       };

//       secondaryStockClosing = new StockClosing(secondaryStockClosingData);
//       await secondaryStockClosing.save();

//       // Update main entry with link to secondary
//       mainStockClosing.linkedStockClosing = secondaryStockClosing._id;
//       await mainStockClosing.save();
//     }

//     // Populate and prepare response
//     await mainStockClosing.populate([
//       {
//         path: "products.product",
//         select: "productTitle productCode productPrice",
//       },
//       { path: "center", select: "centerName centerCode centerType" },
//       { path: "closingCenter", select: "centerName centerCode centerType" },
//       { path: "createdBy", select: "name email" },
//       { path: "linkedStockClosing", select: "_id closingCenter status" },
//     ]);

//     const responseData = mainStockClosing.toObject();

//     // Clean up response data
//     delete responseData.totalProductQty;
//     delete responseData.totalDamageQty;
//     delete responseData.totalQty;
//     delete responseData.id;

//     if (responseData.products && Array.isArray(responseData.products)) {
//       responseData.products.forEach((product) => {
//         if (product.product && product.product.id) {
//           delete product.product.id;
//         }
//       });
//     }

//     let message = "Stock closing created successfully";
//     if (actualStockClosingForOtherCenter) {
//       message = "Stock closing created successfully with secondary entry for target center";
//     }

//     res.status(201).json({
//       success: true,
//       message,
//       data: responseData,
//       ...(secondaryStockClosing && {
//         secondaryEntry: {
//           _id: secondaryStockClosing._id,
//           closingCenter: center
//         }
//       })
//     });

//   } catch (error) {
//     console.error("Create stock closing error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Error creating stock closing",
//     });
//   }
// };
// export const getAllStockClosings = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "date",
//       sortOrder = "desc",
//       startDate,
//       endDate,
//       stockClosingForOtherCenter,
//       center,
//       closingCenter,
//       product,
//       centerType,
//     } = req.query;

//     let filter = {};

//     // If user is not admin, show stock closings where:
//     // 1. They are the closingCenter OR
//     // 2. Their center is the center field (for stockClosingForOtherCenter entries)
//     if (req.user?.role !== 'admin' && req.user?.center) {
//       filter = {
//         $or: [
//           { closingCenter: req.user.center },
//           { center: req.user.center }
//         ]
//       };
//     }

//     if (startDate || endDate) {
//       filter.date = {};
//       if (startDate) filter.date.$gte = new Date(startDate);
//       if (endDate) filter.date.$lte = new Date(endDate);
//     }

//     if (stockClosingForOtherCenter !== undefined) {
//       filter.stockClosingForOtherCenter = stockClosingForOtherCenter === "true";
//     }

//     if (center) filter.center = center;
//     if (closingCenter) filter.closingCenter = closingCenter;

//     if (product) {
//       filter["products.product"] = product;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const sort = {};
//     sort[sortBy] = sortOrder === "desc" ? -1 : 1;

//     const [stockClosings, totalCount] = await Promise.all([
//       StockClosing.find(filter)
//         .populate([
//           {
//             path: "products.product",
//             select: "productTitle productCode productPrice",
//           },
//           { path: "center", select: "centerName centerCode centerType" },
//           { path: "closingCenter", select: "centerName centerCode centerType" },
//           { path: "createdBy", select: "name email" },
//           { path: "linkedStockClosing", select: "_id closingCenter status" },
//         ])
//         .sort(sort)
//         .skip(skip)
//         .limit(limitNum)
//         .lean(),

//       StockClosing.countDocuments(filter),
//     ]);

//     // Filter by center type if specified
//     const filteredStockClosings = centerType 
//       ? stockClosings.filter(sc => sc.closingCenter && sc.closingCenter.centerType === centerType)
//       : stockClosings;

//     const actualTotal = centerType 
//       ? filteredStockClosings.length
//       : totalCount;

//     const totalPages = Math.ceil(actualTotal / limitNum);
//     const hasNext = pageNum < totalPages;
//     const hasPrev = pageNum > 1;

//     res.json({
//       success: true,
//       message: "Stock closings retrieved successfully",
//       data: {
//         stockClosings: filteredStockClosings,
//         pagination: {
//           currentPage: pageNum,
//           totalPages,
//           totalItems: actualTotal,
//           itemsPerPage: limitNum,
//           hasNext,
//           hasPrev,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Get all stock closings error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock closings",
//     });
//   }
// };

// export const getStockClosingById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock closing ID",
//       });
//     }

//     let filter = { _id: id };
    
//     // If user is not admin, allow access if they are closingCenter OR center
//     if (req.user?.role !== 'admin' && req.user?.center) {
//       filter = {
//         _id: id,
//         $or: [
//           { closingCenter: req.user.center },
//           { center: req.user.center }
//         ]
//       };
//     }

//     const stockClosing = await StockClosing.findOne(filter).populate([
//       {
//         path: "products.product",
//         select: "productTitle productCode productPrice productImage",
//       },
//       {
//         path: "center",
//         select: "centerName centerCode centerType addressLine1 city",
//       },
//       {
//         path: "closingCenter",
//         select: "centerName centerCode centerType addressLine1 city",
//       },
//       { path: "createdBy", select: "name email" },
//       { 
//         path: "linkedStockClosing",
//         populate: [
//           { path: "closingCenter", select: "centerName centerCode centerType" },
//           { path: "createdBy", select: "name email" }
//         ]
//       },
//     ]);

//     if (!stockClosing) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock closing not found or you don't have permission to access it",
//       });
//     }

//     res.json({
//       success: true,
//       message: "Stock closing retrieved successfully",
//       data: stockClosing,
//     });
//   } catch (error) {
//     console.error("Get stock closing by ID error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock closing",
//     });
//   }
// };

// export const updateStockClosing = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { date, stockClosingForOtherCenter, center, products, status, remark } = req.body;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock closing ID",
//       });
//     }

//     let filter = { _id: id };
    
//     // If user is not admin, allow updates if they are closingCenter OR center
//     if (req.user?.role !== 'admin' && req.user?.center) {
//       filter = {
//         _id: id,
//         $or: [
//           { closingCenter: req.user.center },
//           { center: req.user.center }
//         ]
//       };
//     }

//     const existingStockClosing = await StockClosing.findOne(filter).populate('closingCenter');
//     if (!existingStockClosing) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock closing not found or you don't have permission to update it",
//       });
//     }

//     // Cannot update if this is a linked entry (secondary entry)
//     if (existingStockClosing.linkedStockClosing) {
//       return res.status(400).json({
//         success: false,
//         message: "Cannot update linked stock closing entry directly. Update the main entry instead.",
//       });
//     }

//     // Check if user can update based on center type
//     const isOutlet = existingStockClosing.closingCenter?.centerType === 'Outlet';
//     const userIsClosingCenter = existingStockClosing.closingCenter?._id?.toString() === req.user?.center?.toString();

//     // Only allow updates to stockClosingForOtherCenter if user is from the closing center (outlet)
//     if (stockClosingForOtherCenter !== undefined && !userIsClosingCenter) {
//       return res.status(400).json({
//         success: false,
//         message: "Only the closing center can update stockClosingForOtherCenter field",
//       });
//     }

//     if (products && Array.isArray(products)) {
//       if (products.length === 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Products array cannot be empty",
//         });
//       }

//       for (const [index, product] of products.entries()) {
//         if (
//           !product.product ||
//           product.productQty === undefined ||
//           product.damageQty === undefined
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
//           });
//         }

//         if (product.damageQty > product.productQty) {
//           return res.status(400).json({
//             success: false,
//             message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
//           });
//         }
//       }
//     }

//     const actualStockClosingForOtherCenter = Boolean(stockClosingForOtherCenter);
    
//     if (actualStockClosingForOtherCenter) {
//       if (!center) {
//         return res.status(400).json({
//           success: false,
//           message: "Center is required when stock closing is for other center",
//         });
//       }

//       // Only outlets can update to stock closing for other centers
//       if (!isOutlet) {
//         return res.status(400).json({
//           success: false,
//           message: "Only outlet users can update stock closing for other centers",
//         });
//       }
//     }

//     const updateData = {};

//     if (date !== undefined) updateData.date = date;
//     if (products !== undefined) updateData.products = products;
//     if (status !== undefined) updateData.status = status;
//     if (remark !== undefined) updateData.remark = remark;

//     // Handle stockClosingForOtherCenter and center fields (only if user is from closing center)
//     if (stockClosingForOtherCenter !== undefined && userIsClosingCenter) {
//       updateData.stockClosingForOtherCenter = actualStockClosingForOtherCenter;
//     }
    
//     if (actualStockClosingForOtherCenter && userIsClosingCenter) {
//       updateData.center = center;
//     } else if (stockClosingForOtherCenter === false && userIsClosingCenter) {
//       updateData.center = undefined;
//     }

//     const updatedStockClosing = await StockClosing.findOneAndUpdate(
//       filter,
//       updateData,
//       { new: true, runValidators: true }
//     ).populate([
//       {
//         path: "products.product",
//         select: "productTitle productCode productPrice",
//       },
//       { path: "center", select: "centerName centerCode centerType" },
//       { path: "closingCenter", select: "centerName centerCode centerType" },
//       { path: "createdBy", select: "name email" },
//       { path: "linkedStockClosing", select: "_id closingCenter status" },
//     ]);

//     res.json({
//       success: true,
//       message: "Stock closing updated successfully",
//       data: updatedStockClosing,
//     });
//   } catch (error) {
//     console.error("Update stock closing error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Error updating stock closing",
//     });
//   }
// };

// export const deleteStockClosing = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock closing ID",
//       });
//     }

//     let filter = { _id: id };
    
//     // If user is not admin, allow deletion if they are closingCenter OR center
//     if (req.user?.role !== 'admin' && req.user?.center) {
//       filter = {
//         _id: id,
//         $or: [
//           { closingCenter: req.user.center },
//           { center: req.user.center }
//         ]
//       };
//     }

//     const stockClosing = await StockClosing.findOne(filter);
//     if (!stockClosing) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock closing not found or you don't have permission to delete it",
//       });
//     }

//     // If this entry has a linked stock closing, delete that too
//     if (stockClosing.linkedStockClosing) {
//       await StockClosing.findByIdAndDelete(stockClosing.linkedStockClosing);
//     }

//     // If this entry is linked to another, remove the reference
//     await StockClosing.updateMany(
//       { linkedStockClosing: stockClosing._id },
//       { $unset: { linkedStockClosing: "" } }
//     );

//     await StockClosing.findByIdAndDelete(id);

//     res.json({
//       success: true,
//       message: "Stock closing deleted successfully",
//     });
//   } catch (error) {
//     console.error("Delete stock closing error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error deleting stock closing",
//     });
//   }
// };

// export const getMyCenterStockClosings = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "date",
//       sortOrder = "desc",
//       startDate,
//       endDate,
//     } = req.query;

//     // Ensure user has a center assigned
//     if (!req.user?.center) {
//       return res.status(400).json({
//         success: false,
//         message: "User is not associated with any center",
//       });
//     }

//     const filter = {
//       closingCenter: req.user.center,
//     };

//     if (startDate || endDate) {
//       filter.date = {};
//       if (startDate) filter.date.$gte = new Date(startDate);
//       if (endDate) filter.date.$lte = new Date(endDate);
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const sort = {};
//     sort[sortBy] = sortOrder === "desc" ? -1 : 1;

//     const [stockClosings, totalCount] = await Promise.all([
//       StockClosing.find(filter)
//         .populate([
//           {
//             path: "products.product",
//             select: "productTitle productCode productPrice",
//           },
//           { path: "center", select: "centerName centerCode centerType" },
//           { path: "closingCenter", select: "centerName centerCode centerType" },
//           { path: "createdBy", select: "name email" },
//           { path: "linkedStockClosing", select: "_id closingCenter status" },
//         ])
//         .sort(sort)
//         .skip(skip)
//         .limit(limitNum)
//         .lean(),

//       StockClosing.countDocuments(filter),
//     ]);

//     const totalPages = Math.ceil(totalCount / limitNum);
//     const hasNext = pageNum < totalPages;
//     const hasPrev = pageNum > 1;

//     res.json({
//       success: true,
//       message: "My center stock closings retrieved successfully",
//       data: {
//         stockClosings,
//         pagination: {
//           currentPage: pageNum,
//           totalPages,
//           totalItems: totalCount,
//           itemsPerPage: limitNum,
//           hasNext,
//           hasPrev,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Get my center stock closings error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock closings",
//     });
//   }
// };


import StockClosing from "../models/ReportSubmission.js";
import mongoose from "mongoose";
import User from "../models/User.js";

// Permission checking function for stock closing
const checkStockClosingPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const closingModule = userPermissions.find(
    (perm) => perm.module === "Closing"
  );

  if (!closingModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_closing_stock_own_center: closingModule.permissions.includes("manage_closing_stock_own_center"),
    manage_closing_stock_all_center: closingModule.permissions.includes("manage_closing_stock_all_center"),
    view_closing_stock_own_center: closingModule.permissions.includes("view_closing_stock_own_center"),
    view_closing_stock_all_center: closingModule.permissions.includes("view_closing_stock_all_center"),
    change_closing_qty: closingModule.permissions.includes("change_closing_qty"),
  };

  // Check if user has any of the required permissions
  const hasRequiredPermission = requiredPermissions.some(perm => permissions[perm]);
  
  return { 
    hasAccess: hasRequiredPermission, 
    permissions,
    userCenter: req.user.center 
  };
};

// Helper function to check center access for stock closing operations
const checkClosingCenterAccess = async (userId, targetCenterId, permissions) => {
  if (!userId) {
    throw new Error("User authentication required");
  }

  const user = await User.findById(userId).populate(
    "center",
    "centerName centerCode centerType"
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User is not associated with any center");
  }

  // Users with manage_closing_stock_all_center or view_closing_stock_all_center can access any center
  if (permissions.manage_closing_stock_all_center || permissions.view_closing_stock_all_center) {
    return targetCenterId || user.center._id;
  }

  // Users with manage_closing_stock_own_center or view_closing_stock_own_center can only access their own center
  if (permissions.manage_closing_stock_own_center || permissions.view_closing_stock_own_center) {
    const userCenterId = user.center._id || user.center;
    
    // If target center is provided, check if it matches user's center
    if (targetCenterId && targetCenterId.toString() !== userCenterId.toString()) {
      throw new Error("Access denied. You can only access your own center's stock closing data.");
    }
    
    return userCenterId;
  }

  throw new Error("Insufficient permissions to access stock closing data");
};

const getUserCenterId = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const user = await User.findById(userId).populate(
    "center",
    "centerName centerCode centerType"
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User center information not found");
  }

  return user.center._id;
};

const handleControllerError = (error, res) => {
  console.error("Controller Error:", error);

  if (
    error.message.includes("User center information not found") ||
    error.message.includes("User authentication required") ||
    error.message.includes("User not found") ||
    error.message.includes("User ID is required") ||
    error.message.includes("Access denied")
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message);
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors,
    });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate entry found",
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal server error",
  });
};

export const createStockClosing = async (req, res) => {
  try {
    // Check permissions for creating stock closing
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(req, ["manage_closing_stock_own_center", "manage_closing_stock_all_center"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_closing_stock_own_center or manage_closing_stock_all_center permission required.",
      });
    }

    const { date, stockClosingForOtherCenter, center, products, status, remark } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array with at least one product is required",
      });
    }

    for (const [index, product] of products.entries()) {
      if (
        !product.product ||
        product.productQty === undefined ||
        product.damageQty === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
        });
      }

      if (product.damageQty > product.productQty) {
        return res.status(400).json({
          success: false,
          message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
        });
      }
    }

    // Get closing center from user's center
    let userClosingCenter = userCenter?._id || userCenter;
    if (!userClosingCenter) {
      userClosingCenter = await getUserCenterId(req.user._id);
    }

    if (!userClosingCenter) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center to create stock closing",
      });
    }

    // Fetch closing center details to check type
    const Center = mongoose.model("Center");
    const closingCenterData = await Center.findById(userClosingCenter).select("centerType");
    
    if (!closingCenterData) {
      return res.status(400).json({
        success: false,
        message: "Invalid user center",
      });
    }

    const isOutlet = closingCenterData.centerType === 'Outlet';
    const isCenter = closingCenterData.centerType === 'Center';

    // Validate if user can create stock closing for other center
    const actualStockClosingForOtherCenter = Boolean(stockClosingForOtherCenter);
    
    if (actualStockClosingForOtherCenter) {
      if (!center) {
        return res.status(400).json({
          success: false,
          message: "Center is required when stock closing is for other center",
        });
      }

      // Validate the target center exists
      const targetCenter = await Center.findById(center);
      if (!targetCenter) {
        return res.status(400).json({
          success: false,
          message: "Target center not found",
        });
      }

      // Check if user has permission to create for other center
      if (permissions.manage_closing_stock_own_center && !permissions.manage_closing_stock_all_center) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You need manage_closing_stock_all_center permission to create stock closing for other centers.",
        });
      }

      // Only outlets can create stock closing for other centers
      if (!isOutlet) {
        return res.status(400).json({
          success: false,
          message: "Only outlet users can create stock closing for other centers",
        });
      }
    }

    // Create main stock closing entry (for the user's center)
    const mainStockClosingData = {
      date: date || new Date(),
      stockClosingForOtherCenter: actualStockClosingForOtherCenter,
      products,
      status: status || "Draft",
      createdBy: req.user?.id,
      closingCenter: userClosingCenter, // Always the user's center
      remark: remark || "",
    };

    // If stockClosingForOtherCenter is true, set the center field
    if (actualStockClosingForOtherCenter) {
      mainStockClosingData.center = center;
    }

    const mainStockClosing = new StockClosing(mainStockClosingData);
    await mainStockClosing.save();

    let secondaryStockClosing = null;

    // If stockClosingForOtherCenter is true, create a secondary entry for the target center
    if (actualStockClosingForOtherCenter) {
      const secondaryStockClosingData = {
        date: date || new Date(),
        stockClosingForOtherCenter: false, // This is the actual closing for the target center
        products: JSON.parse(JSON.stringify(products)), // Clone products data
        status: status || "Draft",
        createdBy: req.user?.id,
        closingCenter: center, // The target center becomes the closing center
        remark: remark,
        linkedStockClosing: mainStockClosing._id
      };

      secondaryStockClosing = new StockClosing(secondaryStockClosingData);
      await secondaryStockClosing.save();

  
      mainStockClosing.linkedStockClosing = secondaryStockClosing._id;
      await mainStockClosing.save();
    }

    // Populate and prepare response
    await mainStockClosing.populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode centerType" },
      { path: "closingCenter", select: "centerName centerCode centerType" },
      { path: "createdBy", select: "name email" },
      { path: "linkedStockClosing", select: "_id closingCenter status" },
    ]);

    const responseData = mainStockClosing.toObject();

    // Clean up response data
    delete responseData.totalProductQty;
    delete responseData.totalDamageQty;
    delete responseData.totalQty;
    delete responseData.id;

    if (responseData.products && Array.isArray(responseData.products)) {
      responseData.products.forEach((product) => {
        if (product.product && product.product.id) {
          delete product.product.id;
        }
      });
    }

    let message = "Stock closing created successfully";
    if (actualStockClosingForOtherCenter) {
      message = "Stock closing created successfully with secondary entry for target center";
    }

    res.status(201).json({
      success: true,
      message,
      data: responseData,
      ...(secondaryStockClosing && {
        secondaryEntry: {
          _id: secondaryStockClosing._id,
          closingCenter: center
        }
      })
    });

  } catch (error) {
    console.error("Create stock closing error:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockClosings = async (req, res) => {
  try {
    // Check permissions for viewing stock closings
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(req, ["view_closing_stock_own_center", "view_closing_stock_all_center"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
      stockClosingForOtherCenter,
      center,
      closingCenter,
      product,
      centerType,
    } = req.query;

    let filter = {};

    // Apply center filtering based on permissions
    if (permissions.view_closing_stock_own_center && !permissions.view_closing_stock_all_center && userCenter) {
      filter = {
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter }
        ]
      };
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (stockClosingForOtherCenter !== undefined) {
      filter.stockClosingForOtherCenter = stockClosingForOtherCenter === "true";
    }

    if (center) filter.center = center;
    if (closingCenter) filter.closingCenter = closingCenter;

    if (product) {
      filter["products.product"] = product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [stockClosings, totalCount] = await Promise.all([
      StockClosing.find(filter)
        .populate([
          {
            path: "products.product",
            select: "productTitle productCode productPrice",
          },
          { path: "center", select: "centerName centerCode centerType" },
          { path: "closingCenter", select: "centerName centerCode centerType" },
          { path: "createdBy", select: "fullName email" },
          { path: "linkedStockClosing", select: "_id closingCenter status" },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      StockClosing.countDocuments(filter),
    ]);

    // Filter by center type if specified
    const filteredStockClosings = centerType 
      ? stockClosings.filter(sc => sc.closingCenter && sc.closingCenter.centerType === centerType)
      : stockClosings;

    const actualTotal = centerType 
      ? filteredStockClosings.length
      : totalCount;

    const totalPages = Math.ceil(actualTotal / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      message: "Stock closings retrieved successfully",
      data: {
        stockClosings: filteredStockClosings,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: actualTotal,
          itemsPerPage: limitNum,
          hasNext,
          hasPrev,
        },
      },
    });
  } catch (error) {
    console.error("Get all stock closings error:", error);
    handleControllerError(error, res);
  }
};

export const getStockClosingById = async (req, res) => {
  try {
    // Check permissions for viewing stock closings
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(req, ["view_closing_stock_own_center", "view_closing_stock_all_center"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    let filter = { _id: id };
    
    // Apply center filtering based on permissions
    if (permissions.view_closing_stock_own_center && !permissions.view_closing_stock_all_center && userCenter) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter }
        ]
      };
    }

    const stockClosing = await StockClosing.findOne(filter).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice productImage",
      },
      {
        path: "center",
        select: "centerName centerCode centerType addressLine1 city",
      },
      {
        path: "closingCenter",
        select: "centerName centerCode centerType addressLine1 city",
      },
      { path: "createdBy", select: "name email" },
      { 
        path: "linkedStockClosing",
        populate: [
          { path: "closingCenter", select: "centerName centerCode centerType" },
          { path: "createdBy", select: "name email" }
        ]
      },
    ]);

    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found or you don't have permission to access it",
      });
    }

    res.json({
      success: true,
      message: "Stock closing retrieved successfully",
      data: stockClosing,
    });
  } catch (error) {
    console.error("Get stock closing by ID error:", error);
    handleControllerError(error, res);
  }
};

export const updateStockClosing = async (req, res) => {
  try {
    // Check permissions for updating stock closing quantities
    const { hasAccess } = checkStockClosingPermissions(req, ["change_closing_qty"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. change_closing_qty permission required.",
      });
    }

    const { id } = req.params;
    const { date, stockClosingForOtherCenter, center, products, status, remark } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    // For update operations, also check view permissions to access the record
    const { permissions, userCenter } = checkStockClosingPermissions(req, ["view_closing_stock_own_center", "view_closing_stock_all_center"]);
    
    let filter = { _id: id };
    
    // Apply center filtering based on permissions
    if (permissions.view_closing_stock_own_center && !permissions.view_closing_stock_all_center && userCenter) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter }
        ]
      };
    }

    const existingStockClosing = await StockClosing.findOne(filter).populate('closingCenter');
    if (!existingStockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found or you don't have permission to update it",
      });
    }

    // Cannot update if this is a linked entry (secondary entry)
    if (existingStockClosing.linkedStockClosing) {
      return res.status(400).json({
        success: false,
        message: "Cannot update linked stock closing entry directly. Update the main entry instead.",
      });
    }

    // Check if user can update based on center type and permissions
    const isOutlet = existingStockClosing.closingCenter?.centerType === 'Outlet';
    const userIsClosingCenter = existingStockClosing.closingCenter?._id?.toString() === (userCenter?._id?.toString() || userCenter?.toString());

    // Only allow updates to stockClosingForOtherCenter if user is from the closing center (outlet) and has appropriate permissions
    if (stockClosingForOtherCenter !== undefined && !userIsClosingCenter) {
      return res.status(400).json({
        success: false,
        message: "Only the closing center can update stockClosingForOtherCenter field",
      });
    }

    if (products && Array.isArray(products)) {
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Products array cannot be empty",
        });
      }

      for (const [index, product] of products.entries()) {
        if (
          !product.product ||
          product.productQty === undefined ||
          product.damageQty === undefined
        ) {
          return res.status(400).json({
            success: false,
            message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
          });
        }

        if (product.damageQty > product.productQty) {
          return res.status(400).json({
            success: false,
            message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
          });
        }
      }
    }

    const actualStockClosingForOtherCenter = Boolean(stockClosingForOtherCenter);
    
    if (actualStockClosingForOtherCenter) {
      if (!center) {
        return res.status(400).json({
          success: false,
          message: "Center is required when stock closing is for other center",
        });
      }

      // Check if user has permission to update for other center
      if (permissions.view_closing_stock_own_center && !permissions.view_closing_stock_all_center) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You need view_closing_stock_all_center permission to update stock closing for other centers.",
        });
      }

      // Only outlets can update to stock closing for other centers
      if (!isOutlet) {
        return res.status(400).json({
          success: false,
          message: "Only outlet users can update stock closing for other centers",
        });
      }
    }

    const updateData = {};

    if (date !== undefined) updateData.date = date;
    if (products !== undefined) updateData.products = products;
    if (status !== undefined) updateData.status = status;
    if (remark !== undefined) updateData.remark = remark;

    // Handle stockClosingForOtherCenter and center fields (only if user is from closing center)
    if (stockClosingForOtherCenter !== undefined && userIsClosingCenter) {
      updateData.stockClosingForOtherCenter = actualStockClosingForOtherCenter;
    }
    
    if (actualStockClosingForOtherCenter && userIsClosingCenter) {
      updateData.center = center;
    } else if (stockClosingForOtherCenter === false && userIsClosingCenter) {
      updateData.center = undefined;
    }

    const updatedStockClosing = await StockClosing.findOneAndUpdate(
      filter,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode centerType" },
      { path: "closingCenter", select: "centerName centerCode centerType" },
      { path: "createdBy", select: "name email" },
      { path: "linkedStockClosing", select: "_id closingCenter status" },
    ]);

    res.json({
      success: true,
      message: "Stock closing updated successfully",
      data: updatedStockClosing,
    });
  } catch (error) {
    console.error("Update stock closing error:", error);
    handleControllerError(error, res);
  }
};

export const deleteStockClosing = async (req, res) => {
  try {
    // Check permissions for deleting stock closings
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(req, ["manage_closing_stock_own_center", "manage_closing_stock_all_center"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_closing_stock_own_center or manage_closing_stock_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    let filter = { _id: id };
    
    // Apply center filtering based on permissions
    if (permissions.manage_closing_stock_own_center && !permissions.manage_closing_stock_all_center && userCenter) {
      filter = {
        _id: id,
        $or: [
          { closingCenter: userCenter._id || userCenter },
          { center: userCenter._id || userCenter }
        ]
      };
    }

    const stockClosing = await StockClosing.findOne(filter);
    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found or you don't have permission to delete it",
      });
    }

    // If this entry has a linked stock closing, delete that too
    if (stockClosing.linkedStockClosing) {
      await StockClosing.findByIdAndDelete(stockClosing.linkedStockClosing);
    }

    // If this entry is linked to another, remove the reference
    await StockClosing.updateMany(
      { linkedStockClosing: stockClosing._id },
      { $unset: { linkedStockClosing: "" } }
    );

    await StockClosing.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Stock closing deleted successfully",
    });
  } catch (error) {
    console.error("Delete stock closing error:", error);
    handleControllerError(error, res);
  }
};

export const getMyCenterStockClosings = async (req, res) => {
  try {
    // Check permissions for viewing stock closings
    const { hasAccess, permissions, userCenter } = checkStockClosingPermissions(req, ["view_closing_stock_own_center", "view_closing_stock_all_center"]);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_closing_stock_own_center or view_closing_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
    } = req.query;

    // Ensure user has a center assigned
    if (!userCenter) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with any center",
      });
    }

    const filter = {
      closingCenter: userCenter._id || userCenter,
    };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [stockClosings, totalCount] = await Promise.all([
      StockClosing.find(filter)
        .populate([
          {
            path: "products.product",
            select: "productTitle productCode productPrice",
          },
          { path: "center", select: "centerName centerCode centerType" },
          { path: "closingCenter", select: "centerName centerCode centerType" },
          { path: "createdBy", select: "name email" },
          { path: "linkedStockClosing", select: "_id closingCenter status" },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      StockClosing.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      message: "My center stock closings retrieved successfully",
      data: {
        stockClosings,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNext,
          hasPrev,
        },
      },
    });
  } catch (error) {
    console.error("Get my center stock closings error:", error);
    handleControllerError(error, res);
  }
};