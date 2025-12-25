import mongoose from "mongoose";
import RepairTransfer from "../models/RepairTransfer.js";
import FaultyStock from "../models/FaultyStock.js";
import ResellerStock from "../models/ResellerStock.js"; 
import Product from '../models/Product.js';
import OutletStock from '../models/OutletStock.js'
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
  

  // export const transferToRepairCenter = async (req, res) => {
  //   try {
  //     const { hasAccess, userCenter } = checkStockUsagePermissions(
  //       req,
  //       ["manage_usage_own_center", "manage_usage_all_center"]
  //     );
  
  //     if (!hasAccess) {
  //       return res.status(403).json({
  //         success: false,
  //         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
  //       });
  //     }
  
  //     const { items, repairCenterId, transferRemark } = req.body;
  //     const transferredBy = req.user.id;
  
  //     if (!items || !Array.isArray(items) || items.length === 0) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Items array is required and cannot be empty",
  //       });
  //     }
  
  //     if (!repairCenterId) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Repair center ID is required",
  //       });
  //     }
  
  //     if (!mongoose.Types.ObjectId.isValid(repairCenterId)) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Invalid repair center ID format",
  //       });
  //     }
  
  //     // Validate items
  //     for (const item of items) {
  //       if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
  //         return res.status(400).json({
  //           success: false,
  //           message: `Invalid product ID: ${item.productId}`
  //         });
  //       }
  
  //       if (!item.quantity || item.quantity < 1) {
  //         return res.status(400).json({
  //           success: false,
  //           message: `Invalid quantity for product ${item.productId}`
  //         });
  //       }
  //     }
  
  //     const Center = mongoose.model("Center");
  //     const Product = mongoose.model("Product");
  //     const FaultyStock = mongoose.model("FaultyStock");
  //     const RepairTransfer = mongoose.model("RepairTransfer");
  
  //     const repairCenter = await Center.findById(repairCenterId);
  //     if (!repairCenter) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "Repair center not found",
  //       });
  //     }
  
  //     const transferResults = [];
  //     const errors = [];
      
  //     for (const item of items) {
  //       try {
  //         const { productId, quantity, serialNumbers, damageRemark } = item;
          
  //         const product = await Product.findById(productId);
  //         if (!product) {
  //           errors.push(`Product not found: ${productId}`);
  //           continue;
  //         }
  
  //         // Find existing faulty stock for this product from ANY center
  //         const existingFaultyStock = await FaultyStock.findOne({
  //           product: productId,
  //           overallStatus: "damaged"
  //         }).populate('center', 'centerName');
  
  //         if (!existingFaultyStock) {
  //           errors.push(`No faulty stock found for product: ${product.productTitle}`);
  //           continue;
  //         }
  
  //         if (existingFaultyStock.quantity < quantity) {
  //           errors.push(`Insufficient faulty stock quantity for ${product.productTitle}. Available: ${existingFaultyStock.quantity}, Requested: ${quantity}`);
  //           continue;
  //         }
  
  //         // Validate serial numbers if product tracks them
  //         if (product.trackSerialNumber === "Yes") {
  //           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
  //             errors.push(`Serial numbers are required for product: ${product.productTitle}`);
  //             continue;
  //           }
            
  //           if (serialNumbers.length !== quantity) {
  //             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${product.productTitle}`);
  //             continue;
  //           }
  
  //           // Verify serial numbers exist in the faulty stock
  //           const availableSerialNumbers = existingFaultyStock.serialNumbers.map(sn => sn.serialNumber);
  //           const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
            
  //           if (invalidSerials.length > 0) {
  //             errors.push(`Invalid serial numbers for product ${product.productTitle}: ${invalidSerials.join(', ')}`);
  //             continue;
  //           }
  //         }
  
  //         // Update the faulty stock - reduce quantity or remove if all transferred
  //         if (existingFaultyStock.quantity === quantity) {
  //           // Update status to "under_repair" instead of deleting
  //           existingFaultyStock.overallStatus = "under_repair";
            
  //           // Update serial numbers status if product tracks them
  //           if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
  //             existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
  //               if (serialNumbers.includes(sn.serialNumber)) {
  //                 return {
  //                   ...sn.toObject(),
  //                   status: "under_repair",
  //                   repairHistory: [
  //                     ...(sn.repairHistory || []),
  //                     {
  //                       date: new Date(),
  //                       status: "under_repair",
  //                       remark: damageRemark || "Transferred to repair center",
  //                       updatedBy: transferredBy,
  //                       cost: 0
  //                     }
  //                   ]
  //                 };
  //               }
  //               return sn;
  //             });
  //           }
            
  //           await existingFaultyStock.save();
  //         } else {
  //           // Reduce the quantity
  //           existingFaultyStock.quantity -= quantity;
            
  //           // Update serial numbers if product tracks them
  //           if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
  //             // Mark transferred serials as under_repair and keep them in the record
  //             existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
  //               if (serialNumbers.includes(sn.serialNumber)) {
  //                 return {
  //                   ...sn.toObject(),
  //                   status: "under_repair",
  //                   repairHistory: [
  //                     ...(sn.repairHistory || []),
  //                     {
  //                       date: new Date(),
  //                       status: "under_repair",
  //                       remark: damageRemark || "Transferred to repair center",
  //                       updatedBy: transferredBy,
  //                       cost: 0
  //                     }
  //                   ]
  //                 };
  //               }
  //               return sn;
  //             });
  //           }
            
  //           await existingFaultyStock.save();
  //         }
  
  //         const repairTransfer = new RepairTransfer({
  //           date: new Date(),
  //           faultyStock: existingFaultyStock._id,
  //           fromCenter: existingFaultyStock.center,
  //           toCenter: repairCenterId,
  //           product: productId,
  //           quantity: quantity,
  //           serialNumbers: serialNumbers ? serialNumbers.map(sn => ({
  //             serialNumber: sn,
  //             status: "under_repair",
  //             repairHistory: [{
  //               date: new Date(),
  //               status: "under_repair",
  //               remark: damageRemark || "Transferred to repair center",
  //               updatedBy: transferredBy,
  //               cost: 0
  //             }]
  //           })) : [],
  //           transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
  //           transferredBy: transferredBy,
  //           status: "transferred"
  //         });
  
  //         await repairTransfer.save();
  
  //         transferResults.push({
  //           product: product.productTitle,
  //           productCode: product.productCode,
  //           quantity: quantity,
  //           serialNumbers: serialNumbers || [],
  //           transferId: repairTransfer._id,
  //           fromCenter: existingFaultyStock.center.centerName,
  //           toCenter: repairCenter.centerName,
  //           status: "success"
  //         });
  
  //         console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity}) from ${existingFaultyStock.center.centerName}`);
  
  //       } catch (error) {
  //         errors.push(`Error processing ${item.productId}: ${error.message}`);
  //       }
  //     }
  //     if (errors.length > 0 && transferResults.length === 0) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Failed to transfer any items",
  //         errors: errors
  //       });
  //     }
  //     if (errors.length > 0) {
  //       return res.json({
  //         success: true,
  //         message: `Partially completed. ${transferResults.length} items transferred successfully, ${errors.length} failed`,
  //         data: {
  //           transferred: transferResults,
  //           errors: errors,
  //           repairCenter: {
  //             id: repairCenter._id,
  //             name: repairCenter.centerName,
  //             code: repairCenter.centerCode
  //           },
  //           totalItems: transferResults.length,
  //           totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
  //           totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
  //         }
  //       });
  //     }
  //     res.json({
  //       success: true,
  //       message: `Successfully transferred ${transferResults.length} items to repair center`,
  //       data: {
  //         transferred: transferResults,
  //         repairCenter: {
  //           id: repairCenter._id,
  //           name: repairCenter.centerName,
  //           code: repairCenter.centerCode
  //         },
  //         totalItems: transferResults.length,
  //         totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
  //         totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
  //       }
  //     });
  
  //   } catch (error) {
  //     console.error("Transfer to repair center error:", error);
  //     res.status(500).json({
  //       success: false,
  //       message: error.message || "Failed to transfer to repair center",
  //     });
  //   }
  // };



  // export const transferToRepairCenter = async (req, res) => {
  //   try {
  //     const { hasAccess, userCenter } = checkStockUsagePermissions(
  //       req,
  //       ["manage_usage_own_center", "manage_usage_all_center"]
  //     );
  
  //     if (!hasAccess) {
  //       return res.status(403).json({
  //         success: false,
  //         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
  //       });
  //     }
  
  //     const { items, repairCenterId, transferRemark } = req.body;
  //     const transferredBy = req.user.id;
  
  //     if (!items || !Array.isArray(items) || items.length === 0) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Items array is required and cannot be empty",
  //       });
  //     }
  
  //     if (!repairCenterId) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Repair center ID is required",
  //       });
  //     }
  
  //     if (!mongoose.Types.ObjectId.isValid(repairCenterId)) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Invalid repair center ID format",
  //       });
  //     }
  
  //     // Validate items
  //     for (const item of items) {
  //       if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
  //         return res.status(400).json({
  //           success: false,
  //           message: `Invalid product ID: ${item.productId}`
  //         });
  //       }
  
  //       if (!item.quantity || item.quantity < 1) {
  //         return res.status(400).json({
  //           success: false,
  //           message: `Invalid quantity for product ${item.productId}`
  //         });
  //       }
  //     }
  
  //     const Center = mongoose.model("Center");
  //     const Product = mongoose.model("Product");
  //     const FaultyStock = mongoose.model("FaultyStock");
  //     const RepairTransfer = mongoose.model("RepairTransfer");
  
  //     const repairCenter = await Center.findById(repairCenterId);
  //     if (!repairCenter) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "Repair center not found",
  //       });
  //     }
  
  //     const transferResults = [];
  //     const errors = [];
      
  //     for (const item of items) {
  //       try {
  //         const { productId, quantity, serialNumbers, damageRemark } = item;
          
  //         const product = await Product.findById(productId);
  //         if (!product) {
  //           errors.push(`Product not found: ${productId}`);
  //           continue;
  //         }
  
  //         // Find existing faulty stock for this product from ANY center
  //         const existingFaultyStock = await FaultyStock.findOne({
  //           product: productId,
  //           overallStatus: "damaged"
  //         }).populate('center', 'centerName');
  
  //         if (!existingFaultyStock) {
  //           errors.push(`No faulty stock found for product: ${product.productTitle}`);
  //           continue;
  //         }
  
  //         if (existingFaultyStock.quantity < quantity) {
  //           errors.push(`Insufficient faulty stock quantity for ${product.productTitle}. Available: ${existingFaultyStock.quantity}, Requested: ${quantity}`);
  //           continue;
  //         }
  
  //         // Validate serial numbers if product tracks them
  //         if (product.trackSerialNumber === "Yes") {
  //           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
  //             errors.push(`Serial numbers are required for product: ${product.productTitle}`);
  //             continue;
  //           }
            
  //           if (serialNumbers.length !== quantity) {
  //             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${product.productTitle}`);
  //             continue;
  //           }
  
  //           // Verify serial numbers exist in the faulty stock
  //           const availableSerialNumbers = existingFaultyStock.serialNumbers.map(sn => sn.serialNumber);
  //           const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
            
  //           if (invalidSerials.length > 0) {
  //             errors.push(`Invalid serial numbers for product ${product.productTitle}: ${invalidSerials.join(', ')}`);
  //             continue;
  //           }
  //         }
  
  //         // Update the faulty stock
  //         if (existingFaultyStock.quantity === quantity) {
  //           // All items transferred - update status to "under_repair"
  //           existingFaultyStock.overallStatus = "under_repair";
            
  //           // For serialized products, update individual serial numbers
  //           if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
  //             existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
  //               if (serialNumbers.includes(sn.serialNumber)) {
  //                 return {
  //                   ...sn.toObject(),
  //                   status: "under_repair",
  //                   repairHistory: [
  //                     ...(sn.repairHistory || []),
  //                     {
  //                       date: new Date(),
  //                       status: "under_repair",
  //                       remark: damageRemark || "Transferred to repair center",
  //                       updatedBy: transferredBy,
  //                       cost: 0
  //                     }
  //                   ]
  //                 };
  //               }
  //               return sn;
  //             });
  //           } else if (product.trackSerialNumber === "No") {
  //             // For non-serialized products, update the single serial number entry
  //             existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
  //               return {
  //                 ...sn.toObject(),
  //                 status: "under_repair",
  //                 repairHistory: [
  //                   ...(sn.repairHistory || []),
  //                   {
  //                     date: new Date(),
  //                     status: "under_repair",
  //                     remark: damageRemark || "Transferred to repair center",
  //                     updatedBy: transferredBy,
  //                     cost: 0
  //                   }
  //                 ]
  //               };
  //             });
  //           }
            
  //           await existingFaultyStock.save();
  //         } else {
  //           // Partial transfer - reduce quantity
  //           existingFaultyStock.quantity -= quantity;
            
  //           // For serialized products, update individual serial numbers
  //           if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
  //             existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
  //               if (serialNumbers.includes(sn.serialNumber)) {
  //                 return {
  //                   ...sn.toObject(),
  //                   status: "under_repair",
  //                   repairHistory: [
  //                     ...(sn.repairHistory || []),
  //                     {
  //                       date: new Date(),
  //                       status: "under_repair",
  //                       remark: damageRemark || "Transferred to repair center",
  //                       updatedBy: transferredBy,
  //                       cost: 0
  //                     }
  //                   ]
  //                 };
  //               }
  //               return sn;
  //             });
  //           } else if (product.trackSerialNumber === "No") {
  //             // For non-serialized products with partial transfer, we need to split the entry
  //             // Create a new entry for the transferred quantity
  //             const transferredSerial = {
  //               serialNumber: `NON-SERIAL-PARTIAL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
  //               status: "under_repair",
  //               repairHistory: [{
  //                 date: new Date(),
  //                 status: "under_repair",
  //                 remark: damageRemark || "Transferred to repair center",
  //                 updatedBy: transferredBy,
  //                 cost: 0
  //               }]
  //             };
              
  //             // Update the original entry to reduce its "virtual" quantity
  //             // For non-serialized products, we might represent quantity in the serial number
  //             const originalSerial = existingFaultyStock.serialNumbers[0];
  //             if (originalSerial && originalSerial.serialNumber.startsWith("NON-SERIAL-QTY-")) {
  //               const originalQty = parseInt(originalSerial.serialNumber.replace("NON-SERIAL-QTY-", ""));
  //               const remainingQty = originalQty - quantity;
                
  //               if (remainingQty > 0) {
  //                 originalSerial.serialNumber = `NON-SERIAL-QTY-${remainingQty}`;
  //               } else {
  //                 // If no remaining quantity, remove the serial entry
  //                 existingFaultyStock.serialNumbers = [];
  //               }
  //             }
              
  //             // Add the transferred serial entry
  //             existingFaultyStock.serialNumbers.push(transferredSerial);
  //           }
            
  //           // Update overall status
  //           existingFaultyStock.overallStatus = "under_repair";
            
  //           await existingFaultyStock.save();
  //         }
  
  //         // Prepare serial numbers for repair transfer
  //         let repairTransferSerials = [];
  //         if (product.trackSerialNumber === "Yes" && serialNumbers) {
  //           repairTransferSerials = serialNumbers.map(sn => ({
  //             serialNumber: sn,
  //             status: "under_repair",
  //             repairHistory: [{
  //               date: new Date(),
  //               status: "under_repair",
  //               remark: damageRemark || "Transferred to repair center",
  //               updatedBy: transferredBy,
  //               cost: 0
  //             }]
  //           }));
  //         } else if (product.trackSerialNumber === "No") {
  //           // For non-serialized products, create a placeholder serial for tracking
  //           repairTransferSerials = [{
  //             serialNumber: `NON-SERIAL-TRANSFER-${Date.now()}`,
  //             status: "under_repair",
  //             repairHistory: [{
  //               date: new Date(),
  //               status: "under_repair",
  //               remark: damageRemark || `Transferred ${quantity} non-serialized items to repair center`,
  //               updatedBy: transferredBy,
  //               cost: 0
  //             }]
  //           }];
  //         }
  
  //         // Create repair transfer record
  //         const repairTransfer = new RepairTransfer({
  //           date: new Date(),
  //           faultyStock: existingFaultyStock._id,
  //           fromCenter: existingFaultyStock.center,
  //           toCenter: repairCenterId,
  //           product: productId,
  //           quantity: quantity,
  //           serialNumbers: repairTransferSerials,
  //           transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
  //           transferredBy: transferredBy,
  //           status: "under_repair"  // This is the key fix - status should be "under_repair", not "transferred"
  //         });
  
  //         await repairTransfer.save();
  
  //         transferResults.push({
  //           product: product.productTitle,
  //           productCode: product.productCode,
  //           quantity: quantity,
  //           serialNumbers: serialNumbers || [],
  //           transferId: repairTransfer._id,
  //           fromCenter: existingFaultyStock.center.centerName,
  //           toCenter: repairCenter.centerName,
  //           status: "success"
  //         });
  
  //         console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity}) from ${existingFaultyStock.center.centerName}`);
  
  //       } catch (error) {
  //         errors.push(`Error processing ${item.productId}: ${error.message}`);
  //       }
  //     }
  
  //     // If there are errors and no successful transfers, return error
  //     if (errors.length > 0 && transferResults.length === 0) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Failed to transfer any items",
  //         errors: errors
  //       });
  //     }
  
  //     // If there are mixed results (some success, some errors)
  //     if (errors.length > 0) {
  //       return res.json({
  //         success: true,
  //         message: `Partially completed. ${transferResults.length} items transferred successfully, ${errors.length} failed`,
  //         data: {
  //           transferred: transferResults,
  //           errors: errors,
  //           repairCenter: {
  //             id: repairCenter._id,
  //             name: repairCenter.centerName,
  //             code: repairCenter.centerCode
  //           },
  //           totalItems: transferResults.length,
  //           totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
  //           totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
  //         }
  //       });
  //     }
  
  //     // All items transferred successfully
  //     res.json({
  //       success: true,
  //       message: `Successfully transferred ${transferResults.length} items to repair center`,
  //       data: {
  //         transferred: transferResults,
  //         repairCenter: {
  //           id: repairCenter._id,
  //           name: repairCenter.centerName,
  //           code: repairCenter.centerCode
  //         },
  //         totalItems: transferResults.length,
  //         totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
  //         totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
  //       }
  //     });
  
  //   } catch (error) {
  //     console.error("Transfer to repair center error:", error);
  //     res.status(500).json({
  //       success: false,
  //       message: error.message || "Failed to transfer to repair center",
  //     });
  //   }
  // };



  export const transferToRepairCenter = async (req, res) => {
    try {
      const { hasAccess,permissions, userCenter } = checkStockUsagePermissions(
        req,
        ["manage_usage_own_center", "manage_usage_all_center"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
        });
      }
  
      const { items, repairCenterId, transferRemark } = req.body;
      const transferredBy = req.user.id;
  
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Items array is required and cannot be empty",
        });
      }
  
      if (!repairCenterId) {
        return res.status(400).json({
          success: false,
          message: "Repair center ID is required",
        });
      }
  
      if (!mongoose.Types.ObjectId.isValid(repairCenterId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid repair center ID format",
        });
      }
  
      // Validate items
      for (const item of items) {
        if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid product ID: ${item.productId}`
          });
        }
  
        if (!item.quantity || item.quantity < 1) {
          return res.status(400).json({
            success: false,
            message: `Invalid quantity for product ${item.productId}`
          });
        }
      }
  
      const Center = mongoose.model("Center");
      const Product = mongoose.model("Product");
      const FaultyStock = mongoose.model("FaultyStock");
      const RepairTransfer = mongoose.model("RepairTransfer");
  
      const repairCenter = await Center.findById(repairCenterId);
      if (!repairCenter) {
        return res.status(404).json({
          success: false,
          message: "Repair center not found",
        });
      }
  
      const transferResults = [];
      const errors = [];
      
      for (const item of items) {
        try {
          const { productId, quantity, serialNumbers, damageRemark } = item;
          
          const product = await Product.findById(productId);
          if (!product) {
            errors.push(`Product not found: ${productId}`);
            continue;
          }

          // FIX: Check for current user's center if they don't have all-center access
          let faultyFilter = {
            product: productId
          };
          
          // Add center filter for users with only own center access
          if (!permissions.manage_usage_all_center && userCenter) {
            faultyFilter.center = userCenter._id || userCenter;
          }

          // Find existing faulty stock for this product
          // Modified to look for items with "damaged" serial numbers regardless of overallStatus
          const existingFaultyStocks = await FaultyStock.find(faultyFilter);
          
          if (!existingFaultyStocks || existingFaultyStocks.length === 0) {
            errors.push(`No faulty stock found for product: ${product.productTitle}`);
            continue;
          }

          // Find damaged serials across all faulty stock records for this product
          let allDamagedSerials = [];
          let totalAvailableDamaged = 0;
          let selectedFaultyStock = null;
          
          for (const faultyStock of existingFaultyStocks) {
            const damagedSerialsInRecord = faultyStock.serialNumbers.filter(
              sn => sn.status === "damaged"
            );
            
            if (damagedSerialsInRecord.length > 0) {
              allDamagedSerials = [...allDamagedSerials, ...damagedSerialsInRecord];
              totalAvailableDamaged += damagedSerialsInRecord.length;
              
              // Use the first record that has damaged items as our selected record
              if (!selectedFaultyStock) {
                selectedFaultyStock = faultyStock;
              }
            }
          }

          if (totalAvailableDamaged === 0) {
            errors.push(`No damaged items available for product: ${product.productTitle}. All items are either repaired, under repair, or irreparable.`);
            continue;
          }

          if (quantity > totalAvailableDamaged) {
            errors.push(`Insufficient damaged stock quantity for ${product.productTitle}. Available damaged items: ${totalAvailableDamaged}, Requested: ${quantity}`);
            continue;
          }

          // Validate serial numbers if product tracks them
          if (product.trackSerialNumber === "Yes") {
            if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
              // If no serial numbers provided, use the first N damaged serials
              const availableSerialNumbers = allDamagedSerials.map(sn => sn.serialNumber);
              const serialsToTransfer = availableSerialNumbers.slice(0, quantity);
              item.serialNumbers = serialsToTransfer;
            } else {
              // Validate provided serial numbers
              if (serialNumbers.length !== quantity) {
                errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${product.productTitle}`);
                continue;
              }

              const availableSerialNumbers = allDamagedSerials.map(sn => sn.serialNumber);
              const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
              
              if (invalidSerials.length > 0) {
                // Check if invalid serials exist but are not damaged
                const allSerials = existingFaultyStocks.flatMap(fs => fs.serialNumbers);
                const nonDamagedSerials = [];
                
                for (const invalidSn of invalidSerials) {
                  const serialInfo = allSerials.find(sn => sn.serialNumber === invalidSn);
                  if (serialInfo) {
                    nonDamagedSerials.push(`${invalidSn} (status: ${serialInfo.status})`);
                  }
                }
                
                if (nonDamagedSerials.length > 0) {
                  errors.push(`Cannot transfer serials with non-damaged status for product ${product.productTitle}: ${nonDamagedSerials.join(', ')}`);
                  continue;
                } else {
                  errors.push(`Invalid serial numbers for product ${product.productTitle}: ${invalidSerials.join(', ')}`);
                  continue;
                }
              }
            }
          } else {
            // For non-serialized products, ensure we're not exceeding available damaged quantity
            const damagedCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "damaged").length;
            if (quantity > damagedCount) {
              errors.push(`Insufficient damaged stock for ${product.productTitle}. Available: ${damagedCount}, Requested: ${quantity}`);
              continue;
            }
          }

          // Use the actual serials to transfer (either provided or auto-selected)
          const actualSerialsToTransfer = product.trackSerialNumber === "Yes" 
            ? (item.serialNumbers || []) 
            : [];

          console.log(`Processing transfer: ${product.productTitle}, Qty: ${quantity}, Serials:`, actualSerialsToTransfer);

          // Update the selected faulty stock record
          if (!selectedFaultyStock) {
            errors.push(`No valid faulty stock record found for product: ${product.productTitle}`);
            continue;
          }

          // Update serial numbers status to "under_repair"
          let updatedCount = 0;
          for (const serial of selectedFaultyStock.serialNumbers) {
            if (actualSerialsToTransfer.includes(serial.serialNumber)) {
              serial.status = "under_repair";
              
              // Add repair history entry
              serial.repairHistory = serial.repairHistory || [];
              serial.repairHistory.push({
                date: new Date(),
                status: "under_repair",
                remark: damageRemark || "Transferred to repair center",
                updatedBy: transferredBy,
                cost: 0
              });
              
              updatedCount++;
            }
          }

          if (updatedCount !== quantity) {
            errors.push(`Failed to update all serial numbers. Expected: ${quantity}, Updated: ${updatedCount}`);
            continue;
          }

          // Update faulty stock quantities
          selectedFaultyStock.underRepairQty = (selectedFaultyStock.underRepairQty || 0) + quantity;
          
          // Recalculate overall status
          const totalSerials = selectedFaultyStock.serialNumbers.length;
          const damagedCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "damaged").length;
          const underRepairCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "under_repair").length;
          const repairedCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "repaired").length;
          const irreparableCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "irreparable").length;

          // Update overall status based on current counts
          if (damagedCount > 0 && underRepairCount > 0) {
            selectedFaultyStock.overallStatus = "partially_repaired";
          } else if (damagedCount > 0) {
            selectedFaultyStock.overallStatus = "damaged";
          } else if (underRepairCount > 0) {
            selectedFaultyStock.overallStatus = "under_repair";
          } else if (repairedCount === totalSerials) {
            selectedFaultyStock.overallStatus = "repaired";
          } else if (irreparableCount === totalSerials) {
            selectedFaultyStock.overallStatus = "irreparable";
          }

          await selectedFaultyStock.save();

          // Prepare serial numbers for repair transfer
          let repairTransferSerials = [];
          if (product.trackSerialNumber === "Yes" && actualSerialsToTransfer.length > 0) {
            repairTransferSerials = actualSerialsToTransfer.map(sn => ({
              serialNumber: sn,
              status: "under_repair",
              repairHistory: [{
                date: new Date(),
                status: "under_repair",
                remark: damageRemark || "Transferred to repair center",
                updatedBy: transferredBy,
                cost: 0
              }]
            }));
          } else if (product.trackSerialNumber === "No") {
            // For non-serialized products, create a placeholder serial for tracking
            repairTransferSerials = [{
              serialNumber: `NON-SERIAL-TRANSFER-${Date.now()}`,
              status: "under_repair",
              repairHistory: [{
                date: new Date(),
                status: "under_repair",
                remark: damageRemark || `Transferred ${quantity} non-serialized items to repair center`,
                updatedBy: transferredBy,
                cost: 0
              }]
            }];
          }

          // Create repair transfer record
          const repairTransfer = new RepairTransfer({
            date: new Date(),
            faultyStock: selectedFaultyStock._id,
            fromCenter: selectedFaultyStock.center,
            toCenter: repairCenterId,
            product: productId,
            quantity: quantity,
            serialNumbers: repairTransferSerials,
            transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
            transferredBy: transferredBy,
            status: "under_repair"
          });

          await repairTransfer.save();

          transferResults.push({
            product: product.productTitle,
            productCode: product.productCode,
            quantity: quantity,
            serialNumbers: actualSerialsToTransfer,
            transferId: repairTransfer._id,
            fromCenter: selectedFaultyStock.center,
            toCenter: repairCenter.centerName,
            status: "success"
          });

          console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity})`);

        } catch (error) {
          console.error(`Error processing ${item.productId}:`, error);
          errors.push(`Error processing ${item.productId}: ${error.message}`);
        }
      }

      // If there are errors and no successful transfers, return error
      if (errors.length > 0 && transferResults.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Failed to transfer any items",
          errors: errors
        });
      }

      // If there are mixed results (some success, some errors)
      if (errors.length > 0) {
        return res.json({
          success: true,
          message: `Partially completed. ${transferResults.length} items transferred successfully, ${errors.length} failed`,
          data: {
            transferred: transferResults,
            errors: errors,
            repairCenter: {
              id: repairCenter._id,
              name: repairCenter.centerName,
              code: repairCenter.centerCode
            },
            totalItems: transferResults.length,
            totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
            totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
          }
        });
      }

      // All items transferred successfully
      res.json({
        success: true,
        message: `Successfully transferred ${transferResults.length} items to repair center`,
        data: {
          transferred: transferResults,
          repairCenter: {
            id: repairCenter._id,
            name: repairCenter.centerName,
            code: repairCenter.centerCode
          },
          totalItems: transferResults.length,
          totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
          totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0)
        }
      });

    } catch (error) {
      console.error("Transfer to repair center error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to transfer to repair center",
      });
    }
  };
  
  export const returnFromRepairCenter = async (req, res) => {
    try {
      const { hasAccess, userCenter } = checkStockUsagePermissions(
        req,
        ["manage_usage_own_center", "manage_usage_all_center"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
        });
      }
  
      const { items, returnRemark } = req.body;
      const returnedBy = req.user.id;
  
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Items array is required and cannot be empty",
        });
      }
  
      const RepairTransfer = mongoose.model("RepairTransfer");
      const FaultyStock = mongoose.model("FaultyStock");
      const CenterStock = mongoose.model("CenterStock");
      const Product = mongoose.model("Product");
  
      const returnResults = [];
      const errors = [];
      
      for (const item of items) {
        try {
          const { repairTransferId, productId, quantity, serialNumbers, finalStatus, repairCost, repairRemark } = item;
          
          if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
            errors.push(`Invalid final status for product: ${productId}. Must be "repaired" or "irreparable"`);
            continue;
          }
  
          const repairTransfer = await RepairTransfer.findById(repairTransferId);
          if (!repairTransfer) {
            errors.push(`Repair transfer not found: ${repairTransferId}`);
            continue;
          }
  
          if (repairTransfer.status === "returned") {
            errors.push(`Repair transfer already returned: ${repairTransferId}`);
            continue;
          }
  
          const product = await Product.findById(productId);
          if (!product) {
            errors.push(`Product not found: ${productId}`);
            continue;
          }
  
          // Update repair transfer status
          repairTransfer.status = "returned";
          repairTransfer.actualReturnDate = new Date();
          repairTransfer.totalRepairCost = repairCost || 0;
          
          // Add repair update
          repairTransfer.repairUpdates.push({
            date: new Date(),
            status: finalStatus,
            remark: repairRemark || `Returned as ${finalStatus}`,
            updatedBy: returnedBy,
            cost: repairCost || 0
          });
  
          // Update serial numbers status in repair transfer
          if (serialNumbers && serialNumbers.length > 0) {
            repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
              if (serialNumbers.includes(sn.serialNumber)) {
                return {
                  ...sn.toObject(),
                  status: finalStatus,
                  repairHistory: [
                    ...(sn.repairHistory || []),
                    {
                      date: new Date(),
                      status: finalStatus,
                      remark: repairRemark || `Repair completed - ${finalStatus}`,
                      updatedBy: returnedBy,
                      cost: repairCost || 0
                    }
                  ]
                };
              }
              return sn;
            });
          }
  
          await repairTransfer.save();
  
          // Update the original faulty stock
          const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
          if (faultyStock) {
            // Update serial numbers in faulty stock
            if (serialNumbers && serialNumbers.length > 0) {
              faultyStock.serialNumbers = faultyStock.serialNumbers.map(sn => {
                if (serialNumbers.includes(sn.serialNumber)) {
                  return {
                    ...sn.toObject(),
                    status: finalStatus,
                    repairHistory: [
                      ...(sn.repairHistory || []),
                      {
                        date: new Date(),
                        status: finalStatus,
                        remark: repairRemark || `Repair completed - ${finalStatus}`,
                        updatedBy: returnedBy,
                        cost: repairCost || 0
                      }
                    ]
                  };
                }
                return sn;
              });
            }
  
            // Update overall status based on all serial numbers
            faultyStock.updateOverallStatus();
            
            // If all items are repaired, update to repaired status
            if (finalStatus === "repaired" && faultyStock.overallStatus === "repaired") {
              faultyStock.repairDate = new Date();
            }
            
            // If irreparable, mark accordingly
            if (finalStatus === "irreparable") {
              faultyStock.overallStatus = "irreparable";
            }
  
            await faultyStock.save();
  
            // If repaired, add back to center stock
            if (finalStatus === "repaired") {
              const centerStock = await CenterStock.findOne({
                center: repairTransfer.fromCenter,
                product: productId
              });
  
              if (centerStock) {
                if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
                  // Add serial numbers back to center stock
                  for (const serialNumber of serialNumbers) {
                    const existingSerial = centerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
                    
                    if (!existingSerial) {
                      centerStock.serialNumbers.push({
                        serialNumber: serialNumber,
                        status: "available",
                        currentLocation: repairTransfer.fromCenter,
                        transferHistory: [{
                          fromCenter: repairTransfer.toCenter,
                          toCenter: repairTransfer.fromCenter,
                          transferDate: new Date(),
                          transferType: "return_from_repair",
                          referenceId: repairTransfer._id,
                          remark: `Returned from repair - ${finalStatus}`
                        }]
                      });
                    } else {
                      existingSerial.status = "available";
                      existingSerial.currentLocation = repairTransfer.fromCenter;
                      existingSerial.transferHistory.push({
                        fromCenter: repairTransfer.toCenter,
                        toCenter: repairTransfer.fromCenter,
                        transferDate: new Date(),
                        transferType: "return_from_repair",
                        referenceId: repairTransfer._id,
                        remark: `Returned from repair - ${finalStatus}`
                      });
                    }
                  }
                  
                  centerStock.availableQuantity += quantity;
                  centerStock.totalQuantity += quantity;
                } else {
                  // Non-serialized products
                  centerStock.availableQuantity += quantity;
                  centerStock.totalQuantity += quantity;
                }
                
                await centerStock.save();
              }
            }
          }
  
          returnResults.push({
            product: product.productTitle,
            productCode: product.productCode,
            quantity: quantity,
            serialNumbers: serialNumbers || [],
            finalStatus: finalStatus,
            repairCost: repairCost || 0,
            repairTransferId: repairTransfer._id,
            status: "success"
          });
  
          console.log(`✓ Returned from repair: ${product.productTitle} (Qty: ${quantity}) - Status: ${finalStatus}`);
  
        } catch (error) {
          errors.push(`Error processing return for ${item.productId}: ${error.message}`);
        }
      }
  
      // If there are errors and no successful returns, return error
      if (errors.length > 0 && returnResults.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Failed to return any items",
          errors: errors
        });
      }
  
      // If there are mixed results
      if (errors.length > 0) {
        return res.json({
          success: true,
          message: `Partially completed. ${returnResults.length} items returned successfully, ${errors.length} failed`,
          data: {
            returned: returnResults,
            errors: errors,
            totalItems: returnResults.length,
            totalQuantity: returnResults.reduce((sum, item) => sum + item.quantity, 0),
            repairedCount: returnResults.filter(item => item.finalStatus === "repaired").length,
            irreparableCount: returnResults.filter(item => item.finalStatus === "irreparable").length
          }
        });
      }
  
      // All items returned successfully
      res.json({
        success: true,
        message: `Successfully returned ${returnResults.length} items from repair center`,
        data: {
          returned: returnResults,
          totalItems: returnResults.length,
          totalQuantity: returnResults.reduce((sum, item) => sum + item.quantity, 0),
          repairedCount: returnResults.filter(item => item.finalStatus === "repaired").length,
          irreparableCount: returnResults.filter(item => item.finalStatus === "irreparable").length
        }
      });
  
    } catch (error) {
      console.error("Return from repair center error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to return from repair center",
      });
    }
  };

export const getRepairTransfersForCenter = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
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
      status,
      page = 1,
      limit = 100,
    } = req.query;

    // const RepairTransfer = mongoose.model("RepairTransfer");
    
    const filter = {
      toCenter: userCenter?._id || req.user.center
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await RepairTransfer.countDocuments(filter);
    const dashboardStats = await RepairTransfer.aggregate([
      { $match: { toCenter: userCenter?._id || req.user.center } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);

    res.json({
      success: true,
      data: repairTransfers,
      dashboardStats: dashboardStats,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Get repair transfers for center error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair transfers for center",
    });
  }
};

export const getDamagedAndUnderRepairSerials = async (req, res) => {
  try {
    const { productId } = req.params;
    const { centerId, status = 'all' } = req.query;
    
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required"
      });
    }

    // const FaultyStock = mongoose.model("FaultyStock");
    // const RepairTransfer = mongoose.model("RepairTransfer");
    const Product = mongoose.model("Product");

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const faultyStockFilter = { product: productId };
    const repairTransferFilter = { product: productId };

    if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
      faultyStockFilter.center = centerId;
      repairTransferFilter.$or = [
        { fromCenter: centerId },
        { toCenter: centerId }
      ];
    }
    const statusFilter = [];
    if (status === 'all' || status === 'damaged') {
      statusFilter.push("damaged");
    }
    if (status === 'all' || status === 'under_repair') {
      statusFilter.push("under_repair");
    }

    const faultyStocks = await FaultyStock.find(faultyStockFilter)
      .populate("center", "centerName centerCode")
      .populate("reseller", "resellerName")
      .select("serialNumbers center overallStatus damageDate");

    const repairTransfers = await RepairTransfer.find(repairTransferFilter)
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .select("serialNumbers fromCenter toCenter status transferDate");

    const allSerialNumbers = [];

    faultyStocks.forEach(stock => {
      stock.serialNumbers.forEach(serial => {
        if (statusFilter.includes(serial.status)) {
          allSerialNumbers.push({
            serialNumber: serial.serialNumber,
            status: serial.status,
      
            center: {
              id: stock.center._id,
              name: stock.center.centerName,
            },
            repairRemark: serial.repairRemark,
            recordId: stock._id
          });
        }
      });
    });
    repairTransfers.forEach(transfer => {
      transfer.serialNumbers.forEach(serial => {
        if (statusFilter.includes(serial.status)) {
          allSerialNumbers.push({
            serialNumber: serial.serialNumber,
            status: serial.status,
            source: "repair_transfer",
            fromCenter: {
              id: transfer.fromCenter._id,
              name: transfer.fromCenter.centerName,
              code: transfer.fromCenter.centerCode
            },
            toCenter: {
              id: transfer.toCenter._id,
              name: transfer.toCenter.centerName,
              code: transfer.toCenter.centerCode
            },
            transferDate: transfer.date,
            transferStatus: transfer.status,
            repairHistory: serial.repairHistory || [],
            recordId: transfer._id
          });
        }
      });
    });

    const uniqueSerials = [];
    const seenSerials = new Set();

    allSerialNumbers.sort((a, b) => {
      if (a.source === b.source) return 0;
      return a.source === "repair_transfer" ? 1 : -1;
    });

    allSerialNumbers.forEach(serial => {
      if (!seenSerials.has(serial.serialNumber)) {
        seenSerials.add(serial.serialNumber);
        uniqueSerials.push(serial);
      }
    });
    const statusSummary = {
      damaged: uniqueSerials.filter(s => s.status === "damaged").length,
      under_repair: uniqueSerials.filter(s => s.status === "under_repair").length,
      total: uniqueSerials.length
    };
    const centerSummary = {};
    uniqueSerials.forEach(serial => {
      const centerId = serial.center ? serial.center.id : serial.fromCenter.id;
      const centerName = serial.center ? serial.center.name : serial.fromCenter.name;
      
      if (!centerSummary[centerId]) {
        centerSummary[centerId] = {
          centerId: centerId,
          centerName: centerName,
          damaged: 0,
          under_repair: 0,
          total: 0
        };
      }
      
      centerSummary[centerId][serial.status]++;
      centerSummary[centerId].total++;
    });

    res.json({
      success: true,
      data: {
        product: {
          _id: product._id,
          title: product.productTitle,
          code: product.productCode,
          trackSerialNumber: product.trackSerialNumber
        },
        availableSerials: uniqueSerials,
        summary: {
          status: statusSummary,
          centers: Object.values(centerSummary),
          sources: {
            faulty_stock: uniqueSerials.filter(s => s.source === "faulty_stock").length,
            repair_transfer: uniqueSerials.filter(s => s.source === "repair_transfer").length
          }
        },
        filters: {
          productId,
          centerId: centerId || 'all',
          status
        }
      }
    });

  } catch (error) {
    console.error("Get damaged and under repair serials error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch damaged and under repair serial numbers"
    });
  }
};

// export const markAsRepairedOrIrreparable = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["manage_usage_own_center", "manage_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
//       });
//     }

//     const { date, remark, items } = req.body;
//     const updatedBy = req.user.id;
//     const repairCenterId = userCenter?._id || req.user.center; // Current user's repair center

//     if (!date) {
//       return res.status(400).json({
//         success: false,
//         message: "Date is required"
//       });
//     }

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Items array is required and cannot be empty",
//       });
//     }

//     // const RepairTransfer = mongoose.model("RepairTransfer");
//     // const FaultyStock = mongoose.model("FaultyStock");
//     const Product = mongoose.model("Product");

//     const results = [];
//     const errors = [];

//     for (const item of items) {
//       try {
//         const { product, quantity, serialNumbers, productRemark, finalStatus, repairCost = 0 } = item;

//         if (!product || !mongoose.Types.ObjectId.isValid(product)) {
//           errors.push(`Invalid product ID: ${product}`);
//           continue;
//         }

//         if (!quantity || quantity < 1) {
//           errors.push(`Invalid quantity for product ${product}`);
//           continue;
//         }

//         if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
//           errors.push(`Invalid final status for product ${product}. Must be "repaired" or "irreparable"`);
//           continue;
//         }

//         const productDoc = await Product.findById(product);
//         if (!productDoc) {
//           errors.push(`Product not found: ${product}`);
//           continue;
//         }

//         // Find repair transfer at current repair center
//         const repairTransfer = await RepairTransfer.findOne({
//           product: product,
//           toCenter: repairCenterId,
//           status: { $in: ["transferred", "in_repair", "under_repair"] }
//         }).populate("fromCenter", "centerName centerCode");

//         if (!repairTransfer) {
//           errors.push(`No active repair transfer found for product: ${productDoc.productTitle} at your repair center`);
//           continue;
//         }

//         // Check available quantity - only count items that are under repair
//         const availableForRepair = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "under_repair"
//         );
        
//         if (availableForRepair.length < quantity) {
//           errors.push(`Insufficient items available for marking as ${finalStatus}. Available for repair: ${availableForRepair.length}, Requested: ${quantity} for ${productDoc.productTitle}`);
//           continue;
//         }

//         // Validate serial numbers for serialized products
//         if (productDoc.trackSerialNumber === "Yes") {
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           // Verify serial numbers exist and are in "under_repair" status
//           const availableSerialNumbers = availableForRepair.map(sn => sn.serialNumber);
//           const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
          
//           if (invalidSerials.length > 0) {
//             errors.push(`Invalid serial numbers or not under repair: ${invalidSerials.join(', ')} for product ${productDoc.productTitle}`);
//             continue;
//           }
//         }

//         // Update RepairTransfer serial numbers status
//         let updatedSerialsCount = 0;
        
//         if (productDoc.trackSerialNumber === "Yes" && serialNumbers) {
//           repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//             if (serialNumbers.includes(sn.serialNumber)) {
//               updatedSerialsCount++;
//               return {
//                 ...sn.toObject(),
//                 status: finalStatus,
//                 repairHistory: [
//                   ...(sn.repairHistory || []),
//                   {
//                     date: new Date(date),
//                     status: finalStatus,
//                     remark: productRemark || remark || `Marked as ${finalStatus}`,
//                     updatedBy: updatedBy,
//                     cost: repairCost || 0
//                   }
//                 ]
//               };
//             }
//             return sn;
//           });
//         } else {
//           // For non-serialized products, update the first X items that are "under_repair"
//           let remainingToUpdate = quantity;
//           repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//             if (remainingToUpdate > 0 && sn.status === "under_repair") {
//               remainingToUpdate--;
//               updatedSerialsCount++;
//               return {
//                 ...sn.toObject(),
//                 status: finalStatus,
//                 repairHistory: [
//                   ...(sn.repairHistory || []),
//                   {
//                     date: new Date(date),
//                     status: finalStatus,
//                     remark: productRemark || remark || `Marked as ${finalStatus}`,
//                     updatedBy: updatedBy,
//                     cost: repairCost || 0
//                   }
//                 ]
//               };
//             }
//             return sn;
//           });
//         }

//         // Check if we updated the correct quantity
//         if (updatedSerialsCount !== quantity) {
//           errors.push(`Failed to update ${quantity} items. Only updated ${updatedSerialsCount} items for ${productDoc.productTitle}`);
//           continue;
//         }

//         // Update RepairTransfer overall status
//         const remainingUnderRepair = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "under_repair"
//         ).length;
        
//         const totalRepaired = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "repaired"
//         ).length;
        
//         const totalIrreparable = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "irreparable"
//         ).length;

//         // Determine overall transfer status
//         if (remainingUnderRepair === 0) {
//           if (totalRepaired === repairTransfer.quantity) {
//             repairTransfer.status = "repaired";
//           } else if (totalIrreparable === repairTransfer.quantity) {
//             repairTransfer.status = "irreparable";
//           } else {
//             repairTransfer.status = "partially_repaired";
//           }
//         } else {
//           repairTransfer.status = "in_repair";
//         }

//         // Add repair update
//         repairTransfer.repairUpdates.push({
//           date: new Date(date),
//           status: finalStatus,
//           remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
//           updatedBy: updatedBy,
//           cost: repairCost * quantity
//         });

//         if (finalStatus === "repaired") {
//           repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + (repairCost * quantity);
//         }

//         await repairTransfer.save();

//         // Update FaultyStock (only status update, no CenterStock changes)
//         const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
//         if (faultyStock) {
//           if (productDoc.trackSerialNumber === "Yes" && serialNumbers) {
//             faultyStock.serialNumbers = faultyStock.serialNumbers.map(sn => {
//               if (serialNumbers.includes(sn.serialNumber)) {
//                 return {
//                   ...sn.toObject(),
//                   status: finalStatus,
//                   repairHistory: [
//                     ...(sn.repairHistory || []),
//                     {
//                       date: new Date(date),
//                       status: finalStatus,
//                       remark: productRemark || remark || `Marked as ${finalStatus}`,
//                       updatedBy: updatedBy,
//                       cost: repairCost || 0
//                     }
//                   ]
//                 };
//               }
//               return sn;
//             });
//           } else {
//             // For non-serialized, update matching serial numbers
//             let remainingToUpdateInFaulty = quantity;
//             faultyStock.serialNumbers = faultyStock.serialNumbers.map(sn => {
//               if (remainingToUpdateInFaulty > 0 && sn.status === "under_repair") {
//                 remainingToUpdateInFaulty--;
//                 return {
//                   ...sn.toObject(),
//                   status: finalStatus,
//                   repairHistory: [
//                     ...(sn.repairHistory || []),
//                     {
//                       date: new Date(date),
//                       status: finalStatus,
//                       remark: productRemark || remark || `Marked as ${finalStatus}`,
//                       updatedBy: updatedBy,
//                       cost: repairCost || 0
//                     }
//                   ]
//                 };
//               }
//               return sn;
//             });
//           }

//           // Update faulty stock overall status
//           faultyStock.updateOverallStatus();
          
//           if (finalStatus === "repaired") {
//             faultyStock.repairDate = new Date(date);
//           }
          
//           await faultyStock.save();
//         }

//         results.push({
//           product: productDoc.productTitle,
//           productCode: productDoc.productCode,
//           quantity: quantity,
//           serialNumbers: serialNumbers || [],
//           finalStatus: finalStatus,
//           repairTransferId: repairTransfer._id,
//           fromCenter: repairTransfer.fromCenter.centerName,
//           repairCenterId: repairCenterId,
//           status: "success",
//           message: `Marked ${quantity} items as ${finalStatus}`
//         });

//         console.log(`✓ Marked as ${finalStatus}: ${productDoc.productTitle} (Qty: ${quantity}) at repair center`);

//       } catch (error) {
//         errors.push(`Error processing ${item.product}: ${error.message}`);
//       }
//     }

//     if (errors.length > 0 && results.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to process any items",
//         errors: errors
//       });
//     }

//     if (errors.length > 0) {
//       return res.json({
//         success: true,
//         message: `Partially completed. ${results.length} items processed successfully, ${errors.length} failed`,
//         data: {
//           processed: results,
//           errors: errors,
//           totalItems: results.length,
//           totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
//           repairedCount: results.filter(item => item.finalStatus === "repaired").length,
//           irreparableCount: results.filter(item => item.finalStatus === "irreparable").length
//         }
//       });
//     }

//     res.json({
//       success: true,
//       message: `Successfully processed ${results.length} items`,
//       data: {
//         processed: results,
//         totalItems: results.length,
//         totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
//         repairedCount: results.filter(item => item.finalStatus === "repaired").length,
//         irreparableCount: results.filter(item => item.finalStatus === "irreparable").length
//       }
//     });

//   } catch (error) {
//     console.error("Mark as repaired/irreparable error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to process repair status",
//     });
//   }
// };
export const markAsRepairedOrIrreparable = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { date, remark, items } = req.body;
    const updatedBy = req.user.id;
    const repairCenterId = userCenter?._id || req.user.center;

    console.log("=== MARK AS REPAIRED/IRREPAIRABLE REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required"
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required and cannot be empty",
      });
    }

    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");
    const Product = mongoose.model("Product");

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        console.log("Processing item:", JSON.stringify(item, null, 2));
        
        const { 
          product,
          quantity, 
          serialNumbers = [], 
          productRemark, 
          finalStatus, 
          repairCost = 0,
          repairTransferId 
        } = item;

        console.log("Product field:", product);

        // Validate required fields
        if (!product || !mongoose.Types.ObjectId.isValid(product)) {
          errors.push(`Invalid product ID: ${product || 'undefined'}`);
          continue;
        }

        if (!quantity || quantity < 1) {
          errors.push(`Invalid quantity for product ${product}. Quantity: ${quantity}`);
          continue;
        }

        if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
          errors.push(`Invalid final status for product ${product}. Must be "repaired" or "irreparable". Received: ${finalStatus}`);
          continue;
        }

        const productDoc = await Product.findById(product);
        if (!productDoc) {
          errors.push(`Product not found: ${product}`);
          continue;
        }

        console.log(`Product found: ${productDoc.productTitle} (Track serial: ${productDoc.trackSerialNumber})`);

        // Find repair transfer
        let repairTransfer;
        if (repairTransferId) {
          repairTransfer = await RepairTransfer.findById(repairTransferId);
        } else {
          // Find repair transfers for this product at the repair center
          repairTransfer = await RepairTransfer.findOne({
            product: product,
            toCenter: repairCenterId,
            status: { $in: ["transferred", "in_repair", "under_repair", "partially_repaired"] }
          }).populate("product", "productTitle productCode trackSerialNumber");
        }

        if (!repairTransfer) {
          errors.push(`No active repair transfer found for product: ${productDoc.productTitle} at your repair center`);
          continue;
        }

        console.log(`Repair transfer found: ${repairTransfer._id}, Status: ${repairTransfer.status}`);

        // Verify the repair transfer is at current center
        if (repairTransfer.toCenter.toString() !== repairCenterId.toString()) {
          errors.push(`This repair transfer does not belong to your repair center. Transfer center: ${repairTransfer.toCenter}, Your center: ${repairCenterId}`);
          continue;
        }

        // Get the associated faulty stock
        const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
        if (!faultyStock) {
          errors.push(`Associated faulty stock not found for repair transfer: ${repairTransfer._id}`);
          continue;
        }

        console.log(`Faulty stock found: ${faultyStock._id}, Quantity: ${faultyStock.quantity}`);

        // Handle based on product type
        if (productDoc.trackSerialNumber === "No") {
          // NON-SERIALIZED PRODUCTS - QUANTITY BASED (NO SERIALS)
          console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
          // Check available under repair quantity
          const availableUnderRepair = repairTransfer.underRepairQty || 
            (repairTransfer.quantity - (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0));
          
          console.log(`Available under repair: ${availableUnderRepair}, Requested: ${quantity}`);
          
          if (availableUnderRepair < quantity) {
            errors.push(`Insufficient items available for marking as ${finalStatus}. Available under repair: ${availableUnderRepair}, Requested: ${quantity} for ${productDoc.productTitle}`);
            continue;
          }

          // Update repair transfer quantities
          if (finalStatus === "repaired") {
            repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + quantity;
          } else if (finalStatus === "irreparable") {
            repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + quantity;
          }

          // Update repair transfer under repair quantity
          repairTransfer.underRepairQty = repairTransfer.quantity - 
            (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0);

          // Update serial numbers array (for non-serialized, we maintain a placeholder)
          if (repairTransfer.serialNumbers.length === 0) {
            // Create a placeholder serial for non-serialized product
            repairTransfer.serialNumbers = [{
              serialNumber: `NON-SERIAL-${repairTransfer._id}`,
              status: "under_repair",
              quantity: repairTransfer.quantity
            }];
          }
          
          // Update the serial status based on overall quantities
          const repairTransferSerial = repairTransfer.serialNumbers[0];
          if (repairTransferSerial) {
            if (finalStatus === "repaired") {
              repairTransferSerial.repairedQty = (repairTransferSerial.repairedQty || 0) + quantity;
            } else if (finalStatus === "irreparable") {
              repairTransferSerial.irrepairedQty = (repairTransferSerial.irrepairedQty || 0) + quantity;
            }
            
            repairTransferSerial.underRepairQty = repairTransferSerial.quantity - 
              (repairTransferSerial.repairedQty || 0) - (repairTransferSerial.irrepairedQty || 0);
            
            // Update serial status
            if (repairTransferSerial.underRepairQty === 0) {
              if (repairTransferSerial.repairedQty === repairTransferSerial.quantity) {
                repairTransferSerial.status = "repaired";
              } else if (repairTransferSerial.irrepairedQty === repairTransferSerial.quantity) {
                repairTransferSerial.status = "irreparable";
              }
            } else {
              repairTransferSerial.status = "under_repair";
            }
            
            // Add to repair history
            if (!Array.isArray(repairTransferSerial.repairHistory)) {
              repairTransferSerial.repairHistory = [];
            }
            
            repairTransferSerial.repairHistory.push({
              date: new Date(date),
              status: finalStatus,
              remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
              quantity: quantity,
              repairedQty: finalStatus === "repaired" ? quantity : 0,
              irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
              updatedBy: updatedBy,
              cost: repairCost * quantity
            });
          }

          // Add to repair updates
          if (!Array.isArray(repairTransfer.repairUpdates)) {
            repairTransfer.repairUpdates = [];
          }
          
          repairTransfer.repairUpdates.push({
            date: new Date(date),
            status: finalStatus,
            remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
            quantity: quantity,
            repairedQty: finalStatus === "repaired" ? quantity : 0,
            irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
            updatedBy: updatedBy,
            cost: repairCost * quantity
          });

          // Update faulty stock quantities
          if (finalStatus === "repaired") {
            faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
          } else if (finalStatus === "irreparable") {
            faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
          }

          // Update faulty stock under repair quantity
          faultyStock.underRepairQty = faultyStock.quantity - 
            (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0);

          // Update faulty stock serial numbers (for non-serialized)
          if (faultyStock.serialNumbers.length === 0) {
            // Create placeholder serial
            faultyStock.serialNumbers = [{
              serialNumber: `NON-SERIAL-${faultyStock._id}`,
              status: "under_repair",
              quantity: faultyStock.quantity
            }];
          }
          
          // Update faulty stock serial
          const faultySerial = faultyStock.serialNumbers[0];
          if (faultySerial) {
            if (finalStatus === "repaired") {
              faultySerial.repairedQty = (faultySerial.repairedQty || 0) + quantity;
            } else if (finalStatus === "irreparable") {
              faultySerial.irrepairedQty = (faultySerial.irrepairedQty || 0) + quantity;
            }
            
            faultySerial.underRepairQty = faultySerial.quantity - 
              (faultySerial.repairedQty || 0) - (faultySerial.irrepairedQty || 0);
            
            // Update serial status
            if (faultySerial.underRepairQty === 0) {
              if (faultySerial.repairedQty === faultySerial.quantity) {
                faultySerial.status = "repaired";
              } else if (faultySerial.irrepairedQty === faultySerial.quantity) {
                faultySerial.status = "irreparable";
              }
            } else {
              faultySerial.status = "under_repair";
            }
            
            // Add to repair history
            if (!Array.isArray(faultySerial.repairHistory)) {
              faultySerial.repairHistory = [];
            }
            
            faultySerial.repairHistory.push({
              date: new Date(date),
              status: finalStatus,
              remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
              quantity: quantity,
              repairedQty: finalStatus === "repaired" ? quantity : 0,
              irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
              updatedBy: updatedBy,
              cost: repairCost * quantity
            });
          }

          console.log(`✓ Updated non-serialized product: ${productDoc.productTitle} - ${quantity} marked as ${finalStatus}`);

        } else {
          // SERIALIZED PRODUCTS
          console.log(`Processing serialized product: ${productDoc.productTitle}`);
          
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
            continue;
          }

          // Validate serials exist and are in under_repair status in repair transfer
          const validSerials = [];
          const invalidSerials = [];
          
          for (const serialNumber of serialNumbers) {
            const serial = repairTransfer.serialNumbers.find(sn => 
              sn.serialNumber === serialNumber && sn.status === "under_repair"
            );
            
            if (serial) {
              validSerials.push(serialNumber);
            } else {
              const foundSerial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
              invalidSerials.push({
                serialNumber,
                status: foundSerial ? foundSerial.status : 'not found'
              });
            }
          }

          if (invalidSerials.length > 0) {
            errors.push(`Invalid serial numbers: ${JSON.stringify(invalidSerials)}`);
            continue;
          }

          if (validSerials.length !== quantity) {
            errors.push(`Only ${validSerials.length} valid serials found, but ${quantity} requested`);
            continue;
          }

          console.log(`Found ${validSerials.length} valid serials`);

          // Update each serial in repair transfer
          for (const serialNumber of validSerials) {
            // Update repair transfer serial
            const repairSerial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            if (repairSerial) {
              repairSerial.status = finalStatus;
              
              if (!Array.isArray(repairSerial.repairHistory)) {
                repairSerial.repairHistory = [];
              }
              
              repairSerial.repairHistory.push({
                date: new Date(date),
                status: finalStatus,
                remark: productRemark || remark || `Marked as ${finalStatus}`,
                updatedBy: updatedBy,
                cost: repairCost
              });

              // Update repair transfer quantities
              if (finalStatus === "repaired") {
                repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + 1;
              } else if (finalStatus === "irreparable") {
                repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + 1;
              }
            }
          }

          // Update repair transfer under repair quantity
          repairTransfer.underRepairQty = repairTransfer.quantity - 
            (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0);

          // Add to repair updates
          if (!Array.isArray(repairTransfer.repairUpdates)) {
            repairTransfer.repairUpdates = [];
          }
          
          repairTransfer.repairUpdates.push({
            date: new Date(date),
            status: finalStatus,
            remark: productRemark || remark || `Marked ${quantity} serials as ${finalStatus}`,
            quantity: quantity,
            repairedQty: finalStatus === "repaired" ? quantity : 0,
            irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
            updatedBy: updatedBy,
            cost: repairCost * quantity
          });

          // Update faulty stock serials and quantities
          for (const serialNumber of validSerials) {
            const faultySerial = faultyStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            if (faultySerial) {
              faultySerial.status = finalStatus;
              
              if (!Array.isArray(faultySerial.repairHistory)) {
                faultySerial.repairHistory = [];
              }
              
              faultySerial.repairHistory.push({
                date: new Date(date),
                status: finalStatus,
                remark: productRemark || remark || `Marked as ${finalStatus}`,
                updatedBy: updatedBy,
                cost: repairCost
              });
            }

            // Update faulty stock quantities
            if (finalStatus === "repaired") {
              faultyStock.repairedQty = (faultyStock.repairedQty || 0) + 1;
            } else if (finalStatus === "irreparable") {
              faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + 1;
            }
          }

          // Update faulty stock under repair quantity
          faultyStock.underRepairQty = faultyStock.quantity - 
            (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0);

          console.log(`✓ Updated serialized product: ${productDoc.productTitle} - ${quantity} serials marked as ${finalStatus}`);
        }

        // Calculate and update repair transfer status
        const totalProcessed = (repairTransfer.repairedQty || 0) + (repairTransfer.irrepairedQty || 0);
        const totalQuantity = repairTransfer.quantity;
        
        console.log(`Total processed: ${totalProcessed}, Total quantity: ${totalQuantity}`);
        
        if (totalProcessed === totalQuantity) {
          // All items processed
          if (repairTransfer.repairedQty === totalQuantity) {
            repairTransfer.status = "repaired";
          } else if (repairTransfer.irrepairedQty === totalQuantity) {
            repairTransfer.status = "irreparable";
          } else {
            // Mix of repaired and irreparable
            repairTransfer.status = "partially_repaired";
          }
        } else if (totalProcessed > 0) {
          // Some items processed, some still under repair
          repairTransfer.status = "under_repair";
        } else {
          // No items processed yet
          repairTransfer.status = "under_repair";
        }

        // Update total repair cost
        if (repairCost > 0) {
          repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + (repairCost * quantity);
        }

        await repairTransfer.save();

        // Calculate and update faulty stock status
        const faultyTotalProcessed = (faultyStock.repairedQty || 0) + (faultyStock.irrepairedQty || 0);
        const faultyTotalQuantity = faultyStock.quantity;
        
        console.log(`Faulty stock - Total processed: ${faultyTotalProcessed}, Total quantity: ${faultyTotalQuantity}`);
        
        if (faultyTotalProcessed === faultyTotalQuantity) {
          // All items processed in faulty stock
          if (faultyStock.repairedQty === faultyTotalQuantity) {
            faultyStock.overallStatus = "repaired";
            faultyStock.repairDate = new Date();
          } else if (faultyStock.irrepairedQty === faultyTotalQuantity) {
            faultyStock.overallStatus = "irreparable";
          } else {
            // Mix of repaired and irreparable
            faultyStock.overallStatus = "partially_repaired";
          }
        } else if (faultyTotalProcessed > 0) {
          // Some items processed, some still under repair
          faultyStock.overallStatus = "under_repair";
        } else {
          // No items processed yet
          faultyStock.overallStatus = "damaged";
        }

        faultyStock.lastRepairUpdate = new Date();
        await faultyStock.save();

        // Get quantity summary
        const transferSummary = {
          total: repairTransfer.quantity,
          repaired: repairTransfer.repairedQty || 0,
          irrepaired: repairTransfer.irrepairedQty || 0,
          underRepair: repairTransfer.underRepairQty || 0,
          remaining: repairTransfer.quantity - (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0)
        };
        
        const faultySummary = {
          total: faultyStock.quantity,
          repaired: faultyStock.repairedQty || 0,
          irrepaired: faultyStock.irrepairedQty || 0,
          underRepair: faultyStock.underRepairQty || 0,
          remaining: faultyStock.quantity - (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0)
        };

        results.push({
          product: productDoc.productTitle,
          productCode: productDoc.productCode,
          quantity: quantity,
          serialNumbers: productDoc.trackSerialNumber === "Yes" ? serialNumbers : [],
          finalStatus: finalStatus,
          repairTransferId: repairTransfer._id,
          repairCost: repairCost * quantity,
          status: "success",
          message: `Marked ${quantity} items as ${finalStatus}`,
          quantities: {
            repairTransfer: transferSummary,
            faultyStock: faultySummary
          },
          repairTransferStatus: repairTransfer.status,
          faultyStockStatus: faultyStock.overallStatus
        });

        console.log(`✓ Successfully marked ${quantity} items as ${finalStatus}: ${productDoc.productTitle}`);
        console.log(`Repair Transfer Status: ${repairTransfer.status}`);
        console.log(`Faulty Stock Status: ${faultyStock.overallStatus}`);

      } catch (error) {
        console.error(`Error processing item:`, error);
        errors.push(`Error processing ${item.product || 'item'}: ${error.message}`);
      }
    }

    console.log("=== PROCESSING COMPLETE ===");
    console.log("Results:", results.length);
    console.log("Errors:", errors.length);

    // Response handling
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to process any items",
        errors: errors
      });
    }

    const totalProcessed = results.reduce((sum, item) => sum + item.quantity, 0);
    const totalRepaired = results.filter(item => item.finalStatus === "repaired")
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalIrreparable = results.filter(item => item.finalStatus === "irreparable")
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = results.reduce((sum, item) => sum + item.repairCost, 0);

    const response = {
      success: true,
      message: `Successfully processed ${results.length} items (${totalProcessed} units)`,
      data: {
        processed: results,
        summary: {
          totalItems: results.length,
          totalQuantity: totalProcessed,
          totalRepaired: totalRepaired,
          totalIrreparable: totalIrreparable,
          totalCost: totalCost
        }
      }
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = true;
      response.message += `, ${errors.length} failed`;
    }

    console.log("Response:", JSON.stringify(response, null, 2));
    
    res.json(response);

  } catch (error) {
    console.error("Mark as repaired/irreparable error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process repair status",
    });
  }
};

// export const getDamageAndUnderRepairProduct = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["view_usage_own_center", "view_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//       });
//     }

//     const {
//       status,
//       page = 1,
//       limit = 100,
//     } = req.query;

//     // const RepairTransfer = mongoose.model("RepairTransfer");
    
//     const filter = {
//       toCenter: userCenter?._id || req.user.center
//     };

//     if (status && status !== "all") {
//       filter.status = status;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const repairTransfers = await RepairTransfer.find(filter)
//       .populate("fromCenter", "centerName centerCode")
//       .populate("product", "productTitle productCode trackSerialNumber")
//       .populate("transferredBy", "name email")
//       .sort({ date: -1 })
//       .skip(skip)
//       .limit(limitNum);

//     const repairItems = [];
    
//     for (const transfer of repairTransfers) {
//       const serialNumbers = transfer.serialNumbers || [];
      
//       if (transfer.product?.trackSerialNumber === "Yes") {
  
//         const underRepairSerials = serialNumbers.filter(serial => 
//           serial.status === "under_repair" || serial.status === "damaged"
//         );
        
//         if (underRepairSerials.length > 0) {
//           repairItems.push({
//             ...transfer.toObject(),
//             quantity: underRepairSerials.length,
//             serialNumbers: underRepairSerials, 
//             availableForRepair: true,
//             displayQuantity: underRepairSerials.length,
//             pendingSerialsCount: underRepairSerials.length,
//             totalSerialsCount: serialNumbers.length
//           });
//         }
//       } else {
//         const repairedCount = transfer.repairUpdates?.filter(update => 
//           update.status === "repaired"
//         ).length || 0;
        
//         const availableQty = transfer.quantity - repairedCount;
        
//         if (availableQty > 0) {
//           repairItems.push({
//             ...transfer.toObject(),
//             quantity: availableQty,
//             displayQuantity: availableQty,
//             availableForRepair: true,
//             repairedCount: repairedCount,
//             originalQuantity: transfer.quantity
//           });
//         }
//       }
//     }

//     const totalTransfers = await RepairTransfer.countDocuments(filter);
//     const totalRepairItems = repairItems.length;

//     const dashboardStats = await RepairTransfer.aggregate([
//       { $match: { toCenter: userCenter?._id || req.user.center } },
//       {
//         $group: {
//           _id: "$status",
//           count: { $sum: 1 },
//           totalQuantity: { $sum: "$quantity" }
//         }
//       }
//     ]);
//     const pendingRepairsStats = {
//       _id: "pending_repairs",
//       count: totalRepairItems,
//       totalQuantity: repairItems.reduce((sum, item) => sum + item.displayQuantity, 0)
//     };

//     dashboardStats.push(pendingRepairsStats);

//     res.json({
//       success: true,
//       data: repairItems,
//       dashboardStats: dashboardStats,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(totalRepairItems / limitNum),
//         totalRecords: totalRepairItems,
//         hasNext: pageNum < Math.ceil(totalRepairItems / limitNum),
//         hasPrev: pageNum > 1,
//       }
//     });
//   } catch (error) {
//     console.error("Get repair transfers for center error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch repair transfers for center",
//     });
//   }
// };


// export const getRepairedProducts = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["view_usage_own_center", "view_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//       });
//     }

//     const {
//       startDate,
//       endDate,
//       centerId,
//       productId,
//       page = 1,
//       limit = 50,
//     } = req.query;

//     const RepairTransfer = mongoose.model("RepairTransfer");
//     const FaultyStock = mongoose.model("FaultyStock");
    
//     const filter = {
//       toCenter: userCenter?._id || req.user.center,
//       status: "repaired"
//     };

//     if (startDate && endDate) {
//       filter.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
//       filter.fromCenter = centerId;
//     }

//     if (productId && mongoose.Types.ObjectId.isValid(productId)) {
//       filter.product = productId;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     const repairedTransfers = await RepairTransfer.find(filter)
//       .populate("fromCenter", "centerName centerCode")
//       .populate("product", "productTitle productCode trackSerialNumber category")
//       .populate("transferredBy", "name email")
//       .sort({ date: -1 })
//       .skip(skip)
//       .limit(limitNum);
//     const repairedProducts = [];

//     for (const transfer of repairedTransfers) {
//       const productId = transfer.product._id;
//       let existingProduct = repairedProducts.find(p => p.product._id.toString() === productId.toString());
      
//       if (!existingProduct) {
//         existingProduct = {
//           product: transfer.product,
//           totalRepairedQuantity: 0,
//           repairTransfers: [],
//           repairedSerials: [],
//           repairDates: [],
//           fromCenters: []
//         };
//         repairedProducts.push(existingProduct);
//       }

//       let repairedQuantity = 0;
//       const repairedSerialsInTransfer = [];

//       if (transfer.product.trackSerialNumber === "Yes") {
//         transfer.serialNumbers.forEach(serial => {
//           if (serial.status === "repaired") {
//             repairedQuantity += 1;
//             repairedSerialsInTransfer.push({
//               serialNumber: serial.serialNumber,
//               repairDate: transfer.actualReturnDate || transfer.updatedAt,
//               repairHistory: serial.repairHistory,
//               transferId: transfer._id
//             });
//           }
//         });
//       } else {
//         repairedQuantity = transfer.quantity;
//       }

//       existingProduct.totalRepairedQuantity += repairedQuantity;
 
//       existingProduct.repairTransfers.push({
//         transferId: transfer._id,
//         date: transfer.date,
//         actualReturnDate: transfer.actualReturnDate,
//         quantity: repairedQuantity,
//         fromCenter: transfer.fromCenter,
//         transferRemark: transfer.transferRemark,
//         repairedSerials: repairedSerialsInTransfer,
//         totalRepairCost: transfer.totalRepairCost
//       });

//       const repairDate = transfer.actualReturnDate || transfer.updatedAt;
//       if (!existingProduct.repairDates.includes(repairDate)) {
//         existingProduct.repairDates.push(repairDate);
//       }

//       const centerExists = existingProduct.fromCenters.some(center => 
//         center._id.toString() === transfer.fromCenter._id.toString()
//       );
//       if (!centerExists) {
//         existingProduct.fromCenters.push(transfer.fromCenter);
//       }

//       existingProduct.repairedSerials.push(...repairedSerialsInTransfer);
//     }

//     repairedProducts.forEach(product => {
//       product.repairDates.sort((a, b) => new Date(b) - new Date(a));
//       product.repairTransfers.sort((a, b) => new Date(b.date) - new Date(a.date));
//     });

//     repairedProducts.sort((a, b) => b.totalRepairedQuantity - a.totalRepairedQuantity);

//     const total = await RepairTransfer.countDocuments(filter);

//     const stats = await RepairTransfer.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: null,
//           totalRepairedTransfers: { $sum: 1 },
//           totalRepairedItems: { $sum: "$quantity" },
//           totalRepairCost: { $sum: "$totalRepairCost" }
//         }
//       }
//     ]);
//     const productStats = await RepairTransfer.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: "$product",
//           repairedQuantity: { $sum: "$quantity" },
//           transferCount: { $sum: 1 },
//           totalRepairCost: { $sum: "$totalRepairCost" }
//         }
//       },
//       {
//         $lookup: {
//           from: "products",
//           localField: "_id",
//           foreignField: "_id",
//           as: "productDetails"
//         }
//       },
//       {
//         $unwind: "$productDetails"
//       },
//       {
//         $project: {
//           productName: "$productDetails.productTitle",
//           productCode: "$productDetails.productCode",
//           repairedQuantity: 1,
//           transferCount: 1,
//           totalRepairCost: 1
//         }
//       },
//       { $sort: { repairedQuantity: -1 } }
//     ]);

//     res.json({
//       success: true,
//       data: {
//         repairedProducts,
//         summary: {
//           totalProducts: repairedProducts.length,
//           totalRepairedTransfers: stats[0]?.totalRepairedTransfers || 0,
//           totalRepairedItems: stats[0]?.totalRepairedItems || 0,
//           totalRepairCost: stats[0]?.totalRepairCost || 0,
//           productStats
//         }
//       },
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         totalRecords: total,
//         hasNext: pageNum < Math.ceil(total / limitNum),
//         hasPrev: pageNum > 1,
//       }
//     });

//   } catch (error) {
//     console.error("Get repaired products error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to fetch repaired products",
//     });
//   }
// };



//********************************  Added new *********************

// export const getRepairedProducts = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["view_usage_own_center", "view_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
//       });
//     }

//     const {
//       startDate,
//       endDate,
//       centerId,
//       productId,
//       page = 1,
//       limit = 100,
//     } = req.query;

//     // const RepairTransfer = mongoose.model("RepairTransfer");
    
//     // Build base filter for repair transfers at current center
//     const filter = {
//       toCenter: userCenter?._id || req.user.center,
//       // Remove the status filter to get ALL transfers
//       // status: "repaired" // <-- REMOVE THIS
//     };

//     // Add date filter if provided
//     if (startDate && endDate) {
//       filter.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
//       filter.fromCenter = centerId;
//     }

//     if (productId && mongoose.Types.ObjectId.isValid(productId)) {
//       filter.product = productId;
//     }

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     // Get all repair transfers (not just status: "repaired")
//     const repairTransfers = await RepairTransfer.find(filter)
//       .populate("fromCenter", "centerName centerCode")
//       .populate("product", "productTitle productCode trackSerialNumber category")
//       .populate("transferredBy", "name email")
//       .sort({ date: -1 })
//       .skip(skip)
//       .limit(limitNum);

//     // Filter and process only transfers that have repaired serials
//     const repairedTransfers = repairTransfers.filter(transfer => {
//       // Check if any serial numbers have status "repaired"
//       const hasRepairedSerials = transfer.serialNumbers.some(
//         sn => sn.status === "repaired"
//       );
//       return hasRepairedSerials;
//     });

//     const repairedProducts = [];

//     for (const transfer of repairedTransfers) {
//       const productId = transfer.product._id;
//       let existingProduct = repairedProducts.find(p => p.product._id.toString() === productId.toString());
      
//       if (!existingProduct) {
//         existingProduct = {
//           product: transfer.product,
//           totalRepairedQuantity: 0,
//           repairTransfers: [],
//           repairedSerials: [],
//           repairDates: [],
//           fromCenters: [],
//           // Add these fields for better tracking
//           totalTransferred: transfer.quantity,
//           remainingUnderRepair: 0,
//           overallTransferStatus: transfer.status
//         };
//         repairedProducts.push(existingProduct);
//       }

//       // Calculate repaired quantity from this transfer
//       let repairedQuantity = 0;
//       const repairedSerialsInTransfer = [];
//       const underRepairSerials = [];

//       if (transfer.product.trackSerialNumber === "Yes") {
//         transfer.serialNumbers.forEach(serial => {
//           if (serial.status === "repaired") {
//             repairedQuantity += 1;
//             repairedSerialsInTransfer.push({
//               serialNumber: serial.serialNumber,
//               repairDate: serial.repairHistory?.find(h => h.status === "repaired")?.date || transfer.updatedAt,
//               repairHistory: serial.repairHistory,
//               transferId: transfer._id,
//               repairRemark: serial.repairHistory?.find(h => h.status === "repaired")?.remark || ""
//             });
//           } else if (serial.status === "under_repair") {
//             underRepairSerials.push(serial.serialNumber);
//           }
//         });
//       } else {
//         // For non-serialized products, check repairUpdates
//         const repairedUpdates = transfer.repairUpdates?.filter(update => 
//           update.status === "repaired"
//         ) || [];
//         repairedQuantity = repairedUpdates.length;
//       }

//       // Only add if there are actually repaired items
//       if (repairedQuantity > 0) {
//         existingProduct.totalRepairedQuantity += repairedQuantity;
//         existingProduct.remainingUnderRepair += underRepairSerials.length;

//         existingProduct.repairTransfers.push({
//           transferId: transfer._id,
//           date: transfer.date,
//           actualReturnDate: transfer.actualReturnDate,
//           quantity: repairedQuantity,
//           fromCenter: transfer.fromCenter,
//           transferRemark: transfer.transferRemark,
//           repairedSerials: repairedSerialsInTransfer,
//           totalRepairCost: transfer.totalRepairCost,
//           // Add transfer status
//           transferStatus: transfer.status,
//           // Add remaining under repair
//           remainingUnderRepair: underRepairSerials.length,
//           // Add serial numbers that are still under repair
//           underRepairSerials: underRepairSerials
//         });

//         // Add repair dates from the repaired serials
//         repairedSerialsInTransfer.forEach(serial => {
//           if (serial.repairDate && !existingProduct.repairDates.includes(serial.repairDate)) {
//             existingProduct.repairDates.push(serial.repairDate);
//           }
//         });

//         const centerExists = existingProduct.fromCenters.some(center => 
//           center._id.toString() === transfer.fromCenter._id.toString()
//         );
//         if (!centerExists) {
//           existingProduct.fromCenters.push(transfer.fromCenter);
//         }

//         existingProduct.repairedSerials.push(...repairedSerialsInTransfer);
//       }
//     }

//     // Sort the repaired products
//     repairedProducts.forEach(product => {
//       product.repairDates.sort((a, b) => new Date(b) - new Date(a));
//       product.repairTransfers.sort((a, b) => new Date(b.date) - new Date(a.date));
//     });

//     repairedProducts.sort((a, b) => b.totalRepairedQuantity - a.totalRepairedQuantity);

//     // Count total repaired transfers
//     const total = repairedTransfers.length;

//     // Calculate statistics
//     const stats = {
//       totalRepairedTransfers: repairedTransfers.length,
//       totalRepairedItems: repairedProducts.reduce((sum, product) => sum + product.totalRepairedQuantity, 0),
//       totalRepairCost: repairedTransfers.reduce((sum, transfer) => sum + (transfer.totalRepairCost || 0), 0),
//       totalProducts: repairedProducts.length
//     };

//     const productStats = repairedProducts.map(product => ({
//       productId: product.product._id,
//       productName: product.product.productTitle,
//       productCode: product.product.productCode,
//       repairedQuantity: product.totalRepairedQuantity,
//       transferCount: product.repairTransfers.length,
//       totalRepairCost: product.repairTransfers.reduce((sum, t) => sum + (t.totalRepairCost || 0), 0)
//     }));

//     res.json({
//       success: true,
//       data: {
//         repairedProducts,
//         summary: {
//           totalProducts: repairedProducts.length,
//           totalRepairedTransfers: stats.totalRepairedTransfers,
//           totalRepairedItems: stats.totalRepairedItems,
//           totalRepairCost: stats.totalRepairCost,
//           productStats
//         }
//       },
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         totalRecords: total,
//         hasNext: pageNum < Math.ceil(total / limitNum),
//         hasPrev: pageNum > 1,
//       }
//     });

//   } catch (error) {
//     console.error("Get repaired products error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to fetch repaired products",
//     });
//   }
// };



export const getDamageAndUnderRepairProduct = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
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
      status,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {
      toCenter: userCenter?._id || req.user.center
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const repairItems = [];
    
    for (const transfer of repairTransfers) {
      // Get the associated faulty stock to get original quantity
      const faultyStock = await FaultyStock.findById(transfer.faultyStock);
      const originalQuantity = faultyStock ? faultyStock.quantity : transfer.quantity;
      
      if (transfer.product?.trackSerialNumber === "Yes") {
        const underRepairSerials = transfer.serialNumbers.filter(serial => 
          serial.status === "under_repair" || serial.status === "damaged"
        );
        
        if (underRepairSerials.length > 0) {
          repairItems.push({
            ...transfer.toObject(),
            quantity: underRepairSerials.length,
            serialNumbers: underRepairSerials, 
            availableForRepair: true,
            displayQuantity: underRepairSerials.length,
            pendingSerialsCount: underRepairSerials.length,
            totalSerialsCount: transfer.serialNumbers.length,
            originalQuantity: originalQuantity // Add original quantity
          });
        }
      } else {
        // NON-SERIALIZED PRODUCTS
        // Calculate repaired count from repair updates
        const repairedCount = transfer.repairUpdates?.filter(update => 
          update.status === "repaired"
        ).reduce((sum, update) => sum + (update.repairedQty || 0), 0) || 0;
        
        // Calculate irrepaired count
        const irrepairedCount = transfer.repairUpdates?.filter(update => 
          update.status === "irreparable"
        ).reduce((sum, update) => sum + (update.irrepairedQty || 0), 0) || 0;
        
        // Calculate under repair quantity
        const totalProcessed = repairedCount + irrepairedCount;
        const availableQty = Math.max(0, originalQuantity - totalProcessed);
        
        if (availableQty > 0) {
          // Update the transfer's quantity fields to match actual state
          transfer.repairedQty = repairedCount;
          transfer.irrepairedQty = irrepairedCount;
          transfer.underRepairQty = availableQty;
          
          // Update the serial number's underRepairQty if it exists
          if (transfer.serialNumbers.length > 0) {
            const serial = transfer.serialNumbers[0];
            serial.repairedQty = repairedCount;
            serial.irrepairedQty = irrepairedCount;
            serial.underRepairQty = availableQty;
          }
          
          repairItems.push({
            ...transfer.toObject(),
            quantity: availableQty, // This should show remaining under repair quantity
            displayQuantity: availableQty,
            availableForRepair: true,
            repairedCount: repairedCount,
            irrepairedCount: irrepairedCount,
            originalQuantity: originalQuantity,
            // Add these for clarity
            quantityBreakdown: {
              original: originalQuantity,
              repaired: repairedCount,
              irrepaired: irrepairedCount,
              underRepair: availableQty,
              totalProcessed: totalProcessed
            }
          });
        }
      }
    }

    const totalTransfers = await RepairTransfer.countDocuments(filter);
    const totalRepairItems = repairItems.length;

    const dashboardStats = await RepairTransfer.aggregate([
      { $match: { toCenter: userCenter?._id || req.user.center } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);
    
    const pendingRepairsStats = {
      _id: "pending_repairs",
      count: totalRepairItems,
      totalQuantity: repairItems.reduce((sum, item) => sum + item.displayQuantity, 0)
    };

    dashboardStats.push(pendingRepairsStats);

    res.json({
      success: true,
      data: repairItems,
      dashboardStats: dashboardStats,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRepairItems / limitNum),
        totalRecords: totalRepairItems,
        hasNext: pageNum < Math.ceil(totalRepairItems / limitNum),
        hasPrev: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Get repair transfers for center error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair transfers for center",
    });
  }
};

export const getRepairedProducts = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
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
      startDate,
      endDate,
      centerId,
      productId,
      page = 1,
      limit = 100,
    } = req.query;

    // Build base filter for repair transfers at current center
    const filter = {
      toCenter: userCenter?._id || req.user.center,
      // Show transfers that have at least SOME repaired items
      $or: [
        { "serialNumbers.status": "repaired" },  // For serialized products
        { repairedQty: { $gt: 0 } }              // For non-serialized products
      ]
    };

    // Add date filter if provided
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
      filter.fromCenter = centerId;
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.product = productId;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count first
    const total = await RepairTransfer.countDocuments(filter);

    // Get repair transfers that have repaired items
    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber category unit")
      .populate("transferredBy", "name email")
      .sort({ date: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const repairedProducts = [];

    for (const transfer of repairTransfers) {
      const productId = transfer.product._id;
      let existingProduct = repairedProducts.find(p => 
        p.product._id.toString() === productId.toString()
      );
      
      if (!existingProduct) {
        existingProduct = {
          product: transfer.product,
          totalRepairedQuantity: 0,
          totalIrrepairedQuantity: 0,  // Add this to track irreparable items
          totalUnderRepairQuantity: 0, // Add this to track items still under repair
          repairTransfers: [],
          repairedSerials: [],
          nonSerializedRepairs: [], // For non-serialized repair updates
          repairDates: [],
          fromCenters: [],
          totalTransferred: 0,
          remainingUnderRepair: 0,
          overallTransferStatus: transfer.status,
          repairCosts: [] // Track repair costs
        };
        repairedProducts.push(existingProduct);
      }

      // Update total transferred
      existingProduct.totalTransferred += transfer.quantity;
      existingProduct.totalUnderRepairQuantity += (transfer.underRepairQty || 0);
      existingProduct.totalIrrepairedQuantity += (transfer.irrepairedQty || 0);

      // Calculate repaired quantity for THIS transfer
      let transferRepairedQuantity = 0;
      let transferIrrepairedQuantity = 0;
      const repairedSerialsInTransfer = [];
      const nonSerializedRepairsInTransfer = [];
      const underRepairSerials = [];

      if (transfer.product.trackSerialNumber === "Yes") {
        // SERIALIZED PRODUCTS
        transfer.serialNumbers.forEach(serial => {
          if (serial.status === "repaired") {
            transferRepairedQuantity += 1;
            repairedSerialsInTransfer.push({
              serialNumber: serial.serialNumber,
              repairDate: serial.repairHistory?.find(h => h.status === "repaired")?.date || 
                         transfer.repairUpdates?.find(u => u.status === "repaired")?.date || 
                         transfer.updatedAt,
              repairHistory: serial.repairHistory,
              transferId: transfer._id,
              repairRemark: serial.repairHistory?.find(h => h.status === "repaired")?.remark || 
                           transfer.repairUpdates?.find(u => u.status === "repaired")?.remark || 
                           "Marked as repaired"
            });
          } else if (serial.status === "under_repair") {
            underRepairSerials.push({
              serialNumber: serial.serialNumber,
              status: serial.status,
              underRepairQty: serial.underRepairQty || 1
            });
          } else if (serial.status === "irreparable") {
            transferIrrepairedQuantity += 1;
          }
        });
      } else {
        // NON-SERIALIZED PRODUCTS
        // Get repaired quantity from the transfer's repairedQty field
        transferRepairedQuantity = transfer.repairedQty || 0;
        transferIrrepairedQuantity = transfer.irrepairedQty || 0;
        
        // Get repair updates for non-serialized products
        const repairedUpdates = transfer.repairUpdates?.filter(update => 
          update.status === "repaired"
        ) || [];
        
        repairedUpdates.forEach(update => {
          nonSerializedRepairsInTransfer.push({
            repairDate: update.date,
            quantity: update.repairedQty || update.quantity,
            repairRemark: update.remark || "Marked as repaired",
            updatedBy: update.updatedBy,
            cost: update.cost,
            transferId: transfer._id
          });
        });
      }

      // Only add to results if there are actually repaired items
      if (transferRepairedQuantity > 0) {
        existingProduct.totalRepairedQuantity += transferRepairedQuantity;
        existingProduct.remainingUnderRepair += underRepairSerials.length;

        // Add repair transfer details
        existingProduct.repairTransfers.push({
          transferId: transfer._id,
          date: transfer.date,
          actualReturnDate: transfer.actualReturnDate,
          repairedQuantity: transferRepairedQuantity,
          irrepairedQuantity: transferIrrepairedQuantity,
          fromCenter: transfer.fromCenter,
          transferRemark: transfer.transferRemark,
          totalQuantity: transfer.quantity,
          repairedSerials: repairedSerialsInTransfer,
          nonSerializedRepairs: nonSerializedRepairsInTransfer,
          totalRepairCost: transfer.totalRepairCost,
          transferStatus: transfer.status,
          remainingUnderRepair: underRepairSerials.length,
          underRepairSerials: underRepairSerials,
          // Quantity breakdown
          quantityBreakdown: {
            total: transfer.quantity,
            repaired: transfer.repairedQty || 0,
            irrepaired: transfer.irrepairedQty || 0,
            underRepair: transfer.underRepairQty || 0,
            returned: transfer.returnedQty || 0
          }
        });

        // Add repair dates
        if (transfer.product.trackSerialNumber === "Yes") {
          repairedSerialsInTransfer.forEach(serial => {
            if (serial.repairDate && !existingProduct.repairDates.some(d => 
              d.getTime() === new Date(serial.repairDate).getTime()
            )) {
              existingProduct.repairDates.push(new Date(serial.repairDate));
            }
          });
        } else {
          nonSerializedRepairsInTransfer.forEach(repair => {
            if (repair.repairDate && !existingProduct.repairDates.some(d => 
              d.getTime() === new Date(repair.repairDate).getTime()
            )) {
              existingProduct.repairDates.push(new Date(repair.repairDate));
            }
          });
        }

        // Add fromCenter if not already exists
        const centerExists = existingProduct.fromCenters.some(center => 
          center._id.toString() === transfer.fromCenter._id.toString()
        );
        if (!centerExists) {
          existingProduct.fromCenters.push(transfer.fromCenter);
        }

        // Add repaired serials (for serialized products)
        existingProduct.repairedSerials.push(...repairedSerialsInTransfer);
        
        // Add non-serialized repairs (for non-serialized products)
        existingProduct.nonSerializedRepairs.push(...nonSerializedRepairsInTransfer);

        // Add repair costs
        if (transfer.totalRepairCost && transfer.totalRepairCost > 0) {
          existingProduct.repairCosts.push({
            transferId: transfer._id,
            date: transfer.date,
            cost: transfer.totalRepairCost
          });
        }
      }
    }

    // Sort the repaired products
    repairedProducts.forEach(product => {
      product.repairDates.sort((a, b) => new Date(b) - new Date(a));
      product.repairTransfers.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    // Sort by total repaired quantity (descending)
    repairedProducts.sort((a, b) => b.totalRepairedQuantity - a.totalRepairedQuantity);

    // Calculate statistics
    const stats = {
      totalRepairedTransfers: repairTransfers.filter(t => 
        (t.repairedQty && t.repairedQty > 0) || 
        t.serialNumbers?.some(sn => sn.status === "repaired")
      ).length,
      totalRepairedItems: repairedProducts.reduce((sum, product) => 
        sum + product.totalRepairedQuantity, 0
      ),
      totalIrrepairedItems: repairedProducts.reduce((sum, product) => 
        sum + product.totalIrrepairedQuantity, 0
      ),
      totalUnderRepairItems: repairedProducts.reduce((sum, product) => 
        sum + product.totalUnderRepairQuantity, 0
      ),
      totalRepairCost: repairedProducts.reduce((sum, product) => 
        sum + product.repairTransfers.reduce((tSum, t) => 
          tSum + (t.totalRepairCost || 0), 0
        ), 0
      ),
      totalProducts: repairedProducts.length
    };

    const productStats = repairedProducts.map(product => ({
      productId: product.product._id,
      productName: product.product.productTitle,
      productCode: product.product.productCode,
      isSerialized: product.product.trackSerialNumber === "Yes",
      totalTransferred: product.totalTransferred,
      repairedQuantity: product.totalRepairedQuantity,
      irrepairedQuantity: product.totalIrrepairedQuantity,
      underRepairQuantity: product.totalUnderRepairQuantity,
      transferCount: product.repairTransfers.length,
      totalRepairCost: product.repairTransfers.reduce((sum, t) => 
        sum + (t.totalRepairCost || 0), 0
      )
    }));

    res.json({
      success: true,
      data: {
        repairedProducts,
        summary: {
          totalProducts: stats.totalProducts,
          totalRepairedTransfers: stats.totalRepairedTransfers,
          totalRepairedItems: stats.totalRepairedItems,
          totalIrrepairedItems: stats.totalIrrepairedItems,
          totalUnderRepairItems: stats.totalUnderRepairItems,
          totalTransferredItems: repairedProducts.reduce((sum, p) => 
            sum + p.totalTransferred, 0
          ),
          totalRepairCost: stats.totalRepairCost,
          productStats
        }
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      }
    });

  } catch (error) {
    console.error("Get repaired products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch repaired products",
    });
  }
};

// export const transferRepairedToMainWarehouse = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["manage_usage_own_center", "manage_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
//       });
//     }

//     const { items, transferRemark, outletId } = req.body;
//     const transferredBy = req.user.id;
//     const repairCenterId = userCenter?._id || req.user.center;

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Items array is required and cannot be empty",
//       });
//     }

//     if (!outletId || !mongoose.Types.ObjectId.isValid(outletId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid outlet ID is required",
//       });
//     }

//     const RepairTransfer = mongoose.model("RepairTransfer");
//     const OutletStock = mongoose.model("OutletStock");
//     const Center = mongoose.model("Center");
//     const Product = mongoose.model("Product");

//     const transferResults = [];
//     const errors = [];

//     // Validate outlet is actually an Outlet type
//     const destinationOutlet = await Center.findById(outletId);
//     if (!destinationOutlet || destinationOutlet.centerType !== "Outlet") {
//       return res.status(400).json({
//         success: false,
//         message: `Destination ${destinationOutlet?.centerName || 'Unknown'} is not an Outlet`,
//       });
//     }

//     for (const item of items) {
//       try {
//         const { productId, quantity, serialNumbers, damageRemark } = item;
        
//         const productDoc = await Product.findById(productId);
//         if (!productDoc) {
//           errors.push(`Product not found: ${productId}`);
//           continue;
//         }

//         // Find repair transfers with repaired items
//         const repairTransfers = await RepairTransfer.find({
//           product: productId,
//           toCenter: repairCenterId,
//           status: { $in: ["repaired", "in_repair", "partially_repaired"] }
//         });

//         if (repairTransfers.length === 0) {
//           errors.push(`No repair transfers found for product: ${productDoc.productTitle}`);
//           continue;
//         }

//         // Find repair transfer that has repaired items
//         let repairTransfer = null;
//         let availableRepairedQuantity = 0;
        
//         for (const transfer of repairTransfers) {
//           if (productDoc.trackSerialNumber === "Yes") {
//             // For serialized products, check if serial numbers are repaired
//             const repairedSerialsInTransfer = transfer.serialNumbers.filter(
//               sn => sn.status === "repaired"
//             );
            
//             if (repairedSerialsInTransfer.length > 0) {
//               repairTransfer = transfer;
//               availableRepairedQuantity = repairedSerialsInTransfer.length;
//               break;
//             }
//           } else {
//             // For non-serialized products, check overall status and quantity
//             // Count how many items are repaired in this transfer
//             const repairedCount = transfer.serialNumbers.filter(
//               sn => sn.status === "repaired"
//             ).length;
            
//             if (repairedCount > 0) {
//               repairTransfer = transfer;
//               availableRepairedQuantity = repairedCount;
//               break;
//             }
//           }
//         }

//         if (!repairTransfer) {
//           errors.push(`No repaired items found for product: ${productDoc.productTitle}`);
//           continue;
//         }

//         if (availableRepairedQuantity < quantity) {
//           errors.push(`Insufficient repaired items. Available: ${availableRepairedQuantity}, Requested: ${quantity}`);
//           continue;
//         }

//         // Validate serial numbers for serialized products
//         if (productDoc.trackSerialNumber === "Yes") {
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           // Verify serials are actually repaired in the transfer
//           const repairedSerials = repairTransfer.serialNumbers.filter(
//             sn => sn.status === "repaired"
//           ).map(sn => sn.serialNumber);
          
//           const missingSerials = serialNumbers.filter(sn => !repairedSerials.includes(sn));
//           if (missingSerials.length > 0) {
//             errors.push(`Some serials are not in repaired status: ${missingSerials.join(', ')}`);
//             continue;
//           }
//         }

//         // 1. UPDATE REPAIRTRANSFER - Mark items as transferred
//         let transferredCount = 0;
        
//         if (productDoc.trackSerialNumber === "Yes" && serialNumbers) {
//           // For serialized products, update specific serials
//           repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//             if (serialNumbers.includes(sn.serialNumber)) {
//               transferredCount++;
//               return {
//                 ...sn.toObject(),
//                 status: "transferred",
//                 repairHistory: [
//                   ...(sn.repairHistory || []),
//                   {
//                     date: new Date(),
//                     status: "transferred",
//                     remark: damageRemark || `Transferred back to ${destinationOutlet.centerName}`,
//                     updatedBy: transferredBy
//                   }
//                 ]
//               };
//             }
//             return sn;
//           });
//         } else {
//           // For non-serialized products, mark the first X repaired items as transferred
//           let remainingToTransfer = quantity;
//           repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//             if (remainingToTransfer > 0 && sn.status === "repaired") {
//               remainingToTransfer--;
//               transferredCount++;
//               return {
//                 ...sn.toObject(),
//                 status: "transferred",
//                 repairHistory: [
//                   ...(sn.repairHistory || []),
//                   {
//                     date: new Date(),
//                     status: "transferred",
//                     remark: damageRemark || `Transferred back to ${destinationOutlet.centerName}`,
//                     updatedBy: transferredBy
//                   }
//                 ]
//               };
//             }
//             return sn;
//           });
//         }

//         // Check overall transfer status
//         const totalTransferred = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "transferred"
//         ).length;

//         const remainingRepaired = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "repaired"
//         ).length;

//         const remainingUnderRepair = repairTransfer.serialNumbers.filter(
//           sn => sn.status === "under_repair"
//         ).length;

//         // Update RepairTransfer overall status
//         if (totalTransferred === repairTransfer.quantity) {
//           // ALL items transferred
//           repairTransfer.status = "transferred";
//           repairTransfer.actualReturnDate = new Date();
//         } else if (totalTransferred > 0 && (remainingRepaired > 0 || remainingUnderRepair > 0)) {
//           // Some items transferred, some remain
//           repairTransfer.status = "partially_repaired";
//           if (!repairTransfer.actualReturnDate) {
//             repairTransfer.actualReturnDate = new Date();
//           }
//         } else if (remainingRepaired > 0 && remainingUnderRepair === 0 && totalTransferred === 0) {
//           // All items repaired, none transferred yet
//           repairTransfer.status = "repaired";
//         } else {
//           // Still under repair
//           repairTransfer.status = "in_repair";
//         }

//         // Add repair update
//         repairTransfer.repairUpdates.push({
//           date: new Date(),
//           status: repairTransfer.status,
//           remark: damageRemark || `Transferred ${quantity} items to ${destinationOutlet.centerName}. Status: ${repairTransfer.status}`,
//           updatedBy: transferredBy
//         });

//         await repairTransfer.save();

//         // 2. UPDATE OUTLETSTOCK - Add repaired items
//         let outletStock = await OutletStock.findOne({
//           outlet: outletId,
//           product: productId
//         });

//         if (!outletStock) {
//           // Create new outlet stock if it doesn't exist
//           outletStock = new OutletStock({
//             outlet: outletId,
//             product: productId,
//             totalQuantity: 0,
//             availableQuantity: 0,
//             inTransitQuantity: 0,
//             serialNumbers: []
//           });
//         }

//         if (productDoc.trackSerialNumber === "Yes" && serialNumbers) {
//           // For serialized products
//           for (const serialNumber of serialNumbers) {
//             // Check if serial already exists
//             const existingSerialIndex = outletStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (existingSerialIndex !== -1) {
//               // Update existing serial
//               outletStock.serialNumbers[existingSerialIndex] = {
//                 ...outletStock.serialNumbers[existingSerialIndex].toObject(),
//                 status: "available",
//                 sourceType: "repair_return",
//                 currentLocation: outletId,
//                 lastUpdated: new Date()
//               };
//             } else {
//               // Add new serial
//               outletStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 status: "available",
//                 sourceType: "repair_return",
//                 currentLocation: outletId,
//                 addedDate: new Date(),
//                 lastUpdated: new Date()
//               });
//             }
//           }
          
//           outletStock.availableQuantity += quantity;
//           outletStock.totalQuantity += quantity;
//         } else {
//           // For non-serialized products - just update quantities
//           outletStock.availableQuantity += quantity;
//           outletStock.totalQuantity += quantity;
          
//           // Optionally add a placeholder serial for tracking
//           outletStock.serialNumbers.push({
//             serialNumber: `NON-SERIAL-REPAIRED-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
//             status: "available",
//             sourceType: "repair_return",
//             currentLocation: outletId,
//             quantity: quantity, // Store quantity in the serial entry
//             addedDate: new Date(),
//             lastUpdated: new Date(),
//             remark: `Repaired items from repair center: ${quantity} units`
//           });
//         }

