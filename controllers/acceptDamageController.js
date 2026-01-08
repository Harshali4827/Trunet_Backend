import mongoose from "mongoose";

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
// export const acceptDamageItems = async (req, res) => {
//     try {
//       const { faultyStockId, acceptedQuantities } = req.body;
//       const userId = req.user._id;
  
//       const FaultyStock = mongoose.model("FaultyStock");
//       const faultyStock = await FaultyStock.findById(faultyStockId);
  
//       if (!faultyStock) {
//         return res.status(404).json({
//           success: false,
//           message: "Faulty stock entry not found"
//         });
//       }
  
//       // Check if there are pending damage items
//       if (faultyStock.overallStatus !== "pending_damage" && faultyStock.pendingDamageQty <= 0) {
//         return res.status(400).json({
//           success: false,
//           message: "No pending damage items to accept"
//         });
//       }
  
//       console.log(`Accepting damage for faulty stock: ${faultyStockId}`);
//       console.log(`Pending damage quantity: ${faultyStock.pendingDamageQty}`);
//       console.log(`Accepted quantities:`, acceptedQuantities);
  
//       if (faultyStock.isSerialized) {
//         // For serialized products
//         const pendingSerials = faultyStock.serialNumbers.filter(sn => sn.status === "pending_damage");
        
//         if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
//           // Accept specific serials
//           for (const accepted of acceptedQuantities) {
//             const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
//             if (serial) {
//               // Update serial status to damaged
//               serial.status = "damaged";
              
//               // Update repair history
//               serial.repairHistory.push({
//                 date: new Date(),
//                 status: "damaged",
//                 remark: accepted.remark || "Damage accepted and verified",
//                 quantity: 1,
//                 repairedQty: 0,
//                 irrepairedQty: 0,
//                 updatedBy: userId
//               });
              
//               console.log(`Accepted serial: ${accepted.serialNumber}`);
//             }
//           }
//         } else {
//           // Accept all pending serials
//           pendingSerials.forEach(serial => {
//             serial.status = "damaged";
//             serial.repairHistory.push({
//               date: new Date(),
//               status: "damaged",
//               remark: "Damage accepted and verified",
//               quantity: 1,
//               repairedQty: 0,
//               irrepairedQty: 0,
//               updatedBy: userId
//             });
//           });
//         }
//       } else {
//         // For non-serialized products
//         const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
//           ? acceptedQuantities.totalAcceptedQty 
//           : faultyStock.pendingDamageQty;
        
//         if (totalAccepted > faultyStock.pendingDamageQty) {
//           return res.status(400).json({
//             success: false,
//             message: `Cannot accept ${totalAccepted} items. Only ${faultyStock.pendingDamageQty} pending items available`
//           });
//         }
        
//         // Update quantities
//         faultyStock.quantity = (faultyStock.quantity || 0) + totalAccepted;
//         faultyStock.damageQty = (faultyStock.damageQty || 0) + totalAccepted;
//         faultyStock.pendingDamageQty = Math.max(0, faultyStock.pendingDamageQty - totalAccepted);
        
//         // Add to repair history
//         if (!faultyStock.repairHistory) {
//           faultyStock.repairHistory = [];
//         }
        
//         faultyStock.repairHistory.push({
//           date: new Date(),
//           status: "damaged",
//           remark: acceptedQuantities?.remark || `Accepted ${totalAccepted} damaged items`,
//           quantity: totalAccepted,
//           repairedQty: 0,
//           irrepairedQty: 0,
//           updatedBy: userId
//         });
//       }
  
//       // Update overall status
//       if (faultyStock.isSerialized) {
//         const hasPending = faultyStock.serialNumbers.some(sn => sn.status === "pending_damage");
//         faultyStock.overallStatus = hasPending ? "pending_damage" : "damaged";
//       } else {
//         faultyStock.overallStatus = faultyStock.pendingDamageQty > 0 ? "pending_damage" : "damaged";
//       }
  
//       // Run the update method
//       faultyStock.updateQuantitiesAndStatus();
      
//       await faultyStock.save();
  
//       res.status(200).json({
//         success: true,
//         message: "Damage items accepted successfully",
//         data: {
//           faultyStockId: faultyStock._id,
//           overallStatus: faultyStock.overallStatus,
//           totalQuantity: faultyStock.quantity,
//           damageQty: faultyStock.damageQty,
//           pendingDamageQty: faultyStock.pendingDamageQty
//         }
//       });
  
//     } catch (error) {
//       console.error("Accept damage error:", error);
//       res.status(500).json({
//         success: false,
//         message: error.message || "Failed to accept damage items"
//       });
//     }
//   };
  

