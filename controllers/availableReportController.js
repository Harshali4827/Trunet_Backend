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

//     // Get damaged quantities for all products in the center
//     const damageAggregation = await StockUsage.aggregate([
//       {
//         $match: {
//           center: filter.center ? new mongoose.Types.ObjectId(filter.center) : { $exists: true },
//           usageType: "Damage",
//           status: "completed"
//         }
//       },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: "$items.product",
//           totalDamagedQuantity: { $sum: "$items.quantity" }
//         }
//       }
//     ]);

//     // Create a map of product ID to damaged quantity
//     const damageMap = new Map();
//     damageAggregation.forEach(item => {
//       damageMap.set(item._id.toString(), item.totalDamagedQuantity);
//     });

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
//             name: "$categoryDetails.productCategory", // Assuming your category model has a 'name' field
//           },
//           trackSerialNumber: "$productDetails.trackSerialNumber",
//           centerName: "$centerDetails.centerName",
//           centerCode: "$centerDetails.centerCode",
//           centerType: "$centerDetails.centerType",
//           serialNumbers: includeSerials === "true" ? "$serialNumbers" : [],
//           damagedQuantity: {
//             $cond: {
//               if: { $gt: [damageMap.get("$productDetails._id.toString()"), 0] },
//               then: damageMap.get("$productDetails._id.toString()"),
//               else: 0
//             }
//           },
//           stockStatus: {
//             $cond: {
//               if: { $lt: ["$availableQuantity", lowStockThreshold] },
//               then: "low_stock",
//               else: {
//                 $cond: {
//                   if: { $eq: ["$availableQuantity", 0] },
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
//             { "categoryDetails.name": { $regex: search, $options: "i" } }, // Add category to search
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

//     // Process the data to include damaged quantities
//     const processedStockData = stockData.map(item => {
//       const productId = item.product ? item.product.toString() : (item.productDetails ? item.productDetails._id.toString() : null);
//       const damagedQty = productId ? (damageMap.get(productId) || 0) : 0;
      
//       return {
//         ...item,
//         damagedQuantity: damagedQty,
//         // Calculate effective available quantity (excluding damaged)
//         effectiveAvailableQuantity: Math.max(0, item.availableQuantity - damagedQty)
//       };
//     });

//     const total = countResult.length > 0 ? countResult[0].total : 0;
//     const totalPages = Math.ceil(total / limitNum);

//     // Update summary stats to include damaged quantities
//     const summaryStats = await CenterStock.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: null,
//           totalProducts: { $sum: 1 },
//           totalQuantity: { $sum: "$totalQuantity" },
//           totalAvailable: { $sum: "$availableQuantity" },
//           totalInTransit: { $sum: "$inTransitQuantity" },
//           totalConsumed: { $sum: "$consumedQuantity" },
//           lowStockItems: {
//             $sum: {
//               $cond: [
//                 {
//                   $and: [
//                     { $lt: ["$availableQuantity", lowStockThreshold] },
//                     { $gt: ["$availableQuantity", 0] },
//                   ],
//                 },
//                 1,
//                 0,
//               ],
//             },
//           },
//           outOfStockItems: {
//             $sum: {
//               $cond: [{ $eq: ["$availableQuantity", 0] }, 1, 0],
//             },
//           },
//         },
//       },
//     ]);

//     // Calculate total damaged quantity for the center
//     const totalDamaged = Array.from(damageMap.values()).reduce((sum, qty) => sum + qty, 0);