//         await outletStock.save();

//         transferResults.push({
//           product: productDoc.productTitle,
//           quantity: quantity,
//           serialNumbers: serialNumbers || [],
//           fromRepairCenter: "Repair Team",
//           toWarehouse: destinationOutlet.centerName,
//           warehouseId: outletId,
//           repairTransferId: repairTransfer._id,
//           repairTransferStatus: repairTransfer.status,
//           status: "success",
//           message: `Transferred ${quantity} repaired items to ${destinationOutlet.centerName}. Repair transfer status: ${repairTransfer.status}`
//         });

//         console.log(`✓ Transferred ${quantity} repaired items to ${destinationOutlet.centerName}. Status: ${repairTransfer.status}`);

//       } catch (error) {
//         console.error(`Error transferring ${item.productId || 'item'}:`, error);
//         errors.push(`Error transferring ${item.productId || 'item'}: ${error.message}`);
//       }
//     }

//     if (errors.length > 0 && transferResults.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to transfer any items",
//         errors: errors
//       });
//     }

//     const response = {
//       success: true,
//       message: `Transferred ${transferResults.length} repaired items to ${destinationOutlet.centerName}`,
//       data: {
//         transferred: transferResults,
//         totalItems: transferResults.length,
//         totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
//         destination: {
//           id: outletId,
//           name: destinationOutlet.centerName,
//           type: destinationOutlet.centerType
//         }
//       }
//     };

