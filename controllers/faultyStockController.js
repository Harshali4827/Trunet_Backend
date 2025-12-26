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
//     const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
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

//         // FIX: Check for current user's center if they don't have all-center access
//         let faultyFilter = {
//           product: productId
//         };
        
//         // Add center filter for users with only own center access
//         if (!permissions.manage_usage_all_center && userCenter) {
//           faultyFilter.center = userCenter._id || userCenter;
//         }

//         // Find existing faulty stock for this product
//         const existingFaultyStocks = await FaultyStock.find(faultyFilter);
        
//         if (!existingFaultyStocks || existingFaultyStocks.length === 0) {
//           errors.push(`No faulty stock found for product: ${product.productTitle}`);
//           continue;
//         }

//         let selectedFaultyStock = null;
//         let totalAvailableDamaged = 0;
//         let allDamagedSerials = [];
        
//         for (const faultyStock of existingFaultyStocks) {
//           if (product.trackSerialNumber === "Yes") {
//             // SERIALIZED PRODUCTS: Look for damaged serials
//             const damagedSerialsInRecord = faultyStock.serialNumbers.filter(
//               sn => sn.status === "damaged"
//             );
            
//             if (damagedSerialsInRecord.length > 0) {
//               allDamagedSerials = [...allDamagedSerials, ...damagedSerialsInRecord];
//               totalAvailableDamaged += damagedSerialsInRecord.length;
              
//               if (!selectedFaultyStock) {
//                 selectedFaultyStock = faultyStock;
//               }
//             }
//           } else {
//             // NON-SERIALIZED PRODUCTS: Check overall status and quantities
//             if (faultyStock.overallStatus === "damaged") {
//               // If overall status is damaged, all items are damaged
//               totalAvailableDamaged += faultyStock.quantity;
//             } else if (faultyStock.overallStatus === "partially_repaired") {
//               // For partially repaired, calculate damaged quantity
//               const damagedQty = faultyStock.quantity - 
//                 (faultyStock.repairedQty || 0) - 
//                 (faultyStock.irrepairedQty || 0) - 
//                 (faultyStock.underRepairQty || 0);
              
//               if (damagedQty > 0) {
//                 totalAvailableDamaged += damagedQty;
//               }
//             }
            
//             if (totalAvailableDamaged > 0 && !selectedFaultyStock) {
//               selectedFaultyStock = faultyStock;
//             }
//           }
//         }

//         console.log(`Product: ${product.productTitle}, Type: ${product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);
//         console.log(`Total available damaged: ${totalAvailableDamaged}, Requested: ${quantity}`);

//         if (totalAvailableDamaged === 0) {
//           errors.push(`No damaged items available for product: ${product.productTitle}. All items are either repaired, under repair, or irreparable.`);
//           continue;
//         }

//         if (quantity > totalAvailableDamaged) {
//           errors.push(`Insufficient damaged stock quantity for ${product.productTitle}. Available damaged items: ${totalAvailableDamaged}, Requested: ${quantity}`);
//           continue;
//         }

//         // Validate serial numbers if product tracks them
//         let actualSerialsToTransfer = [];
//         if (product.trackSerialNumber === "Yes") {
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             // If no serial numbers provided, use the first N damaged serials
//             const availableSerialNumbers = allDamagedSerials.map(sn => sn.serialNumber);
//             actualSerialsToTransfer = availableSerialNumbers.slice(0, quantity);
//           } else {
//             // Validate provided serial numbers
//             if (serialNumbers.length !== quantity) {
//               errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${product.productTitle}`);
//               continue;
//             }

//             const availableSerialNumbers = allDamagedSerials.map(sn => sn.serialNumber);
//             const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
            
//             if (invalidSerials.length > 0) {
//               // Check if invalid serials exist but are not damaged
//               const allSerials = existingFaultyStocks.flatMap(fs => fs.serialNumbers);
//               const nonDamagedSerials = [];
              
//               for (const invalidSn of invalidSerials) {
//                 const serialInfo = allSerials.find(sn => sn.serialNumber === invalidSn);
//                 if (serialInfo) {
//                   nonDamagedSerials.push(`${invalidSn} (status: ${serialInfo.status})`);
//                 }
//               }
              
//               if (nonDamagedSerials.length > 0) {
//                 errors.push(`Cannot transfer serials with non-damaged status for product ${product.productTitle}: ${nonDamagedSerials.join(', ')}`);
//                 continue;
//               } else {
//                 errors.push(`Invalid serial numbers for product ${product.productTitle}: ${invalidSerials.join(', ')}`);
//                 continue;
//               }
//             }
//             actualSerialsToTransfer = serialNumbers;
//           }
//         }
//         // For non-serialized products, no serial validation needed

//         console.log(`Processing transfer: ${product.productTitle}, Qty: ${quantity}, Type: ${product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);

//         // Update the selected faulty stock record
//         if (!selectedFaultyStock) {
//           errors.push(`No valid faulty stock record found for product: ${product.productTitle}`);
//           continue;
//         }

//         if (product.trackSerialNumber === "Yes") {
//           // SERIALIZED PRODUCTS: Update serial numbers status to "under_repair"
//           let updatedCount = 0;
//           for (const serial of selectedFaultyStock.serialNumbers) {
//             if (actualSerialsToTransfer.includes(serial.serialNumber)) {
//               serial.status = "under_repair";
              
//               // Update serial's underRepairQty
//               serial.underRepairQty = 1; // Each serial is 1 unit
//               serial.repairedQty = 0;
//               serial.irrepairedQty = 0;
              
//               // Add repair history entry
//               serial.repairHistory = serial.repairHistory || [];
//               serial.repairHistory.push({
//                 date: new Date(),
//                 status: "under_repair",
//                 remark: damageRemark || "Transferred to repair center",
//                 updatedBy: transferredBy,
//                 cost: 0
//               });
              
//               updatedCount++;
//             }
//           }

//           if (updatedCount !== quantity) {
//             errors.push(`Failed to update all serial numbers. Expected: ${quantity}, Updated: ${updatedCount}`);
//             continue;
//           }
//         } else {
//           // NON-SERIALIZED PRODUCTS: SIMPLIFIED - Just update quantities
//           // Move quantity from damaged to underRepair
//           selectedFaultyStock.underRepairQty = (selectedFaultyStock.underRepairQty || 0) + quantity;
          
//           // Update overall status based on remaining quantities
//           const totalProcessed = (selectedFaultyStock.repairedQty || 0) + 
//                                (selectedFaultyStock.irrepairedQty || 0) + 
//                                (selectedFaultyStock.underRepairQty || 0);
//           const remainingDamaged = selectedFaultyStock.quantity - totalProcessed;
          
//           if (remainingDamaged > 0 && selectedFaultyStock.underRepairQty > 0) {
//             selectedFaultyStock.overallStatus = "partially_repaired";
//           } else if (selectedFaultyStock.underRepairQty === selectedFaultyStock.quantity) {
//             selectedFaultyStock.overallStatus = "under_repair";
//           } else if (remainingDamaged > 0) {
//             selectedFaultyStock.overallStatus = "damaged";
//           }
          
//           console.log(`Non-serialized: Updated underRepairQty to ${selectedFaultyStock.underRepairQty}, Status: ${selectedFaultyStock.overallStatus}`);
//         }

//         // Recalculate overall quantities based on current status
//         if (product.trackSerialNumber === "Yes") {
//           const damagedCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "damaged").length;
//           const underRepairCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "under_repair").length;
//           const repairedCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "repaired").length;
//           const irreparableCount = selectedFaultyStock.serialNumbers.filter(sn => sn.status === "irreparable").length;

//           // Update faulty stock quantities
//           selectedFaultyStock.underRepairQty = underRepairCount;
//           selectedFaultyStock.repairedQty = repairedCount;
//           selectedFaultyStock.irrepairedQty = irreparableCount;
          
//           // Recalculate overall status
//           if (damagedCount > 0 && underRepairCount > 0) {
//             selectedFaultyStock.overallStatus = "partially_repaired";
//           } else if (damagedCount > 0) {
//             selectedFaultyStock.overallStatus = "damaged";
//           } else if (underRepairCount > 0) {
//             selectedFaultyStock.overallStatus = "under_repair";
//           } else if (repairedCount === selectedFaultyStock.serialNumbers.length) {
//             selectedFaultyStock.overallStatus = "repaired";
//           } else if (irreparableCount === selectedFaultyStock.serialNumbers.length) {
//             selectedFaultyStock.overallStatus = "irreparable";
//           }
//         }

//         await selectedFaultyStock.save();

//         // CHECK IF REPAIR TRANSFER ALREADY EXISTS
//         let repairTransfer = await RepairTransfer.findOne({
//           product: productId,
//           toCenter: repairCenterId,
//           fromCenter: selectedFaultyStock.center,
//           status: { $in: ["transferred", "in_repair", "under_repair", "partially_repaired"] }
//         });

//         if (repairTransfer) {
//           // UPDATE EXISTING REPAIR TRANSFER
//           console.log(`Found existing repair transfer ${repairTransfer._id}, updating...`);
          
//           // Update existing transfer quantities
//           repairTransfer.quantity += quantity;
//           repairTransfer.underRepairQty = (repairTransfer.underRepairQty || 0) + quantity;
          
//           if (product.trackSerialNumber === "Yes") {
//             // SERIALIZED: Add serials
//             const newRepairTransferSerials = [];
            
//             // Check for duplicate serials
//             const existingSerials = repairTransfer.serialNumbers.map(sn => sn.serialNumber);
//             const newSerials = actualSerialsToTransfer.filter(sn => !existingSerials.includes(sn));
            
//             if (newSerials.length !== actualSerialsToTransfer.length) {
//               const duplicates = actualSerialsToTransfer.filter(sn => existingSerials.includes(sn));
//               console.warn(`Duplicate serials detected: ${duplicates.join(', ')}. Skipping duplicates.`);
//             }
            
//             // Add only new serials
//             for (const serialNumber of newSerials) {
//               newRepairTransferSerials.push({
//                 serialNumber: serialNumber,
//                 status: "under_repair",
//                 repairHistory: [{
//                   date: new Date(),
//                   status: "under_repair",
//                   remark: damageRemark || "Transferred to repair center",
//                   updatedBy: transferredBy,
//                   cost: 0
//                 }]
//               });
//             }
            
//             console.log(`Adding ${newSerials.length} new serials to existing repair transfer`);
            
//             // Add new serials to existing transfer
//             if (newRepairTransferSerials.length > 0) {
//               repairTransfer.serialNumbers.push(...newRepairTransferSerials);
//             }
//           } else {
//             // NON-SERIALIZED: Keep serialNumbers array empty for non-serialized
//             repairTransfer.serialNumbers = [];
//           }
          
//           // Add repair update
//           repairTransfer.repairUpdates.push({
//             date: new Date(),
//             status: "under_repair",
//             remark: transferRemark || `Additional ${quantity} items transferred to repair center`,
//             quantity: quantity,
//             updatedBy: transferredBy,
//             cost: 0
//           });
          
//           // Update status based on quantities for non-serialized
//           if (!repairTransfer.isSerialized) {
//             if (repairTransfer.underRepairQty > 0) {
//               repairTransfer.status = "under_repair";
//             }
//           }
          
//         } else {
//           // CREATE NEW REPAIR TRANSFER
//           console.log(`Creating new repair transfer for ${product.productTitle}`);
          
//           let repairTransferSerials = [];
//           if (product.trackSerialNumber === "Yes") {
//             // SERIALIZED: Add actual serials
//             repairTransferSerials = actualSerialsToTransfer.map(sn => ({
//               serialNumber: sn,
//               status: "under_repair",
//               repairHistory: [{
//                 date: new Date(),
//                 status: "under_repair",
//                 remark: damageRemark || "Transferred to repair center",
//                 updatedBy: transferredBy,
//                 cost: 0
//               }]
//             }));
//           } else {
//             // NON-SERIALIZED: Keep serialNumbers array empty
//             repairTransferSerials = [];
//           }

//           // Create repair transfer record
//           repairTransfer = new RepairTransfer({
//             date: new Date(),
//             faultyStock: selectedFaultyStock._id,
//             fromCenter: selectedFaultyStock.center,
//             toCenter: repairCenterId,
//             product: productId,
//             quantity: quantity,
//             serialNumbers: repairTransferSerials,
//             isSerialized: product.trackSerialNumber === "Yes",
//             transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
//             transferredBy: transferredBy,
//             status: "under_repair", // Explicitly set status
//             // Set quantity fields correctly
//             underRepairQty: quantity, // CRITICAL FIX: Set underRepairQty to transfer quantity
//             repairedQty: 0,
//             irrepairedQty: 0,
//             repairUpdates: [{
//               date: new Date(),
//               status: "under_repair",
//               remark: transferRemark || `Initial transfer to repair center`,
//               quantity: quantity,
//               updatedBy: transferredBy,
//               cost: 0
//             }]
//           });

//           // Add isNew flag for tracking
//           repairTransfer.isNew = true;
//         }

//         await repairTransfer.save();

//         transferResults.push({
//           product: product.productTitle,
//           productCode: product.productCode,
//           quantity: quantity,
//           serialNumbers: actualSerialsToTransfer,
//           transferId: repairTransfer._id,
//           fromCenter: selectedFaultyStock.center,
//           toCenter: repairCenter.centerName,
//           status: "success",
//           action: repairTransfer.isNew ? "created" : "updated",
//           existingTransferUpdated: !repairTransfer.isNew,
//           productType: product.trackSerialNumber === "Yes" ? "serialized" : "non-serialized"
//         });

//         console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity}) - ${repairTransfer.isNew ? 'New' : 'Updated'} transfer`);

