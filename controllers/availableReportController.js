import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import StockUsage from "../models/StockUsage.js";
import OutletStock from "../models/OutletStock.js";
import StockPurchase from "../models/StockPurchase.js";
import mongoose from "mongoose";

const checkAvailableStockPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  console.log(userPermissions);
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

const checkStockCenterAccess = async (userId, targetCenterId, permissions) => {
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

  if (permissions.available_stock_all_center) {
    return targetCenterId || user.center._id;
  }

  if (permissions.available_stock_own_center) {
    const userCenterId = user.center._id || user.center;

    if (
      targetCenterId &&
      targetCenterId.toString() !== userCenterId.toString()
    ) {
      throw new Error(
        "Access denied. You can only access your own center's stock data."
      );
    }

    return userCenterId;
  }

  throw new Error("Insufficient permissions to access stock data");
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



// export const getCenterAllStock = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } =
//       checkAvailableStockPermissions(req, [
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
//       limit = 10,
//       centerId,
//       product,
//       search,
//       sortBy = "productName",
//       sortOrder = "asc",
//       includeSerials = false,
//       lowStockThreshold = 10,
//     } = req.query;

//     let filter = {};

//     if (
//       permissions.available_stock_own_center &&
//       !permissions.available_stock_all_center &&
//       userCenter
//     ) {
//       filter.center = userCenter._id || userCenter;
//     } else if (centerId) {
//       filter.center = centerId;
//     }

//     if (product) {
//       filter.product = product;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const aggregationPipeline = [
//       { $match: filter },
//       {
//         $lookup: {
//           from: "products",
//           localField: "product",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },
//       {
//         $lookup: {
//           from: "centers",
//           localField: "center",
//           foreignField: "_id",
//           as: "centerDetails",
//         },
//       },
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
//           path: "$productDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       {
//         $unwind: {
//           path: "$centerDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       {
//         $unwind: {
//           path: "$categoryDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $addFields: {
//           damagedQuantity: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "damaged"] },
//               },
//             },
//           },
//           availableSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "available"] },
//               },
//             },
//           },
//           consumedSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "consumed"] },
//               },
//             },
//           },
//           inTransitSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "in_transit"] },
//               },
//             },
//           },
//           transferredSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "transferred"] },
//               },
//             },
//           },
//         },
//       },
//       {
//         $project: {
//           center: 1,
//           product: 1,
//           totalQuantity: 1,
//           availableQuantity: 1,
//           inTransitQuantity: 1,
//           consumedQuantity: 1,
//           lastUpdated: 1,
//           productName: "$productDetails.productTitle",
//           productCode: "$productDetails.productCode",
//           productCategory: {
//             _id: "$categoryDetails._id",
//             name: "$categoryDetails.productCategory",
//           },
//           trackSerialNumber: "$productDetails.trackSerialNumber",
//           centerName: "$centerDetails.centerName",
//           centerCode: "$centerDetails.centerCode",
//           centerType: "$centerDetails.centerType",
//           serialNumbers: includeSerials === "true" ? "$serialNumbers" : [],
//           damagedQuantity: 1,
//           availableSerialsCount: 1,
//           consumedSerialsCount: 1,
//           inTransitSerialsCount: 1,
//           transferredSerialsCount: 1,

//           effectiveAvailableQuantity: {
//             $cond: {
//               if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//               then: "$availableSerialsCount",
//               else: {
//                 $max: [
//                   0,
//                   { $subtract: ["$availableQuantity", "$damagedQuantity"] },
//                 ],
//               },
//             },
//           },
//           stockStatus: {
//             $cond: {
//               if: {
//                 $lt: [
//                   {
//                     $cond: {
//                       if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//                       then: "$availableSerialsCount",
//                       else: {
//                         $max: [
//                           0,
//                           {
//                             $subtract: [
//                               "$availableQuantity",
//                               "$damagedQuantity",
//                             ],
//                           },
//                         ],
//                       },
//                     },
//                   },
//                   lowStockThreshold,
//                 ],
//               },
//               then: "low_stock",
//               else: {
//                 $cond: {
//                   if: {
//                     $eq: [
//                       {
//                         $cond: {
//                           if: {
//                             $eq: ["$productDetails.trackSerialNumber", "Yes"],
//                           },
//                           then: "$availableSerialsCount",
//                           else: {
//                             $max: [
//                               0,
//                               {
//                                 $subtract: [
//                                   "$availableQuantity",
//                                   "$damagedQuantity",
//                                 ],
//                               },
//                             ],
//                           },
//                         },
//                       },
//                       0,
//                     ],
//                   },
//                   then: "out_of_stock",
//                   else: "in_stock",
//                 },
//               },
//             },
//           },
//         },
//       },
//     ];

//     if (search) {
//       aggregationPipeline.unshift({
//         $match: {
//           $or: [
//             {
//               "productDetails.productTitle": { $regex: search, $options: "i" },
//             },
//             { "productDetails.productCode": { $regex: search, $options: "i" } },
//             { "centerDetails.centerName": { $regex: search, $options: "i" } },
//             { "centerDetails.centerCode": { $regex: search, $options: "i" } },
//             { "categoryDetails.name": { $regex: search, $options: "i" } },
//           ],
//         },
//       });
//     }

//     const countPipeline = [...aggregationPipeline, { $count: "total" }];

//     const sortConfig = {};
//     sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;
//     aggregationPipeline.push({ $sort: sortConfig });

//     aggregationPipeline.push({ $skip: skip }, { $limit: limitNum });

//     const [stockData, countResult] = await Promise.all([
//       CenterStock.aggregate(aggregationPipeline),
//       CenterStock.aggregate(countPipeline),
//     ]);

//     const total = countResult.length > 0 ? countResult[0].total : 0;
//     const totalPages = Math.ceil(total / limitNum);

//     const summaryStats = await CenterStock.aggregate([
//       { $match: filter },
//       {
//         $addFields: {
//           damagedQuantity: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "damaged"] },
//               },
//             },
//           },
//           availableSerialsCount: {
//             $size: {
//               $filter: {
//                 input: "$serialNumbers",
//                 as: "serial",
//                 cond: { $eq: ["$$serial.status", "available"] },
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
//           _id: null,
//           totalProducts: { $sum: 1 },
//           totalQuantity: { $sum: "$totalQuantity" },
//           totalAvailable: { $sum: "$availableQuantity" },
//           totalInTransit: { $sum: "$inTransitQuantity" },
//           totalConsumed: { $sum: "$consumedQuantity" },
//           totalDamaged: { $sum: "$damagedQuantity" },
//           totalEffectiveAvailable: {
//             $sum: {
//               $cond: {
//                 if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
//                 then: "$availableSerialsCount",
//                 else: {
//                   $max: [
//                     0,
//                     { $subtract: ["$availableQuantity", "$damagedQuantity"] },
//                   ],
//                 },
//               },
//             },
//           },
//           lowStockItems: {
//             $sum: {
//               $cond: [
//                 {
//                   $and: [
//                     {
//                       $lt: [
//                         {
//                           $cond: {
//                             if: {
//                               $eq: ["$productDetails.trackSerialNumber", "Yes"],
//                             },
//                             then: "$availableSerialsCount",
//                             else: {
//                               $max: [
//                                 0,
//                                 {
//                                   $subtract: [
//                                     "$availableQuantity",
//                                     "$damagedQuantity",
//                                   ],
//                                 },
//                               ],
//                             },
//                           },
//                         },
//                         lowStockThreshold,
//                       ],
//                     },
//                     {
//                       $gt: [
//                         {
//                           $cond: {
//                             if: {
//                               $eq: ["$productDetails.trackSerialNumber", "Yes"],
//                             },
//                             then: "$availableSerialsCount",
//                             else: {
//                               $max: [
//                                 0,
//                                 {
//                                   $subtract: [
//                                     "$availableQuantity",
//                                     "$damagedQuantity",
//                                   ],
//                                 },
//                               ],
//                             },
//                           },
//                         },
//                         0,
//                       ],
//                     },
//                   ],
//                 },
//                 1,
//                 0,
//               ],
//             },
//           },
//           outOfStockItems: {
//             $sum: {
//               $cond: [
//                 {
//                   $eq: [
//                     {
//                       $cond: {
//                         if: {
//                           $eq: ["$productDetails.trackSerialNumber", "Yes"],
//                         },
//                         then: "$availableSerialsCount",
//                         else: {
//                           $max: [
//                             0,
//                             {
//                               $subtract: [
//                                 "$availableQuantity",
//                                 "$damagedQuantity",
//                               ],
//                             },
//                           ],
//                         },
//                       },
//                     },
//                     0,
//                   ],
//                 },
//                 1,
//                 0,
//               ],
//             },
//           },
//         },
//       },
//     ]);

//     const summary =
//       summaryStats.length > 0
//         ? summaryStats[0]
//         : {
//             totalProducts: 0,
//             totalQuantity: 0,
//             totalAvailable: 0,
//             totalInTransit: 0,
//             totalConsumed: 0,
//             totalDamaged: 0,
//             totalEffectiveAvailable: 0,
//             lowStockItems: 0,
//             outOfStockItems: 0,
//           };

//     let centerInfo = null;
//     if (filter.center) {
//       centerInfo = await Center.findById(filter.center).select(
//         "centerName centerCode centerType address phone email"
//       );
//     } else if (
//       permissions.available_stock_own_center &&
//       !permissions.available_stock_all_center &&
//       userCenter
//     ) {
//       centerInfo = await Center.findById(userCenter._id || userCenter).select(
//         "centerName centerCode centerType address phone email"
//       );
//     }

//     res.status(200).json({
//       success: true,
//       message: "Center stock data retrieved successfully",
//       data: {
//         stock: stockData,
//         summary: {
//           ...summary,
//           inStockItems:
//             summary.totalProducts -
//             summary.lowStockItems -
//             summary.outOfStockItems,
//         },
//         center: centerInfo,
//         filters: {
//           centerId: filter.center || "all",
//           product: product || "all",
//           search: search || "",
//           lowStockThreshold: parseInt(lowStockThreshold),
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
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving center stock:", error);
//     handleControllerError(error, res);
//   }
// };

const buildArrayFilter = (value) => {
  if (!value) return null;
  
  // Convert to array and create ObjectIds
  const values = value.includes(",") 
    ? value.split(",").map(item => item.trim())
    : [value];
  
  // Convert to ObjectIds if they are valid, otherwise keep as strings
  const objectIds = values.map(item => {
    if (mongoose.Types.ObjectId.isValid(item)) {
      return new mongoose.Types.ObjectId(item);
    }
    return item;
  });
  
  return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
};

const buildCenterStockFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center, // Support both centerId and center parameters
    product,
    search,
    lowStockThreshold = 10,
  } = query;

  const filter = {};

  // Permission-based center filtering
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    // Support both centerId and center parameters
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  }

  // Product filter
  const productFilter = buildArrayFilter(product);
  if (productFilter) filter.product = productFilter;

  return filter;
};