//     // Add errors to response if any
//     if (errors.length > 0) {
//       response.data.errors = errors;
//       response.data.partialSuccess = transferResults.length > 0;
//     }

//     res.json(response);

//   } catch (error) {
//     console.error("Transfer repaired items error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to transfer repaired items",
//     });
//   }
// };

//****************below is work correct for non serialized product***********

// export const transferRepairedToMainWarehouse = async (req, res) => {
//   try {
//     const { hasAccess, userCenter } = checkStockUsagePermissions(
//       req,
//       ["manage_usage_own_center", "manage_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
//       });
//     }

//     const { items, transferRemark, outletId } = req.body;
//     const transferredBy = req.user.id;
//     const repairCenterId = userCenter?._id || req.user.center;

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Items array is required and cannot be empty",
//       });
//     }

//     if (!outletId || !mongoose.Types.ObjectId.isValid(outletId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid outlet ID is required",
//       });
//     }

//     const RepairTransfer = mongoose.model("RepairTransfer");
//     const OutletStock = mongoose.model("OutletStock");
//     const Center = mongoose.model("Center");
//     const Product = mongoose.model("Product");

//     const transferResults = [];
//     const errors = [];

//     // Validate outlet is actually an Outlet type
//     const destinationOutlet = await Center.findById(outletId);
//     if (!destinationOutlet || destinationOutlet.centerType !== "Outlet") {
//       return res.status(400).json({
//         success: false,
//         message: `Destination ${destinationOutlet?.centerName || 'Unknown'} is not an Outlet`,
//       });
//     }

