
// import DamageReturn from "../models/DamageReturn.js";
// import StockUsage from "../models/StockUsage.js";
// import CenterStock from "../models/CenterStock.js";
// import mongoose from "mongoose";
// import User from "../models/User.js";

// const checkStockUsagePermissions = (req, requiredPermissions = []) => {
//     const userPermissions = req.user.role?.permissions || [];
//     const usageModule = userPermissions.find((perm) => perm.module === "Usage");
  
//     if (!usageModule) {
//       return { hasAccess: false, permissions: {} };
//     }
  
//     const permissions = {
//       manage_usage_own_center: usageModule.permissions.includes(
//         "manage_usage_own_center"
//       ),
//       manage_usage_all_center: usageModule.permissions.includes(
//         "manage_usage_all_center"
//       ),
//       view_usage_own_center: usageModule.permissions.includes(
//         "view_usage_own_center"
//       ),
//       view_usage_all_center: usageModule.permissions.includes(
//         "view_usage_all_center"
//       ),
//       allow_edit_usage: usageModule.permissions.includes("allow_edit_usage"),
//       accept_damage_return: usageModule.permissions.includes(
//         "accept_damage_return"
//       ),
//     };
  
//     const hasRequiredPermission = requiredPermissions.some(
//       (perm) => permissions[perm]
//     );
  
//     return {
//       hasAccess: hasRequiredPermission,
//       permissions,
//       userCenter: req.user.center,
//     };
//   };
  
//   const getUserCenterId = async (userId) => {
//     if (!userId) {
//       throw new Error("User ID is required");
//     }
  
//     const user = await User.findById(userId).populate(
//       "center",
//       "centerName centerCode centerType"
//     );
  
//     if (!user) {
//       throw new Error("User not found");
//     }
  
//     if (!user.center) {
//       throw new Error("User center information not found");
//     }
  
//     return user.center._id;
//   };


// export const createDamageReturn = async (req, res) => {
//   try {
//     const { hasAccess } = checkStockUsagePermissions(req, [
//       "manage_usage_own_center", 
//       "manage_usage_all_center"
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
//       });
//     }

//     const { 
//       usageId,      
//       serialNumber,
//       remark 
//     } = req.body;

//     const createdBy = req.user.id;
//     if (!usageId || !serialNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Usage ID and Serial Number are required"
//       });
//     }
//     const originalUsage = await StockUsage.findById(usageId)
//       .populate("center", "name centerType")
//       .populate("customer", "username name mobile")
//       .populate({
//         path: "items.product",
//         select: "productTitle productCode trackSerialNumber"
//       });

//     if (!originalUsage) {
//       return res.status(404).json({
//         success: false,
//         message: "Original stock usage record not found",
//       });
//     }
//     const userCenterId = await getUserCenterId(req.user._id);
//     if (originalUsage.center._id.toString() !== userCenterId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only create damage returns for your center."
//       });
//     }
//     const itemWithSerial = originalUsage.items.find(item => 
//       item.serialNumbers && item.serialNumbers.includes(serialNumber)
//     );

//     if (!itemWithSerial) {
//       return res.status(400).json({
//         success: false,
//         message: `Serial number ${serialNumber} not found in the original stock usage`
//       });
//     }
//     const existingDamageReturn = await DamageReturn.findOne({
//       originalUsageId: usageId,
//       serialNumber: serialNumber
//     });

//     if (existingDamageReturn) {
//       return res.status(400).json({
//         success: false,
//         message: `Damage return already exists for serial number ${serialNumber}`
//       });
//     }

//     const damageReturnData = {
//       originalUsageId: usageId,
//       center: originalUsage.center._id,
//       customer: originalUsage.customer._id,
//       product: itemWithSerial.product._id,
//       serialNumber: serialNumber,
//       remark: remark || `Serial ${serialNumber} marked as damaged`,
//       createdBy: createdBy,
//       status: "pending"
//     };

//     const damageReturn = new DamageReturn(damageReturnData);
//     await damageReturn.save();
//     await markSpecificSerialAsPendingDamage(
//       originalUsage.center._id, 
//       itemWithSerial.product._id, 
//       serialNumber, 
//       damageReturn._id
//     );

