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

//         // Check for current user's center if they don't have all-center access
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
        
//         // Calculate available damaged items
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
//             // NON-SERIALIZED PRODUCTS: Calculate damaged quantity
//             const repairedQty = faultyStock.repairedQty || 0;
//             const irrepairedQty = faultyStock.irrepairedQty || 0;
//             const underRepairQty = faultyStock.underRepairQty || 0;
            
//             const damagedQty = Math.max(0, faultyStock.quantity - repairedQty - irrepairedQty - underRepairQty);
            
//             if (damagedQty > 0) {
//               totalAvailableDamaged += damagedQty;
//               if (!selectedFaultyStock) {
//                 selectedFaultyStock = faultyStock;
//               }
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

//         console.log(`Processing transfer: ${product.productTitle}, Qty: ${quantity}, Type: ${product.trackSerialNumber === "Yes" ? "Serialized" : "Non-Serialized"}`);

//         // Update the selected faulty stock record
//         if (!selectedFaultyStock) {
//           errors.push(`No valid faulty stock record found for product: ${product.productTitle}`);
//           continue;
//         }

//         // Update faulty stock - mark items as under repair
//         if (product.trackSerialNumber === "Yes") {
//           // SERIALIZED PRODUCTS: Update serial numbers status to "under_repair"
//           let updatedCount = 0;
//           for (const serial of selectedFaultyStock.serialNumbers) {
//             if (actualSerialsToTransfer.includes(serial.serialNumber)) {
//               serial.status = "under_repair";
//               serial.underRepairQty = 1;
              
//               // Add repair history entry
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
//           // NON-SERIALIZED PRODUCTS: Update underRepairQty
//           const currentUnderRepair = selectedFaultyStock.underRepairQty || 0;
//           selectedFaultyStock.underRepairQty = currentUnderRepair + quantity;
//         }

//         // Update faulty stock status and save
//         selectedFaultyStock.updateQuantitiesAndStatus();
//         await selectedFaultyStock.save();
//         console.log(`✓ FaultyStock saved with status: ${selectedFaultyStock.overallStatus}`);

//         // CHECK IF REPAIR TRANSFER ALREADY EXISTS FOR THIS FAULTY STOCK
//         // Look for active transfers (not completed/returned)
//         let repairTransfer = await RepairTransfer.findOne({
//           faultyStock: selectedFaultyStock._id,
//           product: productId,
//           toCenter: repairCenterId,
//           status: { $in: ["transferred", "in_repair", "under_repair", "partially_repaired", "repaired"] }
//         });

//         if (repairTransfer) {
//           // UPDATE EXISTING REPAIR TRANSFER
//           console.log(`Found existing repair transfer ${repairTransfer._id}, updating...`);
          
//           // Prepare items to add
//           const itemsToAdd = product.trackSerialNumber === "Yes" 
//             ? actualSerialsToTransfer.map(sn => ({ serialNumber: sn, quantity: 1 }))
//             : [{ quantity: quantity }];
          
//           // Use the model method to add items
//           try {
//             const addResult = repairTransfer.addItemsToTransfer(
//               itemsToAdd,
//               transferredBy,
//               damageRemark || "Additional items transferred"
//             );
            
//             console.log(`Added items result:`, addResult);
//           } catch (addError) {
//             errors.push(`Failed to add items to existing transfer: ${addError.message}`);
//             continue;
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
//               quantity: 1,
//               repairedQty: 0,
//               irrepairedQty: 0,
//               underRepairQty: 1,
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
//             status: "under_repair",
//             // Set quantity fields correctly
//             underRepairQty: quantity,
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
//         }

//         // Save the repair transfer
//         await repairTransfer.save();
//         console.log(`✓ RepairTransfer saved with status: ${repairTransfer.status}`);

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
//           productType: product.trackSerialNumber === "Yes" ? "serialized" : "non-serialized",
//           faultyStockStatus: selectedFaultyStock.overallStatus,
//           faultyStockId: selectedFaultyStock._id,
//           repairTransferStatus: repairTransfer.status,
//           repairTransferQuantities: repairTransfer.getQuantitySummary()
//         });