export const acceptDamageItems = async (req, res) => {
  try {
    const { faultyStockId, acceptedQuantities } = req.body;
    const userId = req.user._id;

    const FaultyStock = mongoose.model("FaultyStock");
    const faultyStock = await FaultyStock.findById(faultyStockId);

    if (!faultyStock) {
      return res.status(404).json({
        success: false,
        message: "Faulty stock entry not found"
      });
    }

    // Check if there are pending damage items
    if (faultyStock.overallStatus !== "pending_damage" && faultyStock.pendingDamageQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "No pending damage items to accept"
      });
    }

    console.log(`Accepting damage for faulty stock: ${faultyStockId}`);
    console.log(`Pending damage quantity: ${faultyStock.pendingDamageQty}`);
    console.log(`Accepted quantities:`, acceptedQuantities);

    // Use the schema method to handle acceptance
    try {
      const result = faultyStock.acceptPendingDamage(acceptedQuantities, userId, "Damage accepted and verified");
      
      await faultyStock.save();

      res.status(200).json({
        success: true,
        message: "Damage items accepted successfully",
        data: {
          faultyStockId: faultyStock._id,
          overallStatus: faultyStock.overallStatus,
          totalQuantity: faultyStock.quantity,
          damageQty: faultyStock.damageQty,
          pendingDamageQty: faultyStock.pendingDamageQty,
          pendingDamageHistoryUpdated: faultyStock.pendingDamageHistory
            .filter(entry => entry.status === "accepted")
            .map(entry => ({
              date: entry.date,
              quantity: entry.quantity,
              serialNumbers: entry.serialNumbers
            }))
        }
      });

    } catch (methodError) {
      console.error("Error in acceptPendingDamage method:", methodError);
      return res.status(400).json({
        success: false,
        message: methodError.message || "Failed to accept damage items"
      });
    }

  } catch (error) {
    console.error("Accept damage error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to accept damage items"
    });
  }
};

  export const rejectDamageItems = async (req, res) => {
    try {
      const { faultyStockId, rejectedQuantities, remark } = req.body;
      const userId = req.user._id;
  
      const FaultyStock = mongoose.model("FaultyStock");
      const faultyStock = await FaultyStock.findById(faultyStockId);
  
      if (!faultyStock) {
        return res.status(404).json({
          success: false,
          message: "Faulty stock entry not found"
        });
      }
      if (faultyStock.overallStatus !== "pending_damage" && faultyStock.pendingDamageQty <= 0) {
        return res.status(400).json({
          success: false,
          message: "No pending damage items to reject"
        });
      }
  
      console.log(`Rejecting damage for faulty stock: ${faultyStockId}`);
  
      if (faultyStock.isSerialized) {
        const pendingSerials = faultyStock.serialNumbers.filter(sn => sn.status === "pending_damage");
        
        if (rejectedQuantities && Array.isArray(rejectedQuantities)) {
          faultyStock.serialNumbers = faultyStock.serialNumbers.filter(sn => 
            !rejectedQuantities.includes(sn.serialNumber) || sn.status !== "pending_damage"
          );
        } else {
          faultyStock.serialNumbers = faultyStock.serialNumbers.filter(sn => 
            sn.status !== "pending_damage"
          );
        }
      } else {
        const totalRejected = rejectedQuantities && rejectedQuantities.totalRejectedQty 
          ? rejectedQuantities.totalRejectedQty 
          : faultyStock.pendingDamageQty;
        
        faultyStock.pendingDamageQty = Math.max(0, faultyStock.pendingDamageQty - totalRejected);
        if (!faultyStock.repairHistory) {
          faultyStock.repairHistory = [];
        }
        
        faultyStock.repairHistory.push({
          date: new Date(),
          status: "rejected",
          remark: remark || `Rejected ${totalRejected} damage items`,
          quantity: totalRejected,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: userId
        });
      }
      if (faultyStock.isSerialized) {
        const hasPending = faultyStock.serialNumbers.some(sn => sn.status === "pending_damage");
        faultyStock.overallStatus = hasPending ? "pending_damage" : "damaged";
      } else {
        faultyStock.overallStatus = faultyStock.pendingDamageQty > 0 ? "pending_damage" : "damaged";
      }
      if (faultyStock.quantity === 0 && faultyStock.pendingDamageQty === 0 && 
          (!faultyStock.serialNumbers || faultyStock.serialNumbers.length === 0)) {
        await FaultyStock.findByIdAndDelete(faultyStockId);
        
        return res.status(200).json({
          success: true,
          message: "All damage items rejected, entry removed",
          data: { removed: true }
        });
      }
  
      faultyStock.updateQuantitiesAndStatus();
      await faultyStock.save();
  
      res.status(200).json({
        success: true,
        message: "Damage items rejected successfully",
        data: {
          faultyStockId: faultyStock._id,
          overallStatus: faultyStock.overallStatus,
          totalQuantity: faultyStock.quantity,
          damageQty: faultyStock.damageQty,
          pendingDamageQty: faultyStock.pendingDamageQty
        }
      });
  
    } catch (error) {
      console.error("Reject damage error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to reject damage items"
      });
    }
  };

  export const acceptRepairTransfer = async (req, res) => {
    try {
      const { transferId, acceptedQuantities, remark } = req.body;
      const acceptedBy = req.user.id;
  
      if (!transferId) {
        return res.status(400).json({
          success: false,
          message: "Transfer ID is required"
        });
      }
  
      const RepairTransfer = mongoose.model("RepairTransfer");
      const FaultyStock = mongoose.model("FaultyStock");
  
      // Find transfer
      const repairTransfer = await RepairTransfer.findById(transferId)
        .populate("product", "productTitle trackSerialNumber");
      
      if (!repairTransfer) {
        return res.status(404).json({
          success: false,
          message: "Repair transfer not found"
        });
      }
  
      // Must be in pending status
      if (repairTransfer.status !== "pending_under_repair") {
        return res.status(400).json({
          success: false,
          message: `Transfer is not in pending status. Current: ${repairTransfer.status}`
        });
      }
  
      // Find faulty stock
      const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
      if (!faultyStock) {
        return res.status(404).json({
          success: false,
          message: "Faulty stock record not found"
        });
      }
  
      console.log(`Accepting transfer ${transferId}`);
      console.log(`Before accept - FaultyStock: PendingUnderRepairQty: ${faultyStock.pendingUnderRepairQty}, UnderRepairQty: ${faultyStock.underRepairQty}`);
      console.log(`Before accept - RepairTransfer: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`);
  
      if (repairTransfer.isSerialized) {
        // For serialized products
        const pendingSerials = repairTransfer.serialNumbers.filter(sn => sn.status === "pending_under_repair");
        
        if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
          // Accept specific serials
          for (const accepted of acceptedQuantities) {
            const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
            if (serial) {
              // Update in repair transfer
              serial.status = "under_repair";
              serial.underRepairQty = 1;
              
              serial.repairHistory.push({
                date: new Date(),
                status: "under_repair",
                remark: accepted.remark || remark || "Accepted at repair center",
                updatedBy: acceptedBy,
                cost: 0
              });
  
              // Update in faulty stock
              const faultySerial = faultyStock.serialNumbers.find(sn => 
                sn.serialNumber === accepted.serialNumber
              );
              if (faultySerial) {
                faultySerial.status = "under_repair";
                faultySerial.underRepairQty = 1;
                
                faultySerial.repairHistory.push({
                  date: new Date(),
                  status: "under_repair",
                  remark: accepted.remark || remark || "Accepted at repair center",
                  updatedBy: acceptedBy,
                  cost: 0
                });
              }
            }
          }
        } else {
          // Accept all pending serials
          pendingSerials.forEach(serial => {
            // Update repair transfer
            serial.status = "under_repair";
            serial.underRepairQty = 1;
            
            serial.repairHistory.push({
              date: new Date(),
              status: "under_repair",
              remark: remark || "Accepted at repair center",
              updatedBy: acceptedBy,
              cost: 0
            });
  
            // Update faulty stock
            const faultySerial = faultyStock.serialNumbers.find(sn => 
              sn.serialNumber === serial.serialNumber
            );
            if (faultySerial) {
              faultySerial.status = "under_repair";
              faultySerial.underRepairQty = 1;
              
              faultySerial.repairHistory.push({
                date: new Date(),
                status: "under_repair",
                remark: remark || "Accepted at repair center",
                updatedBy: acceptedBy,
                cost: 0
              });
            }
          });
        }
  
        // Update repair transfer quantities
        const underRepairCount = repairTransfer.serialNumbers.filter(sn => sn.status === "under_repair").length;
        const pendingCount = repairTransfer.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
        
        repairTransfer.underRepairQty = underRepairCount;
        repairTransfer.pendingUnderRepairQty = pendingCount;
  
        // Update faulty stock quantities
        faultyStock.underRepairQty = faultyStock.serialNumbers.filter(sn => sn.status === "under_repair").length;
        faultyStock.pendingUnderRepairQty = faultyStock.serialNumbers.filter(sn => sn.status === "pending_under_repair").length;
  
      } else {
        // For non-serialized products
        const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
          ? acceptedQuantities.totalAcceptedQty 
          : repairTransfer.pendingUnderRepairQty;
        
        if (totalAccepted > repairTransfer.pendingUnderRepairQty) {
          return res.status(400).json({
            success: false,
            message: `Cannot accept ${totalAccepted} items. Only ${repairTransfer.pendingUnderRepairQty} pending`
          });
        }
  
        // Update repair transfer
        repairTransfer.underRepairQty = totalAccepted;
        repairTransfer.pendingUnderRepairQty = repairTransfer.pendingUnderRepairQty - totalAccepted;
  
        // Update faulty stock
        faultyStock.underRepairQty = (faultyStock.underRepairQty || 0) + totalAccepted;
        faultyStock.pendingUnderRepairQty = faultyStock.pendingUnderRepairQty - totalAccepted;
  
        // Add history to faulty stock
        faultyStock.repairHistory.push({
          date: new Date(),
          status: "under_repair",
          remark: remark || `Accepted ${totalAccepted} items at repair center`,
          quantity: totalAccepted,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: acceptedBy
        });
      }
  
      // Update repair transfer status
      if (repairTransfer.underRepairQty === repairTransfer.quantity) {
        repairTransfer.status = "under_repair";
      } else if (repairTransfer.underRepairQty > 0) {
        repairTransfer.status = "partially_accepted";
      } else {
        repairTransfer.status = "pending_under_repair";
      }
  
      // Update accepted info
      repairTransfer.acceptedBy = acceptedBy;
      repairTransfer.acceptedAt = new Date();
      
      repairTransfer.repairUpdates.push({
        date: new Date(),
        status: repairTransfer.status,
        remark: remark || `Accepted ${repairTransfer.underRepairQty} items`,
        quantity: repairTransfer.underRepairQty,
        updatedBy: acceptedBy,
        cost: 0
      });
  
      // Update faulty stock status
      faultyStock.updateQuantitiesAndStatus();
      
      // Save both
      await faultyStock.save();
      await repairTransfer.save();
  
      console.log(`After accept - FaultyStock: PendingUnderRepairQty: ${faultyStock.pendingUnderRepairQty}, UnderRepairQty: ${faultyStock.underRepairQty}`);
      console.log(`After accept - RepairTransfer: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`);
  
      res.json({
        success: true,
        message: "Transfer accepted successfully",
        data: {
          transferId: repairTransfer._id,
          status: repairTransfer.status,
          acceptedQty: repairTransfer.underRepairQty,
          pendingQty: repairTransfer.pendingUnderRepairQty,
          product: repairTransfer.product?.productTitle,
          acceptedBy: acceptedBy,
          acceptedAt: new Date()
        }
      });
  
    } catch (error) {
      console.error("Accept error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };

  // export const acceptRejectRepairedTransfer = async (req, res) => {
  //   try {
  //     const { hasAccess, userCenter } = checkStockUsagePermissions(
  //       req,
  //       ["manage_usage_own_center", "manage_usage_all_center"]
  //     );
  
  //     if (!hasAccess) {
  //       return res.status(403).json({
  //         success: false,
  //         message: "Access denied.",
  //       });
  //     }
  
  //     const { productId, serialNumbers = [], action, reason } = req.body;
  //     const userId = req.user.id;
  //     const warehouseId = userCenter?._id || req.user.center;
  
  //     if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Valid product ID is required",
  //       });
  //     }
  
  //     if (!action || !["accept", "reject"].includes(action)) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Action must be 'accept' or 'reject'",
  //       });
  //     }
  
  //     if (action === "reject" && !reason) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Rejection reason is required",
  //       });
  //     }
  
  //     const OutletStock = mongoose.model("OutletStock");
  //     const RepairTransfer = mongoose.model("RepairTransfer");
  //     const Product = mongoose.model("Product");
  
  //     const product = await Product.findById(productId);
  //     if (!product) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "Product not found",
  //       });
  //     }
  
  //     const isSerialized = product.trackSerialNumber === "Yes";
      
  //     // Find outlet stock
  //     const outletStock = await OutletStock.findOne({
  //       outlet: warehouseId,
  //       product: productId
  //     });
  
  //     if (!outletStock) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "No stock found for this product in the warehouse",
  //       });
  //     }
  
  //     // ACCEPT TRANSFER
  //     if (action === "accept") {
  //       if (isSerialized) {
  //         // For serialized products
  //         if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "Serial numbers are required for serialized products",
  //           });
  //         }
  
  //         let acceptedCount = 0;
  //         const acceptedSerials = [];
          
  //         // Update each serial from "pending_approval" to "available"
  //         for (const serialNumber of serialNumbers) {
  //           const serialIndex = outletStock.serialNumbers.findIndex(
  //             sn => sn.serialNumber === serialNumber && sn.status === "pending_approval"
  //           );
            
  //           if (serialIndex !== -1) {
  //             outletStock.serialNumbers[serialIndex].status = "available";
              
  //             // Update transfer history
  //             if (outletStock.serialNumbers[serialIndex].transferHistory.length > 0) {
  //               const lastTransfer = outletStock.serialNumbers[serialIndex].transferHistory[
  //                 outletStock.serialNumbers[serialIndex].transferHistory.length - 1
  //               ];
  //               lastTransfer.transferStatus = "accepted";
  //               lastTransfer.acceptedAt = new Date();
  //               lastTransfer.acceptedBy = userId;
  //             }
              
  //             acceptedCount++;
  //             acceptedSerials.push(serialNumber);
              
  //             // Update RepairTransfer status from "pending_transfer" to "transferred"
  //             await RepairTransfer.updateMany(
  //               {
  //                 product: productId,
  //                 "serialNumbers.serialNumber": serialNumber,
  //                 "serialNumbers.status": "pending_transfer"
  //               },
  //               {
  //                 $set: {
  //                   "serialNumbers.$.status": "transferred",
  //                   "serialNumbers.$.repairHistory.$[elem].status": "transferred",
  //                   "serialNumbers.$.repairHistory.$[elem].transferStatus": "accepted",
  //                   "serialNumbers.$.repairHistory.$[elem].acceptedAt": new Date(),
  //                   "serialNumbers.$.repairHistory.$[elem].acceptedBy": userId
  //                 }
  //               },
  //               {
  //                 arrayFilters: [
  //                   { 
  //                     "elem.status": "pending_transfer",
  //                     "elem.transferStatus": "pending"
  //                   }
  //                 ]
  //               }
  //             );
  //           }
  //         }
          
  //         if (acceptedCount === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "No pending serial numbers found to accept",
  //           });
  //         }
          
  //         // Update outlet stock quantities
  //         outletStock.availableQuantity += acceptedCount;
  //         outletStock.totalQuantity += acceptedCount;
  //         outletStock.repairedQuantity += acceptedCount;
          
  //         await outletStock.save();
          
  //         return res.json({
  //           success: true,
  //           message: `Accepted ${acceptedCount} repaired serialized items`,
  //           data: {
  //             product: product.productTitle,
  //             acceptedQuantity: acceptedCount,
  //             acceptedSerials: acceptedSerials,
  //             availableQuantity: outletStock.availableQuantity,
  //             repairedQuantity: outletStock.repairedQuantity,
  //             totalQuantity: outletStock.totalQuantity
  //           }
  //         });
          
  //       } else {
  //         // For NON-serialized products
  //         const repairTransfers = await RepairTransfer.find({
  //           product: productId,
  //           pendingTransferQty: { $gt: 0 },
  //           "pendingTransferDetails.outletId": warehouseId,
  //           "pendingTransferDetails.status": "pending"
  //         });
          
  //         if (repairTransfers.length === 0) {
  //           return res.status(404).json({
  //             success: false,
  //             message: "No pending transfers found for this non-serialized product",
  //           });
  //         }
          
  //         let totalAccepted = 0;
  //         const acceptedTransfers = [];
          
  //         for (const transfer of repairTransfers) {
  //           try {
  //             // Get pending quantity for this outlet
  //             const pendingDetails = transfer.pendingTransferDetails.filter(
  //               detail => detail.outletId.toString() === warehouseId.toString() && 
  //                        detail.status === "pending"
  //             );
              
  //             if (pendingDetails.length === 0) continue;
              
  //             // Calculate total pending quantity for this outlet in this transfer
  //             const totalPendingForOutlet = pendingDetails.reduce((sum, detail) => sum + detail.quantity, 0);
              
  //             // Accept all pending items for this outlet
  //             const acceptResult = transfer.acceptPendingTransfer(
  //               warehouseId,
  //               totalPendingForOutlet,
  //               userId,
  //               `Accepted at warehouse`
  //             );
              
  //             await transfer.save();
              
  //             totalAccepted += totalPendingForOutlet;
  //             acceptedTransfers.push({
  //               transferId: transfer._id,
  //               quantity: totalPendingForOutlet
  //             });
              
  //           } catch (error) {
  //             console.error(`Error accepting transfer ${transfer._id}:`, error);
  //             // Continue with other transfers
  //           }
  //         }
          
  //         if (totalAccepted === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "No pending items could be accepted",
  //           });
  //         }
          
  //         // Update outlet stock for non-serialized
  //         outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - totalAccepted);
  //         outletStock.repairedQuantity = (outletStock.repairedQuantity || 0) + totalAccepted;
  //         outletStock.availableQuantity += totalAccepted;
  //         outletStock.totalQuantity += totalAccepted;
          
  //         await outletStock.save();
          
  //         return res.json({
  //           success: true,
  //           message: `Accepted ${totalAccepted} repaired non-serialized items`,
  //           data: {
  //             product: product.productTitle,
  //             acceptedQuantity: totalAccepted,
  //             acceptedTransfers: acceptedTransfers,
  //             availableQuantity: outletStock.availableQuantity,
  //             repairedQuantity: outletStock.repairedQuantity,
  //             pendingRepairedQty: outletStock.pendingRepairedQty,
  //             totalQuantity: outletStock.totalQuantity
  //           }
  //         });
  //       }
        
  //     } else {
  //       // REJECT TRANSFER
  //       if (isSerialized) {
  //         // For serialized products
  //         if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "Serial numbers are required for serialized products",
  //           });
  //         }
          
  //         let rejectedCount = 0;
  //         const rejectedSerials = [];
          
  //         // Remove rejected serials from outlet stock
  //         const removedSerials = [];
  //         outletStock.serialNumbers = outletStock.serialNumbers.filter(sn => {
  //           if (serialNumbers.includes(sn.serialNumber) && sn.status === "pending_approval") {
  //             rejectedCount++;
  //             rejectedSerials.push(sn.serialNumber);
  //             removedSerials.push(sn);
  //             return false; // Remove from array
  //           }
  //           return true; // Keep in array
  //         });
          
  //         if (rejectedCount === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "No pending serial numbers found to reject",
  //           });
  //         }
          
  //         await outletStock.save();
          
  //         // Update RepairTransfer status back to "repaired"
  //         for (const serial of removedSerials) {
  //           await RepairTransfer.updateMany(
  //             {
  //               product: productId,
  //               "serialNumbers.serialNumber": serial.serialNumber,
  //               "serialNumbers.status": "pending_transfer"
  //             },
  //             {
  //               $set: {
  //                 "serialNumbers.$.status": "repaired",
  //                 "serialNumbers.$.repairHistory.$[elem].status": "repaired",
  //                 "serialNumbers.$.repairHistory.$[elem].transferStatus": "rejected",
  //                 "serialNumbers.$.repairHistory.$[elem].rejectionReason": reason,
  //                 "serialNumbers.$.repairHistory.$[elem].rejectedAt": new Date(),
  //                 "serialNumbers.$.repairHistory.$[elem].rejectedBy": userId
  //               }
  //             },
  //             {
  //               arrayFilters: [
  //                 { 
  //                   "elem.status": "pending_transfer",
  //                   "elem.transferStatus": "pending"
  //                 }
  //               ]
  //             }
  //           );
  //         }
          
  //         return res.json({
  //           success: true,
  //           message: `Rejected ${rejectedCount} repaired serialized items`,
  //           data: {
  //             product: product.productTitle,
  //             rejectedQuantity: rejectedCount,
  //             rejectedSerials: rejectedSerials,
  //             reason: reason
  //           }
  //         });
          
  //       } else {
  //         // For NON-serialized products
  //         const repairTransfers = await RepairTransfer.find({
  //           product: productId,
  //           pendingTransferQty: { $gt: 0 },
  //           "pendingTransferDetails.outletId": warehouseId,
  //           "pendingTransferDetails.status": "pending"
  //         });
          
  //         if (repairTransfers.length === 0) {
  //           return res.status(404).json({
  //             success: false,
  //             message: "No pending transfers found for this non-serialized product",
  //           });
  //         }
          
  //         let totalRejected = 0;
  //         const rejectedTransfers = [];
          
  //         for (const transfer of repairTransfers) {
  //           try {
  //             // Get pending quantity for this outlet
  //             const pendingDetails = transfer.pendingTransferDetails.filter(
  //               detail => detail.outletId.toString() === warehouseId.toString() && 
  //                        detail.status === "pending"
  //             );
              
  //             if (pendingDetails.length === 0) continue;
              
  //             // Calculate total pending quantity for this outlet in this transfer
  //             const totalPendingForOutlet = pendingDetails.reduce((sum, detail) => sum + detail.quantity, 0);
              
  //             // Reject all pending items for this outlet
  //             const rejectResult = transfer.rejectPendingTransfer(
  //               warehouseId,
  //               totalPendingForOutlet,
  //               userId,
  //               reason
  //             );
              
  //             await transfer.save();
              
  //             totalRejected += totalPendingForOutlet;
  //             rejectedTransfers.push({
  //               transferId: transfer._id,
  //               quantity: totalPendingForOutlet
  //             });
              
  //           } catch (error) {
  //             console.error(`Error rejecting transfer ${transfer._id}:`, error);
  //             // Continue with other transfers
  //           }
  //         }
          
  //         if (totalRejected === 0) {
  //           return res.status(400).json({
  //             success: false,
  //             message: "No pending items could be rejected",
  //           });
  //         }
          
  //         // Update outlet stock - reduce pending quantity
  //         outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - totalRejected);
          
  //         await outletStock.save();
          
  //         return res.json({
  //           success: true,
  //           message: `Rejected ${totalRejected} repaired non-serialized items`,
  //           data: {
  //             product: product.productTitle,
  //             rejectedQuantity: totalRejected,
  //             rejectedTransfers: rejectedTransfers,
  //             pendingRepairedQty: outletStock.pendingRepairedQty,
  //             reason: reason
  //           }
  //         });
  //       }
  //     }
  
  //   } catch (error) {
  //     console.error("Accept/Reject repaired transfer error:", error);
  //     res.status(500).json({
  //       success: false,
  //       message: error.message || "Failed to process transfer",
  //     });
  //   }
  // };



  export const acceptRejectRepairedTransfer = async (req, res) => {
    try {
      const { hasAccess, userCenter } = checkStockUsagePermissions(
        req,
        ["manage_usage_own_center", "manage_usage_all_center"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied.",
        });
      }
  
      const { productId, serialNumbers = [], action, reason } = req.body;
      const userId = req.user.id;
      const warehouseId = userCenter?._id || req.user.center;
  
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: "Valid product ID is required",
        });
      }
  
      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Action must be 'accept' or 'reject'",
        });
      }
  
      if (action === "reject" && !reason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required",
        });
      }
  
      const OutletStock = mongoose.model("OutletStock");
      const RepairTransfer = mongoose.model("RepairTransfer");
      const Product = mongoose.model("Product");
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }
  
      const isSerialized = product.trackSerialNumber === "Yes";
      
      // Find outlet stock
      const outletStock = await OutletStock.findOne({
        outlet: warehouseId,
        product: productId
      });
  
      if (!outletStock) {
        return res.status(404).json({
          success: false,
          message: "No stock found for this product in the warehouse",
        });
      }
  
      // ACCEPT TRANSFER
      if (action === "accept") {
        if (isSerialized) {
          // For serialized products
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            return res.status(400).json({
              success: false,
              message: "Serial numbers are required for serialized products",
            });
          }
  
          let acceptedCount = 0;
          const acceptedSerials = [];
          
          // Update each serial from "pending_approval" to "available"
          for (const serialNumber of serialNumbers) {
            const serialIndex = outletStock.serialNumbers.findIndex(
              sn => sn.serialNumber === serialNumber && sn.status === "pending_approval"
            );
            
            if (serialIndex !== -1) {
              outletStock.serialNumbers[serialIndex].status = "available";
              
              // Update transfer history
              if (outletStock.serialNumbers[serialIndex].transferHistory.length > 0) {
                const lastTransfer = outletStock.serialNumbers[serialIndex].transferHistory[
                  outletStock.serialNumbers[serialIndex].transferHistory.length - 1
                ];
                lastTransfer.transferStatus = "accepted";
                lastTransfer.acceptedAt = new Date();
                lastTransfer.acceptedBy = userId;
              }
              
              acceptedCount++;
              acceptedSerials.push(serialNumber);
              
              // Update RepairTransfer status from "pending_transfer" to "transferred"
              await RepairTransfer.updateMany(
                {
                  product: productId,
                  "serialNumbers.serialNumber": serialNumber,
                  "serialNumbers.status": "pending_transfer"
                },
                {
                  $set: {
                    "serialNumbers.$.status": "transferred",
                    "serialNumbers.$.repairHistory.$[elem].status": "transferred",
                    "serialNumbers.$.repairHistory.$[elem].transferStatus": "accepted",
                    "serialNumbers.$.repairHistory.$[elem].acceptedAt": new Date(),
                    "serialNumbers.$.repairHistory.$[elem].acceptedBy": userId
                  }
                },
                {
                  arrayFilters: [
                    { 
                      "elem.status": "pending_transfer",
                      "elem.transferStatus": "pending"
                    }
                  ]
                }
              );
            }
          }
          
          if (acceptedCount === 0) {
            return res.status(400).json({
              success: false,
              message: "No pending serial numbers found to accept",
            });
          }
          
          // Update outlet stock quantities
          outletStock.availableQuantity += acceptedCount;
          outletStock.totalQuantity += acceptedCount;
          outletStock.repairedQuantity += acceptedCount;
          outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - acceptedCount);
          
          await outletStock.save();
          
          return res.json({
            success: true,
            message: `Accepted ${acceptedCount} repaired serialized items`,
            data: {
              product: product.productTitle,
              acceptedQuantity: acceptedCount,
              acceptedSerials: acceptedSerials,
              availableQuantity: outletStock.availableQuantity,
              repairedQuantity: outletStock.repairedQuantity,
              pendingRepairedQty: outletStock.pendingRepairedQty,
              totalQuantity: outletStock.totalQuantity
            }
          });
          
        } else {
          // For NON-serialized products
          const repairTransfers = await RepairTransfer.find({
            product: productId,
            pendingTransferQty: { $gt: 0 },
            "pendingTransferDetails.outletId": warehouseId,
            "pendingTransferDetails.status": "pending"
          });
          
          if (repairTransfers.length === 0) {
            return res.status(404).json({
              success: false,
              message: "No pending transfers found for this non-serialized product",
            });
          }
          
          let totalAccepted = 0;
          const acceptedTransfers = [];
          
          for (const transfer of repairTransfers) {
            try {
              // Get pending quantity for this outlet
              const pendingDetails = transfer.pendingTransferDetails.filter(
                detail => detail.outletId.toString() === warehouseId.toString() && 
                         detail.status === "pending"
              );
              
              if (pendingDetails.length === 0) continue;
              
              // Calculate total pending quantity for this outlet in this transfer
              const totalPendingForOutlet = pendingDetails.reduce((sum, detail) => sum + detail.quantity, 0);
              
              // Accept all pending items for this outlet
              const acceptResult = transfer.acceptPendingTransfer(
                warehouseId,
                totalPendingForOutlet,
                userId,
                `Accepted at warehouse`
              );
              
              await transfer.save();
              
              totalAccepted += totalPendingForOutlet;
              acceptedTransfers.push({
                transferId: transfer._id,
                quantity: totalPendingForOutlet
              });
              
            } catch (error) {
              console.error(`Error accepting transfer ${transfer._id}:`, error);
              // Continue with other transfers
            }
          }
          
          if (totalAccepted === 0) {
            return res.status(400).json({
              success: false,
              message: "No pending items could be accepted",
            });
          }
          
          // Update outlet stock for non-serialized
          outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - totalAccepted);
          outletStock.repairedQuantity = (outletStock.repairedQuantity || 0) + totalAccepted;
          outletStock.availableQuantity += totalAccepted;
          outletStock.totalQuantity += totalAccepted;
          
          await outletStock.save();
          
          return res.json({
            success: true,
            message: `Accepted ${totalAccepted} repaired non-serialized items`,
            data: {
              product: product.productTitle,
              acceptedQuantity: totalAccepted,
              acceptedTransfers: acceptedTransfers,
              availableQuantity: outletStock.availableQuantity,
              repairedQuantity: outletStock.repairedQuantity,
              pendingRepairedQty: outletStock.pendingRepairedQty,
              totalQuantity: outletStock.totalQuantity
            }
          });
        }
        
      } else {
        // REJECT TRANSFER
        if (isSerialized) {
          // For serialized products
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            return res.status(400).json({
              success: false,
              message: "Serial numbers are required for serialized products",
            });
          }
          
          let rejectedCount = 0;
          const rejectedSerials = [];
          
          // Remove rejected serials from outlet stock
          const removedSerials = [];
          outletStock.serialNumbers = outletStock.serialNumbers.filter(sn => {
            if (serialNumbers.includes(sn.serialNumber) && sn.status === "pending_approval") {
              rejectedCount++;
              rejectedSerials.push(sn.serialNumber);
              removedSerials.push(sn);
              return false; // Remove from array
            }
            return true; // Keep in array
          });
          
          if (rejectedCount === 0) {
            return res.status(400).json({
              success: false,
              message: "No pending serial numbers found to reject",
            });
          }
          
          // Decrease pendingRepairedQty when rejecting
          outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - rejectedCount);
          
          await outletStock.save();
          
          // Update RepairTransfer status back to "repaired"
          for (const serial of removedSerials) {
            await RepairTransfer.updateMany(
              {
                product: productId,
                "serialNumbers.serialNumber": serial.serialNumber,
                "serialNumbers.status": "pending_transfer"
              },
              {
                $set: {
                  "serialNumbers.$.status": "repaired",
                  "serialNumbers.$.repairHistory.$[elem].status": "repaired",
                  "serialNumbers.$.repairHistory.$[elem].transferStatus": "rejected",
                  "serialNumbers.$.repairHistory.$[elem].rejectionReason": reason,
                  "serialNumbers.$.repairHistory.$[elem].rejectedAt": new Date(),
                  "serialNumbers.$.repairHistory.$[elem].rejectedBy": userId
                }
              },
              {
                arrayFilters: [
                  { 
                    "elem.status": "pending_transfer",
                    "elem.transferStatus": "pending"
                  }
                ]
              }
            );
          }
          
          return res.json({
            success: true,
            message: `Rejected ${rejectedCount} repaired serialized items`,
            data: {
              product: product.productTitle,
              rejectedQuantity: rejectedCount,
              rejectedSerials: rejectedSerials,
              pendingRepairedQty: outletStock.pendingRepairedQty,
              reason: reason
            }
          });
          
        } else {
          // For NON-serialized products
          const repairTransfers = await RepairTransfer.find({
            product: productId,
            pendingTransferQty: { $gt: 0 },
            "pendingTransferDetails.outletId": warehouseId,
            "pendingTransferDetails.status": "pending"
          });
          
          if (repairTransfers.length === 0) {
            return res.status(404).json({
              success: false,
              message: "No pending transfers found for this non-serialized product",
            });
          }
          
          let totalRejected = 0;
          const rejectedTransfers = [];
          
          for (const transfer of repairTransfers) {
            try {
              // Get pending quantity for this outlet
              const pendingDetails = transfer.pendingTransferDetails.filter(
                detail => detail.outletId.toString() === warehouseId.toString() && 
                         detail.status === "pending"
              );
              
              if (pendingDetails.length === 0) continue;
              
              // Calculate total pending quantity for this outlet in this transfer
              const totalPendingForOutlet = pendingDetails.reduce((sum, detail) => sum + detail.quantity, 0);
              
              // Reject all pending items for this outlet
              const rejectResult = transfer.rejectPendingTransfer(
                warehouseId,
                totalPendingForOutlet,
                userId,
                reason
              );
              
              await transfer.save();
              
              totalRejected += totalPendingForOutlet;
              rejectedTransfers.push({
                transferId: transfer._id,
                quantity: totalPendingForOutlet
              });
              
            } catch (error) {
              console.error(`Error rejecting transfer ${transfer._id}:`, error);
              // Continue with other transfers
            }
          }
          
          if (totalRejected === 0) {
            return res.status(400).json({
              success: false,
              message: "No pending items could be rejected",
            });
          }
          
          // Update outlet stock - reduce pending quantity
          outletStock.pendingRepairedQty = Math.max(0, outletStock.pendingRepairedQty - totalRejected);
          
          await outletStock.save();
          
          return res.json({
            success: true,
            message: `Rejected ${totalRejected} repaired non-serialized items`,
            data: {
              product: product.productTitle,
              rejectedQuantity: totalRejected,
              rejectedTransfers: rejectedTransfers,
              pendingRepairedQty: outletStock.pendingRepairedQty,
              reason: reason
            }
          });
        }
      }
  
    } catch (error) {
      console.error("Accept/Reject repaired transfer error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to process transfer",
      });
    }
  };

  export const acceptRejectResellerTransfer = async (req, res) => {
  try {
    const { transfers, action, reason } = req.body;
    const userId = req.user.id;

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transfers array is required and cannot be empty",
      });
    }

    if (!action || !["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'accept' or 'reject'",
      });
    }

    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    // Import models
    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const Product = mongoose.model("Product");
    const FaultyStock = mongoose.model("FaultyStock");
    const Reseller = mongoose.model("Reseller");

    const results = [];
    const errors = [];

    console.log(`\n=== Processing ${action.toUpperCase()} for ${transfers.length} reseller transfers ===`);

    for (const transferItem of transfers) {
      try {
        const { resellerId, productId, transferIndex, quantity, serialNumbers = [] } = transferItem;
        
        if (!resellerId || !mongoose.Types.ObjectId.isValid(resellerId)) {
          errors.push(`Invalid reseller ID in transfer: ${JSON.stringify(transferItem)}`);
          continue;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
          errors.push(`Invalid product ID in transfer: ${JSON.stringify(transferItem)}`);
          continue;
        }

        const product = await Product.findById(productId);
        if (!product) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        const reseller = await Reseller.findById(resellerId);
        if (!reseller) {
          errors.push(`Reseller not found: ${resellerId}`);
          continue;
        }

        // Find reseller stock
        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId
        });

        if (!resellerStock) {
          errors.push(`Reseller stock not found for reseller: ${resellerId}, product: ${productId}`);
          continue;
        }

        // Check if there are pending transfers
        if (!resellerStock.pendingTransfers || resellerStock.pendingTransfers.length === 0) {
          errors.push(`No pending transfers found for reseller: ${resellerId}, product: ${productId}`);
          continue;
        }

        // Find the pending transfer
        let transferIndexToUse = transferIndex;
        
        if (transferIndexToUse === undefined) {
          // Try to find pending transfer by matching properties
          const pendingTransferIndex = resellerStock.pendingTransfers.findIndex(pt => 
            pt.status === "pending"
          );
          
          if (pendingTransferIndex === -1) {
            errors.push(`No pending transfers found for reseller: ${resellerId}, product: ${productId}`);
            continue;
          }
          
          transferIndexToUse = pendingTransferIndex;
        } else {
          // Validate the provided index
          if (resellerStock.pendingTransfers.length <= transferIndexToUse) {
            errors.push(`Invalid transfer index ${transferIndexToUse} for reseller: ${resellerId}, product: ${productId}`);
            continue;
          }
        }

        const pendingTransfer = resellerStock.pendingTransfers[transferIndexToUse];
        
        if (pendingTransfer.status !== "pending") {
          errors.push(`Transfer is already ${pendingTransfer.status} for reseller: ${resellerId}, product: ${productId}`);
          continue;
        }

        const outletId = pendingTransfer.outletId;
        const transferQuantity = quantity || pendingTransfer.quantity;
        const transferSerials = serialNumbers.length > 0 
          ? serialNumbers 
          : (pendingTransfer.serialNumbers || []);

        console.log(`\nProcessing ${action} for: ${product.productTitle}`);
        console.log(`Quantity: ${transferQuantity}, Outlet: ${outletId}, Reseller: ${reseller.businessName}`);
        console.log(`Using transfer index: ${transferIndexToUse}`);

        if (action === "accept") {
          // ACCEPT TRANSFER
          console.log(`=== ACCEPTING TRANSFER ===`);

          // 1. Update Outlet Stock
          const outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId
          });

          if (!outletStock) {
            errors.push(`Outlet stock not found for outlet: ${outletId}, product: ${productId}`);
            continue;
          }

          // Verify pending transfer exists in outlet stock
          if (!outletStock.pendingTransfers || outletStock.pendingTransfers.length === 0) {
            errors.push(`No pending transfers found in outlet stock for outlet: ${outletId}, product: ${productId}`);
            continue;
          }

          // Find the matching pending transfer in outlet stock
          const outletTransferIndex = outletStock.pendingTransfers.findIndex(
            pt => pt.resellerId.toString() === resellerId.toString() && 
                  pt.status === "pending"
          );
          
          if (outletTransferIndex === -1) {
            errors.push(`No pending transfer found in outlet stock for reseller: ${resellerId}`);
            continue;
          }

          if (product.trackSerialNumber === "Yes") {
            // SERIALIZED PRODUCTS: Update serial status from pending_transfer to transferred
            for (const serial of transferSerials) {
              const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
              const serialIndex = outletStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber && sn.status === "pending_transfer"
              );
              
              if (serialIndex !== -1) {
                outletStock.serialNumbers[serialIndex].status = "transferred";
                
                // Add to transfer history
                const transferRecord = {
                  fromCenter: outletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  remark: "Transfer accepted by reseller",
                  transferredBy: userId,
                  transferStatus: "accepted",
                  acceptedAt: new Date(),
                  acceptedBy: userId
                };
                
                if (!Array.isArray(outletStock.serialNumbers[serialIndex].transferHistory)) {
                  outletStock.serialNumbers[serialIndex].transferHistory = [];
                }
                
                outletStock.serialNumbers[serialIndex].transferHistory.push(transferRecord);
              }
            }
          } else {
            // NON-SERIALIZED PRODUCTS
            const pendingBatchSerial = outletStock.serialNumbers.find(
              sn => sn.status === "pending_transfer"
            );
            
            if (pendingBatchSerial) {
              pendingBatchSerial.status = "transferred";
              
              const transferRecord = {
                fromCenter: outletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: `Transfer of ${transferQuantity} items accepted by reseller`,
                transferredBy: userId,
                transferStatus: "accepted",
                acceptedAt: new Date(),
                acceptedBy: userId
              };
              
              if (!Array.isArray(pendingBatchSerial.transferHistory)) {
                pendingBatchSerial.transferHistory = [];
              }
              
              pendingBatchSerial.transferHistory.push(transferRecord);
            }
          }

          // Update outlet pending transfer count
          outletStock.pendingTransferToReseller = Math.max(
            0, 
            (outletStock.pendingTransferToReseller || 0) - transferQuantity
          );

          // Increase transferred quantity
          outletStock.transferredRepairedQty = (outletStock.transferredRepairedQty || 0) + transferQuantity;

          // Mark outlet pending transfer as accepted
          outletStock.pendingTransfers[outletTransferIndex].status = "accepted";
          outletStock.pendingTransfers[outletTransferIndex].acceptedAt = new Date();
          outletStock.pendingTransfers[outletTransferIndex].acceptedBy = userId;

          await outletStock.save();
          console.log(`✓ Updated OutletStock`);

          // 2. Update Reseller Stock
          resellerStock.pendingIncomingQuantity = Math.max(
            0, 
            (resellerStock.pendingIncomingQuantity || 0) - transferQuantity
          );

          // Update available and total quantities
          resellerStock.availableQuantity = (resellerStock.availableQuantity || 0) + transferQuantity;
          resellerStock.totalQuantity = (resellerStock.totalQuantity || 0) + transferQuantity;

          // Update source breakdown
          resellerStock.sourceBreakdown.damageRepairQuantity = 
            (resellerStock.sourceBreakdown.damageRepairQuantity || 0) + transferQuantity;

          // Update pending transfer status
          resellerStock.pendingTransfers[transferIndexToUse].status = "accepted";
          resellerStock.pendingTransfers[transferIndexToUse].acceptedAt = new Date();
          resellerStock.pendingTransfers[transferIndexToUse].acceptedBy = userId;

          // Add serials to main serialNumbers array
          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
              
              // Check if serial already exists
              const existingSerialIndex = resellerStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber
              );
              
              const transferRecord = {
                fromCenter: outletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: "Accepted transfer from outlet",
                transferredBy: userId,
                transferStatus: "accepted",
                acceptedAt: new Date(),
                acceptedBy: userId
              };
              
              if (existingSerialIndex === -1) {
                // Add new serial
                resellerStock.serialNumbers.push({
                  serialNumber: serialNumber,
                  status: "available",
                  purchaseId: new mongoose.Types.ObjectId(),
                  currentLocation: null,
                  sourceType: "damage_repair",
                  transferHistory: [transferRecord]
                });
              } else {
                // Update existing serial
                resellerStock.serialNumbers[existingSerialIndex].status = "available";
                
                if (!Array.isArray(resellerStock.serialNumbers[existingSerialIndex].transferHistory)) {
                  resellerStock.serialNumbers[existingSerialIndex].transferHistory = [];
                }
                
                resellerStock.serialNumbers[existingSerialIndex].transferHistory.push(transferRecord);
              }
            }
          } else {
            // Create batch record for non-serialized
            const existingBatchSerial = resellerStock.serialNumbers.find(
              sn => sn.serialNumber.startsWith("BATCH-") && sn.status === "available"
            );
            
            const transferRecord = {
              fromCenter: outletId,
              toReseller: resellerId,
              transferDate: new Date(),
              transferType: "outlet_to_reseller",
              sourceType: "damage_repair",
              referenceId: outletStock._id,
              remark: `Accepted ${transferQuantity} repaired items from outlet`,
              transferredBy: userId,
              transferStatus: "accepted",
              acceptedAt: new Date(),
              acceptedBy: userId
            };
            
            if (!existingBatchSerial) {
              resellerStock.serialNumbers.push({
                serialNumber: `BATCH-${Date.now()}`,
                status: "available",
                purchaseId: new mongoose.Types.ObjectId(),
                currentLocation: null,
                sourceType: "damage_repair",
                transferHistory: [transferRecord]
              });
            } else {
              if (!Array.isArray(existingBatchSerial.transferHistory)) {
                existingBatchSerial.transferHistory = [];
              }
              existingBatchSerial.transferHistory.push(transferRecord);
            }
          }

          await resellerStock.save();
          console.log(`✓ Updated ResellerStock`);

          // 3. Update Repair Transfer
          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
              
              const repairTransfer = await RepairTransfer.findOne({
                product: productId,
                "serialNumbers.serialNumber": serialNumber
              });
              
              if (repairTransfer) {
                const updated = await RepairTransfer.findOneAndUpdate(
                  {
                    _id: repairTransfer._id,
                    "serialNumbers.serialNumber": serialNumber
                  },
                  {
                    $set: {
                      "serialNumbers.$.status": "transferred",
                      "serialNumbers.$.repairHistory.$[elem].status": "transferred",
                      "serialNumbers.$.repairHistory.$[elem].transferStatus": "accepted",
                      "serialNumbers.$.repairHistory.$[elem].acceptedAt": new Date(),
                      "serialNumbers.$.repairHistory.$[elem].acceptedBy": userId
                    },
                    $inc: {
                      returnedQty: 1,
                      pendingTransferQty: -1
                    }
                  },
                  {
                    arrayFilters: [
                      { 
                        "elem.status": "pending_transfer"
                      }
                    ],
                    new: true
                  }
                );
                
                if (updated) {
                  updated.updateStatusAndQuantities();
                  await updated.save();
                }
              }
            }
          } else {
            // Find RepairTransfer for non-serialized products
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              toCenter: outletId,
              status: { $in: ["repaired", "pending_transfer"] }
            });
            
            if (repairTransfer) {
              repairTransfer.pendingTransferQty = Math.max(
                0, 
                (repairTransfer.pendingTransferQty || 0) - transferQuantity
              );
              repairTransfer.returnedQty = (repairTransfer.returnedQty || 0) + transferQuantity;
              
              // Update pendingTransferDetails
              if (repairTransfer.pendingTransferDetails) {
                for (const detail of repairTransfer.pendingTransferDetails) {
                  if (detail.resellerId && 
                      detail.resellerId.toString() === resellerId.toString() && 
                      detail.status === "pending") {
                    detail.status = "accepted";
                    detail.acceptedAt = new Date();
                    detail.acceptedBy = userId;
                  }
                }
              }
              
              repairTransfer.repairUpdates.push({
                date: new Date(),
                status: "transferred",
                remark: `Accepted by reseller ${reseller.businessName}`,
                quantity: transferQuantity,
                updatedBy: userId,
                transferStatus: "accepted",
                destinationReseller: resellerId,
                acceptedAt: new Date(),
                acceptedBy: userId
              });
              
              repairTransfer.updateStatusAndQuantities();
              await repairTransfer.save();
            }
          }

          // 4. Update Faulty Stock
          console.log(`=== UPDATING FAULTY STOCK ===`);
          
          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
              
              const faultyStock = await FaultyStock.findOne({
                product: productId,
                isSerialized: true,
                "serialNumbers.serialNumber": serialNumber
              });
              
              if (faultyStock) {
                const updated = await FaultyStock.findOneAndUpdate(
                  {
                    _id: faultyStock._id,
                    "serialNumbers.serialNumber": serialNumber
                  },
                  {
                    $set: {
                      "serialNumbers.$.status": "transferred"
                    },
                    $inc: {
                      transferredQty: 1,
                      repairedQty: -1
                    }
                  },
                  { new: true }
                );
                
                if (updated) {
                  if (updated.updateQuantitiesAndStatus) {
                    updated.updateQuantitiesAndStatus();
                  }
                  updated.lastRepairUpdate = new Date();
                  await updated.save();
                }
              }
            }
          } else {
            const faultyStock = await FaultyStock.findOne({
              product: productId,
              isSerialized: false,
              $or: [
                { toCenter: outletId },
                { center: outletId }
              ]
            }).sort({ createdAt: -1 });

            if (faultyStock) {
              faultyStock.repairedQty = Math.max(0, (faultyStock.repairedQty || 0) - transferQuantity);
              faultyStock.transferredQty = (faultyStock.transferredQty || 0) + transferQuantity;
              
              if (!faultyStock.repairHistory) {
                faultyStock.repairHistory = [];
              }
              
              faultyStock.repairHistory.push({
                date: new Date(),
                status: "transferred",
                remark: `Transferred ${transferQuantity} repaired items to reseller ${reseller.businessName} (Accepted)`,
                quantity: transferQuantity,
                repairedQty: 0 - transferQuantity,
                irrepairedQty: 0,
                updatedBy: userId,
                transferStatus: "accepted",
                destinationReseller: resellerId
              });
              
              if (faultyStock.updateQuantitiesAndStatus) {
                faultyStock.updateQuantitiesAndStatus();
              }
              
              faultyStock.lastRepairUpdate = new Date();
              await faultyStock.save();
            }
          }

          results.push({
            success: true,
            resellerId,
            productId,
            productName: product.productTitle,
            quantity: transferQuantity,
            outletId: outletId,
            status: "accepted",
            message: `Accepted ${transferQuantity} items from ${reseller.businessName}`
          });

        } else {
          // REJECT TRANSFER
          console.log(`=== REJECTING TRANSFER ===`);

          // 1. Update Outlet Stock
          const outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId
          });

          if (outletStock) {
            if (product.trackSerialNumber === "Yes") {
              // Reset serial status from pending_transfer back to available
              for (const serial of transferSerials) {
                const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
                const serialIndex = outletStock.serialNumbers.findIndex(
                  sn => sn.serialNumber === serialNumber && sn.status === "pending_transfer"
                );
                
                if (serialIndex !== -1) {
                  outletStock.serialNumbers[serialIndex].status = "available";
                  
                  const rejectionRecord = {
                    fromCenter: outletId,
                    toReseller: resellerId,
                    transferDate: new Date(),
                    transferType: "outlet_to_reseller",
                    sourceType: "damage_repair",
                    referenceId: outletStock._id,
                    remark: `Transfer rejected: ${reason}`,
                    transferredBy: userId,
                    transferStatus: "rejected",
                    rejectedAt: new Date(),
                    rejectedBy: userId,
                    rejectionReason: reason
                  };
                  
                  if (!Array.isArray(outletStock.serialNumbers[serialIndex].transferHistory)) {
                    outletStock.serialNumbers[serialIndex].transferHistory = [];
                  }
                  
                  outletStock.serialNumbers[serialIndex].transferHistory.push(rejectionRecord);
                }
              }
            } else {
              // For non-serialized: reset batch serial status
              const pendingBatchSerial = outletStock.serialNumbers.find(
                sn => sn.status === "pending_transfer"
              );
              
              if (pendingBatchSerial) {
                pendingBatchSerial.status = "available";
                
                const rejectionRecord = {
                  fromCenter: outletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  remark: `Transfer of ${transferQuantity} items rejected: ${reason}`,
                  transferredBy: userId,
                  transferStatus: "rejected",
                  rejectedAt: new Date(),
                  rejectedBy: userId,
                  rejectionReason: reason
                };
                
                if (!Array.isArray(pendingBatchSerial.transferHistory)) {
                  pendingBatchSerial.transferHistory = [];
                }
                
                pendingBatchSerial.transferHistory.push(rejectionRecord);
              }
            }

            // Restore available quantity
            outletStock.availableQuantity = (outletStock.availableQuantity || 0) + transferQuantity;
            
            // Reduce pending transfer count
            outletStock.pendingTransferToReseller = Math.max(
              0, 
              (outletStock.pendingTransferToReseller || 0) - transferQuantity
            );

            // Find and update the pending transfer in outlet stock
            if (outletStock.pendingTransfers) {
              const outletTransferIndex = outletStock.pendingTransfers.findIndex(
                pt => pt.resellerId.toString() === resellerId.toString() && 
                      pt.status === "pending"
              );
              
              if (outletTransferIndex !== -1) {
                outletStock.pendingTransfers[outletTransferIndex].status = "rejected";
                outletStock.pendingTransfers[outletTransferIndex].rejectedAt = new Date();
                outletStock.pendingTransfers[outletTransferIndex].rejectedBy = userId;
                outletStock.pendingTransfers[outletTransferIndex].rejectionReason = reason;
              }
            }

            await outletStock.save();
          }

          // 2. Update Reseller Stock
          resellerStock.pendingIncomingQuantity = Math.max(
            0, 
            (resellerStock.pendingIncomingQuantity || 0) - transferQuantity
          );

          resellerStock.pendingTransfers[transferIndexToUse].status = "rejected";
          resellerStock.pendingTransfers[transferIndexToUse].rejectedAt = new Date();
          resellerStock.pendingTransfers[transferIndexToUse].rejectedBy = userId;
          resellerStock.pendingTransfers[transferIndexToUse].rejectionReason = reason;

          await resellerStock.save();

          // 3. Update Repair Transfer
          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber = typeof serial === 'string' ? serial : serial.serialNumber;
              
              const repairTransfer = await RepairTransfer.findOne({
                product: productId,
                "serialNumbers.serialNumber": serialNumber
              });
              
              if (repairTransfer) {
                const updated = await RepairTransfer.findOneAndUpdate(
                  {
                    _id: repairTransfer._id,
                    "serialNumbers.serialNumber": serialNumber
                  },
                  {
                    $set: {
                      "serialNumbers.$.status": "repaired",
                      "serialNumbers.$.repairHistory.$[elem].status": "repaired",
                      "serialNumbers.$.repairHistory.$[elem].transferStatus": "rejected",
                      "serialNumbers.$.repairHistory.$[elem].rejectedAt": new Date(),
                      "serialNumbers.$.repairHistory.$[elem].rejectedBy": userId,
                      "serialNumbers.$.repairHistory.$[elem].rejectionReason": reason
                    },
                    $inc: {
                      repairedQty: 1,
                      pendingTransferQty: -1
                    }
                  },
                  {
                    arrayFilters: [
                      { 
                        "elem.status": "pending_transfer"
                      }
                    ],
                    new: true
                  }
                );
                
                if (updated) {
                  updated.updateStatusAndQuantities();
                  await updated.save();
                }
              }
            }
          } else {
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              toCenter: outletId,
              status: { $in: ["repaired", "pending_transfer"] }
            });
            
            if (repairTransfer) {
              repairTransfer.pendingTransferQty = Math.max(
                0, 
                (repairTransfer.pendingTransferQty || 0) - transferQuantity
              );
              repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + transferQuantity;
              
              if (repairTransfer.pendingTransferDetails) {
                for (const detail of repairTransfer.pendingTransferDetails) {
                  if (detail.resellerId && 
                      detail.resellerId.toString() === resellerId.toString() && 
                      detail.status === "pending") {
                    detail.status = "rejected";
                    detail.rejectedAt = new Date();
                    detail.rejectedBy = userId;
                    detail.rejectionReason = reason;
                  }
                }
              }
              
              repairTransfer.repairUpdates.push({
                date: new Date(),
                status: "repaired",
                remark: `Transfer rejected by reseller: ${reason}`,
                quantity: transferQuantity,
                updatedBy: userId,
                transferStatus: "rejected",
                destinationReseller: resellerId,
                rejectedAt: new Date(),
                rejectedBy: userId,
                rejectionReason: reason
              });
              
              repairTransfer.updateStatusAndQuantities();
              await repairTransfer.save();
            }
          }

          results.push({
            success: true,
            resellerId,
            productId,
            productName: product.productTitle,
            quantity: transferQuantity,
            outletId: outletId,
            status: "rejected",
            reason: reason,
            message: `Rejected ${transferQuantity} items from ${reseller.businessName}`
          });
        }

      } catch (error) {
        console.error(`Error processing transfer:`, error);
        errors.push({
          transfer: transferItem,
          error: error.message
        });
      }
    }

    // Prepare response
    const successfulCount = results.filter(r => r.success).length;
    const totalProcessed = results.length;
    
    const response = {
      success: successfulCount > 0,
      message: successfulCount > 0 
        ? `Successfully processed ${successfulCount} out of ${totalProcessed} transfers` 
        : "Failed to process any transfers",
      data: {
        results,
        totalProcessed,
        successfulCount,
        failedCount: errors.length
      }
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = successfulCount > 0;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error("Accept/Reject reseller transfers error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process transfers",
    });
  }
};