export const getCenterAllStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
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
      limit = 10,
      centerId,
      center,
      product,
      search,
      sortBy = "productName",
      sortOrder = "asc",
      includeSerials = false,
      lowStockThreshold = 10,
      ...filterParams
    } = req.query;

    // Build filter using the new helper function
    const filter = buildCenterStockFilter(
      { centerId, center, product, search, lowStockThreshold, ...filterParams },
      permissions,
      userCenter
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build base aggregation pipeline
    const aggregationPipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
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
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$centerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // Add search filter at the beginning if search exists
    if (search) {
      aggregationPipeline.unshift({
        $match: {
          $or: [
            { "productDetails.productTitle": { $regex: search, $options: "i" } },
            { "productDetails.productCode": { $regex: search, $options: "i" } },
            { "centerDetails.centerName": { $regex: search, $options: "i" } },
            { "centerDetails.centerCode": { $regex: search, $options: "i" } },
            { "categoryDetails.productCategory": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add fields and projections
    aggregationPipeline.push(
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
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
          inTransitSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "in_transit"] },
              },
            },
          },
          transferredSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "transferred"] },
              },
            },
          },
        },
      },
      {
        $project: {
          center: 1,
          product: 1,
          totalQuantity: 1,
          availableQuantity: 1,
          inTransitQuantity: 1,
          consumedQuantity: 1,
          lastUpdated: 1,
          productName: "$productDetails.productTitle",
          productCode: "$productDetails.productCode",
          productCategory: {
            _id: "$categoryDetails._id",
            name: "$categoryDetails.productCategory",
          },
          trackSerialNumber: "$productDetails.trackSerialNumber",
          centerName: "$centerDetails.centerName",
          centerCode: "$centerDetails.centerCode",
          centerType: "$centerDetails.centerType",
          serialNumbers: includeSerials === "true" ? "$serialNumbers" : [],
          damagedQuantity: 1,
          availableSerialsCount: 1,
          consumedSerialsCount: 1,
          inTransitSerialsCount: 1,
          transferredSerialsCount: 1,
          effectiveAvailableQuantity: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
              then: "$availableSerialsCount",
              else: {
                $max: [
                  0,
                  { $subtract: ["$availableQuantity", "$damagedQuantity"] },
                ],
              },
            },
          },
          stockStatus: {
            $cond: {
              if: {
                $lt: [
                  {
                    $cond: {
                      if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                      then: "$availableSerialsCount",
                      else: {
                        $max: [
                          0,
                          {
                            $subtract: [
                              "$availableQuantity",
                              "$damagedQuantity",
                            ],
                          },
                        ],
                      },
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
                          if: {
                            $eq: ["$productDetails.trackSerialNumber", "Yes"],
                          },
                          then: "$availableSerialsCount",
                          else: {
                            $max: [
                              0,
                              {
                                $subtract: [
                                  "$availableQuantity",
                                  "$damagedQuantity",
                                ],
                              },
                            ],
                          },
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
    );

    // Create count pipeline (without skip/limit)
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: "total" });

    // Add sorting and pagination to main pipeline
    const sortConfig = {};
    const validSortFields = [
      "productName", "productCode", "centerName", "centerCode", 
      "effectiveAvailableQuantity", "stockStatus", "lastUpdated"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    sortConfig[actualSortBy] = sortOrder === "desc" ? -1 : 1;
    
    aggregationPipeline.push(
      { $sort: sortConfig },
      { $skip: skip },
      { $limit: limitNum }
    );

    const [stockData, countResult] = await Promise.all([
      CenterStock.aggregate(aggregationPipeline),
      CenterStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // Summary statistics
    const summaryStats = await CenterStock.aggregate([
      { $match: filter },
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] },
              },
            },
          },
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
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
          totalAvailable: { $sum: "$availableQuantity" },
          totalInTransit: { $sum: "$inTransitQuantity" },
          totalConsumed: { $sum: "$consumedQuantity" },
          totalDamaged: { $sum: "$damagedQuantity" },
          totalEffectiveAvailable: {
            $sum: {
              $cond: {
                if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                then: "$availableSerialsCount",
                else: {
                  $max: [
                    0,
                    { $subtract: ["$availableQuantity", "$damagedQuantity"] },
                  ],
                },
              },
            },
          },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $lt: [
                        {
                          $cond: {
                            if: {
                              $eq: ["$productDetails.trackSerialNumber", "Yes"],
                            },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [
                                0,
                                {
                                  $subtract: [
                                    "$availableQuantity",
                                    "$damagedQuantity",
                                  ],
                                },
                              ],
                            },
                          },
                        },
                        parseInt(lowStockThreshold),
                      ],
                    },
                    {
                      $gt: [
                        {
                          $cond: {
                            if: {
                              $eq: ["$productDetails.trackSerialNumber", "Yes"],
                            },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [
                                0,
                                {
                                  $subtract: [
                                    "$availableQuantity",
                                    "$damagedQuantity",
                                  ],
                                },
                              ],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockItems: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $cond: {
                        if: {
                          $eq: ["$productDetails.trackSerialNumber", "Yes"],
                        },
                        then: "$availableSerialsCount",
                        else: {
                          $max: [
                            0,
                            {
                              $subtract: [
                                "$availableQuantity",
                                "$damagedQuantity",
                              ],
                            },
                          ],
                        },
                      },
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const summary =
      summaryStats.length > 0
        ? summaryStats[0]
        : {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalInTransit: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalEffectiveAvailable: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
          };

    // Get center info
    let centerInfo = null;
    if (filter.center) {
      try {
        // Handle single center or multiple centers
        if (typeof filter.center === 'object' && filter.center.$in && filter.center.$in.length > 0) {
          // For multiple centers, get the first one
          centerInfo = await Center.findById(filter.center.$in[0]).select(
            "centerName centerCode centerType address phone email"
          );
        } else {
          // For single center
          const centerId = typeof filter.center === 'object' ? filter.center : filter.center;
          centerInfo = await Center.findById(centerId).select(
            "centerName centerCode centerType address phone email"
          );
        }
      } catch (error) {
        console.error("Error fetching center info:", error);
      }
    } else if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      userCenter
    ) {
      centerInfo = await Center.findById(userCenter._id || userCenter).select(
        "centerName centerCode centerType address phone email"
      );
    }

    res.status(200).json({
      success: true,
      message: "Center stock data retrieved successfully",
      data: {
        stock: stockData,
        summary: {
          ...summary,
          inStockItems:
            summary.totalProducts -
            summary.lowStockItems -
            summary.outOfStockItems,
        },
        center: centerInfo,
        filters: {
          center: filter.center || "all",
          product: product || "all",
          search: search || "",
          lowStockThreshold: parseInt(lowStockThreshold),
        },
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
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving center stock:", error);
    handleControllerError(error, res);
  }
};

const buildAvailableProductsFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center,
    product,
    search,
    category,
  } = query;

  const filter = {};

  // Permission-based center filtering
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    // Support both centerId and center parameters
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  }

  // Product filter
  const productFilter = buildArrayFilter(product);
  if (productFilter) filter.product = productFilter;

  // Category filter
  const categoryFilter = buildArrayFilter(category);
  if (categoryFilter) filter.category = categoryFilter;

  return filter;
};

export const getAllAvailableProductsWithStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
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
      limit = 50,
      search,
      category,
      centerId,
      center,
      product,
      sortBy = "productName",
      sortOrder = "asc",
      ...filterParams
    } = req.query;

    // Get user info
    const user = await User.findById(req.user._id).populate(
      "center",
      "centerName centerCode centerType"
    );

    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const defaultCenterId = user.center._id;
    const centerType = user.center.centerType;

    // Build filter using the same pattern as center stock
    const filter = buildAvailableProductsFilter(
      { centerId, center, product, search, category, ...filterParams },
      permissions,
      userCenter
    );

    // Determine which center to use (filter center or user's center)
    const targetCenterId = filter.center ? filter.center : defaultCenterId;
    const targetCenter = await Center.findById(targetCenterId).select(
      "_id centerName centerCode centerType"
    );

    if (!targetCenter) {
      return res.status(400).json({
        success: false,
        message: "Center not found",
      });
    }

    // Product filter for initial product query
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

    // Get products with pagination
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
            totalInTransit: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalEffectiveAvailable: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
            inStockItems: 0,
          },
          center: targetCenter,
          filters: {
            center: targetCenterId,
            product: product || "all",
            search: search || "",
            category: category || "all",
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
    let stockData = [];

    if (targetCenter.centerType === "Outlet") {
      // Outlet stock logic
      const [outletStockData, purchaseData] = await Promise.all([
        OutletStock.find({
          outlet: targetCenterId,
          product: { $in: productIds },
        }).select(
          "product totalQuantity availableQuantity inTransitQuantity serialNumbers"
        ).lean(),

        StockPurchase.aggregate([
          {
            $match: {
              outlet: targetCenterId,
              "products.product": { $in: productIds },
            },
          },
          {
            $unwind: "$products",
          },
          {
            $match: {
              "products.product": { $in: productIds },
            },
          },
          {
            $group: {
              _id: "$products.product",
              totalPurchased: { $sum: "$products.purchasedQuantity" },
              totalAvailable: { $sum: "$products.availableQuantity" },
              purchaseCount: { $sum: 1 },
            },
          },
        ]),
      ]);

      const outletStockMap = new Map();
      outletStockData.forEach((item) => {
        const damagedQuantity = item.serialNumbers.filter(
          (sn) => sn.status === "damaged"
        ).length;

        outletStockMap.set(item.product.toString(), {
          currentTotalQuantity: item.totalQuantity,
          currentAvailableQuantity: item.availableQuantity,
          currentInTransitQuantity: item.inTransitQuantity,
          serialNumbersCount: item.serialNumbers.length,
          hasSerialNumbers: item.serialNumbers.length > 0,
          damagedQuantity: damagedQuantity,
          effectiveAvailableQuantity: Math.max(
            0,
            item.availableQuantity - damagedQuantity
          ),
        });
      });

      const purchaseMap = new Map();
      purchaseData.forEach((item) => {
        purchaseMap.set(item._id.toString(), {
          totalPurchased: item.totalPurchased,
          totalAvailable: item.totalAvailable,
          purchaseCount: item.purchaseCount,
        });
      });

      stockData = productIds.map((productId) => {
        const outletStock = outletStockMap.get(productId.toString());
        const purchaseInfo = purchaseMap.get(productId.toString());

        return {
          _id: productId,
          totalPurchased: purchaseInfo?.totalPurchased || 0,
          totalAvailable: purchaseInfo?.totalAvailable || 0,
          purchaseCount: purchaseInfo?.purchaseCount || 0,
          currentTotalQuantity: outletStock?.currentTotalQuantity || 0,
          currentAvailableQuantity: outletStock?.currentAvailableQuantity || 0,
          currentInTransitQuantity: outletStock?.currentInTransitQuantity || 0,
          serialNumbersCount: outletStock?.serialNumbersCount || 0,
          hasSerialNumbers: outletStock?.hasSerialNumbers || false,
          damagedQuantity: outletStock?.damagedQuantity || 0,
          effectiveAvailableQuantity:
            outletStock?.effectiveAvailableQuantity || 0,
        };
      });
    } else if (targetCenter.centerType === "Center") {
      // Center stock logic
      stockData = await CenterStock.aggregate([
        {
          $match: {
            center: targetCenterId,
            product: { $in: productIds },
          },
        },
        {
          $addFields: {
            damagedQuantity: {
              $size: {
                $filter: {
                  input: "$serialNumbers",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "damaged"] },
                },
              },
            },
            availableSerialsCount: {
              $size: {
                $filter: {
                  input: "$serialNumbers",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "available"] },
                },
              },
            },
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
            inTransitQuantity: { $sum: "$inTransitQuantity" },
            damagedQuantity: { $sum: "$damagedQuantity" },
            availableSerialsCount: { $sum: "$availableSerialsCount" },
            stockEntries: { $sum: 1 },
            trackSerialNumber: { $first: "$productDetails.trackSerialNumber" },
          },
        },
        {
          $project: {
            totalQuantity: 1,
            availableQuantity: 1,
            inTransitQuantity: 1,
            damagedQuantity: 1,
            availableSerialsCount: 1,
            stockEntries: 1,
            trackSerialNumber: 1,
            effectiveAvailableQuantity: {
              $cond: {
                if: { $eq: ["$trackSerialNumber", "Yes"] },
                then: "$availableSerialsCount",
                else: {
                  $max: [
                    0,
                    { $subtract: ["$availableQuantity", "$damagedQuantity"] },
                  ],
                },
              },
            },
          },
        },
      ]);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid center type",
      });
    }

    // Create stock map
    const stockMap = new Map();
    stockData.forEach((item) => {
      if (targetCenter.centerType === "Outlet") {
        stockMap.set(item._id.toString(), {
          totalPurchased: item.totalPurchased,
          totalAvailable: item.totalAvailable,
          purchaseCount: item.purchaseCount,
          currentTotalQuantity: item.currentTotalQuantity,
          currentAvailableQuantity: item.currentAvailableQuantity,
          currentInTransitQuantity: item.currentInTransitQuantity,
          serialNumbersCount: item.serialNumbersCount,
          hasSerialNumbers: item.hasSerialNumbers,
          damagedQuantity: item.damagedQuantity,
          effectiveAvailableQuantity: item.effectiveAvailableQuantity,
        });
      } else {
        stockMap.set(item._id.toString(), {
          totalQuantity: item.totalQuantity,
          availableQuantity: item.availableQuantity,
          inTransitQuantity: item.inTransitQuantity,
          damagedQuantity: item.damagedQuantity,
          availableSerialsCount: item.availableSerialsCount,
          stockEntries: item.stockEntries,
          effectiveAvailableQuantity: item.effectiveAvailableQuantity,
        });
      }
    });

    // Format products with stock information
    const formattedProducts = products.map((product) => {
      const productId = product._id.toString();
      const productCategory = product.productCategory
        ? {
            _id: product.productCategory._id,
            name: product.productCategory.productCategory,
            code: product.productCategory.categoryCode,
          }
        : null;

      let stockInfo = {};

      if (targetCenter.centerType === "Outlet") {
        const stockData = stockMap.get(productId) || {
          currentTotalQuantity: 0,
          currentAvailableQuantity: 0,
          currentInTransitQuantity: 0,
          serialNumbersCount: 0,
          hasSerialNumbers: false,
          damagedQuantity: 0,
          effectiveAvailableQuantity: 0,
        };

        stockInfo = {
          totalQuantity: stockData.currentTotalQuantity,
          availableQuantity: stockData.currentAvailableQuantity,
          inTransitQuantity: stockData.currentInTransitQuantity,
          consumedQuantity: 0,
          damagedQuantity: stockData.damagedQuantity,
          availableSerialsCount: stockData.serialNumbersCount,
          consumedSerialsCount: 0,
          inTransitSerialsCount: 0,
          transferredSerialsCount: 0,
          effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
        };
      } else {
        const stockData = stockMap.get(productId) || {
          totalQuantity: 0,
          availableQuantity: 0,
          inTransitQuantity: 0,
          damagedQuantity: 0,
          availableSerialsCount: 0,
          stockEntries: 0,
          effectiveAvailableQuantity: 0,
        };

        stockInfo = {
          totalQuantity: stockData.totalQuantity,
          availableQuantity: stockData.availableQuantity,
          inTransitQuantity: stockData.inTransitQuantity,
          consumedQuantity: 0,
          damagedQuantity: stockData.damagedQuantity,
          availableSerialsCount: stockData.availableSerialsCount,
          consumedSerialsCount: 0,
          inTransitSerialsCount: 0,
          transferredSerialsCount: 0,
          effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
        };
      }

      const stockStatus =
        stockInfo.effectiveAvailableQuantity === 0
          ? "out_of_stock"
          : stockInfo.effectiveAvailableQuantity < 10
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
        center: targetCenterId,
        centerName: targetCenter.centerName,
        centerCode: targetCenter.centerCode,
        centerType: targetCenter.centerType,
        ...stockInfo,
        stockStatus: stockStatus,
        lastUpdated: new Date().toISOString(),
        serialNumbers: [],
      };
    });

    // Apply sorting
    const validSortFields = [
      "productName", "productCode", "effectiveAvailableQuantity", 
      "stockStatus", "totalQuantity", "availableQuantity"
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
      totalInTransit: formattedProducts.reduce(
        (sum, product) => sum + product.inTransitQuantity,
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
      totalEffectiveAvailable: formattedProducts.reduce(
        (sum, product) => sum + product.effectiveAvailableQuantity,
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
      message: `Products with stock information retrieved successfully for ${targetCenter.centerType.toLowerCase()}`,
      data: {
        stock: formattedProducts,
        summary: summary,
        center: targetCenter,
        filters: {
          center: targetCenterId,
          product: product || "all",
          search: search || "",
          category: category || "all",
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
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving products with stock:", error);
    handleControllerError(error, res);
  }
};

// export const getStockUsageByCenter = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } =
//       checkAvailableStockPermissions(req, [
//         "available_stock_own_center",
//         "available_stock_all_center",
//       ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. available_stock_own_center available_stock_all_center permission required.",
//       });
//     }

//     const {
//       page = 1,
//       limit = 10,
//       startDate,
//       endDate,
//       usageType,
//       status,
//       product,
//       sortBy = "date",
//       sortOrder = "desc",
//       centerId,
//     } = req.query;

//     let targetCenterId;

//     if (
//       permissions.available_stock_own_center &&
//       !permissions.available_stock_all_center
//     ) {
//       targetCenterId = userCenter?._id || userCenter;
//     } else if (permissions.available_stock_all_center && centerId) {
//       targetCenterId = centerId;
//     } else {
//       targetCenterId = userCenter?._id || userCenter;
//     }

//     if (!targetCenterId) {
//       return res.status(400).json({
//         success: false,
//         message: "Center information not available",
//       });
//     }

//     if (permissions.available_stock_all_center && centerId) {
//       const targetCenter = await Center.findById(centerId);
//       if (!targetCenter) {
//         return res.status(404).json({
//           success: false,
//           message: "Specified center not found",
//         });
//       }
//     }

//     const center = await Center.findById(targetCenterId);
//     if (!center) {
//       return res.status(404).json({
//         success: false,
//         message: "Center not found",
//       });
//     }

//     const query = { center: targetCenterId };

//     if (usageType && usageType !== "all") query.usageType = usageType;

//     if (startDate || endDate) {
//       query.date = {};
//       if (startDate) query.date.$gte = new Date(startDate);
//       if (endDate) query.date.$lte = new Date(endDate);
//     }

//     if (status && status !== "all") query.status = status;
//     if (product) query["items.product"] = product;

//     const total = await StockUsage.countDocuments(query);
//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const sortConfig = {};
//     sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

//     const stockUsages = await StockUsage.find(query)
//       .populate("center", "centerName centerCode centerType")
//       .populate("customer", "name username mobile")
//       .populate("fromBuilding", "buildingName displayName")
//       .populate("toBuilding", "buildingName displayName")
//       .populate("fromControlRoom", "buildingName displayName")
//       .populate({
//         path: "items.product",
//         select: "productTitle productCode category",
//       })
//       .populate("createdBy", "name email")
//       .sort(sortConfig)
//       .skip(skip)
//       .limit(parseInt(limit));

//     const formattedData = [];

//     stockUsages.forEach((usage) => {
//       usage.items.forEach((item) => {
//         let damageQty = 0;
//         if (usage.usageType === "Damage" && usage.status === "completed") {
//           damageQty = item.quantity;
//         }

//         let entityName = "N/A";
//         switch (usage.usageType) {
//           case "Customer":
//             entityName = usage.customer?.name || "Unknown Customer";
//             break;
//           case "Building":
//             entityName = usage.fromBuilding?.buildingName || "Unknown Building";
//             break;
//           case "Building to Building":
//             entityName = `${usage.fromBuilding?.buildingName || "Unknown"} → ${
//               usage.toBuilding?.buildingName || "Unknown"
//             }`;
//             break;
//           case "Control Room":
//             entityName =
//               usage.fromControlRoom?.buildingName || "Unknown Control Room";
//             break;
//           default:
//             entityName = usage.usageType;
//         }

//         formattedData.push({
//           _id: usage._id,
//           Date: usage.date.toLocaleDateString(),
//           Type: usage.usageType,
//           Center: usage.center?.centerName || "Unknown Center",
//           Product: item.product?.productTitle || "Unknown Product",
//           "Old Stock": item.oldStock || 0,
//           Qty: item.quantity,
//           "Damage Qty": damageQty,
//           "New Stock": item.newStock || 0,
//           Entity: entityName,
//           Remark: usage.remark || "",
//           Status: usage.status,
//           "Created By": usage.createdBy?.name || "Unknown",
//           "Created At": usage.createdAt.toLocaleDateString(),
//         });
//       });
//     });

//     const summaryStats = await StockUsage.aggregate([
//       { $match: query },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: "$usageType",
//           totalUsage: { $sum: "$items.quantity" },
//           totalDamage: {
//             $sum: {
//               $cond: [
//                 {
//                   $and: [
//                     { $eq: ["$usageType", "Damage"] },
//                     { $eq: ["$status", "completed"] },
//                   ],
//                 },
//                 "$items.quantity",
//                 0,
//               ],
//             },
//           },
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     const totalUsage = formattedData.reduce((sum, item) => sum + item.Qty, 0);
//     const totalDamage = formattedData.reduce(
//       (sum, item) => sum + item["Damage Qty"],
//       0
//     );

//     res.status(200).json({
//       success: true,
//       message: "Stock usage by center retrieved successfully",
//       data: formattedData,
//       center: {
//         id: center._id,
//         name: center.centerName,
//         code: center.centerCode,
//         type: center.centerType,
//       },
//       summary: {
//         totalRecords: total,
//         totalUsage,
//         totalDamage,
//         byUsageType: summaryStats,
//       },
//       permissions: {
//         canViewAllCenters: permissions.available_stock_all_center,
//         canViewOwnCenter: permissions.available_stock_own_center,
//         currentAccess: permissions.available_stock_all_center
//           ? "all_centers"
//           : "own_center",
//       },
//       pagination: {
//         total,
//         page: parseInt(page),
//         limit: parseInt(limit),
//         totalPages: Math.ceil(total / limit),
//       },
//       filters: {
//         usageType: usageType || "all",
//         status: status || "all",
//         product: product || "all",
//         startDate: startDate || "all",
//         endDate: endDate || "all",
//         center: centerId || "user_center",
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching stock usage by center:", error);
//     handleControllerError(error, res);
//   }
// };

const buildArrayFilterStockUsage = (value) => {
  if (!value) return null;
  
  // Convert to array
  const values = value.includes(",") 
    ? value.split(",").map(item => item.trim())
    : [value];
  
  // Convert to ObjectIds if they are valid, otherwise keep as strings
  const objectIds = values.map(item => {
    if (mongoose.Types.ObjectId.isValid(item)) {
      return new mongoose.Types.ObjectId(item);
    }
    return item;
  });
  
  return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
};

const buildStockUsageFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center,
    usageType,
    status,
    product,
    startDate,
    endDate,
    createdBy,
    search,
  } = query;

  const filter = {};

  // Permission-based center filtering
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    // Support both centerId and center parameters
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  } else if (permissions.available_stock_all_center) {
    // If user has all center access and no center specified, don't filter by center
    // This allows viewing all centers
  } else {
    // Default to user center if no specific center provided
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  }

  // Usage type filter - handle array of usage types
  if (usageType && usageType !== 'all') {
    const usageTypeFilter = buildArrayFilter(usageType);
    if (usageTypeFilter) filter.usageType = usageTypeFilter;
  }

  // Status filter - handle array of statuses
  if (status && status !== 'all') {
    const statusFilter = buildArrayFilter(status);
    if (statusFilter) filter.status = statusFilter;
  }

  // Product filter - special handling for array field
  if (product && product !== 'all') {
    const productFilter = buildArrayFilterStockUsage(product);
    if (productFilter) {
      // For array fields, we need to check if any item in the array matches
      filter["items.product"] = productFilter;
    }
  }

  // Created by filter
  if (createdBy && createdBy !== 'all') {
    const createdByFilter = buildArrayFilterStockUsage(createdBy);
    if (createdByFilter) filter.createdBy = createdByFilter;
  }

  // Date filter (start date and end date only)
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filter.date.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  // Search filter - only apply if search term is provided
  if (search && search.trim() !== '') {
    filter.$or = [
      { remark: { $regex: search.trim(), $options: "i" } },
      { "items.productRemark": { $regex: search.trim(), $options: "i" } },
    ];
  }

  console.log('Final filter:', JSON.stringify(filter, null, 2));
  return filter;
};