//     const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
//       .populate("center", "name centerType")
//       .populate("customer", "username name mobile")
//       .populate("product", "productTitle productCode")
//       .populate("createdBy", "name email");

//     res.status(201).json({
//       success: true,
//       message: `Damage return created for serial ${serialNumber} successfully`,
//       data: populatedDamageReturn
//     });

//   } catch (error) {
//     console.error("Create damage return error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to create damage return",
//     });
//   }
// };

// export const approveDamageReturn = async (req, res) => {
//     try {
//       const { hasAccess } = checkStockUsagePermissions(req, ["accept_damage_return"]);
  
//       if (!hasAccess) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. accept_damage_return permission required.",
//         });
//       }
  
//       const { id } = req.params;
//       const approvedBy = req.user.id;
  
//       if (!mongoose.Types.ObjectId.isValid(id)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid damage return ID",
//         });
//       }
  
//       const damageReturn = await DamageReturn.findById(id)
//         .populate("center", "name centerType")
//         .populate("customer", "username name mobile")
//         .populate("product", "productTitle productCode");
  
//       if (!damageReturn) {
//         return res.status(404).json({
//           success: false,
//           message: "Damage return record not found",
//         });
//       }
  
//       if (damageReturn.status !== "pending") {
//         return res.status(400).json({
//           success: false,
//           message: `Damage return is already ${damageReturn.status}`
//         });
//       }
  
//       console.log(`Approving damage return for serial: ${damageReturn.serialNumber}`);

//       await markSpecificSerialAsDamaged(
//         damageReturn.center._id,
//         damageReturn.product._id,
//         damageReturn.serialNumber,
//         damageReturn._id,
//         approvedBy
//       );

//       damageReturn.status = "approved";
//       damageReturn.approvedBy = approvedBy;
//       damageReturn.approvalDate = new Date();
//       await damageReturn.save();
  
//       console.log(`✓ Damage return ${id} approved successfully`);
  
//       const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
//         .populate("center", "name centerType")
//         .populate("customer", "username name mobile")
//         .populate("product", "productTitle productCode")
//         .populate("createdBy", "name email")
//         .populate("approvedBy", "name email");
  
//       res.json({
//         success: true,
//         message: "Damage return approved successfully",
//         data: populatedDamageReturn
//       });
  
//     } catch (error) {
//       console.error("Approve damage return error:", error);
//       res.status(500).json({
//         success: false,
//         message: error.message || "Failed to approve damage return",
//       });
//     }
//   };

// export const rejectDamageReturn = async (req, res) => {
//   try {
//     const { hasAccess } = checkStockUsagePermissions(req, ["accept_damage_return"]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. accept_damage_return permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { rejectionRemark } = req.body;
//     const rejectedBy = req.user.id;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid damage return ID",
//       });
//     }

//     const damageReturn = await DamageReturn.findById(id);

//     if (!damageReturn) {
//       return res.status(404).json({
//         success: false,
//         message: "Damage return record not found",
//       });
//     }

//     if (damageReturn.status !== "pending") {
//       return res.status(400).json({
//         success: false,
//         message: `Damage return is already ${damageReturn.status}`
//       });
//     }
//     await restoreSerialToAvailable(
//       damageReturn.center._id,
//       damageReturn.product._id,
//       damageReturn.serialNumber,
//       damageReturn._id,
//       rejectedBy
//     );
//     damageReturn.status = "rejected";
//     damageReturn.rejectedBy = rejectedBy;
//     damageReturn.rejectionRemark = rejectionRemark;
//     damageReturn.rejectionDate = new Date();
//     await damageReturn.save();

//     const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
//       .populate("center", "name centerType")
//       .populate("customer", "username name mobile")
//       .populate("product", "productTitle productCode")
//       .populate("createdBy", "name email")
//       .populate("rejectedBy", "name email");

//     res.json({
//       success: true,
//       message: "Damage return rejected successfully",
//       data: populatedDamageReturn
//     });

//   } catch (error) {
//     console.error("Reject damage return error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to reject damage return",
//     });
//   }
// };

// const markSpecificSerialAsPendingDamage = async (centerId, productId, specificSerialNumber, damageReturnId) => {
//   const centerStock = await CenterStock.findOne({
//     center: centerId,
//     product: productId
//   });