//     for (const item of items) {
//       try {
//         const { productId, quantity, serialNumbers = [], damageRemark } = item;
        
//         const productDoc = await Product.findById(productId);
//         if (!productDoc) {
//           errors.push(`Product not found: ${productId}`);
//           continue;
//         }

//         console.log(`Processing ${productDoc.productTitle} (Serialized: ${productDoc.trackSerialNumber === "Yes"})`);
//         console.log(`User center/repair center: ${repairCenterId}`);
//         console.log(`Destination outlet: ${outletId}`);

//         // Find repair transfers with repaired items
//         const repairTransfers = await RepairTransfer.find({
//           product: productId,
//           toCenter: repairCenterId,
//           $or: [
//             { repairedQty: { $gt: 0 } }, // Has repaired items
//             { "serialNumbers.status": "repaired" } // Has repaired serials
//           ]
//         }).populate("product", "productTitle productCode trackSerialNumber");

//         console.log(`Found ${repairTransfers.length} repair transfers with repaired items`);
        
//         if (repairTransfers.length === 0) {
//           errors.push(`No repair transfers with repaired items found for product: ${productDoc.productTitle}`);
//           continue;
//         }

//         // Handle NON-SERIALIZED products
//         if (productDoc.trackSerialNumber === "No") {
//           console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
//           // Count total available repaired quantity
//           let totalAvailableRepaired = 0;
//           const eligibleTransfers = [];
          