const buildStockUsageSortOptions = (sortBy = "date", sortOrder = "desc") => {
  const validSortFields = [
    "date",
    "createdAt",
    "updatedAt",
    "usageType",
    "status",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

export const getStockUsageByCenter = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
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
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
      ...filterParams
    } = req.query;

    console.log('Received query params:', filterParams);

    // Build filter using the helper function
    const filter = buildStockUsageFilter(
      filterParams,
      permissions,
      userCenter
    );

    // For users with all center access, if no center is specified, don't restrict by center
    if (permissions.available_stock_all_center && !filterParams.centerId && !filterParams.center) {
      delete filter.center;
    }

    console.log('Final MongoDB filter:', JSON.stringify(filter, null, 2));

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = buildStockUsageSortOptions(sortBy, sortOrder);

    // Get total count and stock usages
    const [total, stockUsages] = await Promise.all([
      StockUsage.countDocuments(filter),
      StockUsage.find(filter)
        .populate("center", "centerName centerCode centerType")
        .populate("customer", "name username mobile")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName")
        .populate({
          path: "items.product",
          select: "productTitle productCode productCategory trackSerialNumber",
        })
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .populate("rejectedBy", "name email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    console.log(`Found ${stockUsages.length} records out of ${total} total`);

    if (stockUsages.length === 0) {
      const centerInfo = filter.center ? 
        await Center.findById(filter.center).select("centerName centerCode centerType") : 
        null;

      return res.status(200).json({
        success: true,
        message: "No stock usage records found",
        data: [],
        center: centerInfo ? {
          id: centerInfo._id,
          name: centerInfo.centerName,
          code: centerInfo.centerCode,
          type: centerInfo.centerType,
        } : null,
        summary: {
          totalRecords: 0,
          totalUsage: 0,
          totalDamage: 0,
          byUsageType: [],
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
          currentAccess: permissions.available_stock_all_center
            ? "all_centers"
            : "own_center",
        },
        pagination: {
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
        },
        filters: {
          center: filterParams.centerId || filterParams.center || "user_center",
          usageType: filterParams.usageType || "all",
          status: filterParams.status || "all",
          product: filterParams.product || "all",
          createdBy: filterParams.createdBy || "all",
          startDate: filterParams.startDate || "all",
          endDate: filterParams.endDate || "all",
          search: filterParams.search || "",
        },
      });
    }

    // Format the data
    const formattedData = [];

    stockUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        let damageQty = 0;
        if (usage.usageType === "Damage" && usage.status === "completed") {
          damageQty = item.quantity;
        }

        let entityName = "N/A";
        switch (usage.usageType) {
          case "Customer":
            entityName = usage.customer?.name || "Unknown Customer";
            break;
          case "Building":
            entityName = usage.fromBuilding?.buildingName || "Unknown Building";
            break;
          case "Building to Building":
            entityName = `${usage.fromBuilding?.buildingName || "Unknown"} → ${
              usage.toBuilding?.buildingName || "Unknown"
            }`;
            break;
          case "Control Room":
            entityName =
              usage.fromControlRoom?.buildingName || "Unknown Control Room";
            break;
          default:
            entityName = usage.usageType;
        }

        formattedData.push({
          _id: usage._id,
          Date: usage.date.toISOString().split('T')[0],
          Type: usage.usageType,
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          ProductCode: item.product?.productCode || "N/A",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": damageQty,
          "New Stock": item.newStock || 0,
          Entity: entityName,
          Remark: usage.remark || "",
          Status: usage.status,
          "Created By": usage.createdBy?.name || "Unknown",
          "Created At": usage.createdAt.toISOString().split('T')[0],
          "Approved By": usage.approvedBy?.name || "N/A",
          "Rejected By": usage.rejectedBy?.name || "N/A",
        });
      });
    });

    // Get summary statistics
    const summaryStats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$usageType",
          totalUsage: { $sum: "$items.quantity" },
          totalDamage: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$usageType", "Damage"] },
                    { $eq: ["$status", "completed"] },
                  ],
                },
                "$items.quantity",
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalUsage = formattedData.reduce((sum, item) => sum + item.Qty, 0);
    const totalDamage = formattedData.reduce(
      (sum, item) => sum + item["Damage Qty"],
      0
    );

    // Get center info
    let centerInfo = null;
    if (filter.center) {
      if (typeof filter.center === 'object' && filter.center.$in) {
        centerInfo = await Center.findById(filter.center.$in[0]).select("centerName centerCode centerType");
      } else {
        centerInfo = await Center.findById(filter.center).select("centerName centerCode centerType");
      }
    }

    res.status(200).json({
      success: true,
      message: "Stock usage by center retrieved successfully",
      data: formattedData,
      center: centerInfo ? {
        id: centerInfo._id,
        name: centerInfo.centerName,
        code: centerInfo.centerCode,
        type: centerInfo.centerType,
      } : null,
      summary: {
        totalRecords: total,
        totalUsage,
        totalDamage,
        byUsageType: summaryStats,
      },
      permissions: {
        canViewAllCenters: permissions.available_stock_all_center,
        canViewOwnCenter: permissions.available_stock_own_center,
        currentAccess: permissions.available_stock_all_center
          ? "all_centers"
          : "own_center",
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      filters: {
        center: filterParams.centerId || filterParams.center || "user_center",
        usageType: filterParams.usageType || "all",
        status: filterParams.status || "all",
        product: filterParams.product || "all",
        createdBy: filterParams.createdBy || "all",
        startDate: filterParams.startDate || "all",
        endDate: filterParams.endDate || "all",
        search: filterParams.search || "",
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by center:", error);
    handleControllerError(error, res);
  }
};