//     const summary =
//       summaryStats.length > 0
//         ? {
//             ...summaryStats[0],
//             totalDamaged: totalDamaged,
//             totalEffectiveAvailable: Math.max(0, summaryStats[0].totalAvailable - totalDamaged)
//           }
//         : {
//             totalProducts: 0,
//             totalQuantity: 0,
//             totalAvailable: 0,
//             totalInTransit: 0,
//             totalConsumed: 0,
//             lowStockItems: 0,
//             outOfStockItems: 0,
//             totalDamaged: 0,
//             totalEffectiveAvailable: 0
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
//         stock: processedStockData,
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
      product,
      search,
      sortBy = "productName",
      sortOrder = "asc",
      includeSerials = false,
      lowStockThreshold = 10,
    } = req.query;

    let filter = {};

    if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (centerId) {
      filter.center = centerId;
    }

    if (product) {
      filter.product = product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

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
      // Calculate damaged quantity from serialNumbers
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] }
              }
            }
          },
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] }
              }
            }
          },
          consumedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "consumed"] }
              }
            }
          },
          inTransitSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "in_transit"] }
              }
            }
          },
          transferredSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "transferred"] }
              }
            }
          }
        }
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
          // Calculate effective available quantity (excluding damaged)
          effectiveAvailableQuantity: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
              then: "$availableSerialsCount",
              else: {
                $max: [
                  0,
                  { $subtract: ["$availableQuantity", "$damagedQuantity"] }
                ]
              }
            }
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
                          { $subtract: ["$availableQuantity", "$damagedQuantity"] }
                        ]
                      }
                    }
                  },
                  lowStockThreshold
                ]
              },
              then: "low_stock",
              else: {
                $cond: {
                  if: {
                    $eq: [
                      {
                        $cond: {
                          if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                          then: "$availableSerialsCount",
                          else: {
                            $max: [
                              0,
                              { $subtract: ["$availableQuantity", "$damagedQuantity"] }
                            ]
                          }
                        }
                      },
                      0
                    ]
                  },
                  then: "out_of_stock",
                  else: "in_stock",
                },
              },
            },
          },
        },
      },
    ];

    if (search) {
      aggregationPipeline.unshift({
        $match: {
          $or: [
            {
              "productDetails.productTitle": { $regex: search, $options: "i" },
            },
            { "productDetails.productCode": { $regex: search, $options: "i" } },
            { "centerDetails.centerName": { $regex: search, $options: "i" } },
            { "centerDetails.centerCode": { $regex: search, $options: "i" } },
            { "categoryDetails.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const countPipeline = [...aggregationPipeline, { $count: "total" }];

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;
    aggregationPipeline.push({ $sort: sortConfig });

    aggregationPipeline.push({ $skip: skip }, { $limit: limitNum });

    const [stockData, countResult] = await Promise.all([
      CenterStock.aggregate(aggregationPipeline),
      CenterStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // Get summary statistics including damaged quantities
    const summaryStats = await CenterStock.aggregate([
      { $match: filter },
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] }
              }
            }
          },
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] }
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true
        }
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
                  $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
                }
              }
            }
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
                            if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
                            }
                          }
                        },
                        lowStockThreshold
                      ]
                    },
                    {
                      $gt: [
                        {
                          $cond: {
                            if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
                            }
                          }
                        },
                        0
                      ]
                    }
                  ]
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
                        if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                        then: "$availableSerialsCount",
                        else: {
                          $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
                        }
                      }
                    },
                    0
                  ]
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

    let centerInfo = null;
    if (filter.center) {
      centerInfo = await Center.findById(filter.center).select(
        "centerName centerCode centerType address phone email"
      );
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
          centerId: filter.center || "all",
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

// export const getAllAvailableProductsWithStock = async (req, res) => {
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

//     const { page = 1, limit = 50, search, category } = req.query;

//     const user = await User.findById(req.user._id).populate(
//       "center",
//       "centerName centerCode centerType"
//     );

//     if (!user || !user.center) {
//       return res.status(400).json({
//         success: false,
//         message: "User center information not found",
//       });
//     }

//     const centerId = user.center._id;
//     const centerType = user.center.centerType;

//     const canViewAllCenters = permissions.view_all_purchase_stock;

//     // Build product filter with category population
//     const productFilter = {};

//     if (search) {
//       productFilter.$or = [
//         { productTitle: { $regex: search, $options: "i" } },
//         { productCode: { $regex: search, $options: "i" } },
//         { description: { $regex: search, $options: "i" } },
//       ];
//     }

//     if (category) {
//       productFilter.category = category;
//     }

//     // Get products with category population - CORRECTED FIELD NAME
//     const products = await Product.find(productFilter)
//       .populate("productCategory", "productCategory") // Corrected field name
//       .select(
//         "productTitle productCode description category productCategory productPrice trackSerialNumber productImage"
//       )
//       .sort({ productTitle: 1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);

//     const totalProducts = await Product.countDocuments(productFilter);

//     let stockData = [];
//     let centerDetails = null;

//     if (centerType === "Outlet") {
//       centerDetails = await Center.findById(centerId).select(
//         "_id partner area centerType centerName centerCode"
//       );

//       const productIds = products.map((product) => product._id);

//       const outletStockData = await OutletStock.find({
//         outlet: centerId,
//         product: { $in: productIds },
//       }).select(
//         "product totalQuantity availableQuantity inTransitQuantity serialNumbers"
//       );

//       const purchaseData = await StockPurchase.aggregate([
//         {
//           $match: {
//             outlet: centerId,
//             "products.product": { $in: productIds },
//           },
//         },
//         {
//           $unwind: "$products",
//         },
//         {
//           $match: {
//             "products.product": { $in: productIds },
//           },
//         },
//         {
//           $group: {
//             _id: "$products.product",
//             totalPurchased: { $sum: "$products.purchasedQuantity" },
//             totalAvailable: { $sum: "$products.availableQuantity" },
//             purchaseCount: { $sum: 1 },
//           },
//         },
//       ]);

//       const outletStockMap = new Map();
//       outletStockData.forEach((item) => {
//         // Calculate damaged quantity for outlet stock
//         const damagedQuantity = item.serialNumbers.filter(
//           sn => sn.status === "damaged"
//         ).length;

//         outletStockMap.set(item.product.toString(), {
//           currentTotalQuantity: item.totalQuantity,
//           currentAvailableQuantity: item.availableQuantity,
//           currentInTransitQuantity: item.inTransitQuantity,
//           serialNumbersCount: item.serialNumbers.length,
//           hasSerialNumbers: item.serialNumbers.length > 0,
//           damagedQuantity: damagedQuantity,
//           effectiveAvailableQuantity: Math.max(0, item.availableQuantity - damagedQuantity),
//         });
//       });

//       const purchaseMap = new Map();
//       purchaseData.forEach((item) => {
//         purchaseMap.set(item._id.toString(), {
//           totalPurchased: item.totalPurchased,
//           totalAvailable: item.totalAvailable,
//           purchaseCount: item.purchaseCount,
//         });
//       });

//       stockData = productIds.map((productId) => {
//         const outletStock = outletStockMap.get(productId.toString());
//         const purchaseInfo = purchaseMap.get(productId.toString());

//         return {
//           _id: productId,
//           totalPurchased: purchaseInfo?.totalPurchased || 0,
//           totalAvailable: purchaseInfo?.totalAvailable || 0,
//           purchaseCount: purchaseInfo?.purchaseCount || 0,
//           currentTotalQuantity: outletStock?.currentTotalQuantity || 0,
//           currentAvailableQuantity: outletStock?.currentAvailableQuantity || 0,
//           currentInTransitQuantity: outletStock?.currentInTransitQuantity || 0,
//           serialNumbersCount: outletStock?.serialNumbersCount || 0,
//           hasSerialNumbers: outletStock?.hasSerialNumbers || false,
//           damagedQuantity: outletStock?.damagedQuantity || 0,
//           effectiveAvailableQuantity: outletStock?.effectiveAvailableQuantity || 0,
//         };
//       });
//     } else if (centerType === "Center") {
//       centerDetails = await Center.findById(centerId).select(
//         "_id partner area centerType centerName centerCode"
//       );

//       const productIds = products.map((product) => product._id);

//       // Enhanced CenterStock aggregation with damaged quantity calculation
//       stockData = await CenterStock.aggregate([
//         {
//           $match: {
//             center: centerId,
//             product: { $in: productIds },
//           },
//         },
//         {
//           $addFields: {
//             damagedQuantity: {
//               $size: {
//                 $filter: {
//                   input: "$serialNumbers",
//                   as: "serial",
//                   cond: { $eq: ["$$serial.status", "damaged"] }
//                 }
//               }
//             },
//             availableSerialsCount: {
//               $size: {
//                 $filter: {
//                   input: "$serialNumbers",
//                   as: "serial",
//                   cond: { $eq: ["$$serial.status", "available"] }
//                 }
//               }
//             }
//           }
//         },
//         {
//           $lookup: {
//             from: "products",
//             localField: "product",
//             foreignField: "_id",
//             as: "productDetails"
//           }
//         },
//         {
//           $unwind: {
//             path: "$productDetails",
//             preserveNullAndEmptyArrays: true
//           }
//         },
//         {
//           $group: {
//             _id: "$product",
//             totalQuantity: { $sum: "$totalQuantity" },
//             availableQuantity: { $sum: "$availableQuantity" },
//             inTransitQuantity: { $sum: "$inTransitQuantity" },
//             damagedQuantity: { $sum: "$damagedQuantity" },
//             availableSerialsCount: { $sum: "$availableSerialsCount" },
//             stockEntries: { $sum: 1 },
//             trackSerialNumber: { $first: "$productDetails.trackSerialNumber" }
//           },
//         },
//         {
//           $project: {
//             totalQuantity: 1,
//             availableQuantity: 1,
//             inTransitQuantity: 1,
//             damagedQuantity: 1,
//             availableSerialsCount: 1,
//             stockEntries: 1,
//             trackSerialNumber: 1,
//             effectiveAvailableQuantity: {
//               $cond: {
//                 if: { $eq: ["$trackSerialNumber", "Yes"] },
//                 then: "$availableSerialsCount",
//                 else: {
//                   $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
//                 }
//               }
//             }
//           }
//         }
//       ]);
//     } else {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid center type",
//       });
//     }

//     const stockMap = new Map();
//     stockData.forEach((item) => {
//       if (centerType === "Outlet") {
//         stockMap.set(item._id.toString(), {
//           totalPurchased: item.totalPurchased,
//           totalAvailable: item.totalAvailable,
//           purchaseCount: item.purchaseCount,
//           currentTotalQuantity: item.currentTotalQuantity,
//           currentAvailableQuantity: item.currentAvailableQuantity,
//           currentInTransitQuantity: item.currentInTransitQuantity,
//           serialNumbersCount: item.serialNumbersCount,
//           hasSerialNumbers: item.hasSerialNumbers,
//           damagedQuantity: item.damagedQuantity,
//           effectiveAvailableQuantity: item.effectiveAvailableQuantity,
//         });
//       } else {
//         stockMap.set(item._id.toString(), {
//           totalQuantity: item.totalQuantity,
//           availableQuantity: item.availableQuantity,
//           inTransitQuantity: item.inTransitQuantity,
//           damagedQuantity: item.damagedQuantity,
//           availableSerialsCount: item.availableSerialsCount,
//           stockEntries: item.stockEntries,
//           effectiveAvailableQuantity: item.effectiveAvailableQuantity,
//         });
//       }
//     });

//     const productsWithStock = products.map((product) => {
//       const productId = product._id.toString();
      
//       // CORRECTED: Use the actual field name from ProductCategory model
//       const productCategory = product.productCategory ? {
//         _id: product.productCategory._id,
//         name: product.productCategory.productCategory // Corrected field name
//       } : null;

//       if (centerType === "Outlet") {
//         const stockData = stockMap.get(productId) || {
//           totalPurchased: 0,
//           totalAvailable: 0,
//           purchaseCount: 0,
//           currentTotalQuantity: 0,
//           currentAvailableQuantity: 0,
//           currentInTransitQuantity: 0,
//           serialNumbersCount: 0,
//           hasSerialNumbers: false,
//           damagedQuantity: 0,
//           effectiveAvailableQuantity: 0,
//         };

//         const stockInfo = {
//           totalPurchased: stockData.totalPurchased,
//           totalAvailable: stockData.totalAvailable,
//           purchaseCount: stockData.purchaseCount,
//           currentTotalQuantity: stockData.currentTotalQuantity,
//           currentAvailableQuantity: stockData.currentAvailableQuantity,
//           currentInTransitQuantity: stockData.currentInTransitQuantity,
//           serialNumbersCount: stockData.serialNumbersCount,
//           hasSerialNumbers: stockData.hasSerialNumbers,
//           damagedQuantity: stockData.damagedQuantity,
//           effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
//           currentStock: stockData.effectiveAvailableQuantity, // Use effective available as current stock
//         };

//         return {
//           ...product.toObject(),
//           productCategory: productCategory, // Now includes correct category name
//           stock: stockInfo,
//         };
//       } else {
//         const stockData = stockMap.get(productId) || {
//           totalQuantity: 0,
//           availableQuantity: 0,
//           inTransitQuantity: 0,
//           damagedQuantity: 0,
//           availableSerialsCount: 0,
//           stockEntries: 0,
//           effectiveAvailableQuantity: 0,
//         };

//         const stockInfo = {
//           totalQuantity: stockData.totalQuantity,
//           availableQuantity: stockData.availableQuantity,
//           inTransitQuantity: stockData.inTransitQuantity,
//           damagedQuantity: stockData.damagedQuantity,
//           availableSerialsCount: stockData.availableSerialsCount,
//           stockEntries: stockData.stockEntries,
//           effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
//           currentStock: stockData.effectiveAvailableQuantity, // Use effective available as current stock
//         };

//         return {
//           ...product.toObject(),
//           productCategory: productCategory, // Now includes correct category name
//           stock: stockInfo,
//         };
//       }
//     });

//     const totalStockSummary = {
//       totalProducts: productsWithStock.length,
//       totalItemsInStock: 0,
//       totalAvailableItems: 0,
//       totalInTransitItems: 0,
//       totalDamagedItems: 0,
//       totalEffectiveAvailableItems: 0,
//     };

//     productsWithStock.forEach((product) => {
//       if (centerType === "Outlet") {
//         totalStockSummary.totalItemsInStock += product.stock.currentTotalQuantity;
//         totalStockSummary.totalAvailableItems += product.stock.currentAvailableQuantity;
//         totalStockSummary.totalInTransitItems += product.stock.currentInTransitQuantity;
//         totalStockSummary.totalDamagedItems += product.stock.damagedQuantity;
//         totalStockSummary.totalEffectiveAvailableItems += product.stock.effectiveAvailableQuantity;
//       } else {
//         totalStockSummary.totalItemsInStock += product.stock.totalQuantity;
//         totalStockSummary.totalAvailableItems += product.stock.availableQuantity;
//         totalStockSummary.totalInTransitItems += product.stock.inTransitQuantity;
//         totalStockSummary.totalDamagedItems += product.stock.damagedQuantity;
//         totalStockSummary.totalEffectiveAvailableItems += product.stock.effectiveAvailableQuantity;
//       }
//     });

//     res.status(200).json({
//       success: true,
//       message: `Products with stock information retrieved successfully for ${centerType.toLowerCase()}`,
//       data: productsWithStock,
//       center: centerDetails,
//       stockSummary: {
//         centerType,
//         ...totalStockSummary,
//       },
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(totalProducts / limit),
//         totalItems: totalProducts,
//         itemsPerPage: parseInt(limit),
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving products with stock:", error);
//     handleControllerError(error, res);
//   }
// };

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

    const { page = 1, limit = 50, search, category } = req.query;

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

    const centerId = user.center._id;
    const centerType = user.center.centerType;

    // Build product filter with category population
    const productFilter = {};

    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      productFilter.category = category;
    }

    // Get products with category population
    const products = await Product.find(productFilter)
      .populate("productCategory", "productCategory")
      .select(
        "productTitle productCode description category productCategory productPrice trackSerialNumber productImage"
      )
      .sort({ productTitle: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalProducts = await Product.countDocuments(productFilter);

    let stockData = [];
    let centerDetails = null;

    if (centerType === "Outlet") {
      centerDetails = await Center.findById(centerId).select(
        "_id centerName centerCode centerType"
      );

      const productIds = products.map((product) => product._id);

      const outletStockData = await OutletStock.find({
        outlet: centerId,
        product: { $in: productIds },
      }).select(
        "product totalQuantity availableQuantity inTransitQuantity serialNumbers"
      );

      const purchaseData = await StockPurchase.aggregate([
        {
          $match: {
            outlet: centerId,
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
      ]);

      const outletStockMap = new Map();
      outletStockData.forEach((item) => {
        const damagedQuantity = item.serialNumbers.filter(
          sn => sn.status === "damaged"
        ).length;

        outletStockMap.set(item.product.toString(), {
          currentTotalQuantity: item.totalQuantity,
          currentAvailableQuantity: item.availableQuantity,
          currentInTransitQuantity: item.inTransitQuantity,
          serialNumbersCount: item.serialNumbers.length,
          hasSerialNumbers: item.serialNumbers.length > 0,
          damagedQuantity: damagedQuantity,
          effectiveAvailableQuantity: Math.max(0, item.availableQuantity - damagedQuantity),
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
          effectiveAvailableQuantity: outletStock?.effectiveAvailableQuantity || 0,
        };
      });
    } else if (centerType === "Center") {
      centerDetails = await Center.findById(centerId).select(
        "_id centerName centerCode centerType"
      );

      const productIds = products.map((product) => product._id);

      // Enhanced CenterStock aggregation with damaged quantity calculation
      stockData = await CenterStock.aggregate([
        {
          $match: {
            center: centerId,
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
                  cond: { $eq: ["$$serial.status", "damaged"] }
                }
              }
            },
            availableSerialsCount: {
              $size: {
                $filter: {
                  input: "$serialNumbers",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "available"] }
                }
              }
            }
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "product",
            foreignField: "_id",
            as: "productDetails"
          }
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true
          }
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
            trackSerialNumber: { $first: "$productDetails.trackSerialNumber" }
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
                  $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }]
                }
              }
            }
          }
        }
      ]);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid center type",
      });
    }

    const stockMap = new Map();
    stockData.forEach((item) => {
      if (centerType === "Outlet") {
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

    // Format data according to the desired structure
    const formattedProducts = products.map((product) => {
      const productId = product._id.toString();
      const productCategory = product.productCategory ? {
        _id: product.productCategory._id,
        name: product.productCategory.productCategory
      } : null;

      let stockInfo = {};
      
      if (centerType === "Outlet") {
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
          consumedQuantity: 0, // Not available for outlet
          damagedQuantity: stockData.damagedQuantity,
          availableSerialsCount: stockData.serialNumbersCount,
          consumedSerialsCount: 0, // Not available for outlet
          inTransitSerialsCount: 0, // Not available for outlet
          transferredSerialsCount: 0, // Not available for outlet
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
          consumedQuantity: 0, // You might need to calculate this
          damagedQuantity: stockData.damagedQuantity,
          availableSerialsCount: stockData.availableSerialsCount,
          consumedSerialsCount: 0, // You might need to calculate this
          inTransitSerialsCount: 0, // You might need to calculate this
          transferredSerialsCount: 0, // You might need to calculate this
          effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
        };
      }

      // Calculate stock status (similar to your example)
      const stockStatus = stockInfo.effectiveAvailableQuantity === 0 
        ? "out_of_stock" 
        : stockInfo.effectiveAvailableQuantity < 10 
          ? "low_stock" 
          : "in_stock";

      return {
        _id: product._id,
        product: product._id,
        productName: product.productTitle,
        productCode: product.productCode,
        productCategory: productCategory,
        trackSerialNumber: product.trackSerialNumber,
        center: centerId,
        centerName: centerDetails?.centerName || "Unknown Center",
        centerCode: centerDetails?.centerCode || "Unknown Code",
        centerType: centerType,
        ...stockInfo,
        stockStatus: stockStatus,
        lastUpdated: new Date().toISOString(),
        serialNumbers: [] // Empty array as in your example
      };
    });

    // Calculate summary statistics
    const summary = {
      totalProducts: formattedProducts.length,
      totalQuantity: formattedProducts.reduce((sum, product) => sum + product.totalQuantity, 0),
      totalAvailable: formattedProducts.reduce((sum, product) => sum + product.availableQuantity, 0),
      totalInTransit: formattedProducts.reduce((sum, product) => sum + product.inTransitQuantity, 0),
      totalConsumed: formattedProducts.reduce((sum, product) => sum + product.consumedQuantity, 0),
      totalDamaged: formattedProducts.reduce((sum, product) => sum + product.damagedQuantity, 0),
      totalEffectiveAvailable: formattedProducts.reduce((sum, product) => sum + product.effectiveAvailableQuantity, 0),
      lowStockItems: formattedProducts.filter(product => product.stockStatus === "low_stock").length,
      outOfStockItems: formattedProducts.filter(product => product.stockStatus === "out_of_stock").length,
      inStockItems: formattedProducts.filter(product => product.stockStatus === "in_stock").length,
    };

    res.status(200).json({
      success: true,
      message: `Products with stock information retrieved successfully for ${centerType.toLowerCase()}`,
      data: {
        stock: formattedProducts,
        summary: summary,
        center: centerDetails,
        filters: {
          centerId: centerId || "all",
          product: "all",
          search: search || "",
          category: category || "all",
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalProducts / limit),
          totalItems: totalProducts,
          itemsPerPage: parseInt(limit),
          hasNext: parseInt(page) < Math.ceil(totalProducts / limit),
          hasPrev: parseInt(page) > 1,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
        }
      },
    });
  } catch (error) {
    console.error("Error retrieving products with stock:", error);
    handleControllerError(error, res);
  }
};