//           for (const transfer of repairTransfers) {
//             const repairedQty = transfer.repairedQty || 0;
            
//             console.log(`Transfer ${transfer._id}: repairedQty=${repairedQty}`);
            
//             if (repairedQty > 0) {
//               totalAvailableRepaired += repairedQty;
//               eligibleTransfers.push({
//                 transfer,
//                 repairedQty: repairedQty
//               });
//             }
//           }
          
//           console.log(`Total available repaired: ${totalAvailableRepaired}, Requested: ${quantity}`);
          
//           if (totalAvailableRepaired < quantity) {
//             errors.push(`Insufficient repaired items for ${productDoc.productTitle}. Available: ${totalAvailableRepaired}, Requested: ${quantity}`);
//             continue;
//           }
          
//           // Process the transfer
//           let remainingToTransfer = quantity;
//           const transferredFromTransfers = [];
          
//           for (const eligibleTransfer of eligibleTransfers) {
//             if (remainingToTransfer <= 0) break;
            
//             const transfer = eligibleTransfer.transfer;
//             const toTransfer = Math.min(eligibleTransfer.repairedQty, remainingToTransfer);
            
//             if (toTransfer > 0) {
//               console.log(`Transferring ${toTransfer} items from transfer ${transfer._id}`);
              
//               // Update repair transfer quantity fields
//               transfer.returnedQty = (transfer.returnedQty || 0) + toTransfer;
//               transfer.repairedQty = Math.max(0, (transfer.repairedQty || 0) - toTransfer);
              