//         console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity})`);

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

        // Find faulty stock for this product
        let faultyFilter = {
          product: productId,
          overallStatus: "damaged" // Only transfer from damaged status
        };
        
        if (!permissions.manage_usage_all_center && userCenter) {
          faultyFilter.center = userCenter._id || userCenter;
        }

        const faultyStocks = await FaultyStock.find(faultyFilter);
        
        if (!faultyStocks || faultyStocks.length === 0) {
          errors.push(`No damaged faulty stock found for product: ${product.productTitle}`);
          continue;
        }

        let selectedFaultyStock = null;
        let totalAvailable = 0;
        let availableSerials = [];
        
        // Find available damaged items
        for (const faultyStock of faultyStocks) {
          if (product.trackSerialNumber === "Yes") {
            const damagedSerials = faultyStock.serialNumbers.filter(sn => sn.status === "damaged");
            if (damagedSerials.length > 0) {
              availableSerials = [...availableSerials, ...damagedSerials];
              totalAvailable += damagedSerials.length;
              if (!selectedFaultyStock) selectedFaultyStock = faultyStock;
            }
          } else {
            if (faultyStock.damageQty > 0) {
              totalAvailable += faultyStock.damageQty;
              if (!selectedFaultyStock) selectedFaultyStock = faultyStock;
            }
          }
        }

        if (totalAvailable === 0) {
          errors.push(`No damaged items available for product: ${product.productTitle}`);
          continue;
        }

        if (quantity > totalAvailable) {
          errors.push(`Insufficient damaged stock for ${product.productTitle}. Available: ${totalAvailable}, Requested: ${quantity}`);
          continue;
        }

        // Validate serial numbers for serialized products
        let actualSerials = [];
        if (product.trackSerialNumber === "Yes") {
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            // Take first N available serials
            actualSerials = availableSerials.slice(0, quantity).map(s => s.serialNumber);
          } else {
            if (serialNumbers.length !== quantity) {
              errors.push(`Quantity mismatch for ${product.productTitle}. Serial count: ${serialNumbers.length}, Quantity: ${quantity}`);
              continue;
            }
            
            const availableSerialNumbers = availableSerials.map(s => s.serialNumber);
            const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
            if (invalidSerials.length > 0) {
              errors.push(`Invalid serial numbers for ${product.productTitle}: ${invalidSerials.join(', ')}`);
              continue;
            }
            actualSerials = serialNumbers;
          }
        }

        console.log(`Transferring ${product.productTitle}: ${quantity} units to pending_under_repair`);

        // Update faulty stock - move from damaged to pending_under_repair
        if (product.trackSerialNumber === "Yes") {
          // For serialized: Update serial status to pending_under_repair
          let updatedCount = 0;
          for (const serial of selectedFaultyStock.serialNumbers) {
            if (actualSerials.includes(serial.serialNumber)) {
              serial.status = "pending_under_repair";
              serial.underRepairQty = 0; // NOT counted as under repair yet
              
              serial.repairHistory.push({
                date: new Date(),
                status: "pending_under_repair",
                remark: damageRemark || "Transferred to repair center - pending acceptance",
                updatedBy: transferredBy,
                cost: 0
              });
              
              updatedCount++;
            }
          }
          
          if (updatedCount !== quantity) {
            errors.push(`Failed to update ${quantity} serials. Updated: ${updatedCount}`);
            continue;
          }
        } else {
          // For non-serialized: Reduce damageQty and add to pendingUnderRepairQty
          if (selectedFaultyStock.damageQty < quantity) {
            errors.push(`Insufficient damageQty: ${selectedFaultyStock.damageQty}, requested: ${quantity}`);
            continue;
          }
          
          selectedFaultyStock.damageQty -= quantity;
          selectedFaultyStock.pendingUnderRepairQty = (selectedFaultyStock.pendingUnderRepairQty || 0) + quantity;
          
          // Add to repair history
          selectedFaultyStock.repairHistory.push({
            date: new Date(),
            status: "pending_under_repair",
            remark: damageRemark || `Transferred ${quantity} items to repair center - pending acceptance`,
            quantity: quantity,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: transferredBy
          });
        }

        // Update faulty stock status (but NOT underRepairQty)
        selectedFaultyStock.updateQuantitiesAndStatus();
        await selectedFaultyStock.save();
        
        console.log(`FaultyStock saved: DamageQty: ${selectedFaultyStock.damageQty}, PendingUnderRepairQty: ${selectedFaultyStock.pendingUnderRepairQty}, UnderRepairQty: ${selectedFaultyStock.underRepairQty}`);

        // Create repair transfer record
        let repairTransferSerials = [];
        if (product.trackSerialNumber === "Yes") {
          repairTransferSerials = actualSerials.map(sn => ({
            serialNumber: sn,
            status: "pending_under_repair",
            quantity: 1,
            repairedQty: 0,
            irrepairedQty: 0,
            underRepairQty: 0, // ZERO - not accepted yet
            repairHistory: [{
              date: new Date(),
              status: "pending_under_repair",
              remark: damageRemark || "Transferred - pending acceptance",
              updatedBy: transferredBy,
              cost: 0
            }]
          }));
        }

        const repairTransfer = new RepairTransfer({
          date: new Date(),
          faultyStock: selectedFaultyStock._id,
          fromCenter: selectedFaultyStock.center,
          toCenter: repairCenterId,
          product: productId,
          quantity: quantity,
          serialNumbers: repairTransferSerials,
          isSerialized: product.trackSerialNumber === "Yes",
          transferRemark: transferRemark || `Transferred to ${repairCenter.centerName} - pending acceptance`,
          transferredBy: transferredBy,
          status: "pending_under_repair",
          pendingUnderRepairQty: quantity, // ALL items are pending
          underRepairQty: 0, // ZERO - none accepted yet
          repairedQty: 0,
          irrepairedQty: 0,
          returnedQty: 0,
          repairUpdates: [{
            date: new Date(),
            status: "pending_under_repair",
            remark: transferRemark || `Transferred to repair center - pending acceptance`,
            quantity: quantity,
            updatedBy: transferredBy,
            cost: 0
          }]
        });

        await repairTransfer.save();
        console.log(`RepairTransfer saved: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`);

        transferResults.push({
          product: product.productTitle,
          quantity: quantity,
          status: "pending_under_repair",
          faultyStockId: selectedFaultyStock._id,
          transferId: repairTransfer._id,
          message: "Transferred successfully. Waiting for repair center acceptance."
        });

      } catch (error) {
        console.error(`Error processing item:`, error);
        errors.push(`Error: ${error.message}`);
      }
    }

    if (errors.length > 0 && transferResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transfer failed",
        errors: errors
      });
    }

    res.json({
      success: true,
      message: `Transferred ${transferResults.length} items to pending_under_repair status`,
      data: {
        transferred: transferResults,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({
      success: false,
      message: error.message
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
//     console.log("Repair Center:", repairCenterId);
//     console.log("Request:", JSON.stringify(items, null, 2));

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
//         console.log("\n=== Processing Item ===");
//         console.log("Item:", JSON.stringify(item, null, 2));
        
//         const { 
//           product,
//           quantity, 
//           serialNumbers = [], 
//           productRemark, 
//           finalStatus, 
//           repairCost = 0
//         } = item;

//         // Validate
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

//         console.log(`Product: ${productDoc.productTitle}, Serialized: ${productDoc.trackSerialNumber}`);

//         // CRITICAL FIX: Find ALL transfers and check available quantity
//         let repairTransfer;
        
//         if (productDoc.trackSerialNumber === "Yes") {
//           // SERIALIZED: Find transfer with specific serials
//           console.log(`Looking for serialized transfer with serials: ${serialNumbers}`);
          
//           repairTransfer = await RepairTransfer.findOne({
//             product: product,
//             toCenter: repairCenterId,
//             "serialNumbers.serialNumber": { $in: serialNumbers }
//           })
//           .populate("product", "productTitle productCode trackSerialNumber");

//           if (!repairTransfer) {
//             errors.push(`No repair transfer found containing serials: ${serialNumbers.join(', ')} for ${productDoc.productTitle}`);
//             continue;
//           }
          
//         } else {
//           // NON-SERIALIZED: Find ALL transfers and calculate available quantity
//           console.log(`Looking for non-serialized transfers`);
          
//           const allTransfers = await RepairTransfer.find({
//             product: product,
//             toCenter: repairCenterId,
//             status: { $in: ["under_repair", "in_repair", "transferred"] }
//           })
//           .populate("product", "productTitle productCode trackSerialNumber")
//           .sort({ createdAt: 1 });

//           console.log(`Found ${allTransfers.length} transfers for non-serialized product`);

//           if (allTransfers.length === 0) {
//             errors.push(`No repair transfers found for ${productDoc.productTitle} at your repair center`);
//             continue;
//           }

//           // Find transfer with available quantity
//           let availableQuantity = 0;
//           let selectedTransfer = null;
          
//           for (const transfer of allTransfers) {
//             console.log(`Checking transfer ${transfer._id}:`);
//             console.log(`- Total quantity: ${transfer.quantity}`);
//             console.log(`- Repaired: ${transfer.repairedQty || 0}`);
//             console.log(`- Irrepaired: ${transfer.irrepairedQty || 0}`);
//             console.log(`- Under repair: ${transfer.underRepairQty || 0}`);
//             console.log(`- Serial numbers: ${JSON.stringify(transfer.serialNumbers)}`);
            
//             // Calculate available in this transfer
//             const repaired = transfer.repairedQty || 0;
//             const irrepaired = transfer.irrepairedQty || 0;
//             const underRepair = transfer.underRepairQty || 0;
            
//             // Different ways to calculate available:
//             // 1. Use underRepairQty if available
//             // 2. Calculate from quantities
//             // 3. Check serial numbers status
//             let transferAvailable = 0;
            
//             if (underRepair > 0) {
//               transferAvailable = underRepair;
//             } else {
//               transferAvailable = transfer.quantity - repaired - irrepaired;
//             }
            
//             console.log(`- Available in this transfer: ${transferAvailable}`);
            
//             if (transferAvailable >= quantity) {
//               selectedTransfer = transfer;
//               availableQuantity = transferAvailable;
//               console.log(`✓ Found suitable transfer with ${availableQuantity} available`);
//               break;
//             }
            
//             // Also check serial numbers array
//             if (transfer.serialNumbers.length > 0) {
//               const underRepairSerials = transfer.serialNumbers.filter(
//                 sn => sn.status === "under_repair"
//               );
//               const serialsAvailable = underRepairSerials.reduce(
//                 (sum, sn) => sum + (sn.quantity || 1), 0
//               );
              
//               console.log(`- Available from serials: ${serialsAvailable}`);
              
//               if (serialsAvailable >= quantity) {
//                 selectedTransfer = transfer;
//                 availableQuantity = serialsAvailable;
//                 console.log(`✓ Found suitable transfer via serials with ${availableQuantity} available`);
//                 break;
//               }
//             }
//           }

//           if (!selectedTransfer) {
//             // Check total available across all transfers
//             const totalAvailable = allTransfers.reduce((sum, transfer) => {
//               const repaired = transfer.repairedQty || 0;
//               const irrepaired = transfer.irrepairedQty || 0;
//               return sum + (transfer.quantity - repaired - irrepaired);
//             }, 0);
            
//             errors.push(`Insufficient items available. Total available: ${totalAvailable}, Requested: ${quantity} for ${productDoc.productTitle}`);
//             continue;
//           }
          
//           repairTransfer = selectedTransfer;
//         }

//         if (!repairTransfer) {
//           errors.push(`No suitable repair transfer found for ${productDoc.productTitle}`);
//           continue;
//         }

//         console.log(`✓ Using repair transfer: ${repairTransfer._id}`);
//         console.log(`Status: ${repairTransfer.status}, Quantity: ${repairTransfer.quantity}`);

//         // Verify center
//         if (repairTransfer.toCenter.toString() !== repairCenterId.toString()) {
//           errors.push(`Transfer ${repairTransfer._id} is not at your repair center`);
//           continue;
//         }

//         // Get faulty stock
//         const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
//         if (!faultyStock) {
//           errors.push(`Faulty stock not found for transfer ${repairTransfer._id}`);
//           continue;
//         }

//         console.log(`Faulty stock: ${faultyStock._id}`);

//         // PROCESS THE ITEM
//         if (productDoc.trackSerialNumber === "No") {
//           // NON-SERIALIZED PRODUCTS
//           console.log(`Processing NON-SERIALIZED product`);
          
//           // Calculate available quantity
//           const repaired = repairTransfer.repairedQty || 0;
//           const irrepaired = repairTransfer.irrepairedQty || 0;
//           const available = repairTransfer.quantity - repaired - irrepaired;
          
//           console.log(`Available: ${available}, Requested: ${quantity}`);
          
//           if (available < quantity) {
//             errors.push(`Insufficient items. Available: ${available}, Requested: ${quantity}`);
//             continue;
//           }

//           // FIX: Handle empty serialNumbers array
//           if (repairTransfer.serialNumbers.length === 0) {
//             console.log(`Creating serial number entry for new transfer`);
            
//             // Create serial entry based on available quantity
//             repairTransfer.serialNumbers = [{
//               serialNumber: `NON-SERIAL-${repairTransfer._id}`,
//               status: "under_repair",
//               quantity: repairTransfer.quantity,
//               repairedQty: 0,
//               irrepairedQty: 0,
//               underRepairQty: available,
//               repairHistory: []
//             }];
//           }

//           // Update serial entry
//           const serialEntry = repairTransfer.serialNumbers[0];
          
//           if (finalStatus === "repaired") {
//             serialEntry.repairedQty = (serialEntry.repairedQty || 0) + quantity;
//             repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + quantity;
//           } else {
//             serialEntry.irrepairedQty = (serialEntry.irrepairedQty || 0) + quantity;
//             repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + quantity;
//           }
          
//           serialEntry.underRepairQty = Math.max(0, 
//             (serialEntry.underRepairQty || serialEntry.quantity) - quantity
//           );
          
//           // Update serial status
//           if (serialEntry.underRepairQty === 0) {
//             if (serialEntry.repairedQty === serialEntry.quantity) {
//               serialEntry.status = "repaired";
//             } else if (serialEntry.irrepairedQty === serialEntry.quantity) {
//               serialEntry.status = "irreparable";
//             }
//           } else {
//             serialEntry.status = "under_repair";
//           }

//           // Add repair history to serial
//           if (!Array.isArray(serialEntry.repairHistory)) {
//             serialEntry.repairHistory = [];
//           }
          
//           serialEntry.repairHistory.push({
//             date: new Date(date),
//             status: finalStatus,
//             remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
//             quantity: quantity,
//             repairedQty: finalStatus === "repaired" ? quantity : 0,
//             irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//             updatedBy: updatedBy,
//             cost: repairCost * quantity
//           });

//           // Update repair transfer quantities
//           repairTransfer.underRepairQty = Math.max(0, 
//             repairTransfer.quantity - 
//             (repairTransfer.repairedQty || 0) - 
//             (repairTransfer.irrepairedQty || 0)
//           );

//         } else {
//           // SERIALIZED PRODUCTS
//           console.log(`Processing SERIALIZED product`);
          
//           if (!serialNumbers || serialNumbers.length === 0) {
//             errors.push(`Serial numbers required for serialized product`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serials count (${serialNumbers.length})`);
//             continue;
//           }

//           // Validate serials
//           const validSerials = [];
//           const invalidSerials = [];
          
//           for (const serialNumber of serialNumbers) {
//             const serial = repairTransfer.serialNumbers.find(sn => 
//               sn.serialNumber === serialNumber
//             );
            
//             if (serial) {
//               if (serial.status === "under_repair") {
//                 validSerials.push(serialNumber);
//               } else {
//                 invalidSerials.push({
//                   serialNumber,
//                   status: serial.status,
//                   message: `Already ${serial.status}`
//                 });
//               }
//             } else {
//               invalidSerials.push({
//                 serialNumber,
//                 status: "not found",
//                 message: "Serial not found"
//               });
//             }
//           }

//           if (invalidSerials.length > 0) {
//             errors.push(`Invalid serials: ${JSON.stringify(invalidSerials)}`);
//             continue;
//           }

//           console.log(`✓ All ${validSerials.length} serials are valid`);

//           // Update each serial
//           for (const serialNumber of validSerials) {
//             const serial = repairTransfer.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//             if (serial) {
//               serial.status = finalStatus;
              
//               // Add repair history
//               if (!Array.isArray(serial.repairHistory)) {
//                 serial.repairHistory = [];
//               }
              
//               serial.repairHistory.push({
//                 date: new Date(date),
//                 status: finalStatus,
//                 remark: productRemark || remark || `Marked as ${finalStatus}`,
//                 updatedBy: updatedBy,
//                 cost: repairCost
//               });

//               // Update quantities
//               if (finalStatus === "repaired") {
//                 repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + 1;
//               } else {
//                 repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + 1;
//               }
//             }
//           }
          
//           // Update under repair count
//           const remainingUnderRepair = repairTransfer.serialNumbers.filter(
//             sn => sn.status === "under_repair"
//           ).length;
          
//           repairTransfer.underRepairQty = remainingUnderRepair;
//         }

//         // Add repair update
//         if (!Array.isArray(repairTransfer.repairUpdates)) {
//           repairTransfer.repairUpdates = [];
//         }
        
//         repairTransfer.repairUpdates.push({
//           date: new Date(date),
//           status: finalStatus,
//           remark: productRemark || remark || 
//             (productDoc.trackSerialNumber === "Yes" 
//               ? `Marked ${quantity} serials as ${finalStatus}` 
//               : `Marked ${quantity} items as ${finalStatus}`),
//           quantity: quantity,
//           repairedQty: finalStatus === "repaired" ? quantity : 0,
//           irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
//           updatedBy: updatedBy,
//           cost: repairCost * quantity
//         });

//         // Update transfer status
//         const totalProcessed = (repairTransfer.repairedQty || 0) + (repairTransfer.irrepairedQty || 0);
        
//         if (totalProcessed === repairTransfer.quantity) {
//           if (repairTransfer.repairedQty === repairTransfer.quantity) {
//             repairTransfer.status = "repaired";
//           } else if (repairTransfer.irrepairedQty === repairTransfer.quantity) {
//             repairTransfer.status = "irreparable";
//           } else {
//             repairTransfer.status = "partially_repaired";
//           }
//         } else if (totalProcessed > 0) {
//           repairTransfer.status = "under_repair";
//         } else {
//           repairTransfer.status = "under_repair";
//         }

//         // Update repair cost
//         if (repairCost > 0) {
//           repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + (repairCost * quantity);
//         }

//         // Save repair transfer
//         await repairTransfer.save();
//         console.log(`✓ Saved repair transfer with status: ${repairTransfer.status}`);

//         // Update faulty stock
//         if (faultyStock) {
//           if (productDoc.trackSerialNumber === "Yes") {
//             // Update serials in faulty stock
//             for (const serialNumber of serialNumbers) {
//               const faultySerial = faultyStock.serialNumbers.find(sn => 
//                 sn.serialNumber === serialNumber
//               );
              
//               if (faultySerial && faultySerial.status === "under_repair") {
//                 faultySerial.status = finalStatus;
                
//                 if (!Array.isArray(faultySerial.repairHistory)) {
//                   faultySerial.repairHistory = [];
//                 }
                
//                 faultySerial.repairHistory.push({
//                   date: new Date(date),
//                   status: finalStatus,
//                   remark: productRemark || remark || `Marked as ${finalStatus}`,
//                   updatedBy: updatedBy,
//                   cost: repairCost
//                 });
//               }
//             }
            
//             // Update quantities
//             if (finalStatus === "repaired") {
//               faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
//             } else {
//               faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
//             }
            
//           } else {
//             // Non-serialized - update quantities
//             if (finalStatus === "repaired") {
//               faultyStock.repairedQty = (faultyStock.repairedQty || 0) + quantity;
//             } else {
//               faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + quantity;
//             }
//           }
          
//           // Update faulty stock status
//           const faultyProcessed = (faultyStock.repairedQty || 0) + (faultyStock.irrepairedQty || 0);
          
//           if (faultyProcessed === faultyStock.quantity) {
//             if (faultyStock.repairedQty === faultyStock.quantity) {
//               faultyStock.overallStatus = "repaired";
//             } else if (faultyStock.irrepairedQty === faultyStock.quantity) {
//               faultyStock.overallStatus = "irreparable";
//             } else {
//               faultyStock.overallStatus = "partially_repaired";
//             }
//           } else if (faultyProcessed > 0) {
//             faultyStock.overallStatus = "under_repair";
//           } else {
//             faultyStock.overallStatus = "damaged";
//           }
          
//           faultyStock.lastRepairUpdate = new Date();
//           await faultyStock.save();
//           console.log(`✓ Saved faulty stock with status: ${faultyStock.overallStatus}`);
//         }

//         // Add result
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
//           repairTransferStatus: repairTransfer.status
//         });

//         console.log(`✓ Successfully processed ${productDoc.productTitle}`);

//       } catch (error) {
//         console.error(`Error:`, error);
//         errors.push(`Error: ${error.message}`);
//       }
//     }

//     // Response
//     if (errors.length > 0 && results.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to process any items",
//         errors: errors
//       });
//     }

//     const response = {
//       success: true,
//       message: `Successfully processed ${results.length} items`,
//       data: {
//         processed: results,
//         summary: {
//           totalItems: results.length,
//           totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0)
//         }
//       }
//     };

//     if (errors.length > 0) {
//       response.data.errors = errors;
//       response.data.partialSuccess = true;
//       response.message += ` (${errors.length} failed)`;
//     }

//     console.log("\n=== FINAL RESULT ===");
//     console.log(JSON.stringify(response, null, 2));
    
//     res.json(response);

//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to process repair status",
//     });
//   }
// };


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

        // Find repair transfer
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
          let selectedTransfer = null;
          let transferAvailable = 0;
          
          for (const transfer of allTransfers) {
            console.log(`Checking transfer ${transfer._id}:`);
            console.log(`- Total quantity: ${transfer.quantity}`);
            console.log(`- Repaired: ${transfer.repairedQty || 0}`);
            console.log(`- Irrepaired: ${transfer.irrepairedQty || 0}`);
            console.log(`- Under repair: ${transfer.underRepairQty || 0}`);
            
            // Calculate available in this transfer
            const repaired = transfer.repairedQty || 0;
            const irrepaired = transfer.irrepairedQty || 0;
            const underRepair = transfer.underRepairQty || 0;
            
            // Calculate available quantity
            let available = 0;
            
            if (underRepair > 0) {
              available = underRepair;
            } else {
              available = transfer.quantity - repaired - irrepaired;
            }
            
            console.log(`- Available in this transfer: ${available}`);
            
            if (available >= quantity) {
              selectedTransfer = transfer;
              transferAvailable = available;
              console.log(`✓ Found suitable transfer with ${transferAvailable} available`);
              break;
            }
          }

          if (!selectedTransfer) {
            // Check total available across all transfers
            const totalAvailable = allTransfers.reduce((sum, transfer) => {
              const repaired = transfer.repairedQty || 0;
              const irrepaired = transfer.irrepairedQty || 0;
              const underRepair = transfer.underRepairQty || 0;
              return sum + Math.max(underRepair, transfer.quantity - repaired - irrepaired);
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
          // NON-SERIALIZED PRODUCTS - FIXED
          console.log(`Processing NON-SERIALIZED product`);
          
          // Calculate available quantity
          const repaired = repairTransfer.repairedQty || 0;
          const irrepaired = repairTransfer.irrepairedQty || 0;
          const underRepair = repairTransfer.underRepairQty || 0;
          const available = Math.max(underRepair, repairTransfer.quantity - repaired - irrepaired);
          
          console.log(`Available: ${available}, Requested: ${quantity}`);
          
          if (available < quantity) {
            errors.push(`Insufficient items. Available: ${available}, Requested: ${quantity}`);
            continue;
          }

          // Handle empty serialNumbers array in repair transfer
          if (repairTransfer.serialNumbers.length === 0) {
            console.log(`Creating serial number entry for non-serialized transfer`);
            
            repairTransfer.serialNumbers = [{
              serialNumber: `NON-SERIAL-${repairTransfer._id}`,
              status: "under_repair",
              quantity: repairTransfer.quantity,
              repairedQty: repaired,
              irrepairedQty: irrepaired,
              underRepairQty: available,
              repairHistory: []
            }];
          }

          // Update serial entry in repair transfer
          const serialEntry = repairTransfer.serialNumbers[0];
          
          if (finalStatus === "repaired") {
            serialEntry.repairedQty = (serialEntry.repairedQty || 0) + quantity;
            repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + quantity;
          } else {
            serialEntry.irrepairedQty = (serialEntry.irrepairedQty || 0) + quantity;
            repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + quantity;
          }
          
          // Update under repair quantity
          serialEntry.underRepairQty = Math.max(0, 
            (serialEntry.underRepairQty || serialEntry.quantity) - quantity
          );
          
          // Update serial status
          if (serialEntry.underRepairQty === 0) {
            if (serialEntry.repairedQty === serialEntry.quantity) {
              serialEntry.status = "repaired";
            } else if (serialEntry.irrepairedQty === serialEntry.quantity) {
              serialEntry.status = "irreparable";
            } else {
              serialEntry.status = "partially_repaired";
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

          // Update repair transfer underRepairQty
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
              serial.repairDate = new Date(date);
              
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

        // UPDATE FAULTY STOCK - FIXED FOR NON-SERIALIZED
        if (faultyStock) {
          if (productDoc.trackSerialNumber === "Yes") {
            // Update serials in faulty stock
            for (const serialNumber of serialNumbers) {
              const faultySerial = faultyStock.serialNumbers.find(sn => 
                sn.serialNumber === serialNumber
              );
              
              if (faultySerial && faultySerial.status === "under_repair") {
                faultySerial.status = finalStatus;
                faultySerial.repairDate = new Date(date);
                
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
            // NON-SERIALIZED - CRITICAL FIX
            console.log(`=== UPDATING FAULTY STOCK FOR NON-SERIALIZED ===`);
            console.log(`Before update:`);
            console.log(`- Quantity: ${faultyStock.quantity}`);
            console.log(`- RepairedQty: ${faultyStock.repairedQty || 0}`);
            console.log(`- IrrepairedQty: ${faultyStock.irrepairedQty || 0}`);
            console.log(`- UnderRepairQty: ${faultyStock.underRepairQty || 0}`);
            console.log(`- DamageQty: ${faultyStock.damageQty || 0}`);
            console.log(`- Overall Status: ${faultyStock.overallStatus}`);
            
            // Use the new method to update faulty stock from repair
            try {
              const result = faultyStock.markAsRepairedFromRepair(
                quantity,
                finalStatus,
                productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
                updatedBy
              );
              
              console.log(`Faulty stock update result:`, result);
            } catch (error) {
              console.error(`Error updating faulty stock:`, error);
              errors.push(`Error updating faulty stock: ${error.message}`);
              continue;
            }
          }
          
          // Add repair history to faulty stock
          if (!Array.isArray(faultyStock.repairHistory)) {
            faultyStock.repairHistory = [];
          }
          
          faultyStock.repairHistory.push({
            date: new Date(date),
            status: finalStatus,
            remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus} from repair`,
            quantity: quantity,
            repairedQty: finalStatus === "repaired" ? quantity : 0,
            irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
            updatedBy: updatedBy,
            cost: repairCost * quantity
          });
          
          faultyStock.lastRepairUpdate = new Date();
          await faultyStock.save();
          
          console.log(`=== AFTER FAULTY STOCK UPDATE ===`);
          console.log(`- RepairedQty: ${faultyStock.repairedQty || 0}`);
          console.log(`- IrrepairedQty: ${faultyStock.irrepairedQty || 0}`);
          console.log(`- UnderRepairQty: ${faultyStock.underRepairQty || 0}`);
          console.log(`- DamageQty: ${faultyStock.damageQty || 0}`);
          console.log(`- Overall Status: ${faultyStock.overallStatus}`);
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
          repairTransferStatus: repairTransfer.status,
          faultyStockStatus: faultyStock ? faultyStock.overallStatus : null,
          faultyStockUnderRepairQty: faultyStock ? faultyStock.underRepairQty : null
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
          totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
          totalRepaired: results.filter(item => item.finalStatus === "repaired").reduce((sum, item) => sum + item.quantity, 0),
          totalIrrepaired: results.filter(item => item.finalStatus === "irreparable").reduce((sum, item) => sum + item.quantity, 0)
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
//     // NO FaultyStock model needed here

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

//         console.log(`\n=== PROCESSING ${productDoc.productTitle} ===`);
//         const isSerialized = productDoc.trackSerialNumber === "Yes";

//         // Find repair transfers with repaired items
//         const repairTransfers = await RepairTransfer.find({
//           product: productId,
//           toCenter: repairCenterId,
//           $or: [
//             { repairedQty: { $gt: 0 } },
//             { "serialNumbers.status": "repaired" }
//           ]
//         });

//         console.log(`Found ${repairTransfers.length} repair transfers with repaired items`);
        
//         if (repairTransfers.length === 0) {
//           errors.push(`No repair transfers with repaired items found for product: ${productDoc.productTitle}`);
//           continue;
//         }

//         // Handle NON-SERIALIZED products
//         if (!isSerialized) {
//           console.log(`\n=== PROCESSING NON-SERIALIZED PRODUCT ===`);
          
//           // Find transfer with repaired items
//           let repairTransfer = null;
//           for (const transfer of repairTransfers) {
//             if (transfer.repairedQty > 0) {
//               repairTransfer = transfer;
//               break;
//             }
//           }
          
//           if (!repairTransfer || repairTransfer.repairedQty < quantity) {
//             errors.push(`Insufficient repaired items for ${productDoc.productTitle}`);
//             continue;
//           }
          
//           console.log(`Transferring ${quantity} items from transfer ${repairTransfer._id}`);
          
//           // Update repair transfer ONLY
//           repairTransfer.returnedQty = (repairTransfer.returnedQty || 0) + quantity;
//           repairTransfer.repairedQty = Math.max(0, (repairTransfer.repairedQty || 0) - quantity);
          
//           if (repairTransfer.returnedQty === repairTransfer.quantity) {
//             repairTransfer.status = "returned";
//           } else if (repairTransfer.returnedQty > 0) {
//             repairTransfer.status = "partially_repaired";
//           }
          
//           repairTransfer.repairUpdates.push({
//             date: new Date(),
//             status: "transferred", // Status is "transferred" for warehouse transfer
//             remark: damageRemark || `Transferred ${quantity} repaired items to warehouse: ${destinationOutlet.centerName}`,
//             quantity: quantity,
//             updatedBy: transferredBy
//           });
          
//           await repairTransfer.save();
//           console.log(`✓ Updated RepairTransfer status to: ${repairTransfer.status}`);
          
//           // UPDATE OUTLET STOCK ONLY - NO FAULTY STOCK UPDATE
//           let outletStock = await OutletStock.findOne({
//             outlet: outletId,
//             product: productId
//           });

//           if (!outletStock) {
//             outletStock = new OutletStock({
//               outlet: outletId,
//               product: productId,
//               totalQuantity: 0,
//               availableQuantity: 0,
//               inTransitQuantity: 0,
//               repairedQuantity: 0,
//               transferredRepairedQty: 0,
//               serialNumbers: []
//             });
//           }
          
//           outletStock.availableQuantity += quantity;
//           outletStock.totalQuantity += quantity;
//           outletStock.repairedQuantity += quantity; // Add to repaired quantity
          
//           await outletStock.save();
//           console.log(`✓ Updated OutletStock - repairedQuantity: ${outletStock.repairedQuantity}`);
          
//           transferResults.push({
//             product: productDoc.productTitle,
//             quantity: quantity,
//             status: "success",
//             message: `Transferred ${quantity} repaired non-serialized items to warehouse`
//           });
          
//         } else {
//           // SERIALIZED PRODUCTS
//           console.log(`\n=== PROCESSING SERIALIZED PRODUCT ===`);
          
//           // Check if serial numbers are provided
//           if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
//             errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
//             continue;
//           }

//           if (serialNumbers.length !== quantity) {
//             errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
//             continue;
//           }

//           console.log(`Processing serial numbers: ${serialNumbers.join(', ')}`);
          
//           // Find repair transfer containing these serials
//           let repairTransfer = null;
//           for (const transfer of repairTransfers) {
//             const hasAllSerials = serialNumbers.every(serial => 
//               transfer.serialNumbers.some(sn => sn.serialNumber === serial && sn.status === "repaired")
//             );
//             if (hasAllSerials) {
//               repairTransfer = transfer;
//               break;
//             }
//           }
          
//           if (!repairTransfer) {
//             errors.push(`No repair transfer found with these repaired serials: ${serialNumbers.join(', ')}`);
//             continue;
//           }
          
//           console.log(`Found RepairTransfer: ${repairTransfer._id}`);
          
//           // Update each serial in repair transfer
//           for (const serialNumber of serialNumbers) {
//             repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
//               if (sn.serialNumber === serialNumber) {
//                 return {
//                   ...sn.toObject(),
//                   status: "transferred", // Status is "transferred" for warehouse transfer
//                   repairHistory: [
//                     ...(sn.repairHistory || []),
//                     {
//                       date: new Date(),
//                       status: "transferred",
//                       remark: damageRemark || `Transferred to warehouse: ${destinationOutlet.centerName}`,
//                       updatedBy: transferredBy
//                     }
//                   ]
//                 };
//               }
//               return sn;
//             });
//           }
          
//           // Update repair transfer quantities
//           repairTransfer.returnedQty = (repairTransfer.returnedQty || 0) + quantity;
//           repairTransfer.repairedQty = Math.max(0, (repairTransfer.repairedQty || 0) - quantity);
          
//           if (repairTransfer.returnedQty === repairTransfer.quantity) {
//             repairTransfer.status = "returned";
//           } else if (repairTransfer.returnedQty > 0) {
//             repairTransfer.status = "partially_repaired";
//           }
          
//           repairTransfer.repairUpdates.push({
//             date: new Date(),
//             status: "transferred",
//             remark: damageRemark || `Transferred ${quantity} serialized items to warehouse: ${destinationOutlet.centerName}`,
//             quantity: quantity,
//             updatedBy: transferredBy
//           });
          
//           await repairTransfer.save();
//           console.log(`✓ Updated RepairTransfer status to: ${repairTransfer.status}`);
          
//           // UPDATE OUTLET STOCK ONLY - NO FAULTY STOCK UPDATE
//           let outletStock = await OutletStock.findOne({
//             outlet: outletId,
//             product: productId
//           });

//           if (!outletStock) {
//             outletStock = new OutletStock({
//               outlet: outletId,
//               product: productId,
//               totalQuantity: 0,
//               availableQuantity: 0,
//               inTransitQuantity: 0,
//               repairedQuantity: 0,
//               transferredRepairedQty: 0,
//               serialNumbers: []
//             });
//           }
          
//           outletStock.availableQuantity += quantity;
//           outletStock.totalQuantity += quantity;
//           outletStock.repairedQuantity += quantity; // Add to repaired quantity
          
//           // Add/update serials in outlet stock
//           for (const serialNumber of serialNumbers) {
//             const existingIndex = outletStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );
            
//             if (existingIndex === -1) {
//               outletStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 purchaseId: new mongoose.Types.ObjectId(),
//                 status: "available",
//                 sourceType: "repair_return",
//                 repairSource: "repaired",
//                 currentLocation: outletId,
//                 transferHistory: [{
//                   fromCenter: repairCenterId,
//                   toCenter: outletId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_center",
//                   source: "repair_return"
//                 }]
//               });
//             } else {
//               outletStock.serialNumbers[existingIndex].status = "available";
//               outletStock.serialNumbers[existingIndex].sourceType = "repair_return";
//               outletStock.serialNumbers[existingIndex].repairSource = "repaired";
//             }
//           }
          
//           await outletStock.save();
//           console.log(`✓ Updated OutletStock - repairedQuantity: ${outletStock.repairedQuantity}`);
          
//           transferResults.push({
//             product: productDoc.productTitle,
//             quantity: quantity,
//             serialNumbers: serialNumbers,
//             status: "success",
//             message: `Transferred ${quantity} repaired serialized items to warehouse`
//           });
//         }

//         console.log(`✅ Warehouse transfer complete - NO FaultyStock updates needed`);

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
//       message: `Transferred ${transferResults.length} repaired items to warehouse: ${destinationOutlet.centerName}`,
//       data: {
//         transferred: transferResults,
//         totalItems: transferResults.length,
//         totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
//         destination: {
//           id: outletId,
//           name: destinationOutlet.centerName,
//           type: destinationOutlet.centerType
//         },
//         note: "FaultyStock not updated - warehouse transfers are internal movements"
//       }
//     };
    
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

        console.log(`\n=== PROCESSING ${productDoc.productTitle} ===`);
        const isSerialized = productDoc.trackSerialNumber === "Yes";

        // Find repair transfers with repaired items
        const repairTransfers = await RepairTransfer.find({
          product: productId,
          toCenter: repairCenterId,
          $or: [
            { repairedQty: { $gt: 0 } },
            { "serialNumbers.status": "repaired" }
          ]
        });

        console.log(`Found ${repairTransfers.length} repair transfers with repaired items`);
        
        if (repairTransfers.length === 0) {
          errors.push(`No repair transfers with repaired items found for product: ${productDoc.productTitle}`);
          continue;
        }

        // For NON-SERIALIZED products
        if (!isSerialized) {
          console.log(`\n=== PROCESSING NON-SERIALIZED PRODUCT ===`);
          
          // Find transfer with repaired items
          let repairTransfer = null;
          for (const transfer of repairTransfers) {
            if (transfer.repairedQty > 0) {
              repairTransfer = transfer;
              break;
            }
          }
          
          if (!repairTransfer || repairTransfer.repairedQty < quantity) {
            errors.push(`Insufficient repaired items for ${productDoc.productTitle}. Available: ${repairTransfer?.repairedQty || 0}, Requested: ${quantity}`);
            continue;
          }
          
          console.log(`Transferring ${quantity} non-serialized items from transfer ${repairTransfer._id}`);
          console.log(`Before - RepairedQty: ${repairTransfer.repairedQty}, Status: ${repairTransfer.status}`);
          
          try {
            // Use markAsPendingTransfer method
            const transferResult = repairTransfer.markAsPendingTransfer(
              quantity, 
              outletId, 
              transferredBy, 
              damageRemark || `Transferred to warehouse (pending): ${destinationOutlet.centerName}`,
              [] // Empty array for non-serialized
            );
            
            await repairTransfer.save();
            console.log(`✓ Updated RepairTransfer. Status: ${repairTransfer.status}, RepairedQty: ${repairTransfer.repairedQty}, PendingTransferQty: ${repairTransfer.pendingTransferQty}`);
            
            // Update OutletStock
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
                repairedQuantity: 0,
                transferredRepairedQty: 0,
                pendingRepairedQty: 0,
                pendingSerials: []
              });
            }
            
            // Track pending repaired quantity
            outletStock.pendingRepairedQty = (outletStock.pendingRepairedQty || 0) + quantity;
            
            await outletStock.save();
            console.log(`✓ Added ${quantity} to pendingRepairedQty in OutletStock. Total pending: ${outletStock.pendingRepairedQty}`);
            
            transferResults.push({
              product: productDoc.productTitle,
              quantity: quantity,
              status: "pending_transfer",
              isSerialized: false,
              repairTransferId: repairTransfer._id,
              message: `Transferred ${quantity} repaired non-serialized items to warehouse (pending approval)`
            });
            
          } catch (error) {
            console.error(`Error in markAsPendingTransfer:`, error);
            errors.push(`Failed to transfer non-serialized items for ${productDoc.productTitle}: ${error.message}`);
          }
          
        } else {
          // For SERIALIZED products
          console.log(`\n=== PROCESSING SERIALIZED PRODUCT ===`);
          
          // Check if serial numbers are provided
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
            continue;
          }

          console.log(`Processing serial numbers: ${serialNumbers.join(', ')}`);
          
          // Find repair transfer containing these serials
          let repairTransfer = null;
          for (const transfer of repairTransfers) {
            const hasAllSerials = serialNumbers.every(serial => 
              transfer.serialNumbers.some(sn => sn.serialNumber === serial && sn.status === "repaired")
            );
            if (hasAllSerials) {
              repairTransfer = transfer;
              break;
            }
          }
          
          if (!repairTransfer) {
            errors.push(`No repair transfer found with these repaired serials: ${serialNumbers.join(', ')}`);
            continue;
          }
          
          console.log(`Found RepairTransfer: ${repairTransfer._id}`);
          
          try {
            // Use markAsPendingTransfer method with serial numbers
            const transferResult = repairTransfer.markAsPendingTransfer(
              quantity, 
              outletId, 
              transferredBy, 
              damageRemark || `Transferred to warehouse (pending): ${destinationOutlet.centerName}`,
              serialNumbers // Pass serial numbers for serialized
            );
            
            await repairTransfer.save();
            console.log(`✓ Updated RepairTransfer. Status: ${repairTransfer.status}, PendingTransferQty: ${repairTransfer.pendingTransferQty}`);
            
            // Update OutletStock
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
                repairedQuantity: 0,
                transferredRepairedQty: 0,
                pendingRepairedQty: 0,
                serialNumbers: [],
                pendingSerials: []
              });
            }
            
            // Track pending repaired quantity
            outletStock.pendingRepairedQty = (outletStock.pendingRepairedQty || 0) + quantity;
            
            // Track pending serials
            for (const serialNumber of serialNumbers) {
              // Check if serial already exists in pendingSerials
              const existingPendingSerial = outletStock.pendingSerials.find(
                ps => ps.serialNumber === serialNumber
              );
              
              if (!existingPendingSerial) {
                outletStock.pendingSerials.push({
                  serialNumber: serialNumber,
                  repairTransferId: repairTransfer._id,
                  status: "pending_approval"
                });
              }
              
              // Also add to main serialNumbers array with pending_approval status
              const existingSerial = outletStock.serialNumbers.find(
                sn => sn.serialNumber === serialNumber
              );
              
              if (!existingSerial) {
                outletStock.serialNumbers.push({
                  serialNumber: serialNumber,
                  purchaseId: new mongoose.Types.ObjectId(),
                  status: "pending_approval",
                  sourceType: "repair_return",
                  currentLocation: outletId,
                  transferHistory: [{
                    fromCenter: repairCenterId,
                    toCenter: outletId,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    source: "repair_return",
                    transferStatus: "pending",
                    transferredBy: transferredBy
                  }]
                });
              } else {
                // Update existing serial
                existingSerial.status = "pending_approval";
                existingSerial.sourceType = "repair_return";
                existingSerial.transferHistory.push({
                  fromCenter: repairCenterId,
                  toCenter: outletId,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  source: "repair_return",
                  transferStatus: "pending",
                  transferredBy: transferredBy
                });
              }
            }
            
            await outletStock.save();
            console.log(`✓ Added ${quantity} to pendingRepairedQty and pendingSerials in OutletStock`);
            
            transferResults.push({
              product: productDoc.productTitle,
              quantity: quantity,
              serialNumbers: serialNumbers,
              status: "pending_transfer",
              isSerialized: true,
              repairTransferId: repairTransfer._id,
              message: `Transferred ${quantity} repaired serialized items to warehouse (pending approval)`
            });
            
          } catch (error) {
            console.error(`Error in markAsPendingTransfer for serialized:`, error);
            errors.push(`Failed to transfer serialized items for ${productDoc.productTitle}: ${error.message}`);
          }
        }

        console.log(`✅ Warehouse transfer complete - Pending approval`);

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
      message: `Transferred ${transferResults.length} repaired items to warehouse (pending approval): ${destinationOutlet.centerName}`,
      data: {
        transferred: transferResults,
        totalItems: transferResults.length,
        totalQuantity: transferResults.reduce((sum, item) => sum + item.quantity, 0),
        destination: {
          id: outletId,
          name: destinationOutlet.centerName,
          type: destinationOutlet.centerType
        },
        note: "Items are pending approval from warehouse. They will be available after acceptance."
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

//     // Import models
//     const Product = mongoose.model("Product");
//     const OutletStock = mongoose.model("OutletStock");
//     const ResellerStock = mongoose.model("ResellerStock");
//     const RepairTransfer = mongoose.model("RepairTransfer");
//     const FaultyStock = mongoose.model("FaultyStock");
//     const Reseller = mongoose.model("Reseller");

//     const transferResults = [];
//     const errors = [];

//     for (const item of items) {
//       try {
//         const { outletStockId, productId, quantity, serialNumbers, resellerId } = item;
        
//         if (!resellerId) {
//           errors.push(`Reseller ID is required for item: ${productId}`);
//           continue;
//         }

//         // Validate reseller exists
//         const reseller = await Reseller.findById(resellerId);
//         if (!reseller) {
//           errors.push(`Reseller not found: ${resellerId}`);
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

//         console.log(`\n=== Processing ${productDoc.productTitle} ===`);
//         console.log(`Source Outlet: ${sourceOutletId}`);
//         console.log(`Destination Reseller: ${resellerId} (${reseller.businessName})`);
//         console.log(`Requested quantity: ${quantity}`);
//         console.log(`OutletStock BEFORE update:`);
//         console.log(`- repairedQuantity: ${outletStock.repairedQuantity || 0}`);
//         console.log(`- transferredRepairedQty: ${outletStock.transferredRepairedQty || 0}`);

//         // Check if enough repaired items are available for transfer
//         // const availableRepaired = (outletStock.repairedQuantity || 0) - (outletStock.transferredRepairedQty || 0);
//         const availableRepaired = (outletStock.repairedQuantity || 0)
//         console.log(`Available repaired for transfer: ${availableRepaired}`);
        
//         if (availableRepaired < quantity) {
//           errors.push(`Insufficient repaired items available for transfer. Available: ${availableRepaired}, Requested: ${quantity}`);
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
//             errors.push(
//               `Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`
//             );
//             continue;
//           }

//           // Validate serials are from repair_return and available
//           const availableRepairedSerials = outletStock.serialNumbers.filter(
//             sn =>
//               serialNumbers.includes(sn.serialNumber) &&
//               sn.status === "available" &&
//               sn.sourceType === "repair_return"
//           );

//           if (availableRepairedSerials.length !== quantity) {
//             const missingSerials = serialNumbers.filter(
//               sn => !availableRepairedSerials.map(as => as.serialNumber).includes(sn)
//             );
//             errors.push(
//               `Some serials are not available or not from repair stock: ${missingSerials.join(", ")}`
//             );
//             continue;
//           }

//           serialsToTransfer = serialNumbers;
//           console.log(`Processing ${serialsToTransfer.length} serial numbers: ${serialsToTransfer.join(', ')}`);
//         } else {
//           // NON-SERIALIZED PRODUCTS
//           console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          
//           // For non-serialized, we don't need specific serials
//           // Just check if we have enough repaired quantity
//           if (quantity > availableRepaired) {
//             errors.push(`Insufficient repaired stock. Available: ${availableRepaired}, Requested: ${quantity}`);
//             continue;
//           }
          
//           serialsToTransfer = [`REPAIR-BATCH-${Date.now()}`];
//           console.log(`Non-serialized transfer of ${quantity} items`);
//         }

//         // 1. UPDATE OUTLET STOCK - FIXED: Update BOTH repairedQuantity AND transferredRepairedQty
//         if (productDoc.trackSerialNumber === "Yes") {
//           // Update serial status and transfer history
//           outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
//             if (serialsToTransfer.includes(sn.serialNumber)) {
//               const transferRecord = {
//                 fromCenter: sourceOutletId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_reseller",
//                 sourceType: "damage_repair",
//                 referenceId: outletStock._id,
//                 remark: transferRemark || `Transferred repaired item to reseller ${reseller.businessName}`,
//                 transferredBy: transferredBy,
//               };

//               const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];

//               return {
//                 ...sn.toObject(),
//                 status: "transferred",
//                 currentLocation: null,
//                 transferHistory: [...transferHistory, transferRecord],
//               };
//             }
//             return sn;
//           });

//           // Update quantities
//           outletStock.availableQuantity -= quantity;
//           outletStock.totalQuantity -= quantity;
          
//         } else {
//           // NON-SERIALIZED PRODUCTS
//           // Update quantities only (no serials to update)
//           outletStock.availableQuantity -= quantity;
//           outletStock.totalQuantity -= quantity;
          
//           // For non-serialized, we might have a placeholder serial number
//           // Update it if it exists
//           const repairSerialIndex = outletStock.serialNumbers.findIndex(
//             sn => sn.sourceType === "repair_return" && sn.status === "available"
//           );
          
//           if (repairSerialIndex !== -1) {
//             const batchSerial = outletStock.serialNumbers[repairSerialIndex];
//             const batchQty = batchSerial.batchQuantity || 1;
            
//             if (quantity >= batchQty) {
//               // Transfer entire batch
//               outletStock.serialNumbers[repairSerialIndex].status = "transferred";
//               outletStock.serialNumbers[repairSerialIndex].currentLocation = null;
              
//               // Add transfer history
//               const transferHistory = Array.isArray(batchSerial.transferHistory) 
//                 ? batchSerial.transferHistory 
//                 : [];
              
//               outletStock.serialNumbers[repairSerialIndex].transferHistory = [
//                 ...transferHistory,
//                 {
//                   fromCenter: sourceOutletId,
//                   toReseller: resellerId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_reseller",
//                   sourceType: "damage_repair",
//                   referenceId: outletStock._id,
//                   transferredQuantity: quantity,
//                   remark: transferRemark || `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
//                   transferredBy,
//                 }
//               ];
//             } else {
//               // Partial transfer - update batch quantity
//               outletStock.serialNumbers[repairSerialIndex].batchQuantity = batchQty - quantity;
              
//               // Add transfer history
//               const transferHistory = Array.isArray(batchSerial.transferHistory) 
//                 ? batchSerial.transferHistory 
//                 : [];
              
//               outletStock.serialNumbers[repairSerialIndex].transferHistory = [
//                 ...transferHistory,
//                 {
//                   fromCenter: sourceOutletId,
//                   toReseller: resellerId,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_reseller",
//                   sourceType: "damage_repair",
//                   referenceId: outletStock._id,
//                   transferredQuantity: quantity,
//                   remark: transferRemark || `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
//                   transferredBy,
//                 }
//               ];
//             }
//           }
//         }

//         // CRITICAL FIX: Update BOTH repairedQuantity AND transferredRepairedQty
//         outletStock.transferredRepairedQty = (outletStock.transferredRepairedQty || 0) + quantity;
//         // ALSO reduce repairedQuantity since items are leaving
//         outletStock.repairedQuantity = Math.max(0, (outletStock.repairedQuantity || 0) - quantity);
        
//         console.log(`OutletStock AFTER update:`);
//         console.log(`- transferredRepairedQty: ${outletStock.transferredRepairedQty} (+${quantity})`);
//         console.log(`- repairedQuantity: ${outletStock.repairedQuantity} (-${quantity})`);
//         console.log(`- availableQuantity: ${outletStock.availableQuantity}`);
//         console.log(`- totalQuantity: ${outletStock.totalQuantity}`);

//         await outletStock.save();
//         console.log(`✓ Updated OutletStock`);

//         // 2. ADD / UPDATE RESELLER STOCK - MISSING LOGIC ADDED HERE
//         console.log(`\n=== UPDATING RESELLER STOCK ===`);
        
//         // Find or create reseller stock
//         let resellerStock = await ResellerStock.findOne({
//           reseller: resellerId,
//           product: productId
//         });

//         const transferRecord = {
//           fromCenter: sourceOutletId,
//           toReseller: resellerId,
//           transferDate: new Date(),
//           transferType: "outlet_to_reseller",
//           sourceType: "damage_repair",
//           referenceId: outletStock._id,
//           remark: transferRemark || `Transferred repaired items from outlet`,
//           transferredBy: transferredBy
//         };

//         if (!resellerStock) {
//           // Create new reseller stock
//           resellerStock = new ResellerStock({
//             reseller: resellerId,
//             product: productId,
//             availableQuantity: quantity,
//             totalQuantity: quantity,
//             sourceBreakdown: {
//               damageRepairQuantity: quantity
//             }
//           });

//           if (productDoc.trackSerialNumber === "Yes") {
//             // Add serials for serialized products
//             resellerStock.serialNumbers = serialsToTransfer.map(sn => ({
//               serialNumber: sn,
//               status: "available",
//               currentLocation: null,
//               transferHistory: [transferRecord]
//             }));
//           } else {
//             // Add batch record for non-serialized
//             resellerStock.serialNumbers = [{
//               serialNumber: `REPAIR-BATCH-${Date.now()}`,
//               status: "available",
//               currentLocation: null,
//               transferHistory: [transferRecord]
//             }];
//           }

//           console.log(`Created new ResellerStock for ${reseller.businessName}`);
//         } else {
//           // Update existing reseller stock
//           resellerStock.availableQuantity += quantity;
//           resellerStock.totalQuantity += quantity;
//           resellerStock.sourceBreakdown.damageRepairQuantity = 
//             (resellerStock.sourceBreakdown.damageRepairQuantity || 0) + quantity;
          
//           if (productDoc.trackSerialNumber === "Yes") {
//             // Add serials for serialized products
//             for (const serialNumber of serialsToTransfer) {
//               const existingSerial = resellerStock.serialNumbers.find(
//                 sn => sn.serialNumber === serialNumber
//               );
              
//               if (!existingSerial) {
//                 resellerStock.serialNumbers.push({
//                   serialNumber: serialNumber,
//                   status: "available",
//                   currentLocation: null,
//                   transferHistory: [transferRecord]
//                 });
//               } else {
//                 // Update existing serial
//                 existingSerial.status = "available";
//                 if (!Array.isArray(existingSerial.transferHistory)) {
//                   existingSerial.transferHistory = [];
//                 }
//                 existingSerial.transferHistory.push(transferRecord);
//               }
//             }
//           } else {
//             // For non-serialized, add or update batch record
//             const existingBatch = resellerStock.serialNumbers.find(
//               sn => sn.serialNumber.startsWith("REPAIR-BATCH-")
//             );
            
//             if (!existingBatch) {
//               resellerStock.serialNumbers.push({
//                 serialNumber: `REPAIR-BATCH-${Date.now()}`,
//                 status: "available",
//                 currentLocation: null,
//                 transferHistory: [transferRecord]
//               });
//             } else {
//               if (!Array.isArray(existingBatch.transferHistory)) {
//                 existingBatch.transferHistory = [];
//               }
//               existingBatch.transferHistory.push(transferRecord);
//             }
//           }
          
//           console.log(`Updated existing ResellerStock for ${reseller.businessName}`);
//         }

//         resellerStock.lastUpdated = new Date();
//         await resellerStock.save();
//         console.log(`✓ Updated ResellerStock - Available: ${resellerStock.availableQuantity}, Total: ${resellerStock.totalQuantity}`);

//         // 3. UPDATE FAULTY STOCK STATUS (FIXED VERSION)
//         console.log(`\n=== UPDATING FAULTY STOCK ===`);
        
//         if (productDoc.trackSerialNumber === "Yes") {
//           // SERIALIZED: Find FaultyStock by serial numbers
//           const faultyStock = await FaultyStock.findOne({
//             product: productId,
//             isSerialized: true,
//             "serialNumbers.serialNumber": { $in: serialsToTransfer },
//             "serialNumbers.status": "repaired"
//           });
          
//           if (faultyStock) {
//             console.log(`✓ Found FaultyStock: ${faultyStock._id}`);
            
//             // Update each serial in FaultyStock
//             for (const serialNumber of serialsToTransfer) {
//               for (let i = 0; i < faultyStock.serialNumbers.length; i++) {
//                 if (faultyStock.serialNumbers[i].serialNumber === serialNumber && 
//                     faultyStock.serialNumbers[i].status === "repaired") {
                  
//                   faultyStock.serialNumbers[i].status = "transferred";
                  
//                   // Add repair history
//                   if (!faultyStock.serialNumbers[i].repairHistory) {
//                     faultyStock.serialNumbers[i].repairHistory = [];
//                   }
//                   faultyStock.serialNumbers[i].repairHistory.push({
//                     date: new Date(),
//                     status: "transferred",
//                     remark: `Transferred to reseller ${reseller.businessName}`,
//                     quantity: 1,
//                     repairedQty: 0,
//                     irrepairedQty: 0,
//                     updatedBy: transferredBy
//                   });
                  
//                   console.log(`Updated serial ${serialNumber} to "transferred" in FaultyStock`);
//                 }
//               }
//             }
            
//             // Update quantities
//             const transferredCount = faultyStock.serialNumbers.filter(sn => sn.status === "transferred").length;
//             const repairedCount = faultyStock.serialNumbers.filter(sn => sn.status === "repaired").length;
            
//             faultyStock.transferredQty = transferredCount;
//             faultyStock.repairedQty = repairedCount;
            
//             // Update overall status
//             if (faultyStock.transferredQty === faultyStock.quantity) {
//               faultyStock.overallStatus = "transferred";
//             } else if (faultyStock.transferredQty > 0) {
//               faultyStock.overallStatus = "partially_repaired";
//             }
            
//             faultyStock.lastRepairUpdate = new Date();
//             await faultyStock.save();
            
//             console.log(`✓ Updated FaultyStock - transferredQty: ${faultyStock.transferredQty}, repairedQty: ${faultyStock.repairedQty}, status: ${faultyStock.overallStatus}`);
//           } else {
//             console.log(`⚠ Could not find FaultyStock for serialized product`);
//           }
//         } else {
//           // NON-SERIALIZED: Find FaultyStock with repaired items
//           const faultyStock = await FaultyStock.findOne({
//             product: productId,
//             isSerialized: false,
//             repairedQty: { $gte: quantity },
//             $or: [
//               { toCenter: sourceOutletId },
//               { center: sourceOutletId }
//             ]
//           }).sort({ createdAt: -1 });

//           if (faultyStock) {
//             console.log(`✓ Found FaultyStock: ${faultyStock._id}`);
//             console.log(`Before update - Total: ${faultyStock.quantity}, Repaired: ${faultyStock.repairedQty}, Transferred: ${faultyStock.transferredQty}, Damage: ${faultyStock.damageQty}`);
            
//             // Validate we have enough repaired items
//             if ((faultyStock.repairedQty || 0) < quantity) {
//               console.log(`⚠ Not enough repaired items. Available: ${faultyStock.repairedQty}, Requested: ${quantity}`);
//             } else {
//               // Update FaultyStock - reduce repairedQty and increase transferredQty
//               faultyStock.repairedQty = Math.max(0, (faultyStock.repairedQty || 0) - quantity);
//               faultyStock.transferredQty = (faultyStock.transferredQty || 0) + quantity;
              
//               // IMPORTANT: DO NOT reduce the main quantity field
//               // The quantity field should remain the total count of damaged items reported
              
//               // Add repair history for the transfer
//               if (!faultyStock.repairHistory) {
//                 faultyStock.repairHistory = [];
//               }
              
//               faultyStock.repairHistory.push({
//                 date: new Date(),
//                 action: "transfer_to_reseller",
//                 remark: `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
//                 quantity: quantity,
//                 previousRepairedQty: faultyStock.repairedQty + quantity,
//                 newRepairedQty: faultyStock.repairedQty,
//                 previousTransferredQty: faultyStock.transferredQty - quantity,
//                 newTransferredQty: faultyStock.transferredQty,
//                 updatedBy: transferredBy
//               });
              
//               // Update overall status using the model's method if available
//               if (faultyStock.updateQuantitiesAndStatus) {
//                 faultyStock.updateQuantitiesAndStatus();
//               } else {
//                 // Manual status update
//                 const totalProcessed = (faultyStock.repairedQty || 0) + 
//                                       (faultyStock.irrepairedQty || 0) + 
//                                       (faultyStock.transferredQty || 0) + 
//                                       (faultyStock.underRepairQty || 0);
                
//                 const totalQuantity = faultyStock.quantity || 0;
                
//                 if (faultyStock.transferredQty === totalQuantity) {
//                   faultyStock.overallStatus = "transferred";
//                 } else if (faultyStock.transferredQty > 0 && totalProcessed < totalQuantity) {
//                   faultyStock.overallStatus = "partially_repaired";
//                 } else if (faultyStock.repairedQty === totalQuantity) {
//                   faultyStock.overallStatus = "repaired";
//                 } else if (faultyStock.repairedQty > 0) {
//                   faultyStock.overallStatus = "partially_repaired";
//                 } else if (faultyStock.damageQty > 0) {
//                   faultyStock.overallStatus = "damaged";
//                 }
//               }
              
//               faultyStock.lastRepairUpdate = new Date();
//               await faultyStock.save();
              
//               console.log(`After update - Total: ${faultyStock.quantity}, Repaired: ${faultyStock.repairedQty}, Transferred: ${faultyStock.transferredQty}, Damage: ${faultyStock.damageQty}, Status: ${faultyStock.overallStatus}`);
//             }
//           } else {
//             console.log(`⚠ Could not find FaultyStock for non-serialized product ${productDoc.productTitle}`);
//           }
//         }

//         transferResults.push({
//           productId: productId,
//           productName: productDoc.productTitle,
//           quantity: quantity,
//           serialNumbers: serialsToTransfer,
//           fromOutlet: sourceOutletId,
//           toReseller: resellerId,
//           resellerName: reseller.businessName,
//           outletStockId: outletStock._id,
//           resellerStockId: resellerStock._id, // NOW DEFINED
//           sourceType: "damage_repair",
//           outletStockUpdate: {
//             newRepairedQuantity: outletStock.repairedQuantity,
//             newTransferredRepairedQty: outletStock.transferredRepairedQty,
//             newAvailableQuantity: outletStock.availableQuantity,
//             newTotalQuantity: outletStock.totalQuantity
//           },
//           resellerStockUpdate: {
//             newAvailableQuantity: resellerStock.availableQuantity,
//             newTotalQuantity: resellerStock.totalQuantity,
//             newDamageRepairQuantity: resellerStock.sourceBreakdown.damageRepairQuantity
//           },
//           status: "success",
//           message: `Transferred ${quantity} repaired ${productDoc.trackSerialNumber === "Yes" ? "serialized" : "non-serialized"} items to reseller`
//         });

//         console.log(`✅ Successfully transferred ${quantity} items to reseller`);

//       } catch (error) {
//         console.error(`Error transferring item:`, error);
//         errors.push(`Error transferring ${item.productId || "item"}: ${error.message}`);
//       }
//     }

//     const response = {
//       success: transferResults.length > 0,
//       message: transferResults.length > 0 
//         ? `Transferred ${transferResults.length} items to reseller` 
//         : "No items transferred",
//       data: { 
//         transferred: transferResults, 
//         errors: errors.length > 0 ? errors : undefined 
//       }
//     };

//     if (errors.length > 0) {
//       response.partialSuccess = transferResults.length > 0;
//     }

//     res.status(200).json(response);

//   } catch (error) {
//     console.error("Transfer to reseller error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to transfer to reseller stock",
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

    // Import models
    const Product = mongoose.model("Product");
    const OutletStock = mongoose.model("OutletStock");
    const ResellerStock = mongoose.model("ResellerStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const Reseller = mongoose.model("Reseller");

    const transferResults = [];
    const errors = [];

    for (const item of items) {
      try {
        const { outletStockId, productId, quantity, serialNumbers, resellerId } = item;
        
        if (!resellerId) {
          errors.push(`Reseller ID is required for item: ${productId}`);
          continue;
        }

        // Validate reseller exists
        const reseller = await Reseller.findById(resellerId);
        if (!reseller) {
          errors.push(`Reseller not found: ${resellerId}`);
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

        console.log(`\n=== Processing ${productDoc.productTitle} ===`);
        console.log(`Source Outlet: ${sourceOutletId}`);
        console.log(`Destination Reseller: ${resellerId} (${reseller.businessName})`);
        console.log(`Requested quantity: ${quantity}`);
        console.log(`OutletStock BEFORE update:`);
        console.log(`- availableQuantity: ${outletStock.availableQuantity || 0}`);
        console.log(`- repairedQuantity: ${outletStock.repairedQuantity || 0}`);
        console.log(`- pendingTransferToReseller: ${outletStock.pendingTransferToReseller || 0}`);

        // Check if enough items are available
        const availableQuantity = outletStock.availableQuantity || 0;
        console.log(`Available quantity for transfer: ${availableQuantity}`);
        
        if (availableQuantity < quantity) {
          errors.push(`Insufficient items available for transfer. Available: ${availableQuantity}, Requested: ${quantity}`);
          continue;
        }

        let serialsToTransfer = [];
        let validatedSerials = [];

        if (productDoc.trackSerialNumber === "Yes") {
          // SERIALIZED PRODUCTS
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

          // Validate serials are available
          const availableSerials = outletStock.serialNumbers.filter(
            sn =>
              serialNumbers.includes(sn.serialNumber) &&
              sn.status === "available"
          );

          if (availableSerials.length !== quantity) {
            const missingSerials = serialNumbers.filter(
              sn => !availableSerials.map(as => as.serialNumber).includes(sn)
            );
            errors.push(
              `Some serials are not available: ${missingSerials.join(", ")}`
            );
            continue;
          }

          serialsToTransfer = serialNumbers;
          validatedSerials = availableSerials;
          console.log(`Processing ${serialsToTransfer.length} serial numbers: ${serialsToTransfer.join(', ')}`);
        } else {
          // NON-SERIALIZED PRODUCTS
          console.log(`Processing non-serialized product: ${productDoc.productTitle}`);
          console.log(`Non-serialized transfer of ${quantity} items`);
        }

        // 1. UPDATE OUTLET STOCK - Mark as pending_transfer
        console.log(`\n=== UPDATING OUTLET STOCK (Pending Transfer) ===`);
        
        if (productDoc.trackSerialNumber === "Yes") {
          // Update serial status to pending_transfer
          outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
            if (serialsToTransfer.includes(sn.serialNumber)) {
              const transferRecord = {
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: transferRemark || `Pending transfer to reseller ${reseller.businessName}`,
                transferredBy: transferredBy,
                transferStatus: "pending"
              };

              const transferHistory = Array.isArray(sn.transferHistory) ? sn.transferHistory : [];

              return {
                ...sn.toObject(),
                status: "pending_transfer",
                currentLocation: null,
                transferHistory: [...transferHistory, transferRecord],
              };
            }
            return sn;
          });

          // Update available quantity
          outletStock.availableQuantity -= quantity;
          
        } else {
          // NON-SERIALIZED PRODUCTS
          outletStock.availableQuantity -= quantity;
          
          // Update or create a batch record for pending transfer
          const batchSerial = outletStock.serialNumbers.find(
            sn => sn.status === "available" && sn.sourceType === "repair_return"
          );
          
          if (batchSerial) {
            batchSerial.status = "pending_transfer";
            const transferHistory = Array.isArray(batchSerial.transferHistory) 
              ? batchSerial.transferHistory 
              : [];
            
            batchSerial.transferHistory = [
              ...transferHistory,
              {
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                transferredQuantity: quantity,
                remark: transferRemark || `Pending transfer of ${quantity} items to reseller ${reseller.businessName}`,
                transferredBy,
                transferStatus: "pending"
              }
            ];
          } else {
            // Create new batch record for pending transfer
            outletStock.serialNumbers.push({
              serialNumber: `PENDING-BATCH-${Date.now()}`,
              status: "pending_transfer",
              sourceType: "repair_return",
              purchaseId: new mongoose.Types.ObjectId(),
              currentLocation: null,
              transferHistory: [{
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                transferredQuantity: quantity,
                remark: transferRemark || `Pending transfer of ${quantity} items to reseller ${reseller.businessName}`,
                transferredBy,
                transferStatus: "pending"
              }]
            });
          }
        }

        // Track pending transfer
        outletStock.pendingTransferToReseller = (outletStock.pendingTransferToReseller || 0) + quantity;
        
        // Add to pendingTransfers array
        if (!outletStock.pendingTransfers) {
          outletStock.pendingTransfers = [];
        }
        
        const pendingTransferDetail = {
          resellerId: resellerId,
          quantity: quantity,
          transferDate: new Date(),
          transferredBy: transferredBy,
          transferRemark: transferRemark || `Pending transfer to reseller`,
          status: "pending",
          ...(productDoc.trackSerialNumber === "Yes" && {
            serialNumbers: validatedSerials.map(s => ({
              serialNumber: s.serialNumber,
              status: s.status
            }))
          })
        };
        
        outletStock.pendingTransfers.push(pendingTransferDetail);
        
        console.log(`OutletStock AFTER update:`);
        console.log(`- availableQuantity: ${outletStock.availableQuantity} (-${quantity})`);
        console.log(`- pendingTransferToReseller: ${outletStock.pendingTransferToReseller} (+${quantity})`);

        await outletStock.save();
        console.log(`✓ Updated OutletStock with pending transfer`);

        // 2. ADD / UPDATE RESELLER STOCK - Create pending transfer record
        console.log(`\n=== CREATING PENDING TRANSFER IN RESELLER STOCK ===`);
        
        let resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId
        });

        const transferRecord = {
          outletId: sourceOutletId,
          quantity: quantity,
          transferDate: new Date(),
          transferredBy: transferredBy,
          transferRemark: transferRemark || `Pending transfer from outlet`,
          status: "pending",
          ...(productDoc.trackSerialNumber === "Yes" && {
            serialNumbers: serialsToTransfer.map(sn => ({
              serialNumber: sn,
              originalSerialNumber: sn,
              status: "pending"
            }))
          })
        };

        if (!resellerStock) {
          // Create new reseller stock with pending transfer only
          resellerStock = new ResellerStock({
            reseller: resellerId,
            product: productId,
            availableQuantity: 0,
            totalQuantity: 0,
            pendingIncomingQuantity: quantity,
            pendingTransfers: [transferRecord],
            sourceBreakdown: {
              damageRepairQuantity: 0
            }
          });

          console.log(`Created new ResellerStock with pending transfer for ${reseller.businessName}`);
        } else {
          // Update existing reseller stock with pending transfer
          resellerStock.pendingIncomingQuantity = (resellerStock.pendingIncomingQuantity || 0) + quantity;
          
          if (!resellerStock.pendingTransfers) {
            resellerStock.pendingTransfers = [];
          }
          
          resellerStock.pendingTransfers.push(transferRecord);
          
          console.log(`Updated existing ResellerStock with pending transfer for ${reseller.businessName}`);
        }

        resellerStock.lastUpdated = new Date();
        await resellerStock.save();
        console.log(`✓ Updated ResellerStock - Pending Incoming: ${resellerStock.pendingIncomingQuantity}`);

        // 3. UPDATE REPAIR TRANSFER - Mark as pending_transfer
        console.log(`\n=== UPDATING REPAIR TRANSFER STATUS ===`);
        
        if (productDoc.trackSerialNumber === "Yes") {
          // For serialized products, update RepairTransfer
          for (const serialNumber of serialsToTransfer) {
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              "serialNumbers.serialNumber": serialNumber,
              "serialNumbers.status": { $in: ["repaired", "pending_transfer"] }
            });
            
            if (repairTransfer) {
              repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
                if (sn.serialNumber === serialNumber && 
                    (sn.status === "repaired" || sn.status === "pending_transfer")) {
                  
                  const repairHistory = Array.isArray(sn.repairHistory) ? sn.repairHistory : [];
                  
                  return {
                    ...sn.toObject(),
                    status: "pending_transfer",
                    repairHistory: [
                      ...repairHistory,
                      {
                        date: new Date(),
                        status: "pending_transfer",
                        remark: `Pending transfer to reseller ${reseller.businessName}`,
                        quantity: 1,
                        repairedQty: 0,
                        irrepairedQty: 0,
                        updatedBy: transferredBy,
                        transferStatus: "pending",
                        destinationReseller: resellerId
                      }
                    ]
                  };
                }
                return sn;
              });
              
              // Update RepairTransfer status
              repairTransfer.updateStatusAndQuantities();
              await repairTransfer.save();
              console.log(`✓ Updated RepairTransfer for serial ${serialNumber}`);
            }
          }
        } else {
          // For non-serialized products
          const repairTransfer = await RepairTransfer.findOne({
            product: productId,
            toCenter: sourceOutletId,
            repairedQty: { $gte: quantity },
            status: { $in: ["repaired", "pending_transfer"] }
          });
          
          if (repairTransfer) {
            // Update pending transfer quantity
            repairTransfer.pendingTransferQty = (repairTransfer.pendingTransferQty || 0) + quantity;
            repairTransfer.repairedQty = Math.max(0, (repairTransfer.repairedQty || 0) - quantity);
            
            // Add to pendingTransferDetails
            if (!repairTransfer.pendingTransferDetails) {
              repairTransfer.pendingTransferDetails = [];
            }
            
            repairTransfer.pendingTransferDetails.push({
              outletId: sourceOutletId,
              resellerId: resellerId,
              quantity: quantity,
              transferredBy: transferredBy,
              transferredAt: new Date(),
              remark: `Pending transfer to reseller ${reseller.businessName}`,
              status: "pending"
            });
            
            // Update status
            repairTransfer.updateStatusAndQuantities();
            await repairTransfer.save();
            console.log(`✓ Updated RepairTransfer - PendingTransferQty: ${repairTransfer.pendingTransferQty}`);
          }
        }

        // NOTE: FaultyStock is NOT updated here - will be updated after acceptance
        
        transferResults.push({
          productId: productId,
          productName: productDoc.productTitle,
          quantity: quantity,
          serialNumbers: productDoc.trackSerialNumber === "Yes" ? serialsToTransfer : [],
          fromOutlet: sourceOutletId,
          toReseller: resellerId,
          resellerName: reseller.businessName,
          outletStockId: outletStock._id,
          resellerStockId: resellerStock._id,
          sourceType: "damage_repair",
          currentStatus: "pending",
          outletStockUpdate: {
            newAvailableQuantity: outletStock.availableQuantity,
            newPendingTransferToReseller: outletStock.pendingTransferToReseller
          },
          resellerStockUpdate: {
            newPendingIncomingQuantity: resellerStock.pendingIncomingQuantity
          },
          note: "Transfer is pending acceptance by reseller",
          message: `Created pending transfer of ${quantity} items to reseller ${reseller.businessName}`
        });

        console.log(`✅ Successfully created pending transfer to reseller`);

      } catch (error) {
        console.error(`Error creating pending transfer:`, error);
        errors.push(`Error creating pending transfer for ${item.productId || "item"}: ${error.message}`);
      }
    }

    const response = {
      success: transferResults.length > 0,
      message: transferResults.length > 0 
        ? `Created ${transferResults.length} pending transfers to reseller` 
        : "No pending transfers created",
      data: { 
        transfers: transferResults,
        note: "Transfers are pending acceptance by reseller",
        requiresAcceptance: true 
      }
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.partialSuccess = transferResults.length > 0;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error("Transfer to reseller error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create pending transfer",
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
//     const Product = mongoose.model("Product");

//     const outletStocks = await OutletStock.find({
//       $or: [
//         { 
//           "serialNumbers.sourceType": "repair_return",
//           "serialNumbers.status": "available"
//         },
//         {
//           repairedQuantity: { $gt: 0 }
//         }
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

//     console.log(`Found ${outletStocks.length} outlet stocks with repaired items`);

//     const result = [];

//     for (const outletStock of outletStocks) {
//       const isSerialized = outletStock.product.trackSerialNumber === "Yes";
      
//       console.log(`\n=== Processing ${outletStock.product.productTitle} ===`);
//       console.log(`Product type: ${isSerialized ? 'Serialized' : 'Non-serialized'}`);
//       console.log(`Repaired quantity in outlet stock: ${outletStock.repairedQuantity || 0}`);

//       // For serialized products: get available repaired serials
//       // For non-serialized products: we'll use repairedQuantity
//       let availableRepairedSerials = [];
//       let totalRepairedQuantity = 0;
      
//       if (isSerialized) {
//         // SERIALIZED: Get serials with sourceType = repair_return and status = available
//         availableRepairedSerials = outletStock.serialNumbers.filter(
//           sn => sn.sourceType === "repair_return" && sn.status === "available"
//         );
//         totalRepairedQuantity = availableRepairedSerials.length;
        
//         console.log(`- Available repaired serials: ${availableRepairedSerials.length}`);
//         console.log(`- Serial numbers: ${availableRepairedSerials.map(s => s.serialNumber).join(', ')}`);
//       } else {
//         // NON-SERIALIZED: Use repairedQuantity field
//         totalRepairedQuantity = outletStock.repairedQuantity || 0;
        
//         console.log(`- Repaired quantity: ${totalRepairedQuantity}`);
//         console.log(`- Note: Non-serialized products don't track individual serials`);
//       }

//       if (totalRepairedQuantity === 0) {
//         console.log(`No repaired items available for ${outletStock.product.productTitle}`);
//         continue;
//       }

//       let repairTransfers = [];
//       let serialNumbers = availableRepairedSerials.map(sn => sn.serialNumber);
      
//       if (isSerialized) {
//         // Find repair transfers for serialized products
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
//       } else {
//         // Find repair transfers for non-serialized products
//         // Look for transfers that were marked as repaired and transferred to this outlet
//         repairTransfers = await RepairTransfer.find({
//           product: outletStock.product._id,
//           status: "repaired", // Or "returned" if all items were transferred
//           repairedQty: { $gt: 0 }
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
        
//         // Also try finding by remark containing outlet name
//         if (repairTransfers.length === 0) {
//           repairTransfers = await RepairTransfer.find({
//             product: outletStock.product._id,
//             "repairUpdates.status": "transferred",
//             "repairUpdates.remark": { 
//               $regex: outletStock.outlet.centerName, 
//               $options: 'i' 
//             }
//           })
//           .populate({
//             path: 'faultyStock',
//             populate: [
//               {
//                 path: 'center',
//                 select: '_id centerName centerCode',
//                 populate: {
//                   path: 'reseller',
//                   select: '_id businessName'
//                 }
//               }
//             ]
//           });
//         }
//       }

//       console.log(`Found ${repairTransfers.length} repair transfers`);

//       if (repairTransfers.length === 0) {
//         console.log(`No repair transfers found for ${outletStock.product.productTitle}`);
//         continue;
//       }

//       // Group by center and reseller
//       const groups = {};
//       let calculatedTotalRepaired = 0;
      
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
//             serials: []
//           };
//         }

//         if (isSerialized) {
//           // SERIALIZED: Count matching serials
//           const matchingSerials = [];
          
//           for (const serialNumber of serialNumbers) {
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
//             calculatedTotalRepaired += matchingSerials.length;
            
//             console.log(`Transfer ${transfer._id} contributed ${matchingSerials.length} serials`);
//           }
//         } else {
//           // NON-SERIALIZED: Use repairedQty from transfer
//           // We need to estimate how much of this transfer went to this outlet
//           let transferredToThisOutlet = 0;
          
//           // Method 1: Check repairUpdates for transfers to this outlet
//           if (transfer.repairUpdates && transfer.repairUpdates.length > 0) {
//             const transfersToOutlet = transfer.repairUpdates.filter(update => 
//               update.status === "transferred" && 
//               update.remark && 
//               update.remark.includes(outletStock.outlet.centerName)
//             );
            
//             transferredToThisOutlet = transfersToOutlet.reduce((sum, update) => 
//               sum + (update.quantity || 0), 0
//             );
//           }
          
//           // Method 2: If no specific record, use repairedQty as estimate
//           if (transferredToThisOutlet === 0 && transfer.repairedQty > 0) {
//             transferredToThisOutlet = transfer.repairedQty;
//           }
          
//           if (transferredToThisOutlet > 0) {
//             groups[key].quantity += transferredToThisOutlet;
//             groups[key].transferIds.push(transfer._id);
//             calculatedTotalRepaired += transferredToThisOutlet;
            
//             console.log(`Transfer ${transfer._id} contributed ${transferredToThisOutlet} non-serialized items`);
//           }
//         }
//       }

//       const resellerGroups = Object.values(groups);

//       if (resellerGroups.length === 0) {
//         console.log(`No reseller groups found for ${outletStock.product.productTitle}`);
//         continue;
//       }

//       console.log(`Total repaired quantity calculated: ${calculatedTotalRepaired}`);
//       console.log(`Total reseller groups: ${resellerGroups.length}`);

//       // Prepare response
//       const repairedSerialsForResponse = isSerialized 
//         ? availableRepairedSerials.map(serial => ({
//             serialNumber: serial.serialNumber,
//             status: serial.status,
//             sourceType: serial.sourceType,
//             quantity: 1,
//             purchaseId: serial.purchaseId,
//             currentLocation: serial.currentLocation
//           }))
//         : []; // Empty for non-serialized

//       // Create result entry
//       const resultEntry = {
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
//         totalRepairedQuantity: isSerialized ? availableRepairedSerials.length : outletStock.repairedQuantity,
//         availableRepairedQuantity: isSerialized ? availableRepairedSerials.length : (outletStock.repairedQuantity - (outletStock.transferredRepairedQty || 0)),
//         repairedSerials: repairedSerialsForResponse,
//         resellerGroups: resellerGroups.map(group => ({
//           center: group.center,
//           reseller: group.reseller,
//           quantity: group.quantity,
//           transferIds: group.transferIds,
//           serials: group.serials || []
//         })),
//         center: resellerGroups[0]?.center || null,
//         reseller: resellerGroups[0]?.reseller || null,
//         outletStockId: outletStock._id,
//         lastUpdated: outletStock.updatedAt,
//         outletStockQuantity: {
//           total: outletStock.totalQuantity,
//           available: outletStock.availableQuantity,
//           inTransit: outletStock.inTransitQuantity,
//           repaired: outletStock.repairedQuantity || 0,
//           transferredRepaired: outletStock.transferredRepairedQty || 0
//         },
//         isNonSerialized: !isSerialized,
//         note: !isSerialized 
//           ? "Non-serialized product. Quantity represents total repaired items available." 
//           : null
//       };

//       result.push(resultEntry);
//       console.log(`✓ Added ${outletStock.product.productTitle} to results`);
//     }

//     // Calculate summary statistics
//     const serializedCount = result.filter(item => !item.isNonSerialized).length;
//     const nonSerializedCount = result.filter(item => item.isNonSerialized).length;
//     const totalRepairedQty = result.reduce((sum, item) => sum + item.totalRepairedQuantity, 0);
//     const totalAvailableRepaired = result.reduce((sum, item) => sum + item.availableRepairedQuantity, 0);

//     console.log(`\n=== FINAL SUMMARY ===`);
//     console.log(`Total products: ${result.length}`);
//     console.log(`Serialized: ${serializedCount}, Non-serialized: ${nonSerializedCount}`);
//     console.log(`Total repaired quantity: ${totalRepairedQty}`);
//     console.log(`Total available for transfer: ${totalAvailableRepaired}`);

//     res.json({
//       success: true,
//       data: {
//         repairedProducts: result,
//         totalItems: result.length,
//         totalRepairedQuantity: totalRepairedQty,
//         totalAvailableRepaired: totalAvailableRepaired,
//         summary: {
//           serialized: serializedCount,
//           nonSerialized: nonSerializedCount,
//           totalProducts: result.length,
//           totalOutlets: [...new Set(result.map(item => item.outlet._id.toString()))].length,
//           totalAvailableForTransfer: totalAvailableRepaired
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
    const Product = mongoose.model("Product");
    
    // Get all outlet stocks for the current user's outlet
    const outletStocks = await OutletStock.find({
      $or: [
        { 
          "serialNumbers.sourceType": "repair_return"
        },
        {
          repairedQuantity: { $gt: 0 }
        },
        {
          pendingRepairedQty: { $gt: 0 }
        }
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

    console.log(`Found ${outletStocks.length} outlet stocks with repaired items`);

    const result = [];

    for (const outletStock of outletStocks) {
      const isSerialized = outletStock.product.trackSerialNumber === "Yes";
      
      console.log(`\n=== Processing ${outletStock.product.productTitle} ===`);
      console.log(`Product type: ${isSerialized ? 'Serialized' : 'Non-serialized'}`);
      console.log(`Repaired quantity in outlet stock: ${outletStock.repairedQuantity || 0}`);
      console.log(`Pending repaired quantity: ${outletStock.pendingRepairedQty || 0}`);

      // Get pending approval items
      let pendingRepairedSerials = [];
      let pendingRepairedQuantity = 0;
      
      if (isSerialized) {
        // SERIALIZED: Get serials with pending_approval status
        pendingRepairedSerials = outletStock.serialNumbers.filter(
          sn => sn.sourceType === "repair_return" && sn.status === "pending_approval"
        );
        pendingRepairedQuantity = pendingRepairedSerials.length;
        
        console.log(`- Pending approval serials: ${pendingRepairedSerials.length}`);
        console.log(`- Pending serial numbers: ${pendingRepairedSerials.map(s => s.serialNumber).join(', ')}`);
      } else {
        // NON-SERIALIZED: Use pendingRepairedQty field
        pendingRepairedQuantity = outletStock.pendingRepairedQty || 0;
        
        console.log(`- Pending repaired quantity: ${pendingRepairedQuantity}`);
      }

      // Get available (accepted) repaired items
      let availableRepairedSerials = [];
      let availableRepairedQuantity = 0;
      
      if (isSerialized) {
        availableRepairedSerials = outletStock.serialNumbers.filter(
          sn => sn.sourceType === "repair_return" && sn.status === "available"
        );
        availableRepairedQuantity = availableRepairedSerials.length;
      } else {
        availableRepairedQuantity = outletStock.repairedQuantity || 0;
      }

      // If no repaired items at all, skip
      if (pendingRepairedQuantity === 0 && availableRepairedQuantity === 0) {
        console.log(`No repaired items found for ${outletStock.product.productTitle}`);
        continue;
      }

      // Find repair transfers for this product
      let repairTransfers = [];
      const allSerials = [...pendingRepairedSerials.map(s => s.serialNumber), ...availableRepairedSerials.map(s => s.serialNumber)];
      
      if (isSerialized) {
        // Find repair transfers for serialized products
        repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
          $or: [
            { "serialNumbers.serialNumber": { $in: allSerials } },
            { status: "repaired" }
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
      } else {
        // Find repair transfers for non-serialized products
        repairTransfers = await RepairTransfer.find({
          product: outletStock.product._id,
          $or: [
            { repairedQty: { $gt: 0 } },
            { pendingTransferQty: { $gt: 0 } },
            { "repairUpdates.destinationOutlet": outletStock.outlet._id }
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
      }

      console.log(`Found ${repairTransfers.length} repair transfers`);

      // Group by center and reseller
      const groups = {};
      
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
            pendingQuantity: 0,
            availableQuantity: 0,
            transferIds: [],
            serials: []
          };
        }

        if (isSerialized) {
          // Count matching pending and available serials
          const pendingMatchingSerials = pendingRepairedSerials.filter(serial => 
            transfer.serialNumbers.some(sn => sn.serialNumber === serial.serialNumber)
          );
          
          const availableMatchingSerials = availableRepairedSerials.filter(serial => 
            transfer.serialNumbers.some(sn => sn.serialNumber === serial.serialNumber)
          );
          
          groups[key].pendingQuantity += pendingMatchingSerials.length;
          groups[key].availableQuantity += availableMatchingSerials.length;
          groups[key].transferIds.push(transfer._id);
          groups[key].serials.push(...pendingMatchingSerials.map(s => s.serialNumber));
          groups[key].serials.push(...availableMatchingSerials.map(s => s.serialNumber));
          
        } else {
          // For non-serialized, track pending transfer quantities
          if (transfer.pendingTransferQty && transfer.pendingTransferQty > 0) {
            // Check if this pending transfer is for this outlet
            const pendingForThisOutlet = transfer.pendingTransferDetails?.find(
              detail => detail.outletId?.toString() === outletStock.outlet._id.toString()
            );
            
            if (pendingForThisOutlet) {
              groups[key].pendingQuantity += pendingForThisOutlet.quantity || 0;
            }
          }
          
          // Add repaired quantity that's already available
          groups[key].availableQuantity += transfer.repairedQty || 0;
          groups[key].transferIds.push(transfer._id);
        }
      }

      const resellerGroups = Object.values(groups);

      if (resellerGroups.length === 0 && pendingRepairedQuantity === 0 && availableRepairedQuantity === 0) {
        continue;
      }

      // Prepare response
      const pendingSerialsForResponse = isSerialized 
        ? pendingRepairedSerials.map(serial => ({
            serialNumber: serial.serialNumber,
            status: serial.status,
            sourceType: serial.sourceType,
            quantity: 1,
            purchaseId: serial.purchaseId,
            currentLocation: serial.currentLocation
          }))
        : [];

      const availableSerialsForResponse = isSerialized 
        ? availableRepairedSerials.map(serial => ({
            serialNumber: serial.serialNumber,
            status: serial.status,
            sourceType: serial.sourceType,
            quantity: 1,
            purchaseId: serial.purchaseId,
            currentLocation: serial.currentLocation
          }))
        : [];

      // Create result entry
      const resultEntry = {
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
        isSerialized: isSerialized,
        // Pending items (waiting for acceptance)
        pendingRepairedQuantity: pendingRepairedQuantity,
        pendingRepairedSerials: pendingSerialsForResponse,
        // Available items (already accepted)
        availableRepairedQuantity: availableRepairedQuantity,
        availableRepairedSerials: availableSerialsForResponse,
        // Total repaired (pending + available)
        totalRepairedQuantity: pendingRepairedQuantity + availableRepairedQuantity,
        // Reseller groups
        resellerGroups: resellerGroups,
        outletStockId: outletStock._id,
        outletStockDetails: {
          total: outletStock.totalQuantity,
          available: outletStock.availableQuantity,
          inTransit: outletStock.inTransitQuantity,
          repaired: outletStock.repairedQuantity || 0,
          pendingRepaired: outletStock.pendingRepairedQty || 0,
          transferredRepaired: outletStock.transferredRepairedQty || 0
        },
        lastUpdated: outletStock.updatedAt
      };

      result.push(resultEntry);
      console.log(`✓ Added ${outletStock.product.productTitle} to results`);
    }

    // Calculate summary statistics
    const serializedCount = result.filter(item => item.isSerialized).length;
    const nonSerializedCount = result.filter(item => !item.isSerialized).length;
    const totalPendingQty = result.reduce((sum, item) => sum + item.pendingRepairedQuantity, 0);
    const totalAvailableQty = result.reduce((sum, item) => sum + item.availableRepairedQuantity, 0);

    console.log(`\n=== FINAL SUMMARY ===`);
    console.log(`Total products: ${result.length}`);
    console.log(`Serialized: ${serializedCount}, Non-serialized: ${nonSerializedCount}`);
    console.log(`Total pending quantity: ${totalPendingQty}`);
    console.log(`Total available quantity: ${totalAvailableQty}`);

    res.json({
      success: true,
      data: {
        repairedProducts: result,
        totalItems: result.length,
        summary: {
          serialized: serializedCount,
          nonSerialized: nonSerializedCount,
          totalProducts: result.length,
          totalPending: totalPendingQty,
          totalAvailable: totalAvailableQty,
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
      viewType = "summary" // Add viewType parameter: "summary" or "detailed"
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
      filter.overallStatus = status; // Changed from status to overallStatus
    }
    
    if (product) {
      filter.product = product;
    }
    
    if (usageType && usageType !== "all") {
      filter.usageType = usageType;
    }

    // Add search filter for product name or serial number
    if (search) {
      filter.$or = [
        { 'productDetails.productTitle': { $regex: search, $options: 'i' } },
        { 'serialNumbers.serialNumber': { $regex: search, $options: 'i' } }
      ];
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

    // Base query
    let query = FaultyStock.find(filter);
    
    // Populate fields
    query = query
      .populate("center", "centerName centerType")
      .populate("toCenter", "centerName centerType")
      .populate("product", "productTitle productPrice salePrice trackSerialNumber")
      .populate("usageReference", "usageType date")
      .populate("reportedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const faultyStockRecords = await query;

    // Transform records to include quantity summary
    const transformedRecords = faultyStockRecords.map(record => {
      const recordObj = record.toObject();
      
      // Get quantity summary using the model method
      const quantitySummary = record.getQuantitySummary ? record.getQuantitySummary() : {
        total: record.quantity || 0,
        repaired: record.repairedQty || 0,
        irrepaired: record.irrepairedQty || 0,
        underRepair: record.underRepairQty || 0,
        transferred: record.transferredQty || 0,
        damageQty: record.damageQty || 0,
        damaged: record.damagedQty || 0,
        availableForRepair: record.availableForRepairQty || 0
      };

      // Calculate value for each quantity type
      const productPrice = record.product?.productPrice || record.productDetails?.productPrice || 0;
      
      const valueSummary = {
        totalValue: (quantitySummary.total * productPrice),
        repairedValue: (quantitySummary.repaired * productPrice),
        irrepairedValue: (quantitySummary.irrepaired * productPrice),
        underRepairValue: (quantitySummary.underRepair * productPrice),
        transferredValue: (quantitySummary.transferred * productPrice),
        damageValue: (quantitySummary.damageQty * productPrice)
      };

      // Add detailed view if requested
      if (viewType === "detailed" && record.isSerialized && record.serialNumbers) {
        recordObj.serialDetails = record.serialNumbers.map(serial => ({
          serialNumber: serial.serialNumber,
          status: serial.status,
          quantity: serial.quantity || 1,
          repairedQty: serial.repairedQty || 0,
          irrepairedQty: serial.irrepairedQty || 0,
          underRepairQty: serial.underRepairQty || 0,
          repairDate: serial.repairDate,
          disposalDate: serial.disposalDate
        }));
      }

      return {
        ...recordObj,
        quantitySummary,
        valueSummary,
        // Include virtual fields explicitly
        damagedQty: quantitySummary.damaged,
        availableForRepairQty: quantitySummary.availableForRepair,
        // Legacy fields for backward compatibility
        status: record.overallStatus,
        quantity: record.quantity,
        repairedQty: record.repairedQty,
        irrepairedQty: record.irrepairedQty,
        underRepairQty: record.underRepairQty,
        transferredQty: record.transferredQty,
        damageQty: record.damageQty || 0
      };
    });

    const total = await FaultyStock.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    
    // Enhanced statistics aggregation
    const statsPipeline = [
      { $match: filter },
      {
        $project: {
          quantity: 1,
          repairedQty: 1,
          irrepairedQty: 1,
          underRepairQty: 1,
          transferredQty: 1,
          damageQty: 1,
          productPrice: "$productDetails.productPrice",
          product: 1
        }
      },
      {
        $group: {
          _id: null,
          totalItems: { $sum: "$quantity" },
          totalRepaired: { $sum: "$repairedQty" },
          totalIrrepaired: { $sum: "$irrepairedQty" },
          totalUnderRepair: { $sum: "$underRepairQty" },
          totalTransferred: { $sum: "$transferredQty" },
          totalDamage: { $sum: "$damageQty" },
          totalValue: { 
            $sum: { 
              $multiply: ["$quantity", "$productPrice"] 
            } 
          },
          uniqueProducts: { $addToSet: "$product" }
        }
      },
      {
        $project: {
          totalItems: 1,
          totalRepaired: 1,
          totalIrrepaired: 1,
          totalUnderRepair: 1,
          totalTransferred: 1,
          totalDamage: 1,
          totalValue: 1,
          uniqueProductCount: { $size: "$uniqueProducts" },
          repairProgress: {
            $cond: [
              { $eq: ["$totalItems", 0] },
              0,
              { 
                $multiply: [
                  { 
                    $divide: [
                      { $add: ["$totalRepaired", "$totalIrrepaired"] },
                      "$totalItems"
                    ]
                  },
                  100
                ]
              }
            ]
          }
        }
      }
    ];

    const stats = await FaultyStock.aggregate(statsPipeline);
    
    const statusStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$overallStatus",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalDamageQty: { $sum: "$damageQty" },
          totalRepairedQty: { $sum: "$repairedQty" },
          totalUnderRepairQty: { $sum: "$underRepairQty" }
        }
      },
      {
        $project: {
          status: "$_id",
          count: 1,
          totalQuantity: 1,
          totalDamageQty: 1,
          totalRepairedQty: 1,
          totalUnderRepairQty: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    const usageTypeStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalDamageQty: { $sum: "$damageQty" }
        }
      },
      {
        $project: {
          usageType: "$_id",
          count: 1,
          totalQuantity: 1,
          totalDamageQty: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get product-wise damage statistics
    const productStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$product",
          productName: { $first: "$productInfo.productTitle" },
          productCode: { $first: "$productInfo.productCode" },
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalDamageQty: { $sum: "$damageQty" },
          totalRepairedQty: { $sum: "$repairedQty" },
          totalUnderRepairQty: { $sum: "$underRepairQty" }
        }
      },
      {
        $project: {
          productId: "$_id",
          productName: 1,
          productCode: 1,
          count: 1,
          totalQuantity: 1,
          totalDamageQty: 1,
          totalRepairedQty: 1,
          totalUnderRepairQty: 1,
          repairRate: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { 
                $multiply: [
                  { $divide: ["$totalRepairedQty", "$totalQuantity"] },
                  100
                ]
              }
            ]
          },
          damageRate: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { 
                $multiply: [
                  { $divide: ["$totalDamageQty", "$totalQuantity"] },
                  100
                ]
              }
            ]
          }
        }
      },
      { $sort: { totalDamageQty: -1 } },
      { $limit: 10 }
    ]);

    // Get center-wise statistics
    const centerStats = await FaultyStock.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerInfo"
        }
      },
      { $unwind: "$centerInfo" },
      {
        $group: {
          _id: "$center",
          centerName: { $first: "$centerInfo.centerName" },
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalDamageQty: { $sum: "$damageQty" }
        }
      },
      {
        $project: {
          centerId: "$_id",
          centerName: 1,
          count: 1,
          totalQuantity: 1,
          totalDamageQty: 1
        }
      },
      { $sort: { totalDamageQty: -1 } }
    ]);

    res.json({
      success: true,
      data: transformedRecords,
      statistics: {
        summary: {
          totalRecords: total,
          totalItems: stats[0]?.totalItems || 0,
          totalValue: stats[0]?.totalValue || 0,
          uniqueProducts: stats[0]?.uniqueProductCount || 0,
          totalDamage: stats[0]?.totalDamage || 0,
          totalRepaired: stats[0]?.totalRepaired || 0,
          totalIrrepaired: stats[0]?.totalIrrepaired || 0,
          totalUnderRepair: stats[0]?.totalUnderRepair || 0,
          totalTransferred: stats[0]?.totalTransferred || 0,
          repairProgress: stats[0]?.repairProgress || 0
        },
        statusDistribution: statusStats,
        usageTypeDistribution: usageTypeStats,
        productDistribution: productStats,
        centerDistribution: centerStats,
        quantityBreakdown: {
          damaged: stats[0]?.totalDamage || 0,
          underRepair: stats[0]?.totalUnderRepair || 0,
          repaired: stats[0]?.totalRepaired || 0,
          irrepaired: stats[0]?.totalIrrepaired || 0,
          transferred: stats[0]?.totalTransferred || 0
        }
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
        search: search || "",
        viewType: viewType
      },
      metadata: {
        timestamp: new Date().toISOString(),
        recordCount: transformedRecords.length,
        includesDamageQty: true
      }
    });
  } catch (error) {
    console.error("Get all faulty stock error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch faulty stock records",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};