//   if (!centerStock) {
//     throw new Error("Center stock not found");
//   }

//   const serial = centerStock.serialNumbers.find(
//     sn => sn.serialNumber === specificSerialNumber && sn.status === "consumed"
//   );

//   if (!serial) {
//     throw new Error(`Serial number ${specificSerialNumber} not found or not in consumed status`);
//   }
//   serial.status = "damage_pending";
//   serial.transferHistory.push({
//     fromCenter: centerId,
//     transferDate: new Date(),
//     transferType: "damage_return_request",
//     referenceId: damageReturnId,
//     remark: "Pending damage return approval"
//   });

//   await centerStock.save();
// };

// const markSpecificSerialAsDamaged = async (centerId, productId, specificSerialNumber, damageReturnId, approvedBy) => {
//     const centerStock = await CenterStock.findOne({
//       center: centerId,
//       product: productId
//     });
  
//     if (!centerStock) {
//       throw new Error("Center stock not found");
//     }
//     const serial = centerStock.serialNumbers.find(
//       sn => sn.serialNumber === specificSerialNumber && sn.status === "damage_pending"
//     );
  
//     if (!serial) {
//       throw new Error(`Serial number ${specificSerialNumber} not found or not in pending damage status. Current status: ${centerStock.serialNumbers.find(sn => sn.serialNumber === specificSerialNumber)?.status || 'not found'}`);
//     }
//     serial.status = "damaged";
//     serial.transferHistory.push({
//       fromCenter: centerId,
//       transferDate: new Date(),
//       transferType: "damage_approved",
//       referenceId: damageReturnId,
//       remark: "Damage approved - marked as damaged",
//       approvedBy: approvedBy
//     });
  
//     await centerStock.save();
//     console.log(`✓ Serial ${specificSerialNumber} status updated from 'damage_pending' to 'damaged'`);
//   };

// export const getPendingDamageReturns = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
//       req,
//       ["view_usage_own_center", "view_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//       });
//     }

//     const { center, page = 1, limit = 10 } = req.query;

//     const filter = { status: "pending" };

//     if (permissions.view_usage_own_center && !permissions.view_usage_all_center && userCenter) {
//       filter.center = userCenter._id || userCenter;
//     } else if (center) {
//       filter.center = center;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const damageReturns = await DamageReturn.find(filter)
//       .populate("center", "name centerType")
//       .populate("customer", "username name mobile")
//       .populate("product", "productTitle productCode")
//       .populate("createdBy", "name email")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limitNum);

//     const total = await DamageReturn.countDocuments(filter);

//     res.json({
//       success: true,
//       data: damageReturns,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         totalRecords: total,
//         hasNext: pageNum < Math.ceil(total / limitNum),
//         hasPrev: pageNum > 1,
//       },
//     });
//   } catch (error) {
//     console.error("Get pending damage returns error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch pending damage returns",
//     });
//   }
// };

// export const getAllDamageReturns = async (req, res) => {
//     try {
//       const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
//         req,
//         ["view_usage_own_center", "view_usage_all_center"]
//       );
  
//       if (!hasAccess) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//         });
//       }
  
//       const {
//         center,
//         customer,
//         product,
//         status,
//         startDate,
//         endDate,
//         serialNumber,
//         page = 1,
//         limit = 10,
//         sortBy = "createdAt",
//         sortOrder = "desc",
//         search
//       } = req.query;
  
//       const filter = {};
  
//       if (permissions.view_usage_own_center && !permissions.view_usage_all_center && userCenter) {
//         filter.center = userCenter._id || userCenter;
//       } else if (center) {
//         filter.center = center;
//       }

//       if (customer) filter.customer = customer;
//       if (product) filter.product = product;
//       if (status) filter.status = status;
//       if (serialNumber) filter.serialNumber = { $regex: serialNumber, $options: 'i' };
//         if (startDate || endDate) {
//         filter.date = {};
//         if (startDate) filter.date.$gte = new Date(startDate);
//         if (endDate) filter.date.$lte = new Date(endDate);
//       }