//               // Update underRepairQty
//               if (transfer.underRepairQty !== undefined) {
//                 transfer.underRepairQty = Math.max(0, 
//                   transfer.quantity - 
//                   (transfer.repairedQty || 0) - 
//                   (transfer.irrepairedQty || 0) - 
//                   (transfer.returnedQty || 0)
//                 );
//               }
              
//               // Update status
//               if (transfer.returnedQty === transfer.quantity) {
//                 transfer.status = "returned";
//               } else if (transfer.returnedQty > 0) {
//                 transfer.status = "partially_repaired";
//               }
              
//               // Add repair update
//               transfer.repairUpdates.push({
//                 date: new Date(),
//                 status: "transferred",
//                 remark: damageRemark || `Transferred ${toTransfer} repaired items to ${destinationOutlet.centerName}`,
//                 quantity: toTransfer,
//                 updatedBy: transferredBy
//               });
              
//               await transfer.save();
              
//               transferredFromTransfers.push({
//                 transferId: transfer._id,
//                 quantity: toTransfer
//               });
              
//               remainingToTransfer -= toTransfer;
              
//               console.log(`Transferred ${toTransfer} items from transfer ${transfer._id}`);
//             }
//           }
          
//           // UPDATE OUTLETSTOCK - For non-serialized products
//           let outletStock = await OutletStock.findOne({
//             outlet: outletId,
//             product: productId
//           });

//           if (!outletStock) {
//             // Create new outlet stock
//             outletStock = new OutletStock({
//               outlet: outletId,
//               product: productId,
//               totalQuantity: 0,
//               availableQuantity: 0,
//               inTransitQuantity: 0,
//               serialNumbers: []
//             });
//           }
          
//           // Update quantities
//           outletStock.availableQuantity += quantity;
//           outletStock.totalQuantity += quantity;
          
//           // For non-serialized products, add a placeholder serial number for tracking
//           // Create a unique repair ID for this batch
//           const repairBatchId = new mongoose.Types.ObjectId();
          
