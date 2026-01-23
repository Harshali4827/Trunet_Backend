// import mongoose from "mongoose";
// import ResellerStock from "../models/ResellerStock.js";
// import Reseller from "../models/Reseller.js";
// import Product from "../models/Product.js";
// import Center from "../models/Center.js";
// import ProductCategory from "../models/ProductCategory.js";

// const handleControllerError = (error, res) => {
//   console.error("Controller Error:", error);

//   if (
//     error.message.includes("User center information not found") ||
//     error.message.includes("User authentication required") ||
//     error.message.includes("User not found") ||
//     error.message.includes("User ID is required") ||
//     error.message.includes("Access denied")
//   ) {
//     return res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }

//   if (error.name === "ValidationError") {
//     const errors = Object.values(error.errors).map((err) => err.message);
//     return res.status(400).json({
//       success: false,
//       message: "Validation error",
//       errors,
//     });
//   }

//   if (error.name === "CastError") {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid ID format",
//     });
//   }

//   res.status(500).json({
//     success: false,
//     message: "Internal server error",
//     error:
//       process.env.NODE_ENV === "development"
//         ? error.message
//         : "Internal server error",
//   });
// };

// const buildArrayFilter = (value) => {
//   if (!value) return null;

//   const values = value.includes(",") 
//     ? value.split(",").map(item => item.trim())
//     : [value];
  
//   const objectIds = values.map(item => {
//     if (mongoose.Types.ObjectId.isValid(item)) {
//       return new mongoose.Types.ObjectId(item);
//     }
//     return item;
//   });
  
//   return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
// };

// const getCategoryId = async (categoryParam) => {
//   if (mongoose.Types.ObjectId.isValid(categoryParam)) {
//     return new mongoose.Types.ObjectId(categoryParam);
//   }
  
//   const category = await ProductCategory.findOne({
//     $or: [
//       { productCategory: { $regex: new RegExp(`^${categoryParam}$`, "i") } },
//       { categoryCode: { $regex: new RegExp(`^${categoryParam}$`, "i") } }
//     ]
//   }).select("_id");
  
//   return category ? category._id : null;
// };

// const checkResellerStockPermissions = (req, requiredPermissions = []) => {
//   const userPermissions = req.user.role?.permissions || [];
  
//   const availableStockModule = userPermissions.find(
//     (perm) => perm.module === "Available Stock"
//   );

//   if (!availableStockModule) {
//     return { hasAccess: false, permissions: {} };
//   }

//   const permissions = {
//     available_stock_own_center: availableStockModule.permissions.includes(
//       "available_stock_own_center"
//     ),
//     available_stock_all_center: availableStockModule.permissions.includes(
//       "available_stock_all_center"
//     ),
//   };

//   const hasRequiredPermission = requiredPermissions.some(
//     (perm) => permissions[perm]
//   );

//   return {
//     hasAccess: hasRequiredPermission,
//     permissions,
//     userCenter: req.user.center,
//   };
// };

// const getResellerFromCenter = async (centerId) => {
//   if (!centerId) return null;
  
//   try {
//     const center = await Center.findById(centerId).select("reseller").lean();
//     return center ? center.reseller : null;
//   } catch (error) {
//     console.error("Error getting reseller from center:", error);
//     return null;
//   }
// };

// const buildResellerStockFilter = async (query, permissions, userCenter) => {
//   const {
//     resellerId,
//     reseller,
//     product,
//     centerId,
//     center,
//     showCenterReturnsOnly,
//     sourceCenter,
//   } = query;

//   const filter = {};

//   if (
//     permissions.available_stock_own_center &&
//     !permissions.available_stock_all_center &&
//     userCenter
//   ) {
//     const resellerIdFromCenter = await getResellerFromCenter(userCenter._id || userCenter);
    
//     if (resellerIdFromCenter) {
//       filter.reseller = new mongoose.Types.ObjectId(resellerIdFromCenter);
//     } else {
//       return { noAccess: true };
//     }
//   } else if (resellerId || reseller) {
//     const resellerFilterValue = resellerId || reseller;
//     const resellerFilter = buildArrayFilter(resellerFilterValue);
//     if (resellerFilter) filter.reseller = resellerFilter;
//   } else if (centerId || center) {
//     const centerFilterValue = centerId || center;
//     const centerFilter = buildArrayFilter(centerFilterValue);
    
//     if (centerFilter) {
//       const targetCenterId = typeof centerFilter === 'object' ? centerFilter.$in?.[0] : centerFilter;
//       const resellerIdFromCenter = await getResellerFromCenter(targetCenterId);
      
//       if (resellerIdFromCenter) {
//         filter.reseller = new mongoose.Types.ObjectId(resellerIdFromCenter);
//       }
//     }
//   }

//   const productFilter = buildArrayFilter(product);
//   if (productFilter) filter.product = productFilter;


//   if (sourceCenter && mongoose.Types.ObjectId.isValid(sourceCenter)) {
//     filter["serialNumbers.transferHistory"] = {
//       $elemMatch: {
//         transferType: "center_to_reseller_return",
//         fromCenter: sourceCenter
//       }
//     };
//   }

//   if (showCenterReturnsOnly === "true") {
//     filter.$or = [
//       { "sourceBreakdown.centerReturnQuantity": { $gt: 0 } },
//       {
//         "serialNumbers.transferHistory": {
//           $elemMatch: {
//             transferType: "center_to_reseller_return"
//           }
//         }
//       }
//     ];
//   }

//   return filter;
// };

// export const getResellerAvailableStock = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } =
//       checkResellerStockPermissions(req, [
//         "available_stock_own_center",
//         "available_stock_all_center",
//       ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. available_stock_own_center or available_stock_all_center permission required.",
//       });
//     }

//     const {
//       page = 1,
//       limit = 100,
//       resellerId,
//       reseller,
//       product,
//       search,
//       sortBy = "productName",
//       sortOrder = "asc",
//       includeSerials = false,
//       lowStockThreshold = 10,
//       includeSourceBreakdown = false,
//       centerId,
//       center,
//       showCenterReturnsOnly = false,
//       sourceCenter,
//       ...filterParams
//     } = req.query;

//     // Convert sourceCenter to ObjectId if it exists
//     let sourceCenterObjectId = null;
//     if (sourceCenter && mongoose.Types.ObjectId.isValid(sourceCenter)) {
//       sourceCenterObjectId = new mongoose.Types.ObjectId(sourceCenter);
//     }

//     // Build filter for reseller stock
//     const filter = await buildResellerStockFilter(
//       { 
//         resellerId, 
//         reseller, 
//         product, 
//         search, 
//         lowStockThreshold,
//         centerId,
//         center,
//         showCenterReturnsOnly,
//         sourceCenter: sourceCenterObjectId,
//         ...filterParams 
//       },
//       permissions,
//       userCenter
//     );

//     // Check if user has no access (center without reseller)
//     if (filter.noAccess) {
//       const centerInfo = userCenter ? await Center.findById(userCenter._id || userCenter)
//         .select("centerName centerCode centerType")
//         .lean() : null;

//       return res.status(200).json({
//         success: true,
//         message: "No reseller stock data available for your center",
//         data: {
//           stock: [],
//           summary: {
//             totalProducts: 0,
//             totalQuantity: 0,
//             totalAvailable: 0,
//             totalConsumed: 0,
//             totalDamaged: 0,
//             totalRepair: 0,
//             totalDamageRepairSource: 0,
//             totalCenterReturnSource: 0,
//             totalEffectiveAvailable: 0,
//             lowStockItems: 0,
//             outOfStockItems: 0,
//             inStockItems: 0,
//           },
//           reseller: null,
//           center: centerInfo,
//           filters: {
//             reseller: "user_center_reseller",
//             product: product || "all",
//             search: search || "",
//             lowStockThreshold: parseInt(lowStockThreshold),
//             center: centerInfo ? centerInfo._id : null,
//           },
//           pagination: {
//             currentPage: parseInt(page),
//             totalPages: 0,
//             totalItems: 0,
//             itemsPerPage: parseInt(limit),
//             hasNext: false,
//             hasPrev: false,
//           },
//           permissions: {
//             canViewAllCenters: permissions.available_stock_all_center,
//             canViewOwnCenter: permissions.available_stock_own_center,
//           },
//         },
//       });
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     // COMPLETE AGGREGATION PIPELINE WITH SIMPLIFIED CONDITIONS
//     const aggregationPipeline = [
//       { $match: filter },
      
//       // Lookup reseller details FIRST
//       {
//         $lookup: {
//           from: "resellers",
//           localField: "reseller",
//           foreignField: "_id",
//           as: "resellerDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$resellerDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
      
//       // Lookup product details
//       {
//         $lookup: {
//           from: "products",
//           localField: "product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$productDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
      
//       // Lookup product category details
//       {
//         $lookup: {
//           from: "productcategories",
//           localField: "productDetails.productCategory",
//           foreignField: "_id",
//           as: "categoryDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$categoryDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
      
//       // Calculate if product tracks serial numbers
//       {
//         $addFields: {
//           tracksSerial: {
//             $cond: {
//               if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//               then: true,
//               else: false
//             }
//           }
//         }
//       }
//     ];

//     // Add conditional filtering based on sourceCenter
//     if (sourceCenterObjectId) {
//       // When sourceCenter is specified, filter serial numbers
//       aggregationPipeline.push({
//         $addFields: {
//           // Filter serial numbers to only include those from the specified source center
//           filteredSerialNumbers: {
//             $cond: {
//               if: "$tracksSerial",
//               then: {
//                 $filter: {
//                   input: "$serialNumbers",
//                   as: "serial",
//                   cond: {
//                     $gt: [
//                       {
//                         $size: {
//                           $filter: {
//                             input: "$$serial.transferHistory",
//                             as: "transfer",
//                             cond: {
//                               $and: [
//                                 { $eq: ["$$transfer.transferType", "center_to_reseller_return"] },
//                                 { $eq: ["$$transfer.fromCenter", sourceCenterObjectId] }
//                               ]
//                             }
//                           }
//                         }
//                       },
//                       0
//                     ]
//                   }
//                 }
//               },
//               else: []
//             }
//           },
          