//       if (search) {
//         filter.$or = [
//           { serialNumber: { $regex: search, $options: 'i' } },
//           { remark: { $regex: search, $options: 'i' } }
//         ];
//       }
  
//       const pageNum = parseInt(page);
//       const limitNum = parseInt(limit);
//       const skip = (pageNum - 1) * limitNum;
  
//       const sort = {};
//       sort[sortBy] = sortOrder === "desc" ? -1 : 1;
//       const damageReturns = await DamageReturn.find(filter)
//         .populate("center", "name centerType centerName centerCode")
//         .populate("customer", "username name mobile email")
//         .populate("product", "productTitle productCode category trackSerialNumber")
//         .populate("fromBuilding", "buildingName displayName")
//         .populate("toBuilding", "buildingName displayName")
//         .populate("fromControlRoom", "buildingName displayName")
//         .populate("createdBy", "name email")
//         .populate("approvedBy", "name email")
//         .populate("rejectedBy", "name email")
//         .sort(sort)
//         .skip(skip)
//         .limit(limitNum);
  
//       const total = await DamageReturn.countDocuments(filter);
//       const stats = await DamageReturn.aggregate([
//         { $match: filter },
//         {
//           $group: {
//             _id: "$status",
//             count: { $sum: 1 },
//             totalQuantity: { $sum: "$quantity" }
//           }
//         }
//       ]);
  
//       const totalPages = Math.ceil(total / limitNum);
  
//       res.json({
//         success: true,
//         data: damageReturns,
//         statistics: {
//           totalRecords: total,
//           statusDistribution: stats,
//           totalQuantity: stats.reduce((sum, stat) => sum + stat.totalQuantity, 0)
//         },
//         pagination: {
//           currentPage: pageNum,
//           totalPages,
//           totalRecords: total,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       });
//     } catch (error) {
//       console.error("Get all damage returns error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to fetch damage returns",
//       });
//     }
//   };




import DamageReturn from "../models/DamageReturn.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import mongoose from "mongoose";
import User from "../models/User.js";

const checkStockUsagePermissions = (req, requiredPermissions = []) => {
    const userPermissions = req.user.role?.permissions || [];
    const usageModule = userPermissions.find((perm) => perm.module === "Usage");
  
    if (!usageModule) {
      return { hasAccess: false, permissions: {} };
    }
  
    const permissions = {
      manage_usage_own_center: usageModule.permissions.includes(
        "manage_usage_own_center"
      ),
      manage_usage_all_center: usageModule.permissions.includes(
        "manage_usage_all_center"
      ),
      view_usage_own_center: usageModule.permissions.includes(
        "view_usage_own_center"
      ),
      view_usage_all_center: usageModule.permissions.includes(
        "view_usage_all_center"
      ),
      allow_edit_usage: usageModule.permissions.includes("allow_edit_usage"),
      accept_damage_return: usageModule.permissions.includes(
        "accept_damage_return"
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

export const createDamageReturn = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(req, [
      "manage_usage_own_center", 
      "manage_usage_all_center"
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { 
      usageId,      
      serialNumber,
      remark 
    } = req.body;

    const createdBy = req.user.id;
    if (!usageId || !serialNumber) {
      return res.status(400).json({
        success: false,
        message: "Usage ID and Serial Number are required"
      });
    }

    const originalUsage = await StockUsage.findById(usageId)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber"
      });

    if (!originalUsage) {
      return res.status(404).json({
        success: false,
        message: "Original stock usage record not found",
      });
    }

    const userCenterId = await getUserCenterId(req.user._id);
    if (originalUsage.center._id.toString() !== userCenterId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only create damage returns for your center."
      });
    }

    const itemWithSerial = originalUsage.items.find(item => 
      item.serialNumbers && item.serialNumbers.includes(serialNumber)
    );

    if (!itemWithSerial) {
      return res.status(400).json({
        success: false,
        message: `Serial number ${serialNumber} not found in the original stock usage`
      });
    }

    const existingDamageReturn = await DamageReturn.findOne({
      originalUsageId: usageId,
      serialNumber: serialNumber
    });

    if (existingDamageReturn) {
      return res.status(400).json({
        success: false,
        message: `Damage return already exists for serial number ${serialNumber}`
      });
    }

    // Create damage return data with type and usageType
    const damageReturnData = {
      originalUsageId: usageId,
      type: "Damage Return", // Always "Damage Return"
      usageType: originalUsage.usageType, // Copy from original stock usage
      center: originalUsage.center._id,
      customer: originalUsage.customer?._id,
      product: itemWithSerial.product._id,
      serialNumber: serialNumber,
      remark: remark || `Serial ${serialNumber} marked as damaged`,
      createdBy: createdBy,
      status: "pending"
    };

    // Copy additional fields based on usage type
    if (originalUsage.usageType === "Customer" && originalUsage.customer) {
      damageReturnData.customer = originalUsage.customer._id;
      damageReturnData.connectionType = originalUsage.connectionType;
      damageReturnData.packageAmount = originalUsage.packageAmount;
      damageReturnData.packageDuration = originalUsage.packageDuration;
      damageReturnData.onuCharges = originalUsage.onuCharges;
      damageReturnData.installationCharges = originalUsage.installationCharges;
      damageReturnData.reason = originalUsage.reason;
      damageReturnData.shiftingAmount = originalUsage.shiftingAmount;
      damageReturnData.wireChangeAmount = originalUsage.wireChangeAmount;
    }

    if (originalUsage.fromBuilding) {
      damageReturnData.fromBuilding = originalUsage.fromBuilding._id;
    }

    if (originalUsage.toBuilding) {
      damageReturnData.toBuilding = originalUsage.toBuilding._id;
    }

    if (originalUsage.fromControlRoom) {
      damageReturnData.fromControlRoom = originalUsage.fromControlRoom._id;
    }

    const damageReturn = new DamageReturn(damageReturnData);
    await damageReturn.save();

    await markSpecificSerialAsPendingDamage(
      originalUsage.center._id, 
      itemWithSerial.product._id, 
      serialNumber, 
      damageReturn._id
    );

    const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("product", "productTitle productCode")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: `Damage return created for serial ${serialNumber} successfully`,
      data: populatedDamageReturn
    });

  } catch (error) {
    console.error("Create damage return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create damage return",
    });
  }
};