//           // Add serial number entry for repaired items
//           outletStock.serialNumbers.push({
//             serialNumber: `REPAIR-BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
//             purchaseId: repairBatchId, // Using repair transfer ID as purchaseId
//             status: "available",
//             sourceType: "repair_return", // Mark as repaired items
//             currentLocation: outletId,
//             transferHistory: [{
//               fromCenter: repairCenterId,
//               toCenter: outletId,
//               transferDate: new Date(),
//               transferType: "outlet_to_center",
//               remark: `Repaired items transferred from repair center: ${quantity} units`
//             }]
//           });
          
//           await outletStock.save();
          
//           transferResults.push({
//             product: productDoc.productTitle,
//             quantity: quantity,
//             serialNumbers: [], // No serials for non-serialized
//             fromRepairCenter: "Repair Team",
//             toWarehouse: destinationOutlet.centerName,
//             warehouseId: outletId,
//             repairTransferIds: transferredFromTransfers.map(t => t.transferId),
//             status: "success",
//             message: `Transferred ${quantity} repaired non-serialized items to ${destinationOutlet.centerName}`
//           });
          
//           console.log(`✓ Successfully transferred ${quantity} non-serialized items`);
          
//         } else {
//           // SERIALIZED PRODUCTS
//           console.log(`Product marked as serialized: ${productDoc.productTitle}`);
          
//           // For serialized products
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             // Check if we should treat as batch (single serial with quantity > 1)
//             const hasBatchSerials = repairTransfers.some(t => 
//               t.serialNumbers.some(s => (s.quantity || 1) > 1)
//             );
            
//             if (hasBatchSerials) {
//               console.log("Treating as batch serialized product");
              
//               // Find transfer with batch serials
//               let repairTransfer = null;
//               let batchSerial = null;
              
//               for (const transfer of repairTransfers) {
//                 const repairedBatch = transfer.serialNumbers.find(
//                   sn => sn.status === "repaired" && (sn.quantity || 1) > 0
//                 );
                
//                 if (repairedBatch) {
//                   repairTransfer = transfer;
//                   batchSerial = repairedBatch;
//                   break;
//                 }
//               }
              
//               if (!repairTransfer || !batchSerial) {
//                 errors.push(`No repaired batch found for product: ${productDoc.productTitle}`);
//                 continue;
//               }
              
//               const batchQuantity = batchSerial.quantity || 1;
//               console.log(`Found batch: ${batchSerial.serialNumber}, quantity: ${batchQuantity}`);
              
//               if (batchQuantity < quantity) {
//                 errors.push(`Insufficient repaired items in batch. Available: ${batchQuantity}, Requested: ${quantity}`);
//                 continue;
//               }
              
//               // Update batch serial
//               repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//                 if (sn.serialNumber === batchSerial.serialNumber && sn.status === "repaired") {
//                   // Mark batch as transferred
//                   return {
//                     ...sn.toObject(),
//                     status: "transferred",
//                     returnedQty: quantity,
//                     repairHistory: [
//                       ...(sn.repairHistory || []),
//                       {
//                         date: new Date(),
//                         status: "transferred",
//                         remark: damageRemark || `Transferred ${quantity} items to ${destinationOutlet.centerName}`,
//                         quantity: quantity,
//                         updatedBy: transferredBy
//                       }
//                     ]
//                   };
//                 }
//                 return sn;
//               });
              
//               // Update transfer quantities and status
//               repairTransfer.returnedQty = (repairTransfer.returnedQty || 0) + quantity;
//               repairTransfer.repairedQty = Math.max(0, (repairTransfer.repairedQty || 0) - quantity);
              
//               if (repairTransfer.returnedQty === repairTransfer.quantity) {
//                 repairTransfer.status = "returned";
//               } else if (repairTransfer.returnedQty > 0) {
//                 repairTransfer.status = "partially_repaired";
//               }
              
//               // Add repair update
//               repairTransfer.repairUpdates.push({
//                 date: new Date(),
//                 status: repairTransfer.status,
//                 remark: damageRemark || `Transferred ${quantity} batch items to ${destinationOutlet.centerName}`,
//                 quantity: quantity,
//                 updatedBy: transferredBy
//               });
              
//               await repairTransfer.save();
              
//               // UPDATE OUTLETSTOCK
//               let outletStock = await OutletStock.findOne({
//                 outlet: outletId,
//                 product: productId
//               });

//               if (!outletStock) {
//                 outletStock = new OutletStock({
//                   outlet: outletId,
//                   product: productId,
//                   totalQuantity: 0,
//                   availableQuantity: 0,
//                   inTransitQuantity: 0,
//                   serialNumbers: []
//                 });
//               }
              
//               // Update quantities
//               outletStock.availableQuantity += quantity;
//               outletStock.totalQuantity += quantity;
              
//               // Add batch serial number
//               const repairBatchId = new mongoose.Types.ObjectId();
              
//               outletStock.serialNumbers.push({
//                 serialNumber: batchSerial.serialNumber,
//                 purchaseId: repairBatchId,
//                 status: "available",
//                 sourceType: "repair_return",
//                 currentLocation: outletId,
//                 transferHistory: [{
//                   fromCenter: repairCenterId,
//                   toCenter: outletId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_center",
//                   remark: `Repaired batch transferred from repair center: ${quantity} units`
//                 }]
//               });
              
//               await outletStock.save();
              
//               transferResults.push({
//                 product: productDoc.productTitle,
//                 quantity: quantity,
//                 serialNumbers: [batchSerial.serialNumber],
//                 fromRepairCenter: "Repair Team",
//                 toWarehouse: destinationOutlet.centerName,
//                 warehouseId: outletId,
//                 repairTransferId: repairTransfer._id,
//                 repairTransferStatus: repairTransfer.status,
//                 status: "success",
//                 message: `Transferred ${quantity} repaired batch items to ${destinationOutlet.centerName}`
//               });
              
//             } else {
//               // Regular serialized products
//               errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//               continue;
//             }
//           } else {
//             // Handle regular serialized products with individual serials
//             // This part needs to be implemented based on your requirements
//             errors.push(`Individual serial transfer not yet implemented for: ${productDoc.productTitle}`);
//             continue;
//           }
//         }

//       } catch (error) {
//         console.error(`Error transferring ${item.productId}:`, error);
//         errors.push(`Error transferring ${item.productId}: ${error.message}`);
//       }
//     }

//     if (errors.length > 0 && transferResults.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to transfer any items",
//         errors: errors
//       });
//     }

//     const response = {
//       success: true,
//       message: `Transferred ${transferResults.length} repaired items to ${destinationOutlet.centerName}`,
//       data: {
//         transferred: transferResults,
//         totalItems: transferResults.length,
//         totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
//         destination: {
//           id: outletId,
//           name: destinationOutlet.centerName,
//           type: destinationOutlet.centerType
//         }
//       }
//     };

//     // Add errors to response if any
//     if (errors.length > 0) {
//       response.data.errors = errors;
//       response.data.partialSuccess = transferResults.length > 0;
//     }

//     res.json(response);

//   } catch (error) {
//     console.error("Transfer repaired items error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to transfer repaired items",
//     });
//   }
// };