//           // Calculate filtered center return serials
//           centerReturnSerials: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: {
//                 $gt: [
//                   {
//                     $size: {
//                       $filter: {
//                         input: "$$serial.transferHistory",
//                         as: "transfer",
//                         cond: {
//                           $and: [
//                             { $eq: ["$$transfer.transferType", "center_to_reseller_return"] },
//                             { $eq: ["$$transfer.fromCenter", sourceCenterObjectId] }
//                           ]
//                         }
//                       }
//                     }
//                   },
//                   0
//                 ]
//               }
//             }
//           }
//         }
//       });

//       // Replace original serialNumbers with filtered ones
//       aggregationPipeline.push({
//         $addFields: {
//           serialNumbers: "$filteredSerialNumbers"
//         }
//       });

//       // Filter out non-serialized products that don't have center returns from this center
//       aggregationPipeline.push({
//         $match: {
//           $or: [
//             // For serialized products: must have centerReturnSerials
//             { 
//               $and: [
//                 { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//                 { $gt: [{ $size: "$centerReturnSerials" }, 0] }
//               ]
//             },
//             // For non-serialized products: must have centerReturnQuantity in sourceBreakdown
//             {
//               $and: [
//                 { $eq: ["$productDetails.trackSerialNumber", "No"] },
//                 { $gt: ["$sourceBreakdown.centerReturnQuantity", 0] }
//               ]
//             }
//           ]
//         }
//       });
//     } else {
//       // When no sourceCenter is specified, use all serial numbers
//       aggregationPipeline.push({
//         $addFields: {
//           centerReturnSerials: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: {
//                 $gt: [
//                   {
//                     $size: {
//                       $filter: {
//                         input: "$$serial.transferHistory",
//                         as: "transfer",
//                         cond: {
//                           $eq: ["$$transfer.transferType", "center_to_reseller_return"]
//                         }
//                       }
//                     }
//                   },
//                   0
//                 ]
//               }
//             }
//           }
//         }
//       });
//     }

//     // SIMPLIFIED: Calculate center-specific return quantities
//     aggregationPipeline.push({
//       $addFields: {
//         // Count serials by status
//         availableSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "available"] },
//             },
//           },
//         },
//         consumedSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "consumed"] },
//             },
//           },
//         },
//         damagedSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "damaged"] },
//             },
//           },
//         },
//         underRepairSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "under_repair"] },
//             },
//           },
//         },
//         repairedSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "repaired"] },
//             },
//           },
//         },
//         irreparableSerialsCount: {
//           $size: {
//             $filter: {
//               input: "$serialNumbers",
//               as: "serial",
//               cond: { $eq: ["$$serial.status", "irreparable"] },
//             },
//           },
//         },
        
//         // Center return specific counts
//         centerReturnSerialsCount: {
//           $size: "$centerReturnSerials"
//         },
        
//         // Calculate effective available quantity
//         effectiveAvailableQuantity: {
//           $cond: {
//             if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//             then: "$availableSerialsCount",
//             else: {
//               $max: [
//                 0,
//                 {
//                   $subtract: [
//                     "$availableQuantity",
//                     {
//                       $add: [
//                         "$damagedQuantity",
//                         "$repairQuantity"
//                       ]
//                     }
//                   ]
//                 }
//               ]
//             },
//           },
//         },
        
//         // Stock status based on threshold
//         stockStatus: {
//           $cond: {
//             if: {
//               $lt: [
//                 {
//                   $cond: {
//                     if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//                     then: "$availableSerialsCount",
//                     else: "$effectiveAvailableQuantity",
//                   },
//                 },
//                 parseInt(lowStockThreshold),
//               ],
//             },
//             then: "low_stock",
//             else: {
//               $cond: {
//                 if: {
//                   $eq: [
//                     {
//                       $cond: {
//                         if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//                         then: "$availableSerialsCount",
//                         else: "$effectiveAvailableQuantity",
//                       },
//                     },
//                     0,
//                   ],
//                 },
//                 then: "out_of_stock",
//                 else: "in_stock",
//               },
//             },
//           },
//         },
//       },
//     });

//     // Add search filter if search exists
//     if (search) {
//       aggregationPipeline.unshift({
//         $match: {
//           $or: [
//             { "productDetails.productTitle": { $regex: search, $options: "i" } },
//             { "productDetails.productCode": { $regex: search, $options: "i" } },
//             { "resellerDetails.businessName": { $regex: search, $options: "i" } },
//             { "resellerDetails.code": { $regex: search, $options: "i" } },
//             { "resellerDetails.contactPerson": { $regex: search, $options: "i" } },
//             { "categoryDetails.productCategory": { $regex: search, $options: "i" } },
//           ],
//         },
//       });
//     }

//     // Build projection stage
//     const projectionStage = {
//       $project: {
//         // Basic stock fields
//         _id: 1,
//         reseller: 1,
//         product: 1,
//         totalQuantity: 1,
//         availableQuantity: 1,
//         consumedQuantity: 1,
//         damagedQuantity: 1,
//         repairQuantity: 1,
//         lastUpdated: 1,
//         createdAt: 1,
//         updatedAt: 1,
        
//         // Product Details
//         productName: "$productDetails.productTitle",
//         productCode: "$productDetails.productCode",
//         productDescription: "$productDetails.description",
//         productPrice: "$productDetails.productPrice",
//         productImage: "$productDetails.productImage",
//         trackSerialNumber: "$productDetails.trackSerialNumber",
        
//         // Category Details
//         productCategory: {
//           _id: "$categoryDetails._id",
//           name: "$categoryDetails.productCategory",
//           code: "$categoryDetails.categoryCode",
//           description: "$categoryDetails.description",
//         },
        
//         // Reseller Details
//         resellerName: "$resellerDetails.businessName",
//         resellerCode: "$resellerDetails.code",
//         resellerContactPerson: "$resellerDetails.contactPerson",
//         resellerContactNumber: "$resellerDetails.mobile",
//         resellerEmail: "$resellerDetails.email",
//         resellerAddress: "$resellerDetails.address",
//         resellerStatus: "$resellerDetails.status",
        
//         // Serial counts
//         availableSerialsCount: 1,
//         consumedSerialsCount: 1,
//         damagedSerialsCount: 1,
//         underRepairSerialsCount: 1,
//         repairedSerialsCount: 1,
//         irreparableSerialsCount: 1,
        
//         // Center return tracking
//         centerReturnSerialsCount: 1,
//         centerReturnSerials: 1,
        
//         // Source breakdown
//         sourceBreakdown: 1,
        
//         // Calculated fields
//         effectiveAvailableQuantity: 1,
//         stockStatus: 1,
//       }
//     };

//     // Add sourceBreakdown if requested
//     if (includeSourceBreakdown === "true") {
//       projectionStage.$project.sourceBreakdown = 1;
//     }

//     // Add serial numbers to projection if requested
//     if (includeSerials === "true") {
//       projectionStage.$project.serialNumbers = 1;
//     }

//     aggregationPipeline.push(projectionStage);

//     // Create count pipeline (simplified - copy without pagination)
//     const countPipeline = [
//       { $match: filter },
//       {
//         $lookup: {
//           from: "products",
//           localField: "product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },
//       { $unwind: "$productDetails" },
//       { $count: "total" }
//     ];

//     // Add sorting
//     const sortConfig = {};
//     const validSortFields = [
//       "productName", "productCode", "resellerName", "resellerCode", 
//       "effectiveAvailableQuantity", "stockStatus", "lastUpdated",
//       "centerReturnSerialsCount", "totalQuantity", "availableQuantity"
//     ];
//     const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
//     sortConfig[actualSortBy] = sortOrder === "desc" ? -1 : 1;
    
//     aggregationPipeline.push({ $sort: sortConfig });

//     // Add pagination
//     aggregationPipeline.push(
//       { $skip: skip },
//       { $limit: limitNum }
//     );

//     // SIMPLIFIED: Get center returns in memory after aggregation
//     const [stockData, countResult] = await Promise.all([
//       ResellerStock.aggregate(aggregationPipeline),
//       ResellerStock.aggregate(countPipeline),
//     ]);

//     const total = countResult.length > 0 ? countResult[0].total : 0;
//     const totalPages = Math.ceil(total / limitNum);

//     // Get center details for center returns
//     const stockWithCenterDetails = await Promise.all(
//       stockData.map(async (item) => {
//         if (item.centerReturnSerials && item.centerReturnSerials.length > 0) {
//           // Extract unique center IDs from centerReturnSerials
//           const centerIds = [];
//           item.centerReturnSerials.forEach(serial => {
//             if (serial.transferHistory) {
//               serial.transferHistory.forEach(transfer => {
//                 if (transfer.transferType === "center_to_reseller_return" && transfer.fromCenter) {
//                   if (!centerIds.includes(transfer.fromCenter.toString())) {
//                     centerIds.push(transfer.fromCenter.toString());
//                   }
//                 }
//               });
//             }
//           });

//           // Get center details
//           const centerDetails = await Center.find({
//             _id: { $in: centerIds.map(id => new mongoose.Types.ObjectId(id)) }
//           }).select("centerName centerCode centerType").lean();