//       } catch (error) {
//         console.error(`Error processing ${item.productId}:`, error);
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
//           totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0),
//           summary: {
//             newTransfers: transferResults.filter(t => t.action === "created").length,
//             updatedTransfers: transferResults.filter(t => t.action === "updated").length,
//             serialized: transferResults.filter(t => t.productType === "serialized").length,
//             nonSerialized: transferResults.filter(t => t.productType === "non-serialized").length
//           }
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
//         totalSerialNumbers: transferResults.reduce((sum, item) => sum + item.serialNumbers.length, 0),
//         summary: {
//           newTransfers: transferResults.filter(t => t.action === "created").length,
//           updatedTransfers: transferResults.filter(t => t.action === "updated").length,
//           serialized: transferResults.filter(t => t.productType === "serialized").length,
//           nonSerialized: transferResults.filter(t => t.productType === "non-serialized").length
//         }
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
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
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

        // Check for current user's center if they don't have all-center access
        let faultyFilter = {
          product: productId
        };
        
        // Add center filter for users with only own center access
        if (!permissions.manage_usage_all_center && userCenter) {
          faultyFilter.center = userCenter._id || userCenter;
        }

        // Find existing faulty stock for this product
        const existingFaultyStocks = await FaultyStock.find(faultyFilter);
        
        if (!existingFaultyStocks || existingFaultyStocks.length === 0) {
          errors.push(`No faulty stock found for product: ${product.productTitle}`);
          continue;
        }

        let selectedFaultyStock = null;
        let totalAvailableDamaged = 0;
        let allDamagedSerials = [];
        
        // Calculate available damaged items
        for (const faultyStock of existingFaultyStocks) {
          if (product.trackSerialNumber === "Yes") {
            // SERIALIZED PRODUCTS: Look for damaged serials
            const damagedSerialsInRecord = faultyStock.serialNumbers.filter(
              sn => sn.status === "damaged"
            );
            
            if (damagedSerialsInRecord.length > 0) {
              allDamagedSerials = [...allDamagedSerials, ...damagedSerialsInRecord];
              totalAvailableDamaged += damagedSerialsInRecord.length;
              
              if (!selectedFaultyStock) {
                selectedFaultyStock = faultyStock;
              }
            }
          } else {
            // NON-SERIALIZED PRODUCTS: FIXED CALCULATION
            console.log(`Non-serialized stock: ${faultyStock.quantity} total, ${faultyStock.repairedQty} repaired, ${faultyStock.irrepairedQty} irrepaired, ${faultyStock.underRepairQty} under repair`);
            
            // Calculate damaged quantity correctly
            const damagedQty = Math.max(0, faultyStock.quantity - 
              (faultyStock.repairedQty || 0) - 
              (faultyStock.irrepairedQty || 0) - 
              (faultyStock.underRepairQty || 0));
            
            console.log(`Calculated damaged quantity: ${damagedQty}`);
            
            if (damagedQty > 0) {
              totalAvailableDamaged += damagedQty;
              if (!selectedFaultyStock) {
                selectedFaultyStock = faultyStock;
              }
            }
          }
        }

        console.log(`Product: ${product.productTitle}, Type: ${product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);
        console.log(`Total available damaged: ${totalAvailableDamaged}, Requested: ${quantity}`);

        if (totalAvailableDamaged === 0) {
          errors.push(`No damaged items available for product: ${product.productTitle}. All items are either repaired, under repair, or irreparable.`);
          continue;
        }

        if (quantity > totalAvailableDamaged) {
          errors.push(`Insufficient damaged stock quantity for ${product.productTitle}. Available damaged items: ${totalAvailableDamaged}, Requested: ${quantity}`);
          continue;
        }

        // Validate serial numbers if product tracks them
        let actualSerialsToTransfer = [];
        if (product.trackSerialNumber === "Yes") {
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            // If no serial numbers provided, use the first N damaged serials
            const availableSerialNumbers = allDamagedSerials.map(sn => sn.serialNumber);
            actualSerialsToTransfer = availableSerialNumbers.slice(0, quantity);
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
            actualSerialsToTransfer = serialNumbers;
          }
        }

        console.log(`Processing transfer: ${product.productTitle}, Qty: ${quantity}, Type: ${product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);

        // Update the selected faulty stock record
        if (!selectedFaultyStock) {
          errors.push(`No valid faulty stock record found for product: ${product.productTitle}`);
          continue;
        }

        if (product.trackSerialNumber === "Yes") {
          // SERIALIZED PRODUCTS: Update serial numbers status to "under_repair"
          let updatedCount = 0;
          for (const serial of selectedFaultyStock.serialNumbers) {
            if (actualSerialsToTransfer.includes(serial.serialNumber)) {
              serial.status = "under_repair";
              
              // Update serial's underRepairQty
              serial.underRepairQty = 1; // Each serial is 1 unit
              serial.repairedQty = 0;
              serial.irrepairedQty = 0;
              
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
        } else {
          // NON-SERIALIZED PRODUCTS: FIXED - Update underRepairQty without double counting
          console.log(`Before transfer: UnderRepairQty = ${selectedFaultyStock.underRepairQty || 0}`);
          
          // CORRECT: Calculate damaged quantity before transfer
          const currentDamagedQty = Math.max(0, selectedFaultyStock.quantity - 
            (selectedFaultyStock.repairedQty || 0) - 
            (selectedFaultyStock.irrepairedQty || 0) - 
            (selectedFaultyStock.underRepairQty || 0));
          
          console.log(`Current damaged quantity: ${currentDamagedQty}`);
          
          // Verify we have enough damaged items
          if (quantity > currentDamagedQty) {
            errors.push(`Insufficient damaged items. Requested: ${quantity}, Available: ${currentDamagedQty}`);
            continue;
          }
          
          // CORRECT: Update underRepairQty (increase by transfer quantity)
          selectedFaultyStock.underRepairQty = (selectedFaultyStock.underRepairQty || 0) + quantity;
          
          console.log(`After transfer: UnderRepairQty = ${selectedFaultyStock.underRepairQty}`);
          
          // Recalculate remaining damaged quantity
          const remainingDamaged = Math.max(0, selectedFaultyStock.quantity - 
            (selectedFaultyStock.repairedQty || 0) - 
            (selectedFaultyStock.irrepairedQty || 0) - 
            (selectedFaultyStock.underRepairQty || 0));
          
          console.log(`Remaining damaged: ${remainingDamaged}`);
          
          // Update overall status correctly
          if (selectedFaultyStock.underRepairQty > 0 && remainingDamaged > 0) {
            selectedFaultyStock.overallStatus = "partially_repaired";
          } else if (selectedFaultyStock.underRepairQty === selectedFaultyStock.quantity) {
            selectedFaultyStock.overallStatus = "under_repair";
          } else if (selectedFaultyStock.underRepairQty > 0) {
            selectedFaultyStock.overallStatus = "under_repair";
          } else if (remainingDamaged > 0) {
            selectedFaultyStock.overallStatus = "damaged";
          }
          
          console.log(`Non-serialized: Updated underRepairQty to ${selectedFaultyStock.underRepairQty}, Status: ${selectedFaultyStock.overallStatus}`);
        }

        // Call updateQuantitiesAndStatus to ensure consistency
        selectedFaultyStock.updateQuantitiesAndStatus();
        
        await selectedFaultyStock.save();
        console.log(`✓ FaultyStock saved with status: ${selectedFaultyStock.overallStatus}`);

        // CHECK IF REPAIR TRANSFER ALREADY EXISTS
        let repairTransfer = await RepairTransfer.findOne({
          product: productId,
          toCenter: repairCenterId,
          fromCenter: selectedFaultyStock.center,
          status: { $in: ["transferred", "in_repair", "under_repair", "partially_repaired"] }
        });

        if (repairTransfer) {
          // UPDATE EXISTING REPAIR TRANSFER
          console.log(`Found existing repair transfer ${repairTransfer._id}, updating...`);
          
          // Update existing transfer quantities
          repairTransfer.quantity += quantity;
          repairTransfer.underRepairQty = (repairTransfer.underRepairQty || 0) + quantity;
          
          if (product.trackSerialNumber === "Yes") {
            // SERIALIZED: Add serials
            const newRepairTransferSerials = [];
            
            // Check for duplicate serials
            const existingSerials = repairTransfer.serialNumbers.map(sn => sn.serialNumber);
            const newSerials = actualSerialsToTransfer.filter(sn => !existingSerials.includes(sn));
            
            if (newSerials.length !== actualSerialsToTransfer.length) {
              const duplicates = actualSerialsToTransfer.filter(sn => existingSerials.includes(sn));
              console.warn(`Duplicate serials detected: ${duplicates.join(', ')}. Skipping duplicates.`);
            }
            
            // Add only new serials
            for (const serialNumber of newSerials) {
              newRepairTransferSerials.push({
                serialNumber: serialNumber,
                status: "under_repair",
                repairHistory: [{
                  date: new Date(),
                  status: "under_repair",
                  remark: damageRemark || "Transferred to repair center",
                  updatedBy: transferredBy,
                  cost: 0
                }]
              });
            }
            
            console.log(`Adding ${newSerials.length} new serials to existing repair transfer`);
            
            // Add new serials to existing transfer
            if (newRepairTransferSerials.length > 0) {
              repairTransfer.serialNumbers.push(...newRepairTransferSerials);
            }
          } else {
            // NON-SERIALIZED: Keep serialNumbers array empty for non-serialized
            repairTransfer.serialNumbers = [];
          }
          
          // Add repair update
          repairTransfer.repairUpdates.push({
            date: new Date(),
            status: "under_repair",
            remark: transferRemark || `Additional ${quantity} items transferred to repair center`,
            quantity: quantity,
            updatedBy: transferredBy,
            cost: 0
          });
          
          // Update status for non-serialized
          if (!repairTransfer.isSerialized) {
            if (repairTransfer.underRepairQty > 0) {
              repairTransfer.status = "under_repair";
            }
          }
          
        } else {
          // CREATE NEW REPAIR TRANSFER
          console.log(`Creating new repair transfer for ${product.productTitle}`);
          
          let repairTransferSerials = [];
          if (product.trackSerialNumber === "Yes") {
            // SERIALIZED: Add actual serials
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
          } else {
            // NON-SERIALIZED: Keep serialNumbers array empty
            repairTransferSerials = [];
          }

          // Create repair transfer record
          repairTransfer = new RepairTransfer({
            date: new Date(),
            faultyStock: selectedFaultyStock._id,
            fromCenter: selectedFaultyStock.center,
            toCenter: repairCenterId,
            product: productId,
            quantity: quantity,
            serialNumbers: repairTransferSerials,
            isSerialized: product.trackSerialNumber === "Yes",
            transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
            transferredBy: transferredBy,
            status: "under_repair",
            // Set quantity fields correctly
            underRepairQty: quantity,
            repairedQty: 0,
            irrepairedQty: 0,
            repairUpdates: [{
              date: new Date(),
              status: "under_repair",
              remark: transferRemark || `Initial transfer to repair center`,
              quantity: quantity,
              updatedBy: transferredBy,
              cost: 0
            }]
          });
        }

        await repairTransfer.save();

        transferResults.push({
          product: product.productTitle,
          productCode: product.productCode,
          quantity: quantity,
          serialNumbers: actualSerialsToTransfer,
          transferId: repairTransfer._id,
          fromCenter: selectedFaultyStock.center,
          toCenter: repairCenter.centerName,
          status: "success",
          action: repairTransfer.isNew ? "created" : "updated",
          productType: product.trackSerialNumber === "Yes" ? "serialized" : "non-serialized",
          faultyStockStatus: selectedFaultyStock.overallStatus,
          faultyStockId: selectedFaultyStock._id,
          underRepairQty: selectedFaultyStock.underRepairQty
        });

        console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity})`);
        console.log(`FaultyStock updated - Status: ${selectedFaultyStock.overallStatus}, UnderRepairQty: ${selectedFaultyStock.underRepairQty}`);

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
          }
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
        }
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
//     const repairCenterId = userCenter?._id || req.user.center;

//     console.log("=== MARK AS REPAIRED/IRREPAIRABLE REQUEST ===");
//     console.log("Request body:", JSON.stringify(req.body, null, 2));

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

//     const RepairTransfer = mongoose.model("RepairTransfer");
//     const FaultyStock = mongoose.model("FaultyStock");
//     const Product = mongoose.model("Product");

//     const results = [];
//     const errors = [];

//     for (const item of items) {
//       try {
//         console.log("Processing item:", JSON.stringify(item, null, 2));
        
//         const { 
//           product,
//           quantity, 
//           serialNumbers = [], 
//           productRemark, 
//           finalStatus, 
//           repairCost = 0,
//           repairTransferId 
//         } = item;

//         console.log("Product field:", product);

//         // Validate required fields
//         if (!product || !mongoose.Types.ObjectId.isValid(product)) {
//           errors.push(`Invalid product ID: ${product || 'undefined'}`);
//           continue;
//         }

//         if (!quantity || quantity < 1) {
//           errors.push(`Invalid quantity for product ${product}. Quantity: ${quantity}`);
//           continue;
//         }

//         if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
//           errors.push(`Invalid final status for product ${product}. Must be "repaired" or "irreparable". Received: ${finalStatus}`);
//           continue;
//         }

//         const productDoc = await Product.findById(product);
//         if (!productDoc) {
//           errors.push(`Product not found: ${product}`);
//           continue;
//         }

//         console.log(`Product found: ${productDoc.productTitle} (Track serial: ${productDoc.trackSerialNumber})`);

//         // Find repair transfer
//         let repairTransfer;
//         if (repairTransferId) {
//           repairTransfer = await RepairTransfer.findById(repairTransferId);
//         } else {
//           // Find repair transfers for this product at the repair center
//           repairTransfer = await RepairTransfer.findOne({
//             product: product,
//             toCenter: repairCenterId,
//             status: { $in: ["transferred", "in_repair", "under_repair", "partially_repaired"] }
//           }).populate("product", "productTitle productCode trackSerialNumber");
//         }

//         if (!repairTransfer) {
//           errors.push(`No active repair transfer found for product: ${productDoc.productTitle} at your repair center`);
//           continue;
//         }

//         console.log(`Repair transfer found: ${repairTransfer._id}, Status: ${repairTransfer.status}`);

//         // Verify the repair transfer is at current center
//         if (repairTransfer.toCenter.toString() !== repairCenterId.toString()) {
//           errors.push(`This repair transfer does not belong to your repair center. Transfer center: ${repairTransfer.toCenter}, Your center: ${repairCenterId}`);
//           continue;
//         }

//         // Get the associated faulty stock
//         const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
//         if (!faultyStock) {
//           errors.push(`Associated faulty stock not found for repair transfer: ${repairTransfer._id}`);
//           continue;
//         }

//         console.log(`Faulty stock found: ${faultyStock._id}, Quantity: ${faultyStock.quantity}`);

//         // Handle based on product type
//         if (productDoc.trackSerialNumber === "No") {
//           // NON-SERIALIZED PRODUCTS - QUANTITY BASED (NO SERIALS)
//           console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
//           // Check available under repair quantity
//           const availableUnderRepair = repairTransfer.underRepairQty || 
//             (repairTransfer.quantity - (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0));
          
//           console.log(`Available under repair: ${availableUnderRepair}, Requested: ${quantity}`);
          
//           if (availableUnderRepair < quantity) {
//             errors.push(`Insufficient items available for marking as ${finalStatus}. Available under repair: ${availableUnderRepair}, Requested: ${quantity} for ${productDoc.productTitle}`);
//             continue;
//           }

//           // Update repair transfer quantities
//           if (finalStatus === "repaired") {
//             repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + quantity;
//           } else if (finalStatus === "irreparable") {
//             repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + quantity;
//           }

//           // Update repair transfer under repair quantity
//           repairTransfer.underRepairQty = repairTransfer.quantity - 
//             (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0);

//           // Update serial numbers array (for non-serialized, we maintain a placeholder)
//           if (repairTransfer.serialNumbers.length === 0) {
//             // Create a placeholder serial for non-serialized product
//             repairTransfer.serialNumbers = [{
//               serialNumber: `NON-SERIAL-${repairTransfer._id}`,
//               status: "under_repair",
//               quantity: repairTransfer.quantity
//             }];
//           }
          
//           // Update the serial status based on overall quantities
//           const repairTransferSerial = repairTransfer.serialNumbers[0];
//           if (repairTransferSerial) {
//             if (finalStatus === "repaired") {
//               repairTransferSerial.repairedQty = (repairTransferSerial.repairedQty || 0) + quantity;
//             } else if (finalStatus === "irreparable") {
//               repairTransferSerial.irrepairedQty = (repairTransferSerial.irrepairedQty || 0) + quantity;
//             }
            
//             repairTransferSerial.underRepairQty = repairTransferSerial.quantity - 
//               (repairTransferSerial.repairedQty || 0) - (repairTransferSerial.irrepairedQty || 0);
            
//             // Update serial status
//             if (repairTransferSerial.underRepairQty === 0) {
//               if (repairTransferSerial.repairedQty === repairTransferSerial.quantity) {
//                 repairTransferSerial.status = "repaired";
//               } else if (repairTransferSerial.irrepairedQty === repairTransferSerial.quantity) {
//                 repairTransferSerial.status = "irreparable";
//               }
//             } else {
//               repairTransferSerial.status = "under_repair";
//             }
            
//             // Add to repair history
//             if (!Array.isArray(repairTransferSerial.repairHistory)) {
//               repairTransferSerial.repairHistory = [];
//             }
            
//             repairTransferSerial.repairHistory.push({
//               date: new Date(date),
//               status: finalStatus,
//               remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
//               quantity: quantity,
//               repairedQty: finalStatus === "repaired" ? quantity : 0,
//               irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//               updatedBy: updatedBy,
//               cost: repairCost * quantity
//             });
//           }

//           // Add to repair updates
//           if (!Array.isArray(repairTransfer.repairUpdates)) {
//             repairTransfer.repairUpdates = [];
//           }
          
//           repairTransfer.repairUpdates.push({
//             date: new Date(date),
//             status: finalStatus,
//             remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
//             quantity: quantity,
//             repairedQty: finalStatus === "repaired" ? quantity : 0,
//             irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//             updatedBy: updatedBy,
//             cost: repairCost * quantity
//           });

//           // Update faulty stock quantities
//           if (finalStatus === "repaired") {
//             faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
//           } else if (finalStatus === "irreparable") {
//             faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
//           }

//           // Update faulty stock under repair quantity
//           faultyStock.underRepairQty = faultyStock.quantity - 
//             (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0);

//           // Update faulty stock serial numbers (for non-serialized)
//           if (faultyStock.serialNumbers.length === 0) {
//             // Create placeholder serial
//             faultyStock.serialNumbers = [{
//               serialNumber: `NON-SERIAL-${faultyStock._id}`,
//               status: "under_repair",
//               quantity: faultyStock.quantity
//             }];
//           }
          
//           // Update faulty stock serial
//           const faultySerial = faultyStock.serialNumbers[0];
//           if (faultySerial) {
//             if (finalStatus === "repaired") {
//               faultySerial.repairedQty = (faultySerial.repairedQty || 0) + quantity;
//             } else if (finalStatus === "irreparable") {
//               faultySerial.irrepairedQty = (faultySerial.irrepairedQty || 0) + quantity;
//             }
            
//             faultySerial.underRepairQty = faultySerial.quantity - 
//               (faultySerial.repairedQty || 0) - (faultySerial.irrepairedQty || 0);
            
//             // Update serial status
//             if (faultySerial.underRepairQty === 0) {
//               if (faultySerial.repairedQty === faultySerial.quantity) {
//                 faultySerial.status = "repaired";
//               } else if (faultySerial.irrepairedQty === faultySerial.quantity) {
//                 faultySerial.status = "irreparable";
//               }
//             } else {
//               faultySerial.status = "under_repair";
//             }
            
//             // Add to repair history
//             if (!Array.isArray(faultySerial.repairHistory)) {
//               faultySerial.repairHistory = [];
//             }
            
//             faultySerial.repairHistory.push({
//               date: new Date(date),
//               status: finalStatus,
//               remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
//               quantity: quantity,
//               repairedQty: finalStatus === "repaired" ? quantity : 0,
//               irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//               updatedBy: updatedBy,
//               cost: repairCost * quantity
//             });
//           }

//           console.log(`✓ Updated non-serialized product: ${productDoc.productTitle} - ${quantity} marked as ${finalStatus}`);

//         } else {
//           // SERIALIZED PRODUCTS
//           console.log(`Processing serialized product: ${productDoc.productTitle}`);
          
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           // Validate serials exist and are in under_repair status in repair transfer
//           const validSerials = [];
//           const invalidSerials = [];
          
//           for (const serialNumber of serialNumbers) {
//             const serial = repairTransfer.serialNumbers.find(sn => 
//               sn.serialNumber === serialNumber && sn.status === "under_repair"
//             );
            
//             if (serial) {
//               validSerials.push(serialNumber);
//             } else {
//               const foundSerial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//               invalidSerials.push({
//                 serialNumber,
//                 status: foundSerial ? foundSerial.status : 'not found'
//               });
//             }
//           }

//           if (invalidSerials.length > 0) {
//             errors.push(`Invalid serial numbers: ${JSON.stringify(invalidSerials)}`);
//             continue;
//           }

//           if (validSerials.length !== quantity) {
//             errors.push(`Only ${validSerials.length} valid serials found, but ${quantity} requested`);
//             continue;
//           }

//           console.log(`Found ${validSerials.length} valid serials`);

//           // Update each serial in repair transfer
//           for (const serialNumber of validSerials) {
//             // Update repair transfer serial
//             const repairSerial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//             if (repairSerial) {
//               repairSerial.status = finalStatus;
              
//               if (!Array.isArray(repairSerial.repairHistory)) {
//                 repairSerial.repairHistory = [];
//               }
              
//               repairSerial.repairHistory.push({
//                 date: new Date(date),
//                 status: finalStatus,
//                 remark: productRemark || remark || `Marked as ${finalStatus}`,
//                 updatedBy: updatedBy,
//                 cost: repairCost
//               });

//               // Update repair transfer quantities
//               if (finalStatus === "repaired") {
//                 repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + 1;
//               } else if (finalStatus === "irreparable") {
//                 repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + 1;
//               }
//             }
//           }

//           // Update repair transfer under repair quantity
//           repairTransfer.underRepairQty = repairTransfer.quantity - 
//             (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0);

//           // Add to repair updates
//           if (!Array.isArray(repairTransfer.repairUpdates)) {
//             repairTransfer.repairUpdates = [];
//           }
          
//           repairTransfer.repairUpdates.push({
//             date: new Date(date),
//             status: finalStatus,
//             remark: productRemark || remark || `Marked ${quantity} serials as ${finalStatus}`,
//             quantity: quantity,
//             repairedQty: finalStatus === "repaired" ? quantity : 0,
//             irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//             updatedBy: updatedBy,
//             cost: repairCost * quantity
//           });

//           // Update faulty stock serials and quantities
//           for (const serialNumber of validSerials) {
//             const faultySerial = faultyStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//             if (faultySerial) {
//               faultySerial.status = finalStatus;
              
//               if (!Array.isArray(faultySerial.repairHistory)) {
//                 faultySerial.repairHistory = [];
//               }
              
//               faultySerial.repairHistory.push({
//                 date: new Date(date),
//                 status: finalStatus,
//                 remark: productRemark || remark || `Marked as ${finalStatus}`,
//                 updatedBy: updatedBy,
//                 cost: repairCost
//               });
//             }

//             // Update faulty stock quantities
//             if (finalStatus === "repaired") {
//               faultyStock.repairedQty = (faultyStock.repairedQty || 0) + 1;
//             } else if (finalStatus === "irreparable") {
//               faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + 1;
//             }
//           }

//           // Update faulty stock under repair quantity
//           faultyStock.underRepairQty = faultyStock.quantity - 
//             (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0);

//           console.log(`✓ Updated serialized product: ${productDoc.productTitle} - ${quantity} serials marked as ${finalStatus}`);
//         }

//         // Calculate and update repair transfer status
//         const totalProcessed = (repairTransfer.repairedQty || 0) + (repairTransfer.irrepairedQty || 0);
//         const totalQuantity = repairTransfer.quantity;
        
//         console.log(`Total processed: ${totalProcessed}, Total quantity: ${totalQuantity}`);
        
//         if (totalProcessed === totalQuantity) {
//           // All items processed
//           if (repairTransfer.repairedQty === totalQuantity) {
//             repairTransfer.status = "repaired";
//           } else if (repairTransfer.irrepairedQty === totalQuantity) {
//             repairTransfer.status = "irreparable";
//           } else {
//             // Mix of repaired and irreparable
//             repairTransfer.status = "partially_repaired";
//           }
//         } else if (totalProcessed > 0) {
//           // Some items processed, some still under repair
//           repairTransfer.status = "under_repair";
//         } else {
//           // No items processed yet
//           repairTransfer.status = "under_repair";
//         }

//         // Update total repair cost
//         if (repairCost > 0) {
//           repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + (repairCost * quantity);
//         }

//         await repairTransfer.save();

//         // Calculate and update faulty stock status
//         const faultyTotalProcessed = (faultyStock.repairedQty || 0) + (faultyStock.irrepairedQty || 0);
//         const faultyTotalQuantity = faultyStock.quantity;
        
//         console.log(`Faulty stock - Total processed: ${faultyTotalProcessed}, Total quantity: ${faultyTotalQuantity}`);
        
//         if (faultyTotalProcessed === faultyTotalQuantity) {
//           // All items processed in faulty stock
//           if (faultyStock.repairedQty === faultyTotalQuantity) {
//             faultyStock.overallStatus = "repaired";
//             faultyStock.repairDate = new Date();
//           } else if (faultyStock.irrepairedQty === faultyTotalQuantity) {
//             faultyStock.overallStatus = "irreparable";
//           } else {
//             // Mix of repaired and irreparable
//             faultyStock.overallStatus = "partially_repaired";
//           }
//         } else if (faultyTotalProcessed > 0) {
//           // Some items processed, some still under repair
//           faultyStock.overallStatus = "under_repair";
//         } else {
//           // No items processed yet
//           faultyStock.overallStatus = "damaged";
//         }

//         faultyStock.lastRepairUpdate = new Date();
//         await faultyStock.save();

//         // Get quantity summary
//         const transferSummary = {
//           total: repairTransfer.quantity,
//           repaired: repairTransfer.repairedQty || 0,
//           irrepaired: repairTransfer.irrepairedQty || 0,
//           underRepair: repairTransfer.underRepairQty || 0,
//           remaining: repairTransfer.quantity - (repairTransfer.repairedQty || 0) - (repairTransfer.irrepairedQty || 0)
//         };
        
//         const faultySummary = {
//           total: faultyStock.quantity,
//           repaired: faultyStock.repairedQty || 0,
//           irrepaired: faultyStock.irrepairedQty || 0,
//           underRepair: faultyStock.underRepairQty || 0,
//           remaining: faultyStock.quantity - (faultyStock.repairedQty || 0) - (faultyStock.irrepairedQty || 0)
//         };

//         results.push({
//           product: productDoc.productTitle,
//           productCode: productDoc.productCode,
//           quantity: quantity,
//           serialNumbers: productDoc.trackSerialNumber === "Yes" ? serialNumbers : [],
//           finalStatus: finalStatus,
//           repairTransferId: repairTransfer._id,
//           repairCost: repairCost * quantity,
//           status: "success",
//           message: `Marked ${quantity} items as ${finalStatus}`,
//           quantities: {
//             repairTransfer: transferSummary,
//             faultyStock: faultySummary
//           },
//           repairTransferStatus: repairTransfer.status,
//           faultyStockStatus: faultyStock.overallStatus
//         });

//         console.log(`✓ Successfully marked ${quantity} items as ${finalStatus}: ${productDoc.productTitle}`);
//         console.log(`Repair Transfer Status: ${repairTransfer.status}`);
//         console.log(`Faulty Stock Status: ${faultyStock.overallStatus}`);

//       } catch (error) {
//         console.error(`Error processing item:`, error);
//         errors.push(`Error processing ${item.product || 'item'}: ${error.message}`);
//       }
//     }

//     console.log("=== PROCESSING COMPLETE ===");
//     console.log("Results:", results.length);
//     console.log("Errors:", errors.length);

//     // Response handling
//     if (errors.length > 0 && results.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to process any items",
//         errors: errors
//       });
//     }

//     const totalProcessed = results.reduce((sum, item) => sum + item.quantity, 0);
//     const totalRepaired = results.filter(item => item.finalStatus === "repaired")
//       .reduce((sum, item) => sum + item.quantity, 0);
//     const totalIrreparable = results.filter(item => item.finalStatus === "irreparable")
//       .reduce((sum, item) => sum + item.quantity, 0);
//     const totalCost = results.reduce((sum, item) => sum + item.repairCost, 0);

//     const response = {
//       success: true,
//       message: `Successfully processed ${results.length} items (${totalProcessed} units)`,
//       data: {
//         processed: results,
//         summary: {
//           totalItems: results.length,
//           totalQuantity: totalProcessed,
//           totalRepaired: totalRepaired,
//           totalIrreparable: totalIrreparable,
//           totalCost: totalCost
//         }
//       }
//     };

//     if (errors.length > 0) {
//       response.data.errors = errors;
//       response.data.partialSuccess = true;
//       response.message += `, ${errors.length} failed`;
//     }

//     console.log("Response:", JSON.stringify(response, null, 2));
    
//     res.json(response);

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
    console.log("Repair Center:", repairCenterId);
    console.log("Request:", JSON.stringify(items, null, 2));

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
        console.log("\n=== Processing Item ===");
        console.log("Item:", JSON.stringify(item, null, 2));
        
        const { 
          product,
          quantity, 
          serialNumbers = [], 
          productRemark, 
          finalStatus, 
          repairCost = 0
        } = item;

        // Validate
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

        console.log(`Product: ${productDoc.productTitle}, Serialized: ${productDoc.trackSerialNumber}`);

        // CRITICAL FIX: Find ALL transfers and check available quantity
        let repairTransfer;
        
        if (productDoc.trackSerialNumber === "Yes") {
          // SERIALIZED: Find transfer with specific serials
          console.log(`Looking for serialized transfer with serials: ${serialNumbers}`);
          
          repairTransfer = await RepairTransfer.findOne({
            product: product,
            toCenter: repairCenterId,
            "serialNumbers.serialNumber": { $in: serialNumbers }
          })
          .populate("product", "productTitle productCode trackSerialNumber");

          if (!repairTransfer) {
            errors.push(`No repair transfer found containing serials: ${serialNumbers.join(', ')} for ${productDoc.productTitle}`);
            continue;
          }
          
        } else {
          // NON-SERIALIZED: Find ALL transfers and calculate available quantity
          console.log(`Looking for non-serialized transfers`);
          
          const allTransfers = await RepairTransfer.find({
            product: product,
            toCenter: repairCenterId,
            status: { $in: ["under_repair", "in_repair", "transferred"] }
          })
          .populate("product", "productTitle productCode trackSerialNumber")
          .sort({ createdAt: 1 });

          console.log(`Found ${allTransfers.length} transfers for non-serialized product`);

          if (allTransfers.length === 0) {
            errors.push(`No repair transfers found for ${productDoc.productTitle} at your repair center`);
            continue;
          }

          // Find transfer with available quantity
          let availableQuantity = 0;
          let selectedTransfer = null;
          
          for (const transfer of allTransfers) {
            console.log(`Checking transfer ${transfer._id}:`);
            console.log(`- Total quantity: ${transfer.quantity}`);
            console.log(`- Repaired: ${transfer.repairedQty || 0}`);
            console.log(`- Irrepaired: ${transfer.irrepairedQty || 0}`);
            console.log(`- Under repair: ${transfer.underRepairQty || 0}`);
            console.log(`- Serial numbers: ${JSON.stringify(transfer.serialNumbers)}`);
            
            // Calculate available in this transfer
            const repaired = transfer.repairedQty || 0;
            const irrepaired = transfer.irrepairedQty || 0;
            const underRepair = transfer.underRepairQty || 0;
            
            // Different ways to calculate available:
            // 1. Use underRepairQty if available
            // 2. Calculate from quantities
            // 3. Check serial numbers status
            let transferAvailable = 0;
            
            if (underRepair > 0) {
              transferAvailable = underRepair;
            } else {
              transferAvailable = transfer.quantity - repaired - irrepaired;
            }
            
            console.log(`- Available in this transfer: ${transferAvailable}`);
            
            if (transferAvailable >= quantity) {
              selectedTransfer = transfer;
              availableQuantity = transferAvailable;
              console.log(`✓ Found suitable transfer with ${availableQuantity} available`);
              break;
            }
            
            // Also check serial numbers array
            if (transfer.serialNumbers.length > 0) {
              const underRepairSerials = transfer.serialNumbers.filter(
                sn => sn.status === "under_repair"
              );
              const serialsAvailable = underRepairSerials.reduce(
                (sum, sn) => sum + (sn.quantity || 1), 0
              );
              
              console.log(`- Available from serials: ${serialsAvailable}`);
              
              if (serialsAvailable >= quantity) {
                selectedTransfer = transfer;
                availableQuantity = serialsAvailable;
                console.log(`✓ Found suitable transfer via serials with ${availableQuantity} available`);
                break;
              }
            }
          }

          if (!selectedTransfer) {
            // Check total available across all transfers
            const totalAvailable = allTransfers.reduce((sum, transfer) => {
              const repaired = transfer.repairedQty || 0;
              const irrepaired = transfer.irrepairedQty || 0;
              return sum + (transfer.quantity - repaired - irrepaired);
            }, 0);
            
            errors.push(`Insufficient items available. Total available: ${totalAvailable}, Requested: ${quantity} for ${productDoc.productTitle}`);
            continue;
          }
          
          repairTransfer = selectedTransfer;
        }

        if (!repairTransfer) {
          errors.push(`No suitable repair transfer found for ${productDoc.productTitle}`);
          continue;
        }

        console.log(`✓ Using repair transfer: ${repairTransfer._id}`);
        console.log(`Status: ${repairTransfer.status}, Quantity: ${repairTransfer.quantity}`);

        // Verify center
        if (repairTransfer.toCenter.toString() !== repairCenterId.toString()) {
          errors.push(`Transfer ${repairTransfer._id} is not at your repair center`);
          continue;
        }

        // Get faulty stock
        const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
        if (!faultyStock) {
          errors.push(`Faulty stock not found for transfer ${repairTransfer._id}`);
          continue;
        }

        console.log(`Faulty stock: ${faultyStock._id}`);

        // PROCESS THE ITEM
        if (productDoc.trackSerialNumber === "No") {
          // NON-SERIALIZED PRODUCTS
          console.log(`Processing NON-SERIALIZED product`);
          
          // Calculate available quantity
          const repaired = repairTransfer.repairedQty || 0;
          const irrepaired = repairTransfer.irrepairedQty || 0;
          const available = repairTransfer.quantity - repaired - irrepaired;
          
          console.log(`Available: ${available}, Requested: ${quantity}`);
          
          if (available < quantity) {
            errors.push(`Insufficient items. Available: ${available}, Requested: ${quantity}`);
            continue;
          }

          // FIX: Handle empty serialNumbers array
          if (repairTransfer.serialNumbers.length === 0) {
            console.log(`Creating serial number entry for new transfer`);
            
            // Create serial entry based on available quantity
            repairTransfer.serialNumbers = [{
              serialNumber: `NON-SERIAL-${repairTransfer._id}`,
              status: "under_repair",
              quantity: repairTransfer.quantity,
              repairedQty: 0,
              irrepairedQty: 0,
              underRepairQty: available,
              repairHistory: []
            }];
          }

          // Update serial entry
          const serialEntry = repairTransfer.serialNumbers[0];
          
          if (finalStatus === "repaired") {
            serialEntry.repairedQty = (serialEntry.repairedQty || 0) + quantity;
            repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + quantity;
          } else {
            serialEntry.irrepairedQty = (serialEntry.irrepairedQty || 0) + quantity;
            repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + quantity;
          }
          
          serialEntry.underRepairQty = Math.max(0, 
            (serialEntry.underRepairQty || serialEntry.quantity) - quantity
          );
          
          // Update serial status
          if (serialEntry.underRepairQty === 0) {
            if (serialEntry.repairedQty === serialEntry.quantity) {
              serialEntry.status = "repaired";
            } else if (serialEntry.irrepairedQty === serialEntry.quantity) {
              serialEntry.status = "irreparable";
            }
          } else {
            serialEntry.status = "under_repair";
          }

          // Add repair history to serial
          if (!Array.isArray(serialEntry.repairHistory)) {
            serialEntry.repairHistory = [];
          }
          
          serialEntry.repairHistory.push({
            date: new Date(date),
            status: finalStatus,
            remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
            quantity: quantity,
            repairedQty: finalStatus === "repaired" ? quantity : 0,
            irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
            updatedBy: updatedBy,
            cost: repairCost * quantity
          });

          // Update repair transfer quantities
          repairTransfer.underRepairQty = Math.max(0, 
            repairTransfer.quantity - 
            (repairTransfer.repairedQty || 0) - 
            (repairTransfer.irrepairedQty || 0)
          );

        } else {
          // SERIALIZED PRODUCTS
          console.log(`Processing SERIALIZED product`);
          
          if (!serialNumbers || serialNumbers.length === 0) {
            errors.push(`Serial numbers required for serialized product`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serials count (${serialNumbers.length})`);
            continue;
          }

          // Validate serials
          const validSerials = [];
          const invalidSerials = [];
          
          for (const serialNumber of serialNumbers) {
            const serial = repairTransfer.serialNumbers.find(sn => 
              sn.serialNumber === serialNumber
            );
            
            if (serial) {
              if (serial.status === "under_repair") {
                validSerials.push(serialNumber);
              } else {
                invalidSerials.push({
                  serialNumber,
                  status: serial.status,
                  message: `Already ${serial.status}`
                });
              }
            } else {
              invalidSerials.push({
                serialNumber,
                status: "not found",
                message: "Serial not found"
              });
            }
          }

          if (invalidSerials.length > 0) {
            errors.push(`Invalid serials: ${JSON.stringify(invalidSerials)}`);
            continue;
          }

          console.log(`✓ All ${validSerials.length} serials are valid`);

          // Update each serial
          for (const serialNumber of validSerials) {
            const serial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            if (serial) {
              serial.status = finalStatus;
              
              // Add repair history
              if (!Array.isArray(serial.repairHistory)) {
                serial.repairHistory = [];
              }
              
              serial.repairHistory.push({
                date: new Date(date),
                status: finalStatus,
                remark: productRemark || remark || `Marked as ${finalStatus}`,
                updatedBy: updatedBy,
                cost: repairCost
              });

              // Update quantities
              if (finalStatus === "repaired") {
                repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + 1;
              } else {
                repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + 1;
              }
            }
          }
          
          // Update under repair count
          const remainingUnderRepair = repairTransfer.serialNumbers.filter(
            sn => sn.status === "under_repair"
          ).length;
          
          repairTransfer.underRepairQty = remainingUnderRepair;
        }

        // Add repair update
        if (!Array.isArray(repairTransfer.repairUpdates)) {
          repairTransfer.repairUpdates = [];
        }
        
        repairTransfer.repairUpdates.push({
          date: new Date(date),
          status: finalStatus,
          remark: productRemark || remark || 
            (productDoc.trackSerialNumber === "Yes" 
              ? `Marked ${quantity} serials as ${finalStatus}` 
              : `Marked ${quantity} items as ${finalStatus}`),
          quantity: quantity,
          repairedQty: finalStatus === "repaired" ? quantity : 0,
          irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
          updatedBy: updatedBy,
          cost: repairCost * quantity
        });

        // Update transfer status
        const totalProcessed = (repairTransfer.repairedQty || 0) + (repairTransfer.irrepairedQty || 0);
        
        if (totalProcessed === repairTransfer.quantity) {
          if (repairTransfer.repairedQty === repairTransfer.quantity) {
            repairTransfer.status = "repaired";
          } else if (repairTransfer.irrepairedQty === repairTransfer.quantity) {
            repairTransfer.status = "irreparable";
          } else {
            repairTransfer.status = "partially_repaired";
          }
        } else if (totalProcessed > 0) {
          repairTransfer.status = "under_repair";
        } else {
          repairTransfer.status = "under_repair";
        }

        // Update repair cost
        if (repairCost > 0) {
          repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + (repairCost * quantity);
        }

        // Save repair transfer
        await repairTransfer.save();
        console.log(`✓ Saved repair transfer with status: ${repairTransfer.status}`);

        // Update faulty stock
        if (faultyStock) {
          if (productDoc.trackSerialNumber === "Yes") {
            // Update serials in faulty stock
            for (const serialNumber of serialNumbers) {
              const faultySerial = faultyStock.serialNumbers.find(sn => 
                sn.serialNumber === serialNumber
              );
              
              if (faultySerial && faultySerial.status === "under_repair") {
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
            }
            
            // Update quantities
            if (finalStatus === "repaired") {
              faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
            } else {
              faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
            }
            
          } else {
            // Non-serialized - update quantities
            if (finalStatus === "repaired") {
              faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
            } else {
              faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
            }
          }
          
          // Update faulty stock status
          const faultyProcessed = (faultyStock.repairedQty || 0) + (faultyStock.irrepairedQty || 0);
          
          if (faultyProcessed === faultyStock.quantity) {
            if (faultyStock.repairedQty === faultyStock.quantity) {
              faultyStock.overallStatus = "repaired";
            } else if (faultyStock.irrepairedQty === faultyStock.quantity) {
              faultyStock.overallStatus = "irreparable";
            } else {
              faultyStock.overallStatus = "partially_repaired";
            }
          } else if (faultyProcessed > 0) {
            faultyStock.overallStatus = "under_repair";
          } else {
            faultyStock.overallStatus = "damaged";
          }
          
          faultyStock.lastRepairUpdate = new Date();
          await faultyStock.save();
          console.log(`✓ Saved faulty stock with status: ${faultyStock.overallStatus}`);
        }

        // Add result
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
          repairTransferStatus: repairTransfer.status
        });

        console.log(`✓ Successfully processed ${productDoc.productTitle}`);

      } catch (error) {
        console.error(`Error:`, error);
        errors.push(`Error: ${error.message}`);
      }
    }

    // Response
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to process any items",
        errors: errors
      });
    }

    const response = {
      success: true,
      message: `Successfully processed ${results.length} items`,
      data: {
        processed: results,
        summary: {
          totalItems: results.length,
          totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0)
        }
      }
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = true;
      response.message += ` (${errors.length} failed)`;
    }

    console.log("\n=== FINAL RESULT ===");
    console.log(JSON.stringify(response, null, 2));
    
    res.json(response);

  } catch (error) {
    console.error("Error:", error);
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
//       // Get the associated faulty stock to get original quantity
//       const faultyStock = await FaultyStock.findById(transfer.faultyStock);
//       const originalQuantity = faultyStock ? faultyStock.quantity : transfer.quantity;
      
//       if (transfer.product?.trackSerialNumber === "Yes") {
//         const underRepairSerials = transfer.serialNumbers.filter(serial => 
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
//             totalSerialsCount: transfer.serialNumbers.length,
//             originalQuantity: originalQuantity // Add original quantity
//           });
//         }
//       } else {
//         // NON-SERIALIZED PRODUCTS
//         // Calculate repaired count from repair updates
//         const repairedCount = transfer.repairUpdates?.filter(update => 
//           update.status === "repaired"
//         ).reduce((sum, update) => sum + (update.repairedQty || 0), 0) || 0;
        
//         // Calculate irrepaired count
//         const irrepairedCount = transfer.repairUpdates?.filter(update => 
//           update.status === "irreparable"
//         ).reduce((sum, update) => sum + (update.irrepairedQty || 0), 0) || 0;
        
//         // Calculate under repair quantity
//         const totalProcessed = repairedCount + irrepairedCount;
//         const availableQty = Math.max(0, originalQuantity - totalProcessed);
        
//         if (availableQty > 0) {
//           // Update the transfer's quantity fields to match actual state
//           transfer.repairedQty = repairedCount;
//           transfer.irrepairedQty = irrepairedCount;
//           transfer.underRepairQty = availableQty;
          
//           // Update the serial number's underRepairQty if it exists
//           if (transfer.serialNumbers.length > 0) {
//             const serial = transfer.serialNumbers[0];
//             serial.repairedQty = repairedCount;
//             serial.irrepairedQty = irrepairedCount;
//             serial.underRepairQty = availableQty;
//           }
          
//           repairItems.push({
//             ...transfer.toObject(),
//             quantity: availableQty, // This should show remaining under repair quantity
//             displayQuantity: availableQty,
//             availableForRepair: true,
//             repairedCount: repairedCount,
//             irrepairedCount: irrepairedCount,
//             originalQuantity: originalQuantity,
//             // Add these for clarity
//             quantityBreakdown: {
//               original: originalQuantity,
//               repaired: repairedCount,
//               irrepaired: irrepairedCount,
//               underRepair: availableQty,
//               totalProcessed: totalProcessed
//             }
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

    filter.status = { $in: ["under_repair", "partially_repaired"] };

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
      const hasUnderRepairItems = await checkIfTransferHasUnderRepairItems(transfer);
      
      if (!hasUnderRepairItems) {
        continue; 
      }
      
      if (transfer.product?.trackSerialNumber === "Yes") {
        const underRepairSerials = transfer.serialNumbers.filter(serial => 
          serial.status === "under_repair"
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
            originalQuantity: transfer.quantity
          });
        }
      } else {
        const underRepairQty = transfer.underRepairQty || 0;
        
        if (underRepairQty > 0) {
          repairItems.push({
            ...transfer.toObject(),
            quantity: underRepairQty,
            displayQuantity: underRepairQty,
            availableForRepair: true,
            originalQuantity: transfer.quantity,
            quantityBreakdown: {
              originalTransferred: transfer.quantity,
              currentlyUnderRepair: underRepairQty,
              alreadyRepaired: transfer.repairedQty || 0,
              alreadyIrrepaired: transfer.irrepairedQty || 0,
              alreadyReturned: transfer.returnedQty || 0
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
      totalQuantity: repairItems.reduce((sum, item) => sum + (item.displayQuantity || 0), 0)
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

const checkIfTransferHasUnderRepairItems = async (transfer) => {
  if (transfer.product?.trackSerialNumber === "Yes") {
    return transfer.serialNumbers.some(serial => serial.status === "under_repair");
  } else {
    const underRepairQty = transfer.underRepairQty || 0;
    return underRepairQty > 0;
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

// export const transferRepairedToResellerStock = async (req, res) => {
//   try {
//     const { items, transferRemark } = req.body;
//     const transferredBy = req.user.id;
//     const sourceOutletId = req.user.center;

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Items array is required",
//       });
//     }

//     const transferResults = [];
//     const errors = [];

//     for (const item of items) {
//       try {
//         const { outletStockId, productId, quantity, serialNumbers, resellerId } = item;
        
//         if (!resellerId) {
//           errors.push(`Reseller ID is required for item: ${productId}`);
//           continue;
//         }

//         const productDoc = await Product.findById(productId);
//         if (!productDoc) {
//           errors.push(`Product not found: ${productId}`);
//           continue;
//         }

//         const outletStock = await OutletStock.findById(outletStockId);
//         if (!outletStock) {
//           errors.push(`Outlet stock not found for ID: ${outletStockId}`);
//           continue;
//         }

//         let serialsToTransfer = [];
//         if (productDoc.trackSerialNumber === "Yes") {
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           const availableSerials = outletStock.serialNumbers.filter(
//             sn => serialNumbers.includes(sn.serialNumber) &&
//                  sn.status === "available" &&
//                  sn.sourceType === "repair_return"
//           );

//           if (availableSerials.length !== quantity) {
//             const missingSerials = serialNumbers.filter(sn => 
//               !availableSerials.map(as => as.serialNumber).includes(sn)
//             );
//             errors.push(`Some serials are not available or not from repair stock: ${missingSerials.join(', ')}. Available repair serials: ${availableSerials.map(as => as.serialNumber).join(', ')}`);
//             continue;
//           }

//           serialsToTransfer = serialNumbers;
//         } else {
//           const availableRepaired = outletStock.availableQuantity;
//           if (availableRepaired < quantity) {
//             errors.push(`Insufficient repaired stock. Available: ${availableRepaired}, Requested: ${quantity}`);
//             continue;
//           }
//         }
//         if (productDoc.trackSerialNumber === "Yes") {
//           outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
//             if (serialsToTransfer.includes(sn.serialNumber)) {
//               const transferRecord = {
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Transferred from outlet repair stock to reseller`,
//                 transferredBy: transferredBy
//               };
              
//               const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];
              
//               return {
//                 ...sn.toObject(),
//                 status: "transferred",
//                 currentLocation: null,
//                 transferHistory: [...transferHistory, transferRecord]
//               };
//             }
//             return sn;
//           });
//         }

//         outletStock.availableQuantity -= quantity;
//         outletStock.totalQuantity -= quantity;
//         await outletStock.save();

//         let resellerStock = await ResellerStock.findOne({
//           reseller: resellerId,
//           product: productId
//         });

//         if (!resellerStock) {
//           resellerStock = new ResellerStock({
//             reseller: resellerId,
//             product: productId,
//             availableQuantity: 0,
//             totalQuantity: 0,
//             consumedQuantity: 0,
//             damagedQuantity: 0,
//             repairQuantity: 0,
//             sourceBreakdown: {
//               damageRepairQuantity: 0,
//               centerReturnQuantity: 0,
//               directPurchaseQuantity: 0
//             },
//             serialNumbers: []
//           });
//         }

//         if (productDoc.trackSerialNumber === "Yes") {
//           for (const serialNumber of serialsToTransfer) {
//             const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (existingSerialIndex === -1) {
//               resellerStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 status: "available",
//                 sourceType: "damage_repair", 
//                 currentLocation: resellerId, 
//                 originalOutlet: sourceOutletId,
//                 purchaseId: outletStock.purchaseId || new mongoose.Types.ObjectId(),
//                 transferHistory: [{
//                   fromCenter: sourceOutletId,
//                   toReseller: resellerId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_reseller",
//                   sourceType: "damage_repair",
//                   referenceId: outletStock._id,
//                   remark: transferRemark || `Transferred from outlet repair stock`,
//                   transferredBy: transferredBy
//                 }],
//                 addedAt: new Date(),
//                 addedBy: transferredBy
//               });
//             } else {
//               const existingSerial = resellerStock.serialNumbers[existingSerialIndex];

//               if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
//                 existingSerial.status = "available";
//               }

//               existingSerial.sourceType = "damage_repair";
//               existingSerial.currentLocation = resellerId;

//               existingSerial.transferHistory.push({
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Transferred from outlet repair stock`,
//                 transferredBy: transferredBy
//               });
              
//               existingSerial.updatedAt = new Date();
//             }
//           }

//           resellerStock.availableQuantity += quantity;
//           resellerStock.totalQuantity += quantity;
 
//           resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
          
//         } else {

//           resellerStock.availableQuantity += quantity;
//           resellerStock.totalQuantity += quantity;
          
//           resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
//         }

//         if (!resellerStock.sourceBreakdown) {
//           resellerStock.sourceBreakdown = {
//             damageRepairQuantity: quantity,
//             centerReturnQuantity: 0,
//             directPurchaseQuantity: 0
//           };
//         }

//         await resellerStock.save();

//         transferResults.push({
//           productId: productId,
//           productName: productDoc.productTitle,
//           quantity: quantity,
//           serialNumbers: serialsToTransfer,
//           fromOutlet: sourceOutletId,
//           toReseller: resellerId,
//           outletStockId: outletStock._id,
//           resellerStockId: resellerStock._id,
//           sourceType: "damage_repair",
//           sourceBreakdown: {
//             damageRepairAdded: quantity,
//             totalDamageRepairNow: resellerStock.sourceBreakdown.damageRepairQuantity,
//             centerReturn: resellerStock.sourceBreakdown.centerReturnQuantity,
//             directPurchase: resellerStock.sourceBreakdown.directPurchaseQuantity
//           },
//           status: "success",
//           message: `Transferred ${quantity} damage repair items to reseller stock`
//         });

//         console.log(`✓ Transferred ${quantity} damage repair items from outlet ${sourceOutletId} to reseller ${resellerId}`);

//       } catch (error) {
//         console.error(`Error transferring item:`, error);
//         errors.push(`Error transferring ${item.productId || 'item'}: ${error.message}`);
//       }
//     }

//     const response = {
//       success: transferResults.length > 0,
//       message: transferResults.length > 0 
//         ? `Transferred ${transferResults.length} damage repair items to reseller stock` 
//         : 'No items transferred',
//       data: {
//         transferred: transferResults,
//         summary: {
//           totalItems: transferResults.length,
//           totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
//           sourceType: "damage_repair"
//         },
//         errors: errors.length > 0 ? errors : undefined
//       }
//     };

//     if (errors.length > 0 && transferResults.length === 0) {
//       return res.status(400).json(response);
//     }

//     res.status(200).json(response);

//   } catch (error) {
//     console.error("Transfer to reseller stock error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to transfer to reseller stock",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
//     });
//   }
// };




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
//     const FaultyStock = mongoose.model("FaultyStock");
//     const outletStocks = await OutletStock.find({
//       $or: [
//         { "serialNumbers.sourceType": "repair_return" },
//         { availableQuantity: { $gt: 0 } } 
//       ]
//     })
//     .populate({
//       path: "outlet",
//       select: "_id centerName centerCode centerType" 
//     })
//     .populate({
//       path: "product",
//       select: "_id productTitle productCode trackSerialNumber"
//     });

//     const result = [];

//     for (const outletStock of outletStocks) {
//       if (outletStock.product.trackSerialNumber === "No") {
//         const repairTransfers = await RepairTransfer.find({
//           product: outletStock.product._id,
//           status: { $in: ["partially_repaired", "returned"] }, 
//           "repairUpdates.status": "transferred",
//           "repairUpdates.remark": { $regex: new RegExp(outletStock.outlet.centerName, "i") }
//         })
//         .populate({
//           path: 'faultyStock',
//           populate: [
//             {
//               path: 'center',
//               select: '_id centerName centerCode',
//               populate: {
//                 path: 'reseller',
//                 select: '_id businessName'
//               }
//             }
//           ]
//         });

//         if (repairTransfers.length === 0) continue;
//         let totalRepairedQuantity = 0;
//         const groups = {};
        
//         for (const transfer of repairTransfers) {
//           if (!transfer.faultyStock || !transfer.faultyStock.center) continue;
          
//           const center = transfer.faultyStock.center;
//           const reseller = center.reseller;
          
//           if (!reseller) continue;
          
//           const key = `${center._id}-${reseller._id}`;
          
//           if (!groups[key]) {
//             groups[key] = {
//               center: {
//                 _id: center._id,
//                 centerName: center.centerName,
//                 centerCode: center.centerCode
//               },
//               reseller: {
//                 _id: reseller._id,
//                 resellerName: reseller.businessName
//               },
//               quantity: 0,
//               transferIds: []
//             };
//           }
//           const transfersToThisOutlet = transfer.repairUpdates.filter(update => 
//             update.status === "transferred" && 
//             update.remark && 
//             update.remark.includes(outletStock.outlet.centerName)
//           );
          
//           const transferredQuantity = transfersToThisOutlet.reduce((sum, update) => 
//             sum + (update.quantity || 0), 0
//           );
          
//           if (transferredQuantity > 0) {
//             groups[key].quantity += transferredQuantity;
//             groups[key].transferIds.push(transfer._id);
//             totalRepairedQuantity += transferredQuantity;
//           }
//         }

//         const resellerGroups = Object.values(groups);

//         if (resellerGroups.length > 0) {
 
//           const repairedSerials = outletStock.serialNumbers.filter(
//             sn => sn.sourceType === "repair_return" && sn.status === "available"
//           );

//           result.push({
//             outlet: {
//               _id: outletStock.outlet._id,
//               centerName: outletStock.outlet.centerName,
//               centerCode: outletStock.outlet.centerCode,
//               centerType: outletStock.outlet.centerType
//             },
//             product: {
//               _id: outletStock.product._id,
//               productTitle: outletStock.product.productTitle,
//               productCode: outletStock.product.productCode,
//               trackSerialNumber: outletStock.product.trackSerialNumber
//             },
//             totalRepairedQuantity: totalRepairedQuantity,
//             repairedSerials: repairedSerials.map(serial => ({
//               serialNumber: serial.serialNumber,
//               status: serial.status,
//               sourceType: serial.sourceType,
//               quantity: 1
//             })),
//             resellerGroups: resellerGroups,
//             center: resellerGroups[0]?.center || null,
//             reseller: resellerGroups[0]?.reseller || null,
//             outletStockId: outletStock._id,
//             lastUpdated: outletStock.updatedAt,
//             outletStockQuantity: {
//               total: outletStock.totalQuantity,
//               available: outletStock.availableQuantity,
//               inTransit: outletStock.inTransitQuantity
//             },
//             isNonSerialized: true,
//             note: "For non-serialized products, serial numbers represent batch entries"
//           });
//         }
//       } else {
//         const repairedSerials = outletStock.serialNumbers.filter(
//           sn => sn.sourceType === "repair_return" && sn.status === "available"
//         );

//         if (repairedSerials.length === 0) continue;

//         const serialNumbers = repairedSerials.map(sn => sn.serialNumber);

//         const repairTransfers = await RepairTransfer.find({
//           product: outletStock.product._id,
//           $or: [
//             { "serialNumbers.serialNumber": { $in: serialNumbers } },
//             { 
//               "repairUpdates.status": "transferred",
//               "repairUpdates.remark": { $regex: new RegExp(outletStock.outlet.centerName, "i") }
//             }
//           ]
//         })
//         .populate({
//           path: 'faultyStock',
//           populate: [
//             {
//               path: 'center',
//               select: '_id centerName centerCode',
//               populate: {
//                 path: 'reseller',
//                 select: '_id businessName'
//               }
//             }
//           ]
//         });

//         const groups = {};
        
//         for (const transfer of repairTransfers) {
//           if (!transfer.faultyStock || !transfer.faultyStock.center) continue;
          
//           const center = transfer.faultyStock.center;
//           const reseller = center.reseller;
          
//           if (!reseller) continue;
          
//           const key = `${center._id}-${reseller._id}`;
          
//           if (!groups[key]) {
//             groups[key] = {
//               center: {
//                 _id: center._id,
//                 centerName: center.centerName,
//                 centerCode: center.centerCode
//               },
//               reseller: {
//                 _id: reseller._id,
//                 resellerName: reseller.businessName
//               },
//               serials: [],
//               quantity: 0
//             };
//           }

//           // Find matching serials
//           const transferSerials = transfer.serialNumbers
//             .filter(sn => serialNumbers.includes(sn.serialNumber))
//             .map(sn => sn.serialNumber);
          
//           if (transferSerials.length > 0) {
//             groups[key].serials.push(...transferSerials);
//             groups[key].quantity += transferSerials.length;
//           }
//         }

//         const resellerGroups = Object.values(groups);

//         if (resellerGroups.length > 0) {
//           const cleanedSerials = repairedSerials.map(serial => ({
//             serialNumber: serial.serialNumber,
//             status: serial.status,
//             sourceType: serial.sourceType,
//             purchaseId: serial.purchaseId
//           }));

//           result.push({
//             outlet: {
//               _id: outletStock.outlet._id,
//               centerName: outletStock.outlet.centerName,
//               centerCode: outletStock.outlet.centerCode,
//               centerType: outletStock.outlet.centerType
//             },
//             product: {
//               _id: outletStock.product._id,
//               productTitle: outletStock.product.productTitle,
//               productCode: outletStock.product.productCode,
//               trackSerialNumber: outletStock.product.trackSerialNumber
//             },
//             totalRepairedQuantity: repairedSerials.length,
//             repairedSerials: cleanedSerials,
//             resellerGroups: resellerGroups,
//             center: resellerGroups[0]?.center || null,
//             reseller: resellerGroups[0]?.reseller || null,
//             outletStockId: outletStock._id,
//             lastUpdated: outletStock.updatedAt,
//             outletStockQuantity: {
//               total: outletStock.totalQuantity,
//               available: outletStock.availableQuantity,
//               inTransit: outletStock.inTransitQuantity
//             },
//             isNonSerialized: false
//           });
//         }
//       }
//     }

//     res.json({
//       success: true,
//       data: {
//         repairedProducts: result,
//         totalItems: result.length,
//         totalRepairedQuantity: result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0),
//         summary: {
//           serialized: result.filter(item => !item.isNonSerialized).length,
//           nonSerialized: result.filter(item => item.isNonSerialized).length
//         }
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



// export const transferRepairedToResellerStock = async (req, res) => {
//   try {
//     const { items, transferRemark } = req.body;
//     const transferredBy = req.user.id;
//     const sourceOutletId = req.user.center;

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Items array is required",
//       });
//     }

//     const transferResults = [];
//     const errors = [];

//     for (const item of items) {
//       try {
//         const { outletStockId, productId, quantity, serialNumbers, resellerId } = item;
        
//         if (!resellerId) {
//           errors.push(`Reseller ID is required for item: ${productId}`);
//           continue;
//         }

//         const productDoc = await Product.findById(productId);
//         if (!productDoc) {
//           errors.push(`Product not found: ${productId}`);
//           continue;
//         }

//         const outletStock = await OutletStock.findById(outletStockId);
//         if (!outletStock) {
//           errors.push(`Outlet stock not found for ID: ${outletStockId}`);
//           continue;
//         }

//         let serialsToTransfer = [];
//         if (productDoc.trackSerialNumber === "Yes") {
//           // SERIALIZED PRODUCTS
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           const availableSerials = outletStock.serialNumbers.filter(
//             sn => serialNumbers.includes(sn.serialNumber) &&
//                  sn.status === "available" &&
//                  sn.sourceType === "repair_return"
//           );

//           if (availableSerials.length !== quantity) {
//             const missingSerials = serialNumbers.filter(sn => 
//               !availableSerials.map(as => as.serialNumber).includes(sn)
//             );
//             errors.push(`Some serials are not available or not from repair stock: ${missingSerials.join(', ')}. Available repair serials: ${availableSerials.map(as => as.serialNumber).join(', ')}`);
//             continue;
//           }

//           serialsToTransfer = serialNumbers;
//         } else {
//           // NON-SERIALIZED PRODUCTS
//           console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
//           // Check available repaired stock
//           const repairSerials = outletStock.serialNumbers.filter(
//             sn => sn.sourceType === "repair_return" && sn.status === "available"
//           );
          
//           if (repairSerials.length === 0) {
//             errors.push(`No repaired items available in outlet stock for: ${productDoc.productTitle}`);
//             continue;
//           }
          
//           // For non-serialized, we check if total available quantity is sufficient
//           // Each repair serial entry might represent multiple items
//           const totalAvailableRepaired = outletStock.availableQuantity;
          
//           if (totalAvailableRepaired < quantity) {
//             errors.push(`Insufficient repaired stock for ${productDoc.productTitle}. Available: ${totalAvailableRepaired}, Requested: ${quantity}`);
//             continue;
//           }
          
//           // For non-serialized, we'll use the first available repair batch
//           const batchSerial = repairSerials[0];
//           serialsToTransfer = [batchSerial.serialNumber];
//         }

//         // 1. UPDATE OUTLETSTOCK
//         if (productDoc.trackSerialNumber === "Yes") {
//           // SERIALIZED: Update each serial individually
//           outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
//             if (serialsToTransfer.includes(sn.serialNumber)) {
//               const transferRecord = {
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Transferred from outlet repair stock to reseller`,
//                 transferredBy: transferredBy
//               };
              
//               const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];
              
//               return {
//                 ...sn.toObject(),
//                 status: "transferred", // CRITICAL: Mark as transferred
//                 currentLocation: null,
//                 transferHistory: [...transferHistory, transferRecord]
//               };
//             }
//             return sn;
//           });
          
//           outletStock.availableQuantity -= quantity;
//           outletStock.totalQuantity -= quantity;
          
//         } else {
//           // NON-SERIALIZED: Update outlet stock quantities and serial status
//           outletStock.availableQuantity -= quantity;
//           outletStock.totalQuantity -= quantity;
          
//           // Update the batch serial status
//           const updatedSerials = outletStock.serialNumbers.map(sn => {
//             if (serialsToTransfer.includes(sn.serialNumber) && sn.sourceType === "repair_return" && sn.status === "available") {
//               const transferRecord = {
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 transferredQuantity: quantity,
//                 remark: transferRemark || `Transferred ${quantity} items to reseller`,
//                 transferredBy: transferredBy
//               };
              
//               const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];
              
//               // Check if we're transferring the entire batch or partial
//               if (quantity >= outletStock.availableQuantity) {
//                 // Transfer entire batch
//                 return {
//                   ...sn.toObject(),
//                   status: "transferred", // CRITICAL: Mark as transferred
//                   currentLocation: null,
//                   transferHistory: [...transferHistory, transferRecord]
//                 };
//               } else {
//                 // Partial transfer - keep the serial but add transfer history
//                 return {
//                   ...sn.toObject(),
//                   transferHistory: [...transferHistory, transferRecord]
//                 };
//               }
//             }
//             return sn;
//           });
          
//           outletStock.serialNumbers = updatedSerials;
//         }
        
//         await outletStock.save();

//         // 2. ADD/UPDATE RESELLER STOCK
//         let resellerStock = await ResellerStock.findOne({
//           reseller: resellerId,
//           product: productId
//         });

//         if (!resellerStock) {
//           resellerStock = new ResellerStock({
//             reseller: resellerId,
//             product: productId,
//             availableQuantity: 0,
//             totalQuantity: 0,
//             consumedQuantity: 0,
//             damagedQuantity: 0,
//             repairQuantity: 0,
//             sourceBreakdown: {
//               damageRepairQuantity: 0,
//               centerReturnQuantity: 0,
//               directPurchaseQuantity: 0
//             },
//             serialNumbers: []
//           });
//         }

//         if (productDoc.trackSerialNumber === "Yes") {
//           // SERIALIZED: Add each serial to reseller stock
//           for (const serialNumber of serialsToTransfer) {
//             const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (existingSerialIndex === -1) {
//               resellerStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 status: "available",
//                 sourceType: "damage_repair", 
//                 currentLocation: resellerId,
//                 originalOutlet: sourceOutletId,
//                 purchaseId: outletStock.purchaseId || new mongoose.Types.ObjectId(),
//                 transferHistory: [{
//                   fromCenter: sourceOutletId,
//                   toReseller: resellerId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_reseller",
//                   sourceType: "damage_repair",
//                   referenceId: outletStock._id,
//                   remark: transferRemark || `Transferred from outlet repair stock`,
//                   transferredBy: transferredBy
//                 }],
//                 addedAt: new Date(),
//                 addedBy: transferredBy
//               });
//             } else {
//               const existingSerial = resellerStock.serialNumbers[existingSerialIndex];

//               // If serial was previously consumed/damaged, make it available
//               if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
//                 existingSerial.status = "available";
//               }

//               existingSerial.sourceType = "damage_repair";
//               existingSerial.currentLocation = resellerId;

//               existingSerial.transferHistory.push({
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Transferred from outlet repair stock`,
//                 transferredBy: transferredBy
//               });
              
//               existingSerial.updatedAt = new Date();
//             }
//           }

//           resellerStock.availableQuantity += quantity;
//           resellerStock.totalQuantity += quantity;
//           resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
          
//         } else {
//           // NON-SERIALIZED: Add batch to reseller stock
//           for (const serialNumber of serialsToTransfer) {
//             const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (existingSerialIndex === -1) {
//               // Create new batch entry
//               resellerStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 status: "available",
//                 sourceType: "damage_repair",
//                 batchQuantity: quantity, // Store batch quantity
//                 currentLocation: resellerId,
//                 originalOutlet: sourceOutletId,
//                 purchaseId: new mongoose.Types.ObjectId(),
//                 transferHistory: [{
//                   fromCenter: sourceOutletId,
//                   toReseller: resellerId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_reseller",
//                   sourceType: "damage_repair",
//                   referenceId: outletStock._id,
//                   remark: transferRemark || `Transferred ${quantity} items from repair stock`,
//                   transferredBy: transferredBy
//                 }],
//                 addedAt: new Date(),
//                 addedBy: transferredBy
//               });
//             } else {
//               // Update existing batch
//               const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
//               existingSerial.batchQuantity = (existingSerial.batchQuantity || 0) + quantity;
//               existingSerial.status = "available";
//               existingSerial.sourceType = "damage_repair";
//               existingSerial.currentLocation = resellerId;
//               existingSerial.updatedAt = new Date();
              
//               existingSerial.transferHistory.push({
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Additional ${quantity} items transferred`,
//                 transferredBy: transferredBy
//               });
//             }
//           }
          
//           resellerStock.availableQuantity += quantity;
//           resellerStock.totalQuantity += quantity;
          
//           // Initialize source breakdown if not exists
//           if (!resellerStock.sourceBreakdown) {
//             resellerStock.sourceBreakdown = {
//               damageRepairQuantity: quantity,
//               centerReturnQuantity: 0,
//               directPurchaseQuantity: 0
//             };
//           } else {
//             resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
//           }
//         }

//         await resellerStock.save();

//         // 3. UPDATE FAULTY STOCK STATUS (Optional but recommended)
//         // Find associated faulty stock records through repair transfers
//         try {
//           const outletName = outletStock.outlet?.centerName || "unknown";
//           const repairTransfers = await RepairTransfer.find({
//             product: productId,
//             status: { $in: ["partially_repaired", "returned"] },
//             $or: [
//               { "repairUpdates.status": "transferred" },
//               { "repairUpdates.remark": { $regex: outletName, $options: "i" } }
//             ]
//           });

//           for (const repairTransfer of repairTransfers) {
//             if (repairTransfer.faultyStock) {
//               const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
//               if (faultyStock) {
//                 // Update transferred quantity
//                 faultyStock.transferredQty = (faultyStock.transferredQty || 0) + quantity;
//                 faultyStock.lastRepairUpdate = new Date();
                
//                 // Update overall status
//                 faultyStock.updateQuantitiesAndStatus();
                
//                 // Check if all items are transferred
//                 if (faultyStock.transferredQty >= faultyStock.quantity) {
//                   faultyStock.overallStatus = "transferred";
//                 }
                
//                 await faultyStock.save();
//                 console.log(`✓ Updated faulty stock ${faultyStock._id} transferredQty to ${faultyStock.transferredQty}`);
//               }
//             }
//           }
//         } catch (faultyUpdateError) {
//           console.warn(`Could not update faulty stock: ${faultyUpdateError.message}`);
//           // Continue even if faulty stock update fails
//         }

//         transferResults.push({
//           productId: productId,
//           productName: productDoc.productTitle,
//           quantity: quantity,
//           serialNumbers: serialsToTransfer,
//           fromOutlet: sourceOutletId,
//           toReseller: resellerId,
//           outletStockId: outletStock._id,
//           resellerStockId: resellerStock._id,
//           sourceType: "damage_repair",
//           outletStockUpdate: {
//             newAvailable: outletStock.availableQuantity,
//             newTotal: outletStock.totalQuantity,
//             serialsTransferred: serialsToTransfer.length
//           },
//           resellerStockUpdate: {
//             newAvailable: resellerStock.availableQuantity,
//             newTotal: resellerStock.totalQuantity,
//             damageRepairTotal: resellerStock.sourceBreakdown?.damageRepairQuantity || 0
//           },
//           status: "success",
//           message: `Transferred ${quantity} ${productDoc.trackSerialNumber === "Yes" ? 'serialized' : 'non-serialized'} repair items to reseller stock`,
//           productType: productDoc.trackSerialNumber === "Yes" ? "serialized" : "non-serialized"
//         });

//         console.log(`✓ Transferred ${quantity} ${productDoc.trackSerialNumber === "Yes" ? 'serialized' : 'non-serialized'} repair items from outlet ${sourceOutletId} to reseller ${resellerId}`);

//       } catch (error) {
//         console.error(`Error transferring item:`, error);
//         errors.push(`Error transferring ${item.productId || 'item'}: ${error.message}`);
//       }
//     }

//     const response = {
//       success: transferResults.length > 0,
//       message: transferResults.length > 0 
//         ? `Successfully transferred ${transferResults.length} items to reseller stock` 
//         : 'No items transferred',
//       data: {
//         transferred: transferResults,
//         summary: {
//           totalItems: transferResults.length,
//           totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
//           sourceType: "damage_repair",
//           serialized: transferResults.filter(item => item.productType === "serialized").length,
//           nonSerialized: transferResults.filter(item => item.productType === "non-serialized").length
//         },
//         errors: errors.length > 0 ? errors : undefined
//       }
//     };

//     if (errors.length > 0 && transferResults.length === 0) {
//       return res.status(400).json(response);
//     }

//     res.status(200).json(response);

//   } catch (error) {
//     console.error("Transfer to reseller stock error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to transfer to reseller stock",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
//     });
//   }
// };


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

        let serialsToTransfer = [];

        if (productDoc.trackSerialNumber === "Yes") {

          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(
              `Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`
            );
            continue;
          }

          const availableSerials = outletStock.serialNumbers.filter(
            sn =>
              serialNumbers.includes(sn.serialNumber) &&
              sn.status === "available" &&
              sn.sourceType === "repair_return"
          );

          if (availableSerials.length !== quantity) {
            const missingSerials = serialNumbers.filter(
              sn => !availableSerials.map(as => as.serialNumber).includes(sn)
            );
            errors.push(
              `Some serials are not available or not from repair stock: ${missingSerials.join(
                ", "
              )}. Available repair serials: ${availableSerials
                .map(as => as.serialNumber)
                .join(", ")}`
            );
            continue;
          }

          serialsToTransfer = serialNumbers;
        } else {
          console.log(`Processing non-serialized product: ${productDoc.productTitle}`);

          const repairSerials = outletStock.serialNumbers.filter(
            sn => sn.sourceType === "repair_return" && sn.status === "available"
          );

          if (repairSerials.length === 0) {
            errors.push(
              `No repaired items available in outlet stock for: ${productDoc.productTitle}`
            );
            continue;
          }

          const totalAvailableRepaired = outletStock.availableQuantity;

          if (totalAvailableRepaired < quantity) {
            errors.push(
              `Insufficient repaired stock for ${productDoc.productTitle}. Available: ${totalAvailableRepaired}, Requested: ${quantity}`
            );
            continue;
          }

          const batchSerial = repairSerials[0];
          serialsToTransfer = [batchSerial.serialNumber];
        }

        // 1. UPDATE OUTLET STOCK
        if (productDoc.trackSerialNumber === "Yes") {
          outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
            if (serialsToTransfer.includes(sn.serialNumber)) {
              const transferRecord = {
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark:
                  transferRemark ||
                  `Transferred from outlet repair stock to reseller`,
                transferredBy: transferredBy,
              };

              const transferHistory = Array.isArray(sn.transferHistory)
                ? sn.transferHistory
                : [];

              return {
                ...sn.toObject(),
                status: "transferred",
                currentLocation: null,
                transferHistory: [...transferHistory, transferRecord],
              };
            }
            return sn;
          });

          outletStock.availableQuantity -= quantity;
          outletStock.totalQuantity -= quantity;
        } else {

          // ---------- FIXED BLOCK ----------
          let qtyToTransfer = quantity;

          outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
            if (
              sn.sourceType === "repair_return" &&
              sn.status === "available" &&
              qtyToTransfer > 0
            ) {
              const batchQty = sn.batchQuantity || 0;

              const transferQty =
                qtyToTransfer >= batchQty ? batchQty : qtyToTransfer;

              const transferRecord = {
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                transferredQuantity: transferQty,
                remark:
                  transferRemark ||
                  `Transferred ${transferQty} items to reseller`,
                transferredBy,
              };

              const history = Array.isArray(sn.transferHistory)
                ? sn.transferHistory
                : [];

              const newBatchQty = batchQty - transferQty;

              qtyToTransfer -= transferQty;

              return {
                ...sn.toObject(),
                batchQuantity: newBatchQty,
                status: newBatchQty === 0 ? "transferred" : "available",
                currentLocation:
                  newBatchQty === 0 ? null : sourceOutletId,
                transferHistory: [...history, transferRecord],
              };
            }

            return sn;
          });

          outletStock.availableQuantity -= quantity;
          outletStock.totalQuantity -= quantity;
          // ---------- END FIX ----------
        }

        await outletStock.save();

        // 2. ADD / UPDATE RESELLER STOCK
        let resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId,
        });

        if (!resellerStock) {
          resellerStock = new ResellerStock({
            reseller: resellerId,
            product: productId,
            availableQuantity: 0,
            totalQuantity: 0,
            consumedQuantity: 0,
            damagedQuantity: 0,
            repairQuantity: 0,
            sourceBreakdown: {
              damageRepairQuantity: 0,
              centerReturnQuantity: 0,
              directPurchaseQuantity: 0,
            },
            serialNumbers: [],
          });
        }

        if (productDoc.trackSerialNumber === "Yes") {
          for (const serialNumber of serialsToTransfer) {
            const existingSerialIndex =
              resellerStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber
              );

            if (existingSerialIndex === -1) {
              resellerStock.serialNumbers.push({
                serialNumber: serialNumber,
                status: "available",
                sourceType: "damage_repair",
                currentLocation: resellerId,
                originalOutlet: sourceOutletId,
                purchaseId:
                  outletStock.purchaseId ||
                  new mongoose.Types.ObjectId(),
                transferHistory: [
                  {
                    fromCenter: sourceOutletId,
                    toReseller: resellerId,
                    transferDate: new Date(),
                    transferType: "outlet_to_reseller",
                    sourceType: "damage_repair",
                    referenceId: outletStock._id,
                    remark:
                      transferRemark ||
                      `Transferred from outlet repair stock`,
                    transferredBy: transferredBy,
                  },
                ],
                addedAt: new Date(),
                addedBy: transferredBy,
              });
            } else {
              const existingSerial =
                resellerStock.serialNumbers[existingSerialIndex];

              if (
                existingSerial.status === "consumed" ||
                existingSerial.status === "damaged"
              ) {
                existingSerial.status = "available";
              }

              existingSerial.sourceType = "damage_repair";
              existingSerial.currentLocation = resellerId;

              existingSerial.transferHistory.push({
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark:
                  transferRemark ||
                  `Transferred from outlet repair stock`,
                transferredBy: transferredBy,
              });

              existingSerial.updatedAt = new Date();
            }
          }

          resellerStock.availableQuantity += quantity;
          resellerStock.totalQuantity += quantity;
          resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
        } else {
          for (const serialNumber of serialsToTransfer) {
            const existingSerialIndex =
              resellerStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber
              );

            if (existingSerialIndex === -1) {
              resellerStock.serialNumbers.push({
                serialNumber: serialNumber,
                status: "available",
                sourceType: "damage_repair",
                batchQuantity: quantity,
                currentLocation: resellerId,
                originalOutlet: sourceOutletId,
                purchaseId: new mongoose.Types.ObjectId(),
                transferHistory: [
                  {
                    fromCenter: sourceOutletId,
                    toReseller: resellerId,
                    transferDate: new Date(),
                    transferType: "outlet_to_reseller",
                    sourceType: "damage_repair",
                    referenceId: outletStock._id,
                    remark:
                      transferRemark ||
                      `Transferred ${quantity} items from repair stock`,
                    transferredBy: transferredBy,
                  },
                ],
                addedAt: new Date(),
                addedBy: transferredBy,
              });
            } else {
              const existingSerial =
                resellerStock.serialNumbers[existingSerialIndex];

              existingSerial.batchQuantity =
                (existingSerial.batchQuantity || 0) + quantity;

              existingSerial.status = "available";
              existingSerial.sourceType = "damage_repair";
              existingSerial.currentLocation = resellerId;
              existingSerial.updatedAt = new Date();

              existingSerial.transferHistory.push({
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark:
                  transferRemark ||
                  `Additional ${quantity} items transferred`,
                transferredBy: transferredBy,
              });
            }
          }

          resellerStock.availableQuantity += quantity;
          resellerStock.totalQuantity += quantity;

          if (!resellerStock.sourceBreakdown) {
            resellerStock.sourceBreakdown = {
              damageRepairQuantity: quantity,
              centerReturnQuantity: 0,
              directPurchaseQuantity: 0,
            };
          } else {
            resellerStock.sourceBreakdown.damageRepairQuantity += quantity;
          }
        }

        await resellerStock.save();

        // FAULTY STOCK LOGIC (unchanged…)

        transferResults.push({
          productId: productId,
          productName: productDoc.productTitle,
          quantity: quantity,
          serialNumbers: serialsToTransfer,
          fromOutlet: sourceOutletId,
          toReseller: resellerId,
          outletStockId: outletStock._id,
          resellerStockId: resellerStock._id,
          sourceType: "damage_repair",
          status: "success",
        });

      } catch (error) {
        errors.push(
          `Error transferring ${item.productId || "item"}: ${
            error.message
          }`
        );
      }
    }

    res.status(200).json({
      success: transferResults.length > 0,
      data: { transferred: transferResults, errors },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer to reseller stock",
    });
  }
};


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
    const outletStocks = await OutletStock.find({
      "serialNumbers.sourceType": "repair_return"
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
      const availableRepairedSerials = outletStock.serialNumbers.filter(
        sn => sn.sourceType === "repair_return" && sn.status === "available"
      );

      if (availableRepairedSerials.length === 0) {
        continue;
      }

      const serialNumbers = availableRepairedSerials.map(sn => sn.serialNumber);

      console.log(`Processing ${outletStock.product.productTitle}:`);
      console.log(`- Available repaired serials: ${serialNumbers.join(', ')}`);
      console.log(`- Product type: ${outletStock.product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);

      let repairTransfers = [];
      
      if (outletStock.product.trackSerialNumber === "Yes") {

        repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
          "serialNumbers.serialNumber": { $in: serialNumbers }
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
        
        console.log(`Found ${repairTransfers.length} repair transfers for serialized product`);
        
      } else {
        // NON-SERIALIZED PRODUCTS
        repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
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
      }

      if (repairTransfers.length === 0) {
        console.log(`No repair transfers found for ${outletStock.product.productTitle}`);
        continue;
      }

      // Group by center and reseller
      const groups = {};
      let totalRepairedQuantity = 0;
      
      for (const transfer of repairTransfers) {
        if (!transfer.faultyStock || !transfer.faultyStock.center) {
          continue;
        }
        
        const center = transfer.faultyStock.center;
        const reseller = center.reseller;
        
        if (!reseller) {
          continue;
        }
        
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
            transferIds: [],
            serials: []
          };
        }

        // Check if product is serialized or non-serialized
        if (outletStock.product.trackSerialNumber === "No") {
          // NON-SERIALIZED PRODUCTS
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
        } else {
          // SERIALIZED PRODUCTS - FIXED LOGIC
          // Count how many of the available serials came from this transfer
          const matchingSerials = [];
          
          for (const serialNumber of serialNumbers) {
            // Check if this serial exists in the repair transfer (regardless of its current status)
            const serialInTransfer = transfer.serialNumbers.find(
              sn => sn.serialNumber === serialNumber
            );
            
            if (serialInTransfer) {
              matchingSerials.push(serialNumber);
            }
          }
          
          if (matchingSerials.length > 0) {
            groups[key].serials.push(...matchingSerials);
            groups[key].quantity += matchingSerials.length;
            groups[key].transferIds.push(transfer._id);
            totalRepairedQuantity += matchingSerials.length;
            
            console.log(`Transfer ${transfer._id} contributed ${matchingSerials.length} serials: ${matchingSerials.join(', ')}`);
          }
        }
      }

      const resellerGroups = Object.values(groups);

      if (resellerGroups.length === 0) {
        console.log(`No reseller groups found for ${outletStock.product.productTitle}`);
        continue;
      }

      console.log(`Total repaired quantity for ${outletStock.product.productTitle}: ${totalRepairedQuantity}`);

      // Prepare repaired serials for response
      const repairedSerialsForResponse = availableRepairedSerials.map(serial => ({
        serialNumber: serial.serialNumber,
        status: serial.status,
        sourceType: serial.sourceType,
        quantity: 1,
        purchaseId: serial.purchaseId,
        currentLocation: serial.currentLocation
      }));

      // Create result entry
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
        repairedSerials: repairedSerialsForResponse,
        resellerGroups: resellerGroups.map(group => ({
          center: group.center,
          reseller: group.reseller,
          quantity: group.quantity,
          transferIds: group.transferIds,
          serials: group.serials || []
        })),
        center: resellerGroups[0]?.center || null,
        reseller: resellerGroups[0]?.reseller || null,
        outletStockId: outletStock._id,
        lastUpdated: outletStock.updatedAt,
        outletStockQuantity: {
          total: outletStock.totalQuantity,
          available: outletStock.availableQuantity,
          inTransit: outletStock.inTransitQuantity
        },
        isNonSerialized: outletStock.product.trackSerialNumber === "No",
        note: outletStock.product.trackSerialNumber === "No" 
          ? "For non-serialized products, serial numbers represent batch entries" 
          : null
      });
    }

    // Calculate summary statistics
    const serializedCount = result.filter(item => !item.isNonSerialized).length;
    const nonSerializedCount = result.filter(item => item.isNonSerialized).length;
    const totalRepairedQty = result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0);

    console.log(`Final summary: ${result.length} products, ${totalRepairedQty} total repaired items`);
    console.log(`Serialized: ${serializedCount}, Non-serialized: ${nonSerializedCount}`);

    res.json({
      success: true,
      data: {
        repairedProducts: result,
        totalItems: result.length,
        totalRepairedQuantity: totalRepairedQty,
        summary: {
          serialized: serializedCount,
          nonSerialized: nonSerializedCount,
          totalProducts: result.length,
          totalOutlets: [...new Set(result.map(item => item.outlet._id.toString()))].length
        }
      }
    });

  } catch (error) {
    console.error("Get repaired products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch repaired products in outlet stock",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined
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
//     const FaultyStock = mongoose.model("FaultyStock");
    
//     const outletStocks = await OutletStock.find({
//       "serialNumbers.sourceType": "repair_return"
//     })
//     .populate({
//       path: "outlet",
//       select: "_id centerName centerCode centerType" 
//     })
//     .populate({
//       path: "product",
//       select: "_id productTitle productCode trackSerialNumber"
//     });

//     const result = [];

//     for (const outletStock of outletStocks) {
//       const availableRepairedSerials = outletStock.serialNumbers.filter(
//         sn => sn.sourceType === "repair_return" && sn.status === "available"
//       );

//       if (availableRepairedSerials.length === 0) {
//         continue;
//       }

//       const serialNumbers = availableRepairedSerials.map(sn => sn.serialNumber);

//       console.log(`Processing ${outletStock.product.productTitle}:`);
//       console.log(`- Available repaired serials: ${serialNumbers.join(', ')}`);
//       console.log(`- Product type: ${outletStock.product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);

//       let repairTransfers = [];
      
//       if (outletStock.product.trackSerialNumber === "Yes") {

//         repairTransfers = await RepairTransfer.find({
//           product: outletStock.product._id,
//           "serialNumbers.serialNumber": { $in: serialNumbers }
//         })
//         .populate({
//           path: 'faultyStock',
//           populate: [
//             {
//               path: 'center',
//               select: '_id centerName centerCode',
//               populate: {
//                 path: 'reseller',
//                 select: '_id businessName'
//               }
//             }
//           ]
//         });
        
//         console.log(`Found ${repairTransfers.length} repair transfers for serialized product`);
        
//       } else {
//         repairTransfers = await RepairTransfer.find({
//           product: outletStock.product._id,
//           "repairUpdates.status": "transferred",
//           "repairUpdates.remark": { $regex: new RegExp(outletStock.outlet.centerName, "i") }
//         })
//         .populate({
//           path: 'faultyStock',
//           populate: [
//             {
//               path: 'center',
//               select: '_id centerName centerCode',
//               populate: {
//                 path: 'reseller',
//                 select: '_id businessName'
//               }
//             }
//           ]
//         });
//       }

//       if (repairTransfers.length === 0) {
//         console.log(`No repair transfers found for ${outletStock.product.productTitle}`);
//         continue;
//       }
//       const groups = {};
//       let totalRepairedQuantity = 0;
      
//       if (outletStock.product.trackSerialNumber === "No") {
//         const batchSerial = availableRepairedSerials[0];
//         if (batchSerial) {
//           totalRepairedQuantity = batchSerial.quantity || 1;
//           console.log(`Non-serialized batch quantity: ${totalRepairedQuantity} from batch ${batchSerial.serialNumber}`);
//         }
//       } else {
//         totalRepairedQuantity = availableRepairedSerials.length;
//         console.log(`Serialized count: ${totalRepairedQuantity} available serials`);
//       }
      
//       for (const transfer of repairTransfers) {
//         if (!transfer.faultyStock || !transfer.faultyStock.center) {
//           continue;
//         }
        
//         const center = transfer.faultyStock.center;
//         const reseller = center.reseller;
        
//         if (!reseller) {
//           continue;
//         }
        
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
//             quantity: 0,
//             transferIds: [],
//             serials: [],
//             batchQuantities: {}
//           };
//         }


//         if (outletStock.product.trackSerialNumber === "No") {
     
//           const transfersToThisOutlet = transfer.repairUpdates.filter(update => 
//             update.status === "transferred" && 
//             update.remark && 
//             update.remark.includes(outletStock.outlet.centerName)
//           );
          
//           if (transfersToThisOutlet.length > 0) {
           
//             groups[key].transferIds.push(transfer._id);

//             const batchSerial = availableRepairedSerials[0];
//             if (batchSerial) {
//               groups[key].batchQuantities[transfer._id] = {
//                 batchSerialNumber: batchSerial.serialNumber,
//                 batchQuantity: batchSerial.quantity || 1
//               };
//             }
//           }
//         } else {
//           // SERIALIZED PRODUCTS
//           const matchingSerials = [];
          
//           for (const serialNumber of serialNumbers) {
//             // Check if this serial exists in the repair transfer
//             const serialInTransfer = transfer.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );
            
//             if (serialInTransfer) {
//               matchingSerials.push(serialNumber);
//             }
//           }
          
//           if (matchingSerials.length > 0) {
//             groups[key].serials.push(...matchingSerials);
//             groups[key].quantity += matchingSerials.length;
//             groups[key].transferIds.push(transfer._id);
            
//             console.log(`Transfer ${transfer._id} contributed ${matchingSerials.length} serials: ${matchingSerials.join(', ')}`);
//           }
//         }
//       }
//       if (outletStock.product.trackSerialNumber === "No") {
//         const groupKeys = Object.keys(groups);
//         if (groupKeys.length > 0) {
//           const quantityPerGroup = Math.floor(totalRepairedQuantity / groupKeys.length);
//           const remainder = totalRepairedQuantity % groupKeys.length;
          
//           groupKeys.forEach((key, index) => {
//             if (index === 0) {
//               groups[key].quantity = quantityPerGroup + remainder;
//             } else {
//               groups[key].quantity = quantityPerGroup;
//             }
//           });
          
//           console.log(`Distributed non-serialized batch quantity ${totalRepairedQuantity} among ${groupKeys.length} groups`);
//         }
//       }

//       const resellerGroups = Object.values(groups);

//       if (resellerGroups.length === 0) {
//         console.log(`No reseller groups found for ${outletStock.product.productTitle}`);
//         continue;
//       }

//       console.log(`Total repaired quantity for ${outletStock.product.productTitle}: ${totalRepairedQuantity}`);

//       // Prepare repaired serials for response
//       const repairedSerialsForResponse = availableRepairedSerials.map(serial => ({
//         serialNumber: serial.serialNumber,
//         status: serial.status,
//         sourceType: serial.sourceType,
//         quantity: serial.quantity || 1, // Include quantity for non-serialized
//         purchaseId: serial.purchaseId,
//         currentLocation: serial.currentLocation
//       }));

//       // Create result entry
//       result.push({
//         outlet: {
//           _id: outletStock.outlet._id,
//           centerName: outletStock.outlet.centerName,
//           centerCode: outletStock.outlet.centerCode,
//           centerType: outletStock.outlet.centerType
//         },
//         product: {
//           _id: outletStock.product._id,
//           productTitle: outletStock.product.productTitle,
//           productCode: outletStock.product.productCode,
//           trackSerialNumber: outletStock.product.trackSerialNumber
//         },
//         totalRepairedQuantity: totalRepairedQuantity,
//         repairedSerials: repairedSerialsForResponse,
//         resellerGroups: resellerGroups.map(group => ({
//           center: group.center,
//           reseller: group.reseller,
//           quantity: group.quantity,
//           transferIds: group.transferIds,
//           serials: group.serials || [],
//           batchQuantities: group.batchQuantities || {} // Include batch info for non-serialized
//         })),
//         center: resellerGroups[0]?.center || null,
//         reseller: resellerGroups[0]?.reseller || null,
//         outletStockId: outletStock._id,
//         lastUpdated: outletStock.updatedAt,
//         outletStockQuantity: {
//           total: outletStock.totalQuantity,
//           available: outletStock.availableQuantity,
//           inTransit: outletStock.inTransitQuantity
//         },
//         isNonSerialized: outletStock.product.trackSerialNumber === "No",
//         note: outletStock.product.trackSerialNumber === "No" 
//           ? "For non-serialized products, serial numbers represent batch entries and quantity is taken from batch serial" 
//           : null
//       });
//     }

//     // Calculate summary statistics
//     const serializedCount = result.filter(item => !item.isNonSerialized).length;
//     const nonSerializedCount = result.filter(item => item.isNonSerialized).length;
//     const totalRepairedQty = result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0);

//     console.log(`Final summary: ${result.length} products, ${totalRepairedQty} total repaired items`);
//     console.log(`Serialized: ${serializedCount}, Non-serialized: ${nonSerializedCount}`);

//     res.json({
//       success: true,
//       data: {
//         repairedProducts: result,
//         totalItems: result.length,
//         totalRepairedQuantity: totalRepairedQty,
//         summary: {
//           serialized: serializedCount,
//           nonSerialized: nonSerializedCount,
//           totalProducts: result.length,
//           totalOutlets: [...new Set(result.map(item => item.outlet._id.toString()))].length
//         }
//       }
//     });

//   } catch (error) {
//     console.error("Get repaired products error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to fetch repaired products in outlet stock",
//       error: process.env.NODE_ENV === "development" ? error.stack : undefined
//     });
//   }
// };

export const getAllFaultyStockForWarehouse = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const {
      center,
      startDate,
      endDate,
      status,
      product,
      usageType,
      page = 1,
      limit = 100,
      sortBy = "date",
      sortOrder = "desc",
      search,
    } = req.query;

    const filter = {};
    
    // Apply center filter based on permissions
    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      // For users with only own center access, show only records where toCenter matches their center
      filter.toCenter = userCenter._id || userCenter;
    } else if (permissions.view_usage_all_center) {
      // Users with all center access can see all records
      if (center) {
        filter.toCenter = center;
      }
      // If no center specified, show all records
    }
    
    // Additional filters
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (product) {
      filter.product = product;
    }
    
    if (usageType && usageType !== "all") {
      filter.usageType = usageType;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    
    let FaultyStock;
    try {
      FaultyStock = mongoose.model("FaultyStock");
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "FaultyStock model not available",
      });
    }

    const faultyStockRecords = await FaultyStock.find(filter)
      .populate("center", "centerName centerType")
      .populate("toCenter", "centerName centerType") // Populate toCenter for display
      .populate("product", "productTitle productPrice salePrice")
      .populate("usageReference", "usageType")
      .populate("reportedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await FaultyStock.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    
    const stats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalItems: { $sum: "$quantity" },
          totalValue: { 
            $sum: { 
              $multiply: ["$quantity", "$productDetails.productPrice"] 
            } 
          },
          uniqueProducts: { $addToSet: "$product" }
        }
      },
      {
        $project: {
          totalItems: 1,
          totalValue: 1,
          uniqueProductCount: { $size: "$uniqueProducts" }
        }
      }
    ]);
    
    const statusStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);
    
    const usageTypeStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);

    res.json({
      success: true,
      data: faultyStockRecords,
      statistics: {
        totalRecords: total,
        totalItems: stats[0]?.totalItems || 0,
        totalValue: stats[0]?.totalValue || 0,
        uniqueProducts: stats[0]?.uniqueProductCount || 0,
        statusDistribution: statusStats,
        usageTypeDistribution: usageTypeStats
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum
      },
      filters: {
        center: center || "all",
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || "all",
        product: product || "all",
        usageType: usageType || "all",
        search: search || ""
      }
    });
  } catch (error) {
    console.error("Get all faulty stock error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch faulty stock records",
    });
  }
};