export const transferRepairedToMainWarehouse = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { items, transferRemark, outletId } = req.body;
    const transferredBy = req.user.id;
    const repairCenterId = userCenter?._id || req.user.center;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required and cannot be empty",
      });
    }

    if (!outletId || !mongoose.Types.ObjectId.isValid(outletId)) {
      return res.status(400).json({
        success: false,
        message: "Valid outlet ID is required",
      });
    }

    const RepairTransfer = mongoose.model("RepairTransfer");
    const OutletStock = mongoose.model("OutletStock");
    const Center = mongoose.model("Center");
    const Product = mongoose.model("Product");

    const transferResults = [];
    const errors = [];

    // Validate outlet is actually an Outlet type
    const destinationOutlet = await Center.findById(outletId);
    if (!destinationOutlet || destinationOutlet.centerType !== "Outlet") {
      return res.status(400).json({
        success: false,
        message: `Destination ${destinationOutlet?.centerName || 'Unknown'} is not an Outlet`,
      });
    }

    for (const item of items) {
      try {
        const { productId, quantity, serialNumbers = [], damageRemark } = item;
        
        const productDoc = await Product.findById(productId);
        if (!productDoc) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        console.log(`Processing ${productDoc.productTitle} (Serialized: ${productDoc.trackSerialNumber === "Yes"})`);
        console.log(`User center/repair center: ${repairCenterId}`);
        console.log(`Destination outlet: ${outletId}`);

        // Find repair transfers with repaired items
        const repairTransfers = await RepairTransfer.find({
          product: productId,
          toCenter: repairCenterId,
          $or: [
            { repairedQty: { $gt: 0 } }, // Has repaired items
            { "serialNumbers.status": "repaired" } // Has repaired serials
          ]
        }).populate("product", "productTitle productCode trackSerialNumber");

        console.log(`Found ${repairTransfers.length} repair transfers with repaired items`);
        
        if (repairTransfers.length === 0) {
          errors.push(`No repair transfers with repaired items found for product: ${productDoc.productTitle}`);
          continue;
        }

        // Handle NON-SERIALIZED products
        if (productDoc.trackSerialNumber === "No") {
          console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
          // Count total available repaired quantity
          let totalAvailableRepaired = 0;
          const eligibleTransfers = [];
          
          for (const transfer of repairTransfers) {
            const repairedQty = transfer.repairedQty || 0;
            
            console.log(`Transfer ${transfer._id}: repairedQty=${repairedQty}`);
            
            if (repairedQty > 0) {
              totalAvailableRepaired += repairedQty;
              eligibleTransfers.push({
                transfer,
                repairedQty: repairedQty
              });
            }
          }
          
          console.log(`Total available repaired: ${totalAvailableRepaired}, Requested: ${quantity}`);
          
          if (totalAvailableRepaired < quantity) {
            errors.push(`Insufficient repaired items for ${productDoc.productTitle}. Available: ${totalAvailableRepaired}, Requested: ${quantity}`);
            continue;
          }
          
          // Process the transfer
          let remainingToTransfer = quantity;
          const transferredFromTransfers = [];
          
          for (const eligibleTransfer of eligibleTransfers) {
            if (remainingToTransfer <= 0) break;
            
            const transfer = eligibleTransfer.transfer;
            const toTransfer = Math.min(eligibleTransfer.repairedQty, remainingToTransfer);
            
            if (toTransfer > 0) {
              console.log(`Transferring ${toTransfer} items from transfer ${transfer._id}`);
              
              // Update repair transfer quantity fields
              transfer.returnedQty = (transfer.returnedQty || 0) + toTransfer;
              transfer.repairedQty = Math.max(0, (transfer.repairedQty || 0) - toTransfer);
              
              // Update underRepairQty
              if (transfer.underRepairQty !== undefined) {
                transfer.underRepairQty = Math.max(0, 
                  transfer.quantity - 
                  (transfer.repairedQty || 0) - 
                  (transfer.irrepairedQty || 0) - 
                  (transfer.returnedQty || 0)
                );
              }
              
              // Update status
              if (transfer.returnedQty === transfer.quantity) {
                transfer.status = "returned";
              } else if (transfer.returnedQty > 0) {
                transfer.status = "partially_repaired";
              }
              
              // Add repair update
              transfer.repairUpdates.push({
                date: new Date(),
                status: "transferred",
                remark: damageRemark || `Transferred ${toTransfer} repaired items to ${destinationOutlet.centerName}`,
                quantity: toTransfer,
                updatedBy: transferredBy
              });
              
              await transfer.save();
              
              transferredFromTransfers.push({
                transferId: transfer._id,
                quantity: toTransfer
              });
              
              remainingToTransfer -= toTransfer;
              
              console.log(`Transferred ${toTransfer} items from transfer ${transfer._id}`);
            }
          }
          
          // UPDATE OUTLETSTOCK - For non-serialized products
          let outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId
          });

          if (!outletStock) {
            // Create new outlet stock
            outletStock = new OutletStock({
              outlet: outletId,
              product: productId,
              totalQuantity: 0,
              availableQuantity: 0,
              inTransitQuantity: 0,
              serialNumbers: []
            });
          }
          
          // Update quantities
          outletStock.availableQuantity += quantity;
          outletStock.totalQuantity += quantity;
          
          // For non-serialized products, add a placeholder serial number for tracking
          // Create a unique repair ID for this batch
          const repairBatchId = new mongoose.Types.ObjectId();
          
          // Add serial number entry for repaired items
          outletStock.serialNumbers.push({
            serialNumber: `REPAIR-BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            purchaseId: repairBatchId,
            status: "available",
            sourceType: "repair_return", // Mark as repaired items
            currentLocation: outletId,
            transferHistory: [{
              fromCenter: repairCenterId,
              toCenter: outletId,
              transferDate: new Date(),
              transferType: "outlet_to_center",
              remark: `Repaired items transferred from repair center: ${quantity} units`
            }]
          });
          
          await outletStock.save();
          
          transferResults.push({
            product: productDoc.productTitle,
            quantity: quantity,
            serialNumbers: [], // No serials for non-serialized
            fromRepairCenter: "Repair Team",
            toWarehouse: destinationOutlet.centerName,
            warehouseId: outletId,
            repairTransferIds: transferredFromTransfers.map(t => t.transferId),
            status: "success",
            message: `Transferred ${quantity} repaired non-serialized items to ${destinationOutlet.centerName}`
          });
          
          console.log(`✓ Successfully transferred ${quantity} non-serialized items`);
          
        } else {
          // SERIALIZED PRODUCTS
          console.log(`Product marked as serialized: ${productDoc.productTitle}`);
          
          // Check if serial numbers are provided
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
            continue;
          }

          // For serialized products with individual serials
          console.log(`Processing ${serialNumbers.length} serial numbers: ${serialNumbers.join(', ')}`);
          
          // Find repair transfers that contain these serials
          let repairTransfer = null;
          const foundSerials = [];
          const missingSerials = [];
          
          // Check each serial number
          for (const serialNumber of serialNumbers) {
            let found = false;
            
            for (const transfer of repairTransfers) {
              const serial = transfer.serialNumbers.find(sn => 
                sn.serialNumber === serialNumber && 
                sn.status === "repaired"
              );
              
              if (serial) {
                if (!repairTransfer) {
                  repairTransfer = transfer;
                }
                foundSerials.push({
                  serialNumber,
                  transferId: transfer._id,
                  serialData: serial
                });
                found = true;
                break;
              }
            }
            
            if (!found) {
              missingSerials.push(serialNumber);
            }
          }
          
          if (missingSerials.length > 0) {
            errors.push(`Some serial numbers are not available or not repaired: ${missingSerials.join(', ')}`);
            continue;
          }
          
          if (!repairTransfer) {
            errors.push(`No repair transfer found containing the provided serial numbers for product: ${productDoc.productTitle}`);
            continue;
          }
          
          // Verify all serials belong to the same repair transfer
          const transferIds = [...new Set(foundSerials.map(s => s.transferId))];
          if (transferIds.length > 1) {
            errors.push(`Serial numbers belong to multiple repair transfers. All serials must be from the same transfer.`);
            continue;
          }
          
          console.log(`Found repair transfer: ${repairTransfer._id} with ${foundSerials.length} repaired serials`);
          
          // Update each serial in the repair transfer
          for (const foundSerial of foundSerials) {
            repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
              if (sn.serialNumber === foundSerial.serialNumber) {
                // Mark serial as transferred
                return {
                  ...sn.toObject(),
                  status: "transferred",
                  repairHistory: [
                    ...(sn.repairHistory || []),
                    {
                      date: new Date(),
                      status: "transferred",
                      remark: damageRemark || `Transferred to ${destinationOutlet.centerName}`,
                      updatedBy: transferredBy
                    }
                  ]
                };
              }
              return sn;
            });
          }
          
          // Update repair transfer quantities
          repairTransfer.returnedQty = (repairTransfer.returnedQty || 0) + quantity;
          repairTransfer.repairedQty = Math.max(0, (repairTransfer.repairedQty || 0) - quantity);
          
          // Update status
          if (repairTransfer.returnedQty === repairTransfer.quantity) {
            repairTransfer.status = "returned";
          } else if (repairTransfer.returnedQty > 0) {
            repairTransfer.status = "partially_repaired";
          }
          
          // Add repair update
          repairTransfer.repairUpdates.push({
            date: new Date(),
            status: "transferred",
            remark: damageRemark || `Transferred ${quantity} serialized items (${serialNumbers.join(', ')}) to ${destinationOutlet.centerName}`,
            quantity: quantity,
            updatedBy: transferredBy
          });
          
          await repairTransfer.save();
          
          // UPDATE OUTLETSTOCK for serialized products
          let outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId
          });

          if (!outletStock) {
            outletStock = new OutletStock({
              outlet: outletId,
              product: productId,
              totalQuantity: 0,
              availableQuantity: 0,
              inTransitQuantity: 0,
              serialNumbers: []
            });
          }
          
          // Update quantities
          outletStock.availableQuantity += quantity;
          outletStock.totalQuantity += quantity;
          
          // Add each serial number to outlet stock
          for (const serialNumber of serialNumbers) {
            const repairBatchId = new mongoose.Types.ObjectId();
            
            // Check if serial already exists in outlet stock
            const existingSerialIndex = outletStock.serialNumbers.findIndex(
              sn => sn.serialNumber === serialNumber
            );
            
            if (existingSerialIndex === -1) {
              // Add new serial
              outletStock.serialNumbers.push({
                serialNumber: serialNumber,
                purchaseId: repairBatchId,
                status: "available",
                sourceType: "repair_return",
                currentLocation: outletId,
                transferHistory: [{
                  fromCenter: repairCenterId,
                  toCenter: outletId,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  remark: `Repaired serial transferred from repair center`
                }]
              });
            } else {
              // Update existing serial
              outletStock.serialNumbers[existingSerialIndex].status = "available";
              outletStock.serialNumbers[existingSerialIndex].sourceType = "repair_return";
              outletStock.serialNumbers[existingSerialIndex].currentLocation = outletId;
              
              if (!outletStock.serialNumbers[existingSerialIndex].transferHistory) {
                outletStock.serialNumbers[existingSerialIndex].transferHistory = [];
              }
              
              outletStock.serialNumbers[existingSerialIndex].transferHistory.push({
                fromCenter: repairCenterId,
                toCenter: outletId,
                transferDate: new Date(),
                transferType: "outlet_to_center",
                remark: `Repaired serial transferred from repair center`
              });
            }
          }
          
          await outletStock.save();
          
          transferResults.push({
            product: productDoc.productTitle,
            quantity: quantity,
            serialNumbers: serialNumbers,
            fromRepairCenter: "Repair Team",
            toWarehouse: destinationOutlet.centerName,
            warehouseId: outletId,
            repairTransferId: repairTransfer._id,
            repairTransferStatus: repairTransfer.status,
            status: "success",
            message: `Transferred ${quantity} repaired serialized items to ${destinationOutlet.centerName}`
          });
          
          console.log(`✓ Successfully transferred ${quantity} serialized items`);
        }

      } catch (error) {
        console.error(`Error transferring ${item.productId}:`, error);
        errors.push(`Error transferring ${item.productId}: ${error.message}`);
      }
    }

    if (errors.length > 0 && transferResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to transfer any items",
        errors: errors
      });
    }

    const response = {
      success: true,
      message: `Transferred ${transferResults.length} repaired items to ${destinationOutlet.centerName}`,
      data: {
        transferred: transferResults,
        totalItems: transferResults.length,
        totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
        destination: {
          id: outletId,
          name: destinationOutlet.centerName,
          type: destinationOutlet.centerType
        }
      }
    };

    // Add errors to response if any
    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = transferResults.length > 0;
    }

    res.json(response);

  } catch (error) {
    console.error("Transfer repaired items error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer repaired items",
    });
  }
};

export const transferRepairedToResellerStock = async (req, res) => {
  try {
    const { items, transferRemark } = req.body;
    const transferredBy = req.user.id;
    const sourceOutletId = req.user.center;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required",
      });
    }

    const transferResults = [];
    const errors = [];

    for (const item of items) {
      try {
        const { outletStockId, productId, quantity, serialNumbers, resellerId } = item;
        
        if (!resellerId) {
          errors.push(`Reseller ID is required for item: ${productId}`);
          continue;
        }

        const productDoc = await Product.findById(productId);
        if (!productDoc) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        const outletStock = await OutletStock.findById(outletStockId);
        if (!outletStock) {
          errors.push(`Outlet stock not found for ID: ${outletStockId}`);
          continue;
        }

        // Validate serial numbers
        let serialsToTransfer = [];
        if (productDoc.trackSerialNumber === "Yes") {
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
            continue;
          }

          const availableSerials = outletStock.serialNumbers.filter(
            sn => serialNumbers.includes(sn.serialNumber) &&
                 sn.status === "available" &&
                 sn.sourceType === "repair_return"
          );

          if (availableSerials.length !== quantity) {
            const missingSerials = serialNumbers.filter(sn => 
              !availableSerials.map(as => as.serialNumber).includes(sn)
            );
            errors.push(`Some serials are not available: ${missingSerials.join(', ')}. Available serials: ${availableSerials.map(as => as.serialNumber).join(', ')}`);
            continue;
          }

          serialsToTransfer = serialNumbers;
        } else {
          const availableRepaired = outletStock.availableQuantity;
          if (availableRepaired < quantity) {
            errors.push(`Insufficient repaired stock. Available: ${availableRepaired}, Requested: ${quantity}`);
            continue;
          }
        }

        // 1. UPDATE OUTLETSTOCK
        if (productDoc.trackSerialNumber === "Yes") {
          outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
            if (serialsToTransfer.includes(sn.serialNumber)) {
              const transferRecord = {
                fromCenter: sourceOutletId,
                toReseller: resellerId, // Store resellerId here
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                // referenceId: outletStock._id,
                // remark: transferRemark || `Transferred to reseller ${resellerId}`,
                // transferredBy: transferredBy
              };
              
              const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];
              
              return {
                ...sn.toObject(),
                status: "transferred",
                currentLocation: null, // No center for reseller transfers
                transferHistory: [...transferHistory, transferRecord]
              };
            }
            return sn;
          });
        }
        
        outletStock.availableQuantity -= quantity;
        outletStock.totalQuantity -= quantity;
        await outletStock.save();

        // 2. ADD/UPDATE RESELLER STOCK
        let resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId
        });

        if (resellerStock) {
          if (productDoc.trackSerialNumber === "Yes") {
            for (const serialNumber of serialsToTransfer) {
              const existingSerialIndex = resellerStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber
              );

              if (existingSerialIndex === -1) {
                resellerStock.serialNumbers.push({
                  serialNumber: serialNumber,
                  status: "available",
                  currentLocation: null,
                  transferHistory: [{
                    fromCenter: sourceOutletId,
                    toReseller: resellerId, // Store resellerId
                    transferDate: new Date(),
                    transferType: "outlet_to_reseller",
                    referenceId: outletStock._id,
                    remark: transferRemark || `Transferred from outlet repair stock`,
                    transferredBy: transferredBy
                  }]
                });
              } else {
                resellerStock.serialNumbers[existingSerialIndex].status = "available";
                resellerStock.serialNumbers[existingSerialIndex].currentLocation = null;
                resellerStock.serialNumbers[existingSerialIndex].transferHistory.push({
                  fromCenter: sourceOutletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  referenceId: outletStock._id,
                  remark: transferRemark || `Transferred from outlet repair stock`,
                  transferredBy: transferredBy
                });
              }
            }
          }
          
          resellerStock.availableQuantity += quantity;
          resellerStock.totalQuantity += quantity;
        } else {
          const newResellerStock = new ResellerStock({
            reseller: resellerId,
            product: productId,
            availableQuantity: quantity,
            totalQuantity: quantity,
            consumedQuantity: 0,
            damagedQuantity: 0,
            repairQuantity: 0,
            serialNumbers: productDoc.trackSerialNumber === "Yes" ? 
              serialsToTransfer.map(serialNumber => ({
                serialNumber: serialNumber,
                status: "available",
                currentLocation: null,
                transferHistory: [{
                  fromCenter: sourceOutletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  referenceId: outletStock._id,
                  remark: transferRemark || `Transferred from outlet repair stock`,
                  transferredBy: transferredBy
                }]
              })) : []
          });
          
          resellerStock = newResellerStock;
        }

        await resellerStock.save();

        transferResults.push({
          product: productDoc.productTitle,
          quantity: quantity,
          serialNumbers: serialsToTransfer,
          fromOutlet: sourceOutletId,
          toReseller: resellerId,
          outletStockId: outletStock._id,
          resellerStockId: resellerStock._id,
          status: "success",
          message: `Transferred ${quantity} items to reseller stock`
        });

        console.log(`✓ Transferred ${quantity} items from outlet ${sourceOutletId} to reseller ${resellerId}`);

      } catch (error) {
        console.error(`Error transferring item:`, error);
        errors.push(`Error transferring ${item.productId || 'item'}: ${error.message}`);
      }
    }

    const response = {
      success: transferResults.length > 0,
      message: transferResults.length > 0 
        ? `Transferred ${transferResults.length} items to reseller stock` 
        : 'No items transferred',
      data: {
        transferred: transferResults,
        errors: errors.length > 0 ? errors : undefined
      }
    };

    if (errors.length > 0 && transferResults.length === 0) {
      return res.status(400).json(response);
    }

    res.json(response);

  } catch (error) {
    console.error("Transfer to reseller stock error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer to reseller stock",
    });
  }
};

// export const getRepairedProductsInOutletStock = async (req, res) => {
//   try {
//     const { hasAccess } = checkStockUsagePermissions(
//       req,
//       ["view_usage_own_center", "view_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied.",
//       });
//     }

//     const OutletStock = mongoose.model("OutletStock");
//     const RepairTransfer = mongoose.model("RepairTransfer");

//     const outletStocks = await OutletStock.find({
//       "serialNumbers.sourceType": "repair_return"
//     })
//     .populate({
//       path: "outlet",
//       select: "_id centerName" 
//     })
//     .populate({
//       path: "product",
//       select: "_id productTitle trackSerialNumber"
//     });

//     const result = [];

//     for (const outletStock of outletStocks) {
//       const repairedSerials = outletStock.serialNumbers.filter(
//         sn => sn.sourceType === "repair_return" && sn.status === "available"
//       );

//       if (repairedSerials.length === 0) continue;

//       const serialNumbers = repairedSerials.map(sn => sn.serialNumber);

//       const repairTransfers = await RepairTransfer.find({
//         product: outletStock.product,
//         "serialNumbers.serialNumber": { $in: serialNumbers },
//         "serialNumbers.status": "transferred"
//       })
//       .populate({
//         path: 'faultyStock',
//         populate: [
//           {
//             path: 'center',
//             select: '_id centerName',
//             populate: {
//               path: 'reseller',
//               select: '_id businessName'
//             }
//           }
//         ]
//       });

//       const groups = {};
      
//       for (const transfer of repairTransfers) {
//         if (!transfer.faultyStock || !transfer.faultyStock.center) continue;
        
//         const center = transfer.faultyStock.center;
//         const reseller = center.reseller;
        
//         if (!reseller) continue;
        
//         const key = `${center._id}-${reseller._id}`;
        
//         if (!groups[key]) {
//           groups[key] = {
//             center: {
//               _id: center._id,
//               centerName: center.centerName,
//               centerCode: center.centerCode
//             },
//             reseller: {
//               _id: reseller._id,
//               resellerName: reseller.businessName
//             },
//             serials: [],
//             quantity: 0
//           };
//         }

//         const transferSerials = transfer.serialNumbers
//           .filter(sn => serialNumbers.includes(sn.serialNumber))
//           .map(sn => sn.serialNumber);
        
//         groups[key].serials.push(...transferSerials);
//         groups[key].quantity = groups[key].serials.length;
//       }

//       const resellerGroups = Object.values(groups);

//       if (resellerGroups.length > 0) {
//         const cleanedSerials = repairedSerials.map(serial => ({
//           serialNumber: serial.serialNumber,
//           status: serial.status,
//           sourceType: serial.sourceType
//         }));

//         result.push({
//           outlet: {
//             _id: outletStock.outlet._id,
//             centerName: outletStock.outlet.centerName,
//             centerCode: outletStock.outlet.centerCode,
//             centerType: outletStock.outlet.centerType
//           },
//           product: {
//             _id: outletStock.product._id,
//             productTitle: outletStock.product.productTitle,
//             productCode: outletStock.product.productCode,
//             trackSerialNumber: outletStock.product.trackSerialNumber
//           },
//           totalRepairedQuantity: repairedSerials.length,
//           repairedSerials: cleanedSerials,
//           resellerGroups: resellerGroups,
//           center: resellerGroups[0]?.center || null,
//           reseller: resellerGroups[0]?.reseller || null,
//           outletStockId: outletStock._id,
//           lastUpdated: outletStock.updatedAt
//         });
//       }
//     }

//     res.json({
//       success: true,
//       data: {
//         repairedProducts: result,
//         totalItems: result.length,
//         totalRepairedQuantity: result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0)
//       }
//     });

//   } catch (error) {
//     console.error("Get repaired products error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };



export const getRepairedProductsInOutletStock = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const OutletStock = mongoose.model("OutletStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");

    // Get all outlet stocks with repaired items
    // For non-serialized products, we should also check by quantity
    const outletStocks = await OutletStock.find({
      $or: [
        { "serialNumbers.sourceType": "repair_return" }, // Serialized repair returns
        { availableQuantity: { $gt: 0 } } // Non-serialized products might have repaired items
      ]
    })
    .populate({
      path: "outlet",
      select: "_id centerName centerCode centerType" 
    })
    .populate({
      path: "product",
      select: "_id productTitle productCode trackSerialNumber"
    });

    const result = [];

    for (const outletStock of outletStocks) {
      // For non-serialized products, we need a different approach
      if (outletStock.product.trackSerialNumber === "No") {
        // Check if there are any repaired items in this outlet stock
        // We need to find repair transfers that were transferred to this outlet
        const repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
          status: { $in: ["partially_repaired", "returned"] }, // These have transferred repaired items
          "repairUpdates.status": "transferred",
          "repairUpdates.remark": { $regex: new RegExp(outletStock.outlet.centerName, "i") }
        })
        .populate({
          path: 'faultyStock',
          populate: [
            {
              path: 'center',
              select: '_id centerName centerCode',
              populate: {
                path: 'reseller',
                select: '_id businessName'
              }
            }
          ]
        });

        if (repairTransfers.length === 0) continue;

        // Calculate total repaired quantity from these transfers for this outlet
        let totalRepairedQuantity = 0;
        const groups = {};
        
        for (const transfer of repairTransfers) {
          if (!transfer.faultyStock || !transfer.faultyStock.center) continue;
          
          const center = transfer.faultyStock.center;
          const reseller = center.reseller;
          
          if (!reseller) continue;
          
          const key = `${center._id}-${reseller._id}`;
          
          if (!groups[key]) {
            groups[key] = {
              center: {
                _id: center._id,
                centerName: center.centerName,
                centerCode: center.centerCode
              },
              reseller: {
                _id: reseller._id,
                resellerName: reseller.businessName
              },
              quantity: 0,
              transferIds: []
            };
          }

          // Calculate how much was transferred to this outlet from this transfer
          const transfersToThisOutlet = transfer.repairUpdates.filter(update => 
            update.status === "transferred" && 
            update.remark && 
            update.remark.includes(outletStock.outlet.centerName)
          );
          
          const transferredQuantity = transfersToThisOutlet.reduce((sum, update) => 
            sum + (update.quantity || 0), 0
          );
          
          if (transferredQuantity > 0) {
            groups[key].quantity += transferredQuantity;
            groups[key].transferIds.push(transfer._id);
            totalRepairedQuantity += transferredQuantity;
          }
        }

        const resellerGroups = Object.values(groups);

        if (resellerGroups.length > 0) {
          // Get the repaired serials for this product (if any exist)
          const repairedSerials = outletStock.serialNumbers.filter(
            sn => sn.sourceType === "repair_return" && sn.status === "available"
          );

          result.push({
            outlet: {
              _id: outletStock.outlet._id,
              centerName: outletStock.outlet.centerName,
              centerCode: outletStock.outlet.centerCode,
              centerType: outletStock.outlet.centerType
            },
            product: {
              _id: outletStock.product._id,
              productTitle: outletStock.product.productTitle,
              productCode: outletStock.product.productCode,
              trackSerialNumber: outletStock.product.trackSerialNumber
            },
            totalRepairedQuantity: totalRepairedQuantity,
            repairedSerials: repairedSerials.map(serial => ({
              serialNumber: serial.serialNumber,
              status: serial.status,
              sourceType: serial.sourceType,
              quantity: 1 // For non-serialized, each serial represents the batch quantity
            })),
            resellerGroups: resellerGroups,
            center: resellerGroups[0]?.center || null,
            reseller: resellerGroups[0]?.reseller || null,
            outletStockId: outletStock._id,
            lastUpdated: outletStock.updatedAt,
            outletStockQuantity: {
              total: outletStock.totalQuantity,
              available: outletStock.availableQuantity,
              inTransit: outletStock.inTransitQuantity
            },
            isNonSerialized: true,
            note: "For non-serialized products, serial numbers represent batch entries"
          });
        }
      } else {
        // SERIALIZED PRODUCTS - Original logic
        const repairedSerials = outletStock.serialNumbers.filter(
          sn => sn.sourceType === "repair_return" && sn.status === "available"
        );

        if (repairedSerials.length === 0) continue;

        const serialNumbers = repairedSerials.map(sn => sn.serialNumber);

        // Look for repair transfers with these serials OR transfers to this outlet
        const repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
          $or: [
            { "serialNumbers.serialNumber": { $in: serialNumbers } },
            { 
              "repairUpdates.status": "transferred",
              "repairUpdates.remark": { $regex: new RegExp(outletStock.outlet.centerName, "i") }
            }
          ]
        })
        .populate({
          path: 'faultyStock',
          populate: [
            {
              path: 'center',
              select: '_id centerName centerCode',
              populate: {
                path: 'reseller',
                select: '_id businessName'
              }
            }
          ]
        });

        const groups = {};
        
        for (const transfer of repairTransfers) {
          if (!transfer.faultyStock || !transfer.faultyStock.center) continue;
          
          const center = transfer.faultyStock.center;
          const reseller = center.reseller;
          
          if (!reseller) continue;
          
          const key = `${center._id}-${reseller._id}`;
          
          if (!groups[key]) {
            groups[key] = {
              center: {
                _id: center._id,
                centerName: center.centerName,
                centerCode: center.centerCode
              },
              reseller: {
                _id: reseller._id,
                resellerName: reseller.businessName
              },
              serials: [],
              quantity: 0
            };
          }

          // Find matching serials
          const transferSerials = transfer.serialNumbers
            .filter(sn => serialNumbers.includes(sn.serialNumber))
            .map(sn => sn.serialNumber);
          
          if (transferSerials.length > 0) {
            groups[key].serials.push(...transferSerials);
            groups[key].quantity += transferSerials.length;
          }
        }

        const resellerGroups = Object.values(groups);

        if (resellerGroups.length > 0) {
          const cleanedSerials = repairedSerials.map(serial => ({
            serialNumber: serial.serialNumber,
            status: serial.status,
            sourceType: serial.sourceType,
            purchaseId: serial.purchaseId
          }));

          result.push({
            outlet: {
              _id: outletStock.outlet._id,
              centerName: outletStock.outlet.centerName,
              centerCode: outletStock.outlet.centerCode,
              centerType: outletStock.outlet.centerType
            },
            product: {
              _id: outletStock.product._id,
              productTitle: outletStock.product.productTitle,
              productCode: outletStock.product.productCode,
              trackSerialNumber: outletStock.product.trackSerialNumber
            },
            totalRepairedQuantity: repairedSerials.length,
            repairedSerials: cleanedSerials,
            resellerGroups: resellerGroups,
            center: resellerGroups[0]?.center || null,
            reseller: resellerGroups[0]?.reseller || null,
            outletStockId: outletStock._id,
            lastUpdated: outletStock.updatedAt,
            outletStockQuantity: {
              total: outletStock.totalQuantity,
              available: outletStock.availableQuantity,
              inTransit: outletStock.inTransitQuantity
            },
            isNonSerialized: false
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        repairedProducts: result,
        totalItems: result.length,
        totalRepairedQuantity: result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0),
        summary: {
          serialized: result.filter(item => !item.isNonSerialized).length,
          nonSerialized: result.filter(item => item.isNonSerialized).length
        }
      }
    });

  } catch (error) {
    console.error("Get repaired products error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};