//           // Create center returns array
//           const centerReturnsMap = new Map();
//           item.centerReturnSerials.forEach(serial => {
//             if (serial.transferHistory) {
//               serial.transferHistory.forEach(transfer => {
//                 if (transfer.transferType === "center_to_reseller_return" && transfer.fromCenter) {
//                   const centerId = transfer.fromCenter.toString();
//                   if (!centerReturnsMap.has(centerId)) {
//                     const centerDetail = centerDetails.find(c => c._id.toString() === centerId);
//                     centerReturnsMap.set(centerId, {
//                       centerId: centerId,
//                       centerName: centerDetail?.centerName || "Unknown Center",
//                       centerCode: centerDetail?.centerCode || "N/A",
//                       centerType: centerDetail?.centerType || "Unknown",
//                       returnCount: 0,
//                       serialNumbers: [],
//                       latestReturnDate: transfer.transferDate
//                     });
//                   }
//                   const centerReturn = centerReturnsMap.get(centerId);
//                   centerReturn.returnCount += 1;
//                   if (serial.serialNumber) {
//                     centerReturn.serialNumbers.push(serial.serialNumber);
//                   }
//                   if (transfer.transferDate > centerReturn.latestReturnDate) {
//                     centerReturn.latestReturnDate = transfer.transferDate;
//                   }
//                 }
//               });
//             }
//           });

//           item.centerReturns = Array.from(centerReturnsMap.values());
//         } else {
//           item.centerReturns = [];
//         }
        
//         return item;
//       })
//     );

//     // Get source center info if specified
//     let sourceCenterInfo = null;
//     if (sourceCenter) {
//       try {
//         sourceCenterInfo = await Center.findById(sourceCenter).select(
//           "centerName centerCode centerType"
//         );
//       } catch (error) {
//         console.error("Error fetching source center info:", error);
//       }
//     }

//     // Get reseller info
//     let resellerInfo = null;
//     if (filter.reseller) {
//       const resellerIdValue = typeof filter.reseller === 'object' && filter.reseller.$in 
//         ? filter.reseller.$in[0] 
//         : filter.reseller;
      
//       try {
//         resellerInfo = await Reseller.findById(resellerIdValue).select(
//           "name businessName code contactPerson mobile email address status"
//         );
//       } catch (error) {
//         console.error("Error fetching reseller info:", error);
//       }
//     }

//     // Get center info for user context
//     let centerInfo = null;
//     if (userCenter && permissions.available_stock_own_center && !permissions.available_stock_all_center) {
//       centerInfo = await Center.findById(userCenter._id || userCenter)
//         .select("centerName centerCode centerType")
//         .lean();
//     } else if (centerId || center) {
//       const centerFilterValue = centerId || center;
//       const centerFilter = buildArrayFilter(centerFilterValue);
//       if (centerFilter) {
//         centerInfo = await Center.findById(
//           typeof centerFilter === 'object' ? centerFilter.$in?.[0] : centerFilter
//         )
//         .select("centerName centerCode centerType reseller")
//         .lean();
//       }
//     }

//     // Calculate summary
//     const summary = {
//       totalProducts: total,
//       totalQuantity: stockWithCenterDetails.reduce((sum, item) => sum + (item.totalQuantity || 0), 0),
//       totalAvailable: stockWithCenterDetails.reduce((sum, item) => sum + (item.availableQuantity || 0), 0),
//       totalConsumed: stockWithCenterDetails.reduce((sum, item) => sum + (item.consumedQuantity || 0), 0),
//       totalDamaged: stockWithCenterDetails.reduce((sum, item) => sum + (item.damagedQuantity || 0), 0),
//       totalRepair: stockWithCenterDetails.reduce((sum, item) => sum + (item.repairQuantity || 0), 0),
//       totalEffectiveAvailable: stockWithCenterDetails.reduce((sum, item) => sum + (item.effectiveAvailableQuantity || 0), 0),
//       totalCenterReturnsBySerial: stockWithCenterDetails.reduce((sum, item) => sum + (item.centerReturnSerialsCount || 0), 0),
//       lowStockItems: stockWithCenterDetails.filter(item => item.stockStatus === "low_stock").length,
//       outOfStockItems: stockWithCenterDetails.filter(item => item.stockStatus === "out_of_stock").length,
//       inStockItems: stockWithCenterDetails.filter(item => item.stockStatus === "in_stock").length,
//     };

//     // Add source breakdown summary if requested
//     if (includeSourceBreakdown === "true") {
//       summary.totalDamageRepairSource = stockWithCenterDetails.reduce((sum, item) => 
//         sum + (item.sourceBreakdown?.damageRepairQuantity || 0), 0);
//       summary.totalCenterReturnSource = stockWithCenterDetails.reduce((sum, item) => 
//         sum + (item.sourceBreakdown?.centerReturnQuantity || 0), 0);
//     }

//     res.status(200).json({
//       success: true,
//       message: "Reseller stock data retrieved successfully",
//       data: {
//         stock: stockWithCenterDetails,
//         summary: summary,
//         reseller: resellerInfo,
//         center: centerInfo,
//         sourceCenter: sourceCenterInfo,
//         filters: {
//           reseller: filter.reseller || "all",
//           product: product || "all",
//           search: search || "",
//           lowStockThreshold: parseInt(lowStockThreshold),
//           includeSerials: includeSerials === "true",
//           includeSourceBreakdown: includeSourceBreakdown === "true",
//           center: centerInfo ? centerInfo._id : (centerId || center || null),
//           showCenterReturnsOnly: showCenterReturnsOnly === "true",
//           sourceCenter: sourceCenter || null,
//         },
//         pagination: {
//           currentPage: pageNum,
//           totalPages,
//           totalItems: total,
//           itemsPerPage: limitNum,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//         permissions: {
//           canViewAllCenters: permissions.available_stock_all_center,
//           canViewOwnCenter: permissions.available_stock_own_center,
//           accessType: permissions.available_stock_all_center 
//             ? "all_centers" 
//             : permissions.available_stock_own_center 
//               ? "own_center_reseller" 
//               : "none",
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving reseller stock:", error);
//     handleControllerError(error, res);
//   }
// };

// export const getResellerProductsWithStock = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } =
//       checkResellerStockPermissions(req, [
//         "available_stock_own_center",
//         "available_stock_all_center",
//       ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. available_stock_own_center or available_stock_all_center permission required.",
//       });
//     }

//     const {
//       page = 1,
//       limit = 100,
//       resellerId,
//       reseller,
//       product,
//       search,
//       category,
//       sortBy = "productName",
//       sortOrder = "asc",
//       centerId,
//       center,
//       ...filterParams
//     } = req.query;

//     let targetResellerId = null;
//     let targetCenterId = null;
//     let targetCenter = null;

//     if (permissions.available_stock_own_center && !permissions.available_stock_all_center) {
//       if (userCenter) {
//         targetCenterId = userCenter._id || userCenter;
//         const centerData = await Center.findById(targetCenterId)
//           .select("reseller centerName centerCode")
//           .lean();
        
//         if (centerData) {
//           targetCenter = {
//             _id: centerData._id,
//             centerName: centerData.centerName,
//             centerCode: centerData.centerCode,
//           };
          
//           if (centerData.reseller) {
//             targetResellerId = centerData.reseller;
//           } else {
//             // If center has no reseller, return empty response
//             return res.status(200).json({
//               success: true,
//               message: "Your center is not associated with any reseller",
//               data: {
//                 stock: [],
//                 summary: {
//                   totalProducts: 0,
//                   totalQuantity: 0,
//                   totalAvailable: 0,
//                   totalConsumed: 0,
//                   totalDamaged: 0,
//                   totalRepair: 0,
//                   totalEffectiveAvailable: 0,
//                   totalDamageRepairSource: 0,
//                   totalCenterReturnSource: 0,
//                   lowStockItems: 0,
//                   outOfStockItems: 0,
//                   inStockItems: 0,
//                 },
//                 reseller: null,
//                 center: targetCenter,
//                 filters: {
//                   center: targetCenterId,
//                   product: product || "all",
//                   search: search || "",
//                   category: category || "all",
//                 },
//                 pagination: {
//                   currentPage: parseInt(page),
//                   totalPages: 0,
//                   totalItems: 0,
//                   itemsPerPage: parseInt(limit),
//                   hasNext: false,
//                   hasPrev: false,
//                 },
//                 permissions: {
//                   canViewAllCenters: false,
//                   canViewOwnCenter: true,
//                 },
//               },
//             });
//           }
//         }
//       }
//     } 
//     // If user has access to all centers, they can specify which reseller/center
//     else if (permissions.available_stock_all_center) {
//       if (resellerId || reseller) {
//         const resellerFilterValue = resellerId || reseller;
//         const resellerFilter = buildArrayFilter(resellerFilterValue);
//         if (resellerFilter) {
//           targetResellerId = typeof resellerFilter === 'object' 
//             ? resellerFilter.$in[0] 
//             : resellerFilter;
//         }
//       } else if (centerId || center) {
//         const centerFilterValue = centerId || center;
//         const centerFilter = buildArrayFilter(centerFilterValue);
//         if (centerFilter) {
//           targetCenterId = typeof centerFilter === 'object' 
//             ? centerFilter.$in[0] 
//             : centerFilter;
          
//           const centerData = await Center.findById(targetCenterId)
//             .select("reseller centerName centerCode")
//             .lean();
          
//           if (centerData) {
//             targetCenter = {
//               _id: centerData._id,
//               centerName: centerData.centerName,
//               centerCode: centerData.centerCode,
//             };
            
//             if (centerData.reseller) {
//               targetResellerId = centerData.reseller;
//             }
//           }
//         }
//       }
//     }

//     if (!targetResellerId) {
//       return res.status(400).json({
//         success: false,
//         message: "Reseller not specified or not found for the given center",
//       });
//     }

//     // Get reseller details
//     const targetReseller = await Reseller.findById(targetResellerId).select(
//       "_id name code contactPerson mobile email address"
//     );

//     if (!targetReseller) {
//       return res.status(404).json({
//         success: false,
//         message: "Reseller not found",
//       });
//     }