// ... rest of your controller functions remain the same
export const approveDamageReturn = async (req, res) => {
    try {
      const { hasAccess } = checkStockUsagePermissions(req, ["accept_damage_return"]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. accept_damage_return permission required.",
        });
      }
  
      const { id } = req.params;
      const approvedBy = req.user.id;
  
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid damage return ID",
        });
      }
  
      const damageReturn = await DamageReturn.findById(id)
        .populate("center", "name centerType")
        .populate("customer", "username name mobile")
        .populate("product", "productTitle productCode");
  
      if (!damageReturn) {
        return res.status(404).json({
          success: false,
          message: "Damage return record not found",
        });
      }
  
      if (damageReturn.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Damage return is already ${damageReturn.status}`
        });
      }
  
      console.log(`Approving damage return for serial: ${damageReturn.serialNumber}`);
  
      // Mark serial as damaged in center stock
      await markSpecificSerialAsDamaged(
        damageReturn.center._id,
        damageReturn.product._id,
        damageReturn.serialNumber,
        damageReturn._id,
        approvedBy
      );
  
      // Update damage return status
      damageReturn.status = "approved";
      damageReturn.approvedBy = approvedBy;
      damageReturn.approvalDate = new Date();
      await damageReturn.save();
  
      console.log(`✓ Damage return ${id} approved successfully`);
  
      const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
        .populate("center", "name centerType")
        .populate("customer", "username name mobile")
        .populate("product", "productTitle productCode")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email");
  
      res.json({
        success: true,
        message: "Damage return approved successfully",
        data: populatedDamageReturn
      });
  
    } catch (error) {
      console.error("Approve damage return error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to approve damage return",
      });
    }
  };
  
export const rejectDamageReturn = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(req, ["accept_damage_return"]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. accept_damage_return permission required.",
      });
    }

    const { id } = req.params;
    const { rejectionRemark } = req.body;
    const rejectedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid damage return ID",
      });
    }

    const damageReturn = await DamageReturn.findById(id);

    if (!damageReturn) {
      return res.status(404).json({
        success: false,
        message: "Damage return record not found",
      });
    }

    if (damageReturn.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Damage return is already ${damageReturn.status}`
      });
    }
    await restoreSerialToAvailable(
      damageReturn.center._id,
      damageReturn.product._id,
      damageReturn.serialNumber,
      damageReturn._id,
      rejectedBy
    );
    damageReturn.status = "rejected";
    damageReturn.rejectedBy = rejectedBy;
    damageReturn.rejectionRemark = rejectionRemark;
    damageReturn.rejectionDate = new Date();
    await damageReturn.save();

    const populatedDamageReturn = await DamageReturn.findById(damageReturn._id)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("product", "productTitle productCode")
      .populate("createdBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: "Damage return rejected successfully",
      data: populatedDamageReturn
    });

  } catch (error) {
    console.error("Reject damage return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject damage return",
    });
  }
};

