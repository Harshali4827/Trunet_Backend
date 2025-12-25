import mongoose from "mongoose";
import ResellerStock from "../models/ResellerStock.js";
import Reseller from "../models/Reseller.js";
import Product from "../models/Product.js";
import Center from "../models/Center.js";
import ProductCategory from "../models/ProductCategory.js";

// Helper functions
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

// Permission check using existing "Available Stock" module
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
    userCenter: req.user.center, // User's assigned center
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
  } = query;

  const filter = {};

  // If user has access to own center only, get the reseller from their center
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    const resellerIdFromCenter = await getResellerFromCenter(userCenter._id || userCenter);
    
    if (resellerIdFromCenter) {
      filter.reseller = new mongoose.Types.ObjectId(resellerIdFromCenter);
    } else {
      // If no reseller found for the center, return empty filter (no access)
      return { noAccess: true };
    }
  } else if (resellerId || reseller) {
    // User specified a specific reseller
    const resellerFilterValue = resellerId || reseller;
    const resellerFilter = buildArrayFilter(resellerFilterValue);
    if (resellerFilter) filter.reseller = resellerFilter;
  } else if (centerId || center) {
    // User specified a center - get its reseller
    const centerFilterValue = centerId || center;
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

const buildProjectionStage = (includeSourceBreakdown = false) => {
  const baseProjection = {
    reseller: 1,
    product: 1,
    totalQuantity: 1,
    availableQuantity: 1,
    consumedQuantity: 1,
    damagedQuantity: 1,
    repairQuantity: 1,
    lastUpdated: 1,
    productName: "$productDetails.productTitle",
    productCode: "$productDetails.productCode",
    productCategory: {
      _id: "$categoryDetails._id",
      name: "$categoryDetails.productCategory",
    },
    trackSerialNumber: "$productDetails.trackSerialNumber",
    resellerName: "$resellerDetails.businessName",
    resellerCode: "$resellerDetails.code",
    resellerContactPerson: "$resellerDetails.contactPerson",
    resellerContactNumber: "$resellerDetails.mobile",
    resellerEmail: "$resellerDetails.email",
    
    // Serial counts
    availableSerialsCount: 1,
    consumedSerialsCount: 1,
    damagedSerialsCount: 1,
    underRepairSerialsCount: 1,
    repairedSerialsCount: 1,
    irreparableSerialsCount: 1,
    
    // Calculated fields
    effectiveAvailableQuantity: 1,
  };

  // Add sourceBreakdown only if requested
  if (includeSourceBreakdown) {
    baseProjection.sourceBreakdown = 1;
  }

  return baseProjection;
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

    // Get center and reseller info for the response
    let centerInfo = null;
    let resellerIdForInfo = null;

    if (filter.reseller) {
      if (typeof filter.reseller === 'object' && filter.reseller.$in) {
        resellerIdForInfo = filter.reseller.$in[0];
      } else {
        resellerIdForInfo = filter.reseller;
      }

      // Find center context
      if (userCenter && permissions.available_stock_own_center && !permissions.available_stock_all_center) {
        centerInfo = await Center.findById(userCenter._id || userCenter)
          .select("centerName centerCode centerType reseller")
          .lean();
      } else if (centerId || center) {
        const centerFilterValue = centerId || center;
        const centerFilter = buildArrayFilter(centerFilterValue);
        if (centerFilter) {
          centerInfo = await Center.findById(
            typeof centerFilter === 'object' ? centerFilter.$in?.[0] : centerFilter
          )
          .select("centerName centerCode centerType reseller")
          .lean();
        }
      }
    }

    // Aggregation pipeline for reseller stock
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
          from: "resellers",
          localField: "reseller",
          foreignField: "_id",
          as: "resellerDetails",
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
          path: "$resellerDetails",
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

    // Calculate serial-based quantities
    aggregationPipeline.push(
      {
        $addFields: {
          // Count serials by status
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
          
          // Calculate effective available quantity
          effectiveAvailableQuantity: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
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
          
          // Stock status based on threshold
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

    // Build projection stage
    const projectionStage = {
      $project: buildProjectionStage(includeSourceBreakdown === "true")
    };

    // Add serial numbers to projection if requested
    if (includeSerials === "true") {
      projectionStage.$project.serialNumbers = 1;
    }

    aggregationPipeline.push(projectionStage);

    // Create count pipeline (without skip/limit)
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: "total" });

    // Add sorting and pagination to main pipeline
    const sortConfig = {};
    const validSortFields = [
      "productName", "productCode", "resellerName", "resellerCode", 
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
      ResellerStock.aggregate(aggregationPipeline),
      ResellerStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // Summary statistics - fix for summary aggregation
    const summaryAggregationPipeline = [
      { $match: filter },
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
    ];

    // Build the group stage with conditional fields
    const groupStage = {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalQuantity: { $sum: "$totalQuantity" },
        totalAvailable: { $sum: "$availableQuantity" },
        totalConsumed: { $sum: "$consumedQuantity" },
        totalDamaged: { $sum: "$damagedQuantity" },
        totalRepair: { $sum: "$repairQuantity" },
        totalEffectiveAvailable: {
          $sum: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
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
                  0,
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    };

    // Only include source breakdown in summary if requested
    if (includeSourceBreakdown === "true") {
      groupStage.$group.totalDamageRepairSource = { $sum: "$sourceBreakdown.damageRepairQuantity" };
      groupStage.$group.totalCenterReturnSource = { $sum: "$sourceBreakdown.centerReturnQuantity" };
    }

    summaryAggregationPipeline.push(groupStage);

    const summaryStats = await ResellerStock.aggregate(summaryAggregationPipeline);

    const summary =
      summaryStats.length > 0
        ? summaryStats[0]
        : {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalRepair: 0,
            totalDamageRepairSource: includeSourceBreakdown === "true" ? 0 : undefined,
            totalCenterReturnSource: includeSourceBreakdown === "true" ? 0 : undefined,
            totalEffectiveAvailable: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
          };

    // Get reseller info
    let resellerInfo = null;
    if (filter.reseller && resellerIdForInfo) {
      try {
        resellerInfo = await Reseller.findById(resellerIdForInfo).select(
          "name code contactPerson mobile email address"
        );
      } catch (error) {
        console.error("Error fetching reseller info:", error);
      }
    }

    res.status(200).json({
      success: true,
      message: "Reseller stock data retrieved successfully",
      data: {
        stock: stockData,
        summary: {
          ...summary,
          inStockItems:
            summary.totalProducts -
            summary.lowStockItems -
            summary.outOfStockItems,
        },
        reseller: resellerInfo,
        center: centerInfo,
        filters: {
          reseller: resellerIdForInfo || "all",
          product: product || "all",
          search: search || "",
          lowStockThreshold: parseInt(lowStockThreshold),
          includeSerials: includeSerials === "true",
          includeSourceBreakdown: includeSourceBreakdown === "true",
          center: centerInfo ? centerInfo._id : (centerId || center || null),
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
      ...filterParams
    } = req.query;

    // Determine which reseller to show based on permissions
    let targetResellerId = null;
    let targetCenterId = null;
    let targetCenter = null;

    // If user has own center access only, use their center's reseller
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
      } else if (centerId || center) {
        const centerFilterValue = centerId || center;
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
        
        // Source breakdown
        sourceBreakdown: stockData.sourceBreakdown,
        
        // Calculated fields
        effectiveAvailableQuantity: stockData.effectiveAvailableQuantity,
        stockStatus: stockStatus,
        lastUpdated: new Date().toISOString(),
        serialNumbers: [],
      };
    });

    // Sort the results
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