//     // Build product filter
//     const productFilter = {};
//     if (search) {
//       productFilter.$or = [
//         { productTitle: { $regex: search, $options: "i" } },
//         { productCode: { $regex: search, $options: "i" } },
//         { description: { $regex: search, $options: "i" } },
//         { "productCategory.productCategory": { $regex: search, $options: "i" } },
//       ];
//     }

//     if (category) {
//       const categoryId = await getCategoryId(category);
//       if (categoryId) {
//         productFilter.productCategory = categoryId;
//       }
//     }

//     if (product) {
//       const productFilterObj = buildArrayFilter(product);
//       if (productFilterObj) {
//         productFilter._id = productFilterObj;
//       }
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     // Get products
//     const [products, totalProducts] = await Promise.all([
//       Product.find(productFilter)
//         .populate("productCategory", "productCategory categoryCode")
//         .select(
//           "productTitle productCode description productCategory productPrice trackSerialNumber productImage"
//         )
//         .sort({ productTitle: 1 })
//         .limit(limitNum)
//         .skip(skip)
//         .lean(),

//       Product.countDocuments(productFilter),
//     ]);

//     if (products.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No products found",
//         data: {
//           stock: [],
//           summary: {
//             totalProducts: 0,
//             totalQuantity: 0,
//             totalAvailable: 0,
//             totalConsumed: 0,
//             totalDamaged: 0,
//             totalRepair: 0,
//             totalEffectiveAvailable: 0,
//             totalDamageRepairSource: 0,
//             totalCenterReturnSource: 0,
//             lowStockItems: 0,
//             outOfStockItems: 0,
//             inStockItems: 0,
//           },
//           reseller: targetReseller,
//           center: targetCenter,
//           filters: {
//             reseller: targetResellerId,
//             center: targetCenterId || "user_center",
//             product: product || "all",
//             search: search || "",
//             category: category || "all",
//           },
//           pagination: {
//             currentPage: pageNum,
//             totalPages: 0,
//             totalItems: 0,
//             itemsPerPage: limitNum,
//             hasNext: false,
//             hasPrev: false,
//           },
//           permissions: {
//             canViewAllCenters: permissions.available_stock_all_center,
//             canViewOwnCenter: permissions.available_stock_own_center,
//           },
//         },
//       });
//     }

//     const productIds = products.map((product) => product._id);

//     // Get reseller stock for these products
//     const resellerStockData = await ResellerStock.aggregate([
//       {
//         $match: {
//           reseller: new mongoose.Types.ObjectId(targetResellerId),
//           product: { $in: productIds },
//         },
//       },
//       {
//         $addFields: {
//           availableSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "available"] },
//               },
//             },
//           },
//           damagedSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "damaged"] },
//               },
//             },
//           },
//           underRepairSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "under_repair"] },
//               },
//             },
//           },
//           repairedSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "repaired"] },
//               },
//             },
//           },
//           irreparableSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "irreparable"] },
//               },
//             },
//           },
//         },
//       },
//       {
//         $lookup: {
//           from: "products",
//           localField: "product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$productDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       {
//         $group: {
//           _id: "$product",
//           totalQuantity: { $sum: "$totalQuantity" },
//           availableQuantity: { $sum: "$availableQuantity" },
//           consumedQuantity: { $sum: "$consumedQuantity" },
//           damagedQuantity: { $sum: "$damagedQuantity" },
//           repairQuantity: { $sum: "$repairQuantity" },
//           availableSerialsCount: { $sum: "$availableSerialsCount" },
//           damagedSerialsCount: { $sum: "$damagedSerialsCount" },
//           underRepairSerialsCount: { $sum: "$underRepairSerialsCount" },
//           repairedSerialsCount: { $sum: "$repairedSerialsCount" },
//           irreparableSerialsCount: { $sum: "$irreparableSerialsCount" },
//           stockEntries: { $sum: 1 },
//           trackSerialNumber: { $first: "$productDetails.trackSerialNumber" },
//           sourceBreakdown: { 
//             $first: {
//               $ifNull: ["$sourceBreakdown", {
//                 damageRepairQuantity: 0,
//                 centerReturnQuantity: 0
//               }]
//             }
//           },
//         },
//       },
//       {
//         $project: {
//           totalQuantity: 1,
//           availableQuantity: 1,
//           consumedQuantity: 1,
//           damagedQuantity: 1,
//           repairQuantity: 1,
//           availableSerialsCount: 1,
//           damagedSerialsCount: 1,
//           underRepairSerialsCount: 1,
//           repairedSerialsCount: 1,
//           irreparableSerialsCount: 1,
//           stockEntries: 1,
//           trackSerialNumber: 1,
//           sourceBreakdown: 1,
//           effectiveAvailableQuantity: {
//             $cond: {
//               if: { $eq: ["$trackSerialNumber", "Yes"] },
//               then: "$availableSerialsCount",
//               else: {
//                 $max: [
//                   0,
//                   {
//                     $subtract: [
//                       "$availableQuantity",
//                       {
//                         $add: [
//                           "$damagedQuantity",
//                           "$repairQuantity"
//                         ]
//                       }
//                     ]
//                   }
//                 ]
//               },
//             },
//           },
//         },
//       },
//     ]);

//     const stockMap = new Map();
//     resellerStockData.forEach((item) => {
//       stockMap.set(item._id.toString(), {
//         totalQuantity: item.totalQuantity,
//         availableQuantity: item.availableQuantity,
//         consumedQuantity: item.consumedQuantity,
//         damagedQuantity: item.damagedQuantity,
//         repairQuantity: item.repairQuantity,
//         availableSerialsCount: item.availableSerialsCount,
//         damagedSerialsCount: item.damagedSerialsCount,
//         underRepairSerialsCount: item.underRepairSerialsCount,
//         repairedSerialsCount: item.repairedSerialsCount,
//         irreparableSerialsCount: item.irreparableSerialsCount,
//         stockEntries: item.stockEntries,
//         effectiveAvailableQuantity: item.effectiveAvailableQuantity,
//         sourceBreakdown: item.sourceBreakdown,
//       });
//     });

//     // Format the response
//     const formattedProducts = products.map((product) => {
//       const productId = product._id.toString();
//       const stockData = stockMap.get(productId) || {
//         totalQuantity: 0,
//         availableQuantity: 0,
//         consumedQuantity: 0,
//         damagedQuantity: 0,
//         repairQuantity: 0,
//         availableSerialsCount: 0,
//         damagedSerialsCount: 0,
//         underRepairSerialsCount: 0,
//         repairedSerialsCount: 0,
//         irreparableSerialsCount: 0,
//         stockEntries: 0,
//         effectiveAvailableQuantity: 0,
//         sourceBreakdown: {
//           damageRepairQuantity: 0,
//           centerReturnQuantity: 0
//         },
//       };

//       const productCategory = product.productCategory
//         ? {
//             _id: product.productCategory._id,
//             name: product.productCategory.productCategory,
//             code: product.productCategory.categoryCode,
//           }
//         : null;

//       const stockStatus =
//         stockData.effectiveAvailableQuantity === 0
//           ? "out_of_stock"
//           : stockData.effectiveAvailableQuantity < 10
//           ? "low_stock"
//           : "in_stock";

//       return {
//         _id: product._id,
//         product: product._id,
//         productName: product.productTitle,
//         productCode: product.productCode,
//         productDescription: product.description,
//         productPrice: product.productPrice,
//         productImage: product.productImage,
//         productCategory: productCategory,
//         trackSerialNumber: product.trackSerialNumber,
//         reseller: targetResellerId,
//         resellerName: targetReseller.name,
//         resellerCode: targetReseller.code,
//         resellerContactPerson: targetReseller.contactPerson,
//         resellerContactNumber: targetReseller.mobile,
//         resellerEmail: targetReseller.email,
        
//         // Stock information
//         totalQuantity: stockData.totalQuantity,
//         availableQuantity: stockData.availableQuantity,
//         consumedQuantity: stockData.consumedQuantity,
//         damagedQuantity: stockData.damagedQuantity,
//         repairQuantity: stockData.repairQuantity,
        
//         // Serial counts
//         availableSerialsCount: stockData.availableSerialsCount,
//         consumedSerialsCount: stockData.consumedQuantity,
//         damagedSerialsCount: stockData.damagedSerialsCount,
//         underRepairSerialsCount: stockData.underRepairSerialsCount,
//         repairedSerialsCount: stockData.repairedSerialsCount,
//         irreparableSerialsCount: stockData.irreparableSerialsCount,
        
//         // Source breakdown
//         sourceBreakdown: stockData.sourceBreakdown,
        
//         // Calculated fields
//         effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
//         stockStatus: stockStatus,
//         lastUpdated: new Date().toISOString(),
//         serialNumbers: [],
//       };
//     });

//     // Sort the results
//     const validSortFields = [
//       "productName", "productCode", "effectiveAvailableQuantity", 
//       "stockStatus", "totalQuantity", "availableQuantity"
//     ];
//     const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    
//     formattedProducts.sort((a, b) => {
//       const aValue = a[actualSortBy];
//       const bValue = b[actualSortBy];
//       const multiplier = sortOrder === "desc" ? -1 : 1;
      
//       if (aValue < bValue) return -1 * multiplier;
//       if (aValue > bValue) return 1 * multiplier;
//       return 0;
//     });