const markSpecificSerialAsPendingDamage = async (centerId, productId, specificSerialNumber, damageReturnId) => {
  const centerStock = await CenterStock.findOne({
    center: centerId,
    product: productId
  });

  if (!centerStock) {
    throw new Error("Center stock not found");
  }

  const serial = centerStock.serialNumbers.find(
    sn => sn.serialNumber === specificSerialNumber && sn.status === "consumed"
  );

  if (!serial) {
    throw new Error(`Serial number ${specificSerialNumber} not found or not in consumed status`);
  }
  serial.status = "damage_pending";
  serial.transferHistory.push({
    fromCenter: centerId,
    transferDate: new Date(),
    transferType: "damage_return_request",
    referenceId: damageReturnId,
    remark: "Pending damage return approval"
  });

  await centerStock.save();
};

const markSpecificSerialAsDamaged = async (centerId, productId, specificSerialNumber, damageReturnId, approvedBy) => {
    const centerStock = await CenterStock.findOne({
      center: centerId,
      product: productId
    });
  
    if (!centerStock) {
      throw new Error("Center stock not found");
    }
  
    // FIX: Look for serial number with 'damage_pending' status
    const serial = centerStock.serialNumbers.find(
      sn => sn.serialNumber === specificSerialNumber && sn.status === "damage_pending"
    );
  
    if (!serial) {
      throw new Error(`Serial number ${specificSerialNumber} not found or not in pending damage status. Current status: ${centerStock.serialNumbers.find(sn => sn.serialNumber === specificSerialNumber)?.status || 'not found'}`);
    }
  
    // Update status from 'damage_pending' to 'damaged'
    serial.status = "damaged";
    serial.transferHistory.push({
      fromCenter: centerId,
      transferDate: new Date(),
      transferType: "damage_approved",
      referenceId: damageReturnId,
      remark: "Damage approved - marked as damaged",
      approvedBy: approvedBy
    });
  
    await centerStock.save();
    console.log(`✓ Serial ${specificSerialNumber} status updated from 'damage_pending' to 'damaged'`);
  };

export const getPendingDamageReturns = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const { center, page = 1, limit = 100 } = req.query;

    const filter = { status: "pending" };

    if (permissions.view_usage_own_center && !permissions.view_usage_all_center && userCenter) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const damageReturns = await DamageReturn.find(filter)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("product", "productTitle productCode")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await DamageReturn.countDocuments(filter);

    res.json({
      success: true,
      data: damageReturns,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get pending damage returns error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending damage returns",
    });
  }
};

// export const getAllDamageReturns = async (req, res) => {
//     try {
//       const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
//         req,
//         ["view_usage_own_center", "view_usage_all_center"]
//       );
  
//       if (!hasAccess) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//         });
//       }
  
//       const {
//         center,
//         customer,
//         product,
//         status,
//         startDate,
//         endDate,
//         serialNumber,
//         page = 1,
//         limit = 10,
//         sortBy = "createdAt",
//         sortOrder = "desc",
//         search
//       } = req.query;
  
//       const filter = {};
  
//       if (permissions.view_usage_own_center && !permissions.view_usage_all_center && userCenter) {
//         filter.center = userCenter._id || userCenter;
//       } else if (center) {
//         filter.center = center;
//       }