export const getStockUsageByCenter = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
       "available_stock_own_center", "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      usageType,
      status,
      product,
      sortBy = "date",
      sortOrder = "desc",
      centerId,
    } = req.query;

    let targetCenterId;

    if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center
    ) {
      targetCenterId = userCenter?._id || userCenter;
    } else if (permissions.available_stock_all_center && centerId) {
      targetCenterId = centerId;
    } else {
      targetCenterId = userCenter?._id || userCenter;
    }

    if (!targetCenterId) {
      return res.status(400).json({
        success: false,
        message: "Center information not available",
      });
    }

    if (permissions.available_stock_all_center && centerId) {
      const targetCenter = await Center.findById(centerId);
      if (!targetCenter) {
        return res.status(404).json({
          success: false,
          message: "Specified center not found",
        });
      }
    }

    const center = await Center.findById(targetCenterId);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    const query = { center: targetCenterId };

    if (usageType && usageType !== "all") query.usageType = usageType;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (status && status !== "all") query.status = status;
    if (product) query["items.product"] = product;

    const total = await StockUsage.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // CORRECTED: Added center and createdBy population
    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode centerType") // Added center population
      .populate("customer", "name username mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email") // This should work now with proper population
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

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
          Date: usage.date.toLocaleDateString(),
          Type: usage.usageType,
          Center: usage.center?.centerName || "Unknown Center", // Now should work with populated center
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": damageQty,
          "New Stock": item.newStock || 0,
          Entity: entityName,
          Remark: usage.remark || "",
          Status: usage.status,
          "Created By": usage.createdBy?.name || "Unknown", // Now should work with populated createdBy
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    const summaryStats = await StockUsage.aggregate([
      { $match: query },
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

    // CORRECTED: Fixed permission check in response
    res.status(200).json({
      success: true,
      message: "Stock usage by center retrieved successfully",
      data: formattedData,
      center: {
        id: center._id,
        name: center.centerName,
        code: center.centerCode,
        type: center.centerType,
      },
      summary: {
        totalRecords: total,
        totalUsage,
        totalDamage,
        byUsageType: summaryStats,
      },
      permissions: {
        canViewAllCenters: permissions.available_stock_all_center, // Fixed field name
        canViewOwnCenter: permissions.available_stock_own_center, // Fixed field name
        currentAccess: permissions.available_stock_all_center // Fixed field name
          ? "all_centers"
          : "own_center",
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        usageType: usageType || "all",
        status: status || "all",
        product: product || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        center: centerId || "user_center",
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by center:", error);
    handleControllerError(error, res);
  }
};