//     // Calculate summary
//     const summary = {
//       totalProducts: formattedProducts.length,
//       totalQuantity: formattedProducts.reduce(
//         (sum, product) => sum + product.totalQuantity,
//         0
//       ),
//       totalAvailable: formattedProducts.reduce(
//         (sum, product) => sum + product.availableQuantity,
//         0
//       ),
//       totalConsumed: formattedProducts.reduce(
//         (sum, product) => sum + product.consumedQuantity,
//         0
//       ),
//       totalDamaged: formattedProducts.reduce(
//         (sum, product) => sum + product.damagedQuantity,
//         0
//       ),
//       totalRepair: formattedProducts.reduce(
//         (sum, product) => sum + product.repairQuantity,
//         0
//       ),
//       totalEffectiveAvailable: formattedProducts.reduce(
//         (sum, product) => sum + product.effectiveAvailableQuantity,
//         0
//       ),
//       totalDamageRepairSource: formattedProducts.reduce(
//         (sum, product) => sum + product.sourceBreakdown.damageRepairQuantity,
//         0
//       ),
//       totalCenterReturnSource: formattedProducts.reduce(
//         (sum, product) => sum + product.sourceBreakdown.centerReturnQuantity,
//         0
//       ),
//       lowStockItems: formattedProducts.filter(
//         (product) => product.stockStatus === "low_stock"
//       ).length,
//       outOfStockItems: formattedProducts.filter(
//         (product) => product.stockStatus === "out_of_stock"
//       ).length,
//       inStockItems: formattedProducts.filter(
//         (product) => product.stockStatus === "in_stock"
//       ).length,
//     };

//     res.status(200).json({
//       success: true,
//       message: "Reseller products with stock information retrieved successfully",
//       data: {
//         stock: formattedProducts,
//         summary: summary,
//         reseller: targetReseller,
//         center: targetCenter,
//         filters: {
//           reseller: targetResellerId,
//           center: targetCenterId || "user_center",
//           product: product || "all",
//           search: search || "",
//           category: category || "all",
//         },
//         pagination: {
//           currentPage: pageNum,
//           totalPages: Math.ceil(totalProducts / limitNum),
//           totalItems: totalProducts,
//           itemsPerPage: limitNum,
//           hasNext: pageNum < Math.ceil(totalProducts / limitNum),
//           hasPrev: pageNum > 1,
//         },
//         permissions: {
//           canViewAllCenters: permissions.available_stock_all_center,
//           canViewOwnCenter: permissions.available_stock_own_center,
//           accessType: permissions.available_stock_all_center 
//             ? "all_centers" 
//             : "own_center_reseller",
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving reseller products with stock:", error);
//     handleControllerError(error, res);
//   }
// };



import mongoose from "mongoose";
import ResellerStock from "../models/ResellerStock.js";
import Reseller from "../models/Reseller.js";
import Product from "../models/Product.js";
import Center from "../models/Center.js";
import ProductCategory from "../models/ProductCategory.js";

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

const buildArrayFilter = (value) => {
  if (!value) return null;

  const values = value.includes(",") 
    ? value.split(",").map(item => item.trim())
    : [value];
  
  const objectIds = values.map(item => {
    if (mongoose.Types.ObjectId.isValid(item)) {
      return new mongoose.Types.ObjectId(item);
    }
    return item;
  });
  
  return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
};

const getCategoryId = async (categoryParam) => {
  if (mongoose.Types.ObjectId.isValid(categoryParam)) {
    return new mongoose.Types.ObjectId(categoryParam);
  }
  
  const category = await ProductCategory.findOne({
    $or: [
      { productCategory: { $regex: new RegExp(`^${categoryParam}$`, "i") } },
      { categoryCode: { $regex: new RegExp(`^${categoryParam}$`, "i") } }
    ]
  }).select("_id");
  
  return category ? category._id : null;
};

const checkResellerStockPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  
  const availableStockModule = userPermissions.find(
    (perm) => perm.module === "Available Stock"
  );

  if (!availableStockModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    available_stock_own_center: availableStockModule.permissions.includes(
      "available_stock_own_center"
    ),
    available_stock_all_center: availableStockModule.permissions.includes(
      "available_stock_all_center"
    ),
  };

  const hasRequiredPermission = requiredPermissions.some(
    (perm) => permissions[perm]
  );

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: req.user.center,
  };
};

const getResellerFromCenter = async (centerId) => {
  if (!centerId) return null;
  
  try {
    const center = await Center.findById(centerId).select("reseller").lean();
    return center ? center.reseller : null;
  } catch (error) {
    console.error("Error getting reseller from center:", error);
    return null;
  }
};

const buildResellerStockFilter = async (query, permissions, userCenter) => {
  const {
    resellerId,
    reseller,
    product,
    centerId,
    center,
    showCenterReturnsOnly,
    sourceCenter,
    forCenter,
  } = query;

  const filter = {};

  // Handle user permissions and center context
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    const resellerIdFromCenter = await getResellerFromCenter(userCenter._id || userCenter);
    
    if (resellerIdFromCenter) {
      filter.reseller = new mongoose.Types.ObjectId(resellerIdFromCenter);
    } else {
      return { noAccess: true };
    }
  }

  // Handle explicit reseller filter
  if (resellerId || reseller) {
    const resellerFilterValue = resellerId || reseller;
    const resellerFilter = buildArrayFilter(resellerFilterValue);
    if (resellerFilter) filter.reseller = resellerFilter;
  }
  
  // Handle explicit center filter
  if (centerId || center || forCenter) {
    const centerFilterValue = forCenter || centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    
    if (centerFilter) {
      const targetCenterId = typeof centerFilter === 'object' ? centerFilter.$in?.[0] : centerFilter;
      const resellerIdFromCenter = await getResellerFromCenter(targetCenterId);
      
      if (resellerIdFromCenter) {
        filter.reseller = new mongoose.Types.ObjectId(resellerIdFromCenter);
      }
    }
  }

  // Product filter
  const productFilter = buildArrayFilter(product);
  if (productFilter) filter.product = productFilter;

  return filter;
};