//       if (customer) filter.customer = customer;
//       if (product) filter.product = product;
//       if (status) filter.status = status;
//       if (serialNumber) filter.serialNumber = { $regex: serialNumber, $options: 'i' };
//         if (startDate || endDate) {
//         filter.date = {};
//         if (startDate) filter.date.$gte = new Date(startDate);
//         if (endDate) filter.date.$lte = new Date(endDate);
//       }

//       if (search) {
//         filter.$or = [
//           { serialNumber: { $regex: search, $options: 'i' } },
//           { remark: { $regex: search, $options: 'i' } }
//         ];
//       }
  
//       const pageNum = parseInt(page);
//       const limitNum = parseInt(limit);
//       const skip = (pageNum - 1) * limitNum;
  
//       const sort = {};
//       sort[sortBy] = sortOrder === "desc" ? -1 : 1;
//       const damageReturns = await DamageReturn.find(filter)
//         .populate("center", "name centerType centerName centerCode")
//         .populate("customer", "username name mobile email")
//         .populate("product", "productTitle productCode category trackSerialNumber")
//         .populate("fromBuilding", "buildingName displayName")
//         .populate("toBuilding", "buildingName displayName")
//         .populate("fromControlRoom", "buildingName displayName")
//         .populate("createdBy", "name email")
//         .populate("approvedBy", "name email")
//         .populate("rejectedBy", "name email")
//         .sort(sort)
//         .skip(skip)
//         .limit(limitNum);
  
//       const total = await DamageReturn.countDocuments(filter);
//       const stats = await DamageReturn.aggregate([
//         { $match: filter },
//         {
//           $group: {
//             _id: "$status",
//             count: { $sum: 1 },
//             totalQuantity: { $sum: "$quantity" }
//           }
//         }
//       ]);
  
//       const totalPages = Math.ceil(total / limitNum);
  
//       res.json({
//         success: true,
//         data: damageReturns,
//         statistics: {
//           totalRecords: total,
//           statusDistribution: stats,
//           totalQuantity: stats.reduce((sum, stat) => sum + stat.totalQuantity, 0)
//         },
//         pagination: {
//           currentPage: pageNum,
//           totalPages,
//           totalRecords: total,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       });
//     } catch (error) {
//       console.error("Get all damage returns error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to fetch damage returns",
//       });
//     }
//   };


export const getAllDamageReturns = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
        req,
        ["view_usage_own_center", "view_usage_all_center"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
        });
      }
  
      const {
        center,
        customer,
        product,
        status,
        startDate,
        endDate,
        serialNumber,
        type,
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc",
        search
      } = req.query;
  
      const filter = {};
  
      if (permissions.view_usage_own_center && !permissions.view_usage_all_center && userCenter) {
        filter.center = userCenter._id || userCenter;
      } else if (center) {
        filter.center = center;
      }

      if (customer) filter.customer = customer;
      if (product) filter.product = product;
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (serialNumber) filter.serialNumber = { $regex: serialNumber, $options: 'i' };
        if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      if (search) {
        filter.$or = [
          { serialNumber: { $regex: search, $options: 'i' } },
          { remark: { $regex: search, $options: 'i' } },
          { type: { $regex: search, $options: 'i' } },
          { usageType: { $regex: search, $options: 'i' } }
        ];
      }
  
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
  
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
      const damageReturns = await DamageReturn.find(filter)
        .populate("center", "name centerType centerName centerCode")
        .populate("customer", "username name mobile email")
        .populate("product", "productTitle productCode category trackSerialNumber")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .populate("rejectedBy", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum);
  
      const total = await DamageReturn.countDocuments(filter);
      const stats = await DamageReturn.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalQuantity: { $sum: "$quantity" }
          }
        }
      ]);

      // Get type distribution statistics
      const typeStats = await DamageReturn.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 }
          }
        }
      ]);
  
      const totalPages = Math.ceil(total / limitNum);
  
      res.json({
        success: true,
        data: damageReturns,
        statistics: {
          totalRecords: total,
          statusDistribution: stats,
          typeDistribution: typeStats,
          totalQuantity: stats.reduce((sum, stat) => sum + stat.totalQuantity, 0)
        },
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalRecords: total,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      });
    } catch (error) {
      console.error("Get all damage returns error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch damage returns",
      });
    }
  };