export const getResellerAvailableStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkResellerStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      resellerId,
      reseller,
      product,
      search,
      sortBy = "productName",
      sortOrder = "asc",
      includeSerials = false,
      lowStockThreshold = 10,
      includeSourceBreakdown = false,
      centerId,
      center,
      forCenter,
      showCenterReturnsOnly = false,
      sourceCenter,
      ...filterParams
    } = req.query;

    // Build filter for reseller stock
    const filter = await buildResellerStockFilter(
      { 
        resellerId, 
        reseller, 
        product, 
        search, 
        lowStockThreshold,
        centerId,
        center,
        forCenter,
        showCenterReturnsOnly,
        sourceCenter,
        ...filterParams 
      },
      permissions,
      userCenter
    );

    // Check if user has no access (center without reseller)
    if (filter.noAccess) {
      const centerInfo = userCenter ? await Center.findById(userCenter._id || userCenter)
        .select("centerName centerCode centerType")
        .lean() : null;

      return res.status(200).json({
        success: true,
        message: "No reseller stock data available for your center",
        data: {
          stock: [],
          summary: {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalRepair: 0,
            totalDamageRepairSource: 0,
            totalCenterReturnSource: 0,
            totalEffectiveAvailable: 0,
            totalTargetCenterReturns: 0,
            totalAllCenterReturns: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
            inStockItems: 0,
          },
          reseller: null,
          center: centerInfo,
          filters: {
            reseller: "user_center_reseller",
            product: product || "all",
            search: search || "",
            lowStockThreshold: parseInt(lowStockThreshold),
            center: centerInfo ? centerInfo._id : null,
            showCenterReturnsOnly: showCenterReturnsOnly === "true",
            sourceCenter: sourceCenter || null,
            forCenter: forCenter || null,
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit),
            hasNext: false,
            hasPrev: false,
          },
          permissions: {
            canViewAllCenters: permissions.available_stock_all_center,
            canViewOwnCenter: permissions.available_stock_own_center,
          },
        },
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // SIMPLIFIED AGGREGATION PIPELINE
    const aggregationPipeline = [
      { $match: filter },
      
      // Lookup reseller details
      {
        $lookup: {
          from: "resellers",
          localField: "reseller",
          foreignField: "_id",
          as: "resellerDetails",
        },
      },
      {
        $unwind: {
          path: "$resellerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      
      // Lookup product details
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      
      // Lookup product category details
      {
        $lookup: {
          from: "productcategories",
          localField: "productDetails.productCategory",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      
      // Calculate if product tracks serial numbers
      {
        $addFields: {
          tracksSerial: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
              then: true,
              else: false
            }
          }
        }
      },
      
      // Calculate basic serial counts
      {
        $addFields: {
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] },
              },
            },
          },
          consumedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "consumed"] },
              },
            },
          },
          damagedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
          underRepairSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "under_repair"] },
              },
            },
          },
          repairedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "repaired"] },
              },
            },
          },
          irreparableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "irreparable"] },
              },
            },
          },
          
          // Get all center return serials
          centerReturnSerials: {
            $filter: {
              input: "$serialNumbers",
              as: "serial",
              cond: {
                $anyElementTrue: {
                  $map: {
                    input: "$$serial.transferHistory",
                    as: "transfer",
                    in: {
                      $eq: ["$$transfer.transferType", "center_to_reseller_return"]
                    }
                  }
                }
              }
            }
          }
        }
      },
      
      // Calculate center return serials count
      {
        $addFields: {
          centerReturnSerialsCount: {
            $size: "$centerReturnSerials"
          }
        }
      },
      
      // Calculate effective available quantity
      {
        $addFields: {
          effectiveAvailableQuantity: {
            $cond: {
              if: "$tracksSerial",
              then: "$availableSerialsCount",
              else: {
                $max: [
                  0,
                  {
                    $subtract: [
                      "$availableQuantity",
                      {
                        $add: [
                          "$damagedQuantity",
                          "$repairQuantity"
                        ]
                      }
                    ]
                  }
                ]
              },
            },
          },
        },
      },
      
      // Calculate stock status
      {
        $addFields: {
          stockStatus: {
            $cond: {
              if: {
                $lt: [
                  {
                    $cond: {
                      if: "$tracksSerial",
                      then: "$availableSerialsCount",
                      else: "$effectiveAvailableQuantity",
                    },
                  },
                  parseInt(lowStockThreshold),
                ],
              },
              then: "low_stock",
              else: {
                $cond: {
                  if: {
                    $eq: [
                      {
                        $cond: {
                          if: "$tracksSerial",
                          then: "$availableSerialsCount",
                          else: "$effectiveAvailableQuantity",
                        },
                      },
                      0,
                    ],
                  },
                  then: "out_of_stock",
                  else: "in_stock",
                },
              },
            },
          },
        },
      }
    ];

    // Add search filter if search exists
    if (search) {
      aggregationPipeline.unshift({
        $match: {
          $or: [
            { "productDetails.productTitle": { $regex: search, $options: "i" } },
            { "productDetails.productCode": { $regex: search, $options: "i" } },
            { "resellerDetails.businessName": { $regex: search, $options: "i" } },
            { "resellerDetails.code": { $regex: search, $options: "i" } },
            { "resellerDetails.contactPerson": { $regex: search, $options: "i" } },
            { "categoryDetails.productCategory": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Projection stage
    aggregationPipeline.push({
      $project: {
        _id: 1,
        reseller: 1,
        product: 1,
        totalQuantity: 1,
        availableQuantity: 1,
        consumedQuantity: 1,
        damagedQuantity: 1,
        repairQuantity: 1,
        sourceBreakdown: 1,
        centerReturns: 1,
        lastUpdated: 1,
        createdAt: 1,
        updatedAt: 1,
        
        // Product Details
        productName: "$productDetails.productTitle",
        productCode: "$productDetails.productCode",
        productDescription: "$productDetails.description",
        productPrice: "$productDetails.productPrice",
        productImage: "$productDetails.productImage",
        trackSerialNumber: "$productDetails.trackSerialNumber",
        
        // Category Details
        productCategory: {
          _id: "$categoryDetails._id",
          name: "$categoryDetails.productCategory",
          code: "$categoryDetails.categoryCode",
          description: "$categoryDetails.description",
        },
        
        // Reseller Details
        resellerName: "$resellerDetails.businessName",
        resellerCode: "$resellerDetails.code",
        resellerContactPerson: "$resellerDetails.contactPerson",
        resellerContactNumber: "$resellerDetails.mobile",
        resellerEmail: "$resellerDetails.email",
        resellerAddress: "$resellerDetails.address",
        resellerStatus: "$resellerDetails.status",
        
        // Serial counts
        availableSerialsCount: 1,
        consumedSerialsCount: 1,
        damagedSerialsCount: 1,
        underRepairSerialsCount: 1,
        repairedSerialsCount: 1,
        irreparableSerialsCount: 1,
        
        // Center return tracking
        centerReturnSerials: 1,
        centerReturnSerialsCount: 1,
        
        // Calculated fields
        effectiveAvailableQuantity: 1,
        stockStatus: 1,
        tracksSerial: 1,
        
        // Include serial numbers if requested
        serialNumbers: includeSerials === "true" ? "$serialNumbers" : undefined,
      }
    });

    // Create count pipeline
    const countPipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      { $count: "total" }
    ];

    // Add sorting
    const sortConfig = {};
    const validSortFields = [
      "productName", "productCode", "resellerName", "resellerCode", 
      "effectiveAvailableQuantity", "stockStatus", "lastUpdated",
      "centerReturnSerialsCount", "totalQuantity", "availableQuantity"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    sortConfig[actualSortBy] = sortOrder === "desc" ? -1 : 1;
    
    aggregationPipeline.push({ $sort: sortConfig });

    // Add pagination
    aggregationPipeline.push(
      { $skip: skip },
      { $limit: limitNum }
    );

    // Get stock data and count
    const [stockData, countResult] = await Promise.all([
      ResellerStock.aggregate(aggregationPipeline),
      ResellerStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // Process stock data to combine serialized and non-serialized center returns
    const stockWithCenterDetails = await Promise.all(
      stockData.map(async (item) => {
        // Combine ALL center returns: from serialized AND non-serialized
        const allCenterReturnsMap = new Map();
        
        // 1. Process serialized center returns (from serialNumbers)
        if (item.centerReturnSerials && item.centerReturnSerials.length > 0) {
          item.centerReturnSerials.forEach(serial => {
            if (serial.transferHistory) {
              serial.transferHistory.forEach(transfer => {
                if (transfer.transferType === "center_to_reseller_return" && transfer.fromCenter) {
                  const centerId = transfer.fromCenter.toString();
                  
                  if (!allCenterReturnsMap.has(centerId)) {
                    allCenterReturnsMap.set(centerId, {
                      centerId: centerId,
                      serializedReturns: 0,
                      nonSerializedReturns: 0,
                      availableCount: 0,
                      consumedCount: 0,
                      damagedCount: 0,
                      underRepairCount: 0,
                      repairedCount: 0,
                      irreparableCount: 0,
                      serialNumbers: [],
                    });
                  }
                  
                  const centerData = allCenterReturnsMap.get(centerId);
                  centerData.serializedReturns += 1;
                  
                  // Count by status
                  if (serial.status === "available") centerData.availableCount += 1;
                  if (serial.status === "consumed") centerData.consumedCount += 1;
                  if (serial.status === "damaged") centerData.damagedCount += 1;
                  if (serial.status === "under_repair") centerData.underRepairCount += 1;
                  if (serial.status === "repaired") centerData.repairedCount += 1;
                  if (serial.status === "irreparable") centerData.irreparableCount += 1;
                  
                  if (serial.serialNumber) {
                    centerData.serialNumbers.push(serial.serialNumber);
                  }
                }
              });
            }
          });
        }
        
        // 2. Process non-serialized center returns (from centerReturns array)
        // IMPORTANT FIX: Check if product is non-serialized AND has centerReturns
        if (!item.tracksSerial && item.centerReturns && item.centerReturns.length > 0) {
          // For non-serialized products, use centerReturns array
          item.centerReturns.forEach(centerReturn => {
            const centerId = centerReturn.center?.toString();
            if (centerId) {
              if (!allCenterReturnsMap.has(centerId)) {
                allCenterReturnsMap.set(centerId, {
                  centerId: centerId,
                  serializedReturns: 0,
                  nonSerializedReturns: 0,
                  availableCount: 0,
                  consumedCount: 0,
                  damagedCount: 0,
                  underRepairCount: 0,
                  repairedCount: 0,
                  irreparableCount: 0,
                  serialNumbers: [],
                });
              }
              
              const centerData = allCenterReturnsMap.get(centerId);
              centerData.nonSerializedReturns += centerReturn.quantity || 0;
              
              // For non-serialized, we assume all are available unless otherwise tracked
              centerData.availableCount += centerReturn.quantity || 0;
            }
          });
        } else if (item.tracksSerial && item.centerReturns && item.centerReturns.length > 0) {
          // FIX FOR DOUBLE-COUNTING ISSUE:
          // For serialized products, we should ONLY use serialized returns
          // The centerReturns array might contain duplicate data, so we ignore it
          console.log(`Product "${item.productName}" is serialized - using serialized returns only (${item.centerReturnSerialsCount || 0} items)`);
        }
        
        // Get center details for all unique centers
        let centerReturnsData = [];
        if (allCenterReturnsMap.size > 0) {
          const centerIds = Array.from(allCenterReturnsMap.keys())
            .filter(id => id !== "unknown" && mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
          
          let centerDetails = [];
          if (centerIds.length > 0) {
            centerDetails = await Center.find({
              _id: { $in: centerIds }
            }).select("centerName centerCode centerType address").lean();
          }
          
          // Create combined center returns array
          centerReturnsData = Array.from(allCenterReturnsMap.entries()).map(([centerId, data]) => {
            let centerName = "Unknown Center";
            let centerCode = "N/A";
            let centerType = "Unknown";
            
            if (centerId !== "unknown" && mongoose.Types.ObjectId.isValid(centerId)) {
              const centerDetail = centerDetails.find(c => c._id.toString() === centerId);
              if (centerDetail) {
                centerName = centerDetail.centerName;
                centerCode = centerDetail.centerCode;
                centerType = centerDetail.centerType;
              }
            }
            
            return {
              centerId: centerId,
              centerName: centerName,
              centerCode: centerCode,
              centerType: centerType,
              serializedReturns: data.serializedReturns,
              nonSerializedReturns: data.nonSerializedReturns,
              totalReturns: data.serializedReturns + data.nonSerializedReturns,
              availableCount: data.availableCount,
              consumedCount: data.consumedCount,
              damagedCount: data.damagedCount,
              underRepairCount: data.underRepairCount,
              repairedCount: data.repairedCount,
              irreparableCount: data.irreparableCount,
              serialNumbers: data.serialNumbers,
              isSerialized: data.serializedReturns > 0,
              isNonSerialized: data.nonSerializedReturns > 0,
            };
          });
        }
        
        // Filter by sourceCenter if specified
        let filteredCenterReturns = centerReturnsData;
        if (sourceCenter) {
          filteredCenterReturns = filteredCenterReturns.filter(
            cr => cr.centerId === sourceCenter
          );
        }
        
        // Calculate center-specific totals
        const totalCenterReturns = filteredCenterReturns.reduce((sum, cr) => 
          sum + cr.totalReturns, 0);
        
        const totalCenterAvailable = filteredCenterReturns.reduce((sum, cr) => 
          sum + cr.availableCount, 0);
        
        const totalCenterConsumed = filteredCenterReturns.reduce((sum, cr) => 
          sum + cr.consumedCount, 0);
        
        // Calculate what quantity to display based on filter
        let displayQuantity = item.availableQuantity;
        let displayConsumed = item.consumedQuantity;
        
        if (sourceCenter) {
          // When filtering by center, show only returns from that center
          displayQuantity = totalCenterAvailable;
          displayConsumed = totalCenterConsumed;
        } else if (showCenterReturnsOnly === "true") {
          // When showing only center returns, show all center returns
          displayQuantity = totalCenterAvailable;
          displayConsumed = totalCenterConsumed;
        }
        
        // Calculate stock status for filtered view
        let displayStockStatus = item.stockStatus;
        if (sourceCenter || showCenterReturnsOnly === "true") {
          if (displayQuantity === 0) {
            displayStockStatus = "out_of_stock";
          } else if (displayQuantity < parseInt(lowStockThreshold)) {
            displayStockStatus = "low_stock";
          } else {
            displayStockStatus = "in_stock";
          }
        }
        
        return {
          ...item,
          centerReturns: filteredCenterReturns,
          totalCenterReturns: totalCenterReturns,
          totalCenterAvailable: totalCenterAvailable,
          totalCenterConsumed: totalCenterConsumed,
          
          // Display fields
          displayQuantity: displayQuantity,
          displayConsumed: displayConsumed,
          displayStockStatus: displayStockStatus,
          
          // Original quantities for reference
          originalTotalQuantity: item.totalQuantity,
          originalAvailableQuantity: item.availableQuantity,
          originalConsumedQuantity: item.consumedQuantity,
          originalStockStatus: item.stockStatus,
        };
      })
    );

    // Get reseller info
    let resellerInfo = null;
    if (filter.reseller) {
      const resellerIdValue = typeof filter.reseller === 'object' && filter.reseller.$in 
        ? filter.reseller.$in[0] 
        : filter.reseller;
      
      try {
        resellerInfo = await Reseller.findById(resellerIdValue).select(
          "name businessName code contactPerson mobile email address status"
        );
      } catch (error) {
        console.error("Error fetching reseller info:", error);
      }
    }

    // Get source center info if specified
    let sourceCenterInfo = null;
    if (sourceCenter && mongoose.Types.ObjectId.isValid(sourceCenter)) {
      try {
        sourceCenterInfo = await Center.findById(sourceCenter).select(
          "centerName centerCode centerType"
        );
      } catch (error) {
        console.error("Error fetching source center info:", error);
      }
    }

    // Calculate summary - FIXED to avoid double counting
    const summary = {
      totalProducts: total,
      totalQuantity: stockWithCenterDetails.reduce((sum, item) => 
        sum + (sourceCenter ? item.totalCenterAvailable : item.availableQuantity || 0), 0),
      totalAvailable: stockWithCenterDetails.reduce((sum, item) => 
        sum + (sourceCenter ? item.totalCenterAvailable : item.availableQuantity || 0), 0),
      totalConsumed: stockWithCenterDetails.reduce((sum, item) => 
        sum + (sourceCenter ? item.totalCenterConsumed : item.consumedQuantity || 0), 0),
      totalDamaged: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.damagedQuantity || 0), 0),
      totalRepair: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.repairQuantity || 0), 0),
      totalEffectiveAvailable: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.effectiveAvailableQuantity || 0), 0),
      totalCenterReturns: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.totalCenterReturns || 0), 0),
      totalSerializedCenterReturns: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.centerReturnSerialsCount || 0), 0),
      totalNonSerializedCenterReturns: stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.centerReturns?.reduce((s, cr) => s + cr.nonSerializedReturns, 0) || 0), 0),
      lowStockItems: stockWithCenterDetails.filter(item => 
        item.displayStockStatus === "low_stock"
      ).length,
      outOfStockItems: stockWithCenterDetails.filter(item => 
        item.displayStockStatus === "out_of_stock"
      ).length,
      inStockItems: stockWithCenterDetails.filter(item => 
        item.displayStockStatus === "in_stock"
      ).length,
    };

    // Add source breakdown summary if requested
    if (includeSourceBreakdown === "true") {
      summary.totalDamageRepairSource = stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.sourceBreakdown?.damageRepairQuantity || 0), 0);
      summary.totalCenterReturnSource = stockWithCenterDetails.reduce((sum, item) => 
        sum + (item.sourceBreakdown?.centerReturnQuantity || 0), 0);
    }

    // Build filters object for response
    const filters = {
      reseller: filter.reseller || "all",
      product: product || "all",
      search: search || "",
      lowStockThreshold: parseInt(lowStockThreshold),
      includeSerials: includeSerials === "true",
      includeSourceBreakdown: includeSourceBreakdown === "true",
      showCenterReturnsOnly: showCenterReturnsOnly === "true",
      sourceCenter: sourceCenter || null,
      forCenter: forCenter || null,
      filterType: sourceCenter ? "center_specific" : "all_stock"
    };

    res.status(200).json({
      success: true,
      message: sourceCenter 
        ? "Reseller stock data filtered by source center retrieved successfully"
        : "Reseller stock data retrieved successfully",
      data: {
        stock: stockWithCenterDetails,
        summary: summary,
        reseller: resellerInfo,
        sourceCenter: sourceCenterInfo,
        filters: filters,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          itemsPerPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
          accessType: permissions.available_stock_all_center 
            ? "all_centers" 
            : permissions.available_stock_own_center 
              ? "own_center_reseller" 
              : "none",
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving reseller stock:", error);
    handleControllerError(error, res);
  }
};
export const getResellerProductsWithStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkResellerStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      resellerId,
      reseller,
      product,
      search,
      category,
      sortBy = "productName",
      sortOrder = "asc",
      centerId,
      center,
      forCenter,
      ...filterParams
    } = req.query;

    let targetResellerId = null;
    let targetCenterId = null;
    let targetCenter = null;

    if (permissions.available_stock_own_center && !permissions.available_stock_all_center) {
      if (userCenter) {
        targetCenterId = userCenter._id || userCenter;
        const centerData = await Center.findById(targetCenterId)
          .select("reseller centerName centerCode")
          .lean();
        
        if (centerData) {
          targetCenter = {
            _id: centerData._id,
            centerName: centerData.centerName,
            centerCode: centerData.centerCode,
          };
          
          if (centerData.reseller) {
            targetResellerId = centerData.reseller;
          } else {
            // If center has no reseller, return empty response
            return res.status(200).json({
              success: true,
              message: "Your center is not associated with any reseller",
              data: {
                stock: [],
                summary: {
                  totalProducts: 0,
                  totalQuantity: 0,
                  totalAvailable: 0,
                  totalConsumed: 0,
                  totalDamaged: 0,
                  totalRepair: 0,
                  totalEffectiveAvailable: 0,
                  totalDamageRepairSource: 0,
                  totalCenterReturnSource: 0,
                  lowStockItems: 0,
                  outOfStockItems: 0,
                  inStockItems: 0,
                },
                reseller: null,
                center: targetCenter,
                filters: {
                  center: targetCenterId,
                  product: product || "all",
                  search: search || "",
                  category: category || "all",
                  forCenter: forCenter || null,
                },
                pagination: {
                  currentPage: parseInt(page),
                  totalPages: 0,
                  totalItems: 0,
                  itemsPerPage: parseInt(limit),
                  hasNext: false,
                  hasPrev: false,
                },
                permissions: {
                  canViewAllCenters: false,
                  canViewOwnCenter: true,
                },
              },
            });
          }
        }
      }
    } 
    // If user has access to all centers, they can specify which reseller/center
    else if (permissions.available_stock_all_center) {
      if (resellerId || reseller) {
        const resellerFilterValue = resellerId || reseller;
        const resellerFilter = buildArrayFilter(resellerFilterValue);
        if (resellerFilter) {
          targetResellerId = typeof resellerFilter === 'object' 
            ? resellerFilter.$in[0] 
            : resellerFilter;
        }
      } else if (centerId || center || forCenter) {
        const centerFilterValue = forCenter || centerId || center;
        const centerFilter = buildArrayFilter(centerFilterValue);
        if (centerFilter) {
          targetCenterId = typeof centerFilter === 'object' 
            ? centerFilter.$in[0] 
            : centerFilter;
          
          const centerData = await Center.findById(targetCenterId)
            .select("reseller centerName centerCode")
            .lean();
          
          if (centerData) {
            targetCenter = {
              _id: centerData._id,
              centerName: centerData.centerName,
              centerCode: centerData.centerCode,
            };
            
            if (centerData.reseller) {
              targetResellerId = centerData.reseller;
            }
          }
        }
      }
    }

    if (!targetResellerId) {
      return res.status(400).json({
        success: false,
        message: "Reseller not specified or not found for the given center",
      });
    }

    // Get reseller details
    const targetReseller = await Reseller.findById(targetResellerId).select(
      "_id name code contactPerson mobile email address"
    );

    if (!targetReseller) {
      return res.status(404).json({
        success: false,
        message: "Reseller not found",
      });
    }

    // Build product filter
    const productFilter = {};
    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "productCategory.productCategory": { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      const categoryId = await getCategoryId(category);
      if (categoryId) {
        productFilter.productCategory = categoryId;
      }
    }

    if (product) {
      const productFilterObj = buildArrayFilter(product);
      if (productFilterObj) {
        productFilter._id = productFilterObj;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get products
    const [products, totalProducts] = await Promise.all([
      Product.find(productFilter)
        .populate("productCategory", "productCategory categoryCode")
        .select(
          "productTitle productCode description productCategory productPrice trackSerialNumber productImage"
        )
        .sort({ productTitle: 1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),

      Product.countDocuments(productFilter),
    ]);

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No products found",
        data: {
          stock: [],
          summary: {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalRepair: 0,
            totalEffectiveAvailable: 0,
            totalDamageRepairSource: 0,
            totalCenterReturnSource: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
            inStockItems: 0,
          },
          reseller: targetReseller,
          center: targetCenter,
          filters: {
            reseller: targetResellerId,
            center: targetCenterId || "user_center",
            product: product || "all",
            search: search || "",
            category: category || "all",
            forCenter: forCenter || null,
          },
          pagination: {
            currentPage: pageNum,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limitNum,
            hasNext: false,
            hasPrev: false,
          },
          permissions: {
            canViewAllCenters: permissions.available_stock_all_center,
            canViewOwnCenter: permissions.available_stock_own_center,
          },
        },
      });
    }

    const productIds = products.map((product) => product._id);

    // Get reseller stock for these products
    const resellerStockData = await ResellerStock.aggregate([
      {
        $match: {
          reseller: new mongoose.Types.ObjectId(targetResellerId),
          product: { $in: productIds },
        },
      },
      {
        $addFields: {
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] },
              },
            },
          },
          damagedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
          underRepairSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "under_repair"] },
              },
            },
          },
          repairedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "repaired"] },
              },
            },
          },
          irreparableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "irreparable"] },
              },
            },
          },
          // Center return counts
          centerReturnSerials: {
            $filter: {
              input: "$serialNumbers",
              as: "serial",
              cond: {
                $anyElementTrue: {
                  $map: {
                    input: "$$serial.transferHistory",
                    as: "transfer",
                    in: {
                      $eq: ["$$transfer.transferType", "center_to_reseller_return"]
                    }
                  }
                }
              }
            }
          }
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$product",
          totalQuantity: { $sum: "$totalQuantity" },
          availableQuantity: { $sum: "$availableQuantity" },
          consumedQuantity: { $sum: "$consumedQuantity" },
          damagedQuantity: { $sum: "$damagedQuantity" },
          repairQuantity: { $sum: "$repairQuantity" },
          availableSerialsCount: { $sum: "$availableSerialsCount" },
          damagedSerialsCount: { $sum: "$damagedSerialsCount" },
          underRepairSerialsCount: { $sum: "$underRepairSerialsCount" },
          repairedSerialsCount: { $sum: "$repairedSerialsCount" },
          irreparableSerialsCount: { $sum: "$irreparableSerialsCount" },
          centerReturnSerialsCount: { 
            $sum: { $size: "$centerReturnSerials" }
          },
          stockEntries: { $sum: 1 },
          trackSerialNumber: { $first: "$productDetails.trackSerialNumber" },
          sourceBreakdown: { 
            $first: {
              $ifNull: ["$sourceBreakdown", {
                damageRepairQuantity: 0,
                centerReturnQuantity: 0
              }]
            }
          },
        },
      },
      {
        $project: {
          totalQuantity: 1,
          availableQuantity: 1,
          consumedQuantity: 1,
          damagedQuantity: 1,
          repairQuantity: 1,
          availableSerialsCount: 1,
          damagedSerialsCount: 1,
          underRepairSerialsCount: 1,
          repairedSerialsCount: 1,
          irreparableSerialsCount: 1,
          centerReturnSerialsCount: 1,
          stockEntries: 1,
          trackSerialNumber: 1,
          sourceBreakdown: 1,
          effectiveAvailableQuantity: {
            $cond: {
              if: { $eq: ["$trackSerialNumber", "Yes"] },
              then: "$availableSerialsCount",
              else: {
                $max: [
                  0,
                  {
                    $subtract: [
                      "$availableQuantity",
                      {
                        $add: [
                          "$damagedQuantity",
                          "$repairQuantity"
                        ]
                      }
                    ]
                  }
                ]
              },
            },
          },
        },
      },
    ]);

    const stockMap = new Map();
    resellerStockData.forEach((item) => {
      stockMap.set(item._id.toString(), {
        totalQuantity: item.totalQuantity,
        availableQuantity: item.availableQuantity,
        consumedQuantity: item.consumedQuantity,
        damagedQuantity: item.damagedQuantity,
        repairQuantity: item.repairQuantity,
        availableSerialsCount: item.availableSerialsCount,
        damagedSerialsCount: item.damagedSerialsCount,
        underRepairSerialsCount: item.underRepairSerialsCount,
        repairedSerialsCount: item.repairedSerialsCount,
        irreparableSerialsCount: item.irreparableSerialsCount,
        centerReturnSerialsCount: item.centerReturnSerialsCount,
        stockEntries: item.stockEntries,
        effectiveAvailableQuantity: item.effectiveAvailableQuantity,
        sourceBreakdown: item.sourceBreakdown,
      });
    });

    // Format the response
    const formattedProducts = products.map((product) => {
      const productId = product._id.toString();
      const stockData = stockMap.get(productId) || {
        totalQuantity: 0,
        availableQuantity: 0,
        consumedQuantity: 0,
        damagedQuantity: 0,
        repairQuantity: 0,
        availableSerialsCount: 0,
        damagedSerialsCount: 0,
        underRepairSerialsCount: 0,
        repairedSerialsCount: 0,
        irreparableSerialsCount: 0,
        centerReturnSerialsCount: 0,
        stockEntries: 0,
        effectiveAvailableQuantity: 0,
        sourceBreakdown: {
          damageRepairQuantity: 0,
          centerReturnQuantity: 0
        },
      };

      const productCategory = product.productCategory
        ? {
            _id: product.productCategory._id,
            name: product.productCategory.productCategory,
            code: product.productCategory.categoryCode,
          }
        : null;

      const stockStatus =
        stockData.effectiveAvailableQuantity === 0
          ? "out_of_stock"
          : stockData.effectiveAvailableQuantity < 10
          ? "low_stock"
          : "in_stock";

      return {
        _id: product._id,
        product: product._id,
        productName: product.productTitle,
        productCode: product.productCode,
        productDescription: product.description,
        productPrice: product.productPrice,
        productImage: product.productImage,
        productCategory: productCategory,
        trackSerialNumber: product.trackSerialNumber,
        reseller: targetResellerId,
        resellerName: targetReseller.name,
        resellerCode: targetReseller.code,
        resellerContactPerson: targetReseller.contactPerson,
        resellerContactNumber: targetReseller.mobile,
        resellerEmail: targetReseller.email,
        
        // Stock information
        totalQuantity: stockData.totalQuantity,
        availableQuantity: stockData.availableQuantity,
        consumedQuantity: stockData.consumedQuantity,
        damagedQuantity: stockData.damagedQuantity,
        repairQuantity: stockData.repairQuantity,
        
        // Serial counts
        availableSerialsCount: stockData.availableSerialsCount,
        consumedSerialsCount: stockData.consumedQuantity,
        damagedSerialsCount: stockData.damagedSerialsCount,
        underRepairSerialsCount: stockData.underRepairSerialsCount,
        repairedSerialsCount: stockData.repairedSerialsCount,
        irreparableSerialsCount: stockData.irreparableSerialsCount,
        centerReturnSerialsCount: stockData.centerReturnSerialsCount,
        
        // Source breakdown
        sourceBreakdown: stockData.sourceBreakdown,
        
        // Calculated fields
        effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
        stockStatus: stockStatus,
        lastUpdated: new Date().toISOString(),
      };
    });

    // Sort the results
    const validSortFields = [
      "productName", "productCode", "effectiveAvailableQuantity", 
      "stockStatus", "totalQuantity", "availableQuantity",
      "centerReturnSerialsCount"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    
    formattedProducts.sort((a, b) => {
      const aValue = a[actualSortBy];
      const bValue = b[actualSortBy];
      const multiplier = sortOrder === "desc" ? -1 : 1;
      
      if (aValue < bValue) return -1 * multiplier;
      if (aValue > bValue) return 1 * multiplier;
      return 0;
    });

    // Calculate summary
    const summary = {
      totalProducts: formattedProducts.length,
      totalQuantity: formattedProducts.reduce(
        (sum, product) => sum + product.totalQuantity,
        0
      ),
      totalAvailable: formattedProducts.reduce(
        (sum, product) => sum + product.availableQuantity,
        0
      ),
      totalConsumed: formattedProducts.reduce(
        (sum, product) => sum + product.consumedQuantity,
        0
      ),
      totalDamaged: formattedProducts.reduce(
        (sum, product) => sum + product.damagedQuantity,
        0
      ),
      totalRepair: formattedProducts.reduce(
        (sum, product) => sum + product.repairQuantity,
        0
      ),
      totalEffectiveAvailable: formattedProducts.reduce(
        (sum, product) => sum + product.effectiveAvailableQuantity,
        0
      ),
      totalCenterReturnBySerial: formattedProducts.reduce(
        (sum, product) => sum + product.centerReturnSerialsCount,
        0
      ),
      totalDamageRepairSource: formattedProducts.reduce(
        (sum, product) => sum + product.sourceBreakdown.damageRepairQuantity,
        0
      ),
      totalCenterReturnSource: formattedProducts.reduce(
        (sum, product) => sum + product.sourceBreakdown.centerReturnQuantity,
        0
      ),
      lowStockItems: formattedProducts.filter(
        (product) => product.stockStatus === "low_stock"
      ).length,
      outOfStockItems: formattedProducts.filter(
        (product) => product.stockStatus === "out_of_stock"
      ).length,
      inStockItems: formattedProducts.filter(
        (product) => product.stockStatus === "in_stock"
      ).length,
    };

    res.status(200).json({
      success: true,
      message: "Reseller products with stock information retrieved successfully",
      data: {
        stock: formattedProducts,
        summary: summary,
        reseller: targetReseller,
        center: targetCenter,
        filters: {
          reseller: targetResellerId,
          center: targetCenterId || "user_center",
          product: product || "all",
          search: search || "",
          category: category || "all",
          forCenter: forCenter || null,
        },
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalProducts / limitNum),
          totalItems: totalProducts,
          itemsPerPage: limitNum,
          hasNext: pageNum < Math.ceil(totalProducts / limitNum),
          hasPrev: pageNum > 1,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
          accessType: permissions.available_stock_all_center 
            ? "all_centers" 
            : "own_center_reseller",
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving reseller products with stock:", error);
    handleControllerError(error, res);
  }
};