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
  
      if (faultyStock.isSerialized) {
        // For serialized products
        const pendingSerials = faultyStock.serialNumbers.filter(sn => sn.status === "pending_damage");
        
        if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
          // Accept specific serials
          for (const accepted of acceptedQuantities) {
            const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
            if (serial) {
              // Update serial status to damaged
              serial.status = "damaged";
              
              // Update repair history
              serial.repairHistory.push({
                date: new Date(),
                status: "damaged",
                remark: accepted.remark || "Damage accepted and verified",
                quantity: 1,
                repairedQty: 0,
                irrepairedQty: 0,
                updatedBy: userId
              });
              
              console.log(`Accepted serial: ${accepted.serialNumber}`);
            }
          }
        } else {
          // Accept all pending serials
          pendingSerials.forEach(serial => {
            serial.status = "damaged";
            serial.repairHistory.push({
              date: new Date(),
              status: "damaged",
              remark: "Damage accepted and verified",
              quantity: 1,
              repairedQty: 0,
              irrepairedQty: 0,
              updatedBy: userId
            });
          });
        }
      } else {
        // For non-serialized products
        const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
          ? acceptedQuantities.totalAcceptedQty 
          : faultyStock.pendingDamageQty;
        
        if (totalAccepted > faultyStock.pendingDamageQty) {
          return res.status(400).json({
            success: false,
            message: `Cannot accept ${totalAccepted} items. Only ${faultyStock.pendingDamageQty} pending items available`
          });
        }
        
        // Update quantities
        faultyStock.quantity = (faultyStock.quantity || 0) + totalAccepted;
        faultyStock.damageQty = (faultyStock.damageQty || 0) + totalAccepted;
        faultyStock.pendingDamageQty = Math.max(0, faultyStock.pendingDamageQty - totalAccepted);
        
        // Add to repair history
        if (!faultyStock.repairHistory) {
          faultyStock.repairHistory = [];
        }
        
        faultyStock.repairHistory.push({
          date: new Date(),
          status: "damaged",
          remark: acceptedQuantities?.remark || `Accepted ${totalAccepted} damaged items`,
          quantity: totalAccepted,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: userId
        });
      }
  
      // Update overall status
      if (faultyStock.isSerialized) {
        const hasPending = faultyStock.serialNumbers.some(sn => sn.status === "pending_damage");
        faultyStock.overallStatus = hasPending ? "pending_damage" : "damaged";
      } else {
        faultyStock.overallStatus = faultyStock.pendingDamageQty > 0 ? "pending_damage" : "damaged";
      }
  
      // Run the update method
      faultyStock.updateQuantitiesAndStatus();
      
      await faultyStock.save();
  
      res.status(200).json({
        success: true,
        message: "Damage items accepted successfully",
        data: {
          faultyStockId: faultyStock._id,
          overallStatus: faultyStock.overallStatus,
          totalQuantity: faultyStock.quantity,
          damageQty: faultyStock.damageQty,
          pendingDamageQty: faultyStock.pendingDamageQty
        }
      });
  
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

 // API to accept transferred items at repair center
export const acceptRepairTransfer = async (req, res) => {
    try {
      const { transferId, acceptedQuantities, remark } = req.body;
      const acceptedBy = req.user.id;
  
      if (!transferId || !mongoose.Types.ObjectId.isValid(transferId)) {
        return res.status(400).json({
          success: false,
          message: "Valid transfer ID is required"
        });
      }
  
      const RepairTransfer = mongoose.model("RepairTransfer");
      const FaultyStock = mongoose.model("FaultyStock");
      const Center = mongoose.model("Center");
  
      // Find the repair transfer
      const repairTransfer = await RepairTransfer.findById(transferId)
        .populate("product", "productTitle productCode trackSerialNumber")
        .populate("fromCenter", "centerName centerCode")
        .populate("toCenter", "centerName centerCode");
  
      if (!repairTransfer) {
        return res.status(404).json({
          success: false,
          message: "Repair transfer not found"
        });
      }
  
      // Check if transfer is in pending status
      if (repairTransfer.status !== "pending_under_repair") {
        return res.status(400).json({
          success: false,
          message: `Transfer is not in pending status. Current status: ${repairTransfer.status}`
        });
      }
  
      // Find the faulty stock record
      const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
      if (!faultyStock) {
        return res.status(404).json({
          success: false,
          message: "Faulty stock record not found"
        });
      }
  
      console.log(`Accepting repair transfer: ${transferId}`);
      console.log(`Before accept - Transfer Status: ${repairTransfer.status}, Pending Qty: ${repairTransfer.pendingUnderRepairQty || repairTransfer.quantity}`);
  
      if (repairTransfer.isSerialized) {
        // For serialized products
        const pendingSerials = repairTransfer.serialNumbers.filter(sn => sn.status === "pending_under_repair");
        
        if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
          // Accept specific serials
          for (const accepted of acceptedQuantities) {
            const serial = pendingSerials.find(sn => sn.serialNumber === accepted.serialNumber);
            if (serial) {
              // Update serial status to under_repair in repair transfer
              serial.status = "under_repair";
              serial.underRepairQty = 1;
              
              // Add repair history entry
              serial.repairHistory.push({
                date: new Date(),
                status: "under_repair",
                remark: accepted.remark || remark || "Accepted at repair center",
                updatedBy: acceptedBy,
                cost: 0
              });
  
              // Also update the faulty stock serial
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
            // Update in repair transfer
            serial.status = "under_repair";
            serial.underRepairQty = 1;
            
            serial.repairHistory.push({
              date: new Date(),
              status: "under_repair",
              remark: remark || "Accepted at repair center",
              updatedBy: acceptedBy,
              cost: 0
            });
  
            // Update in faulty stock
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
  
        // Calculate accepted count
        const acceptedCount = repairTransfer.serialNumbers.filter(sn => sn.status === "under_repair").length;
        repairTransfer.underRepairQty = acceptedCount;
        repairTransfer.pendingUnderRepairQty = Math.max(0, repairTransfer.quantity - acceptedCount);
  
      } else {
        // For non-serialized products
        const totalAccepted = acceptedQuantities && acceptedQuantities.totalAcceptedQty 
          ? acceptedQuantities.totalAcceptedQty 
          : repairTransfer.pendingUnderRepairQty || repairTransfer.quantity;
        
        if (totalAccepted > (repairTransfer.pendingUnderRepairQty || repairTransfer.quantity)) {
          return res.status(400).json({
            success: false,
            message: `Cannot accept ${totalAccepted} items. Only ${repairTransfer.pendingUnderRepairQty || repairTransfer.quantity} pending items available`
          });
        }
  
        // Update repair transfer
        repairTransfer.underRepairQty = totalAccepted;
        repairTransfer.pendingUnderRepairQty = Math.max(0, (repairTransfer.pendingUnderRepairQty || repairTransfer.quantity) - totalAccepted);
  
        // Update faulty stock
        faultyStock.underRepairQty = (faultyStock.underRepairQty || 0) + totalAccepted;
        faultyStock.pendingUnderRepairQty = Math.max(0, (faultyStock.pendingUnderRepairQty || 0) - totalAccepted);
  
        // Add repair history to faulty stock
        if (!faultyStock.repairHistory) {
          faultyStock.repairHistory = [];
        }
        
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
  
      // Add acceptance update
      repairTransfer.repairUpdates.push({
        date: new Date(),
        status: repairTransfer.status,
        remark: remark || `Accepted by repair center`,
        quantity: repairTransfer.underRepairQty,
        updatedBy: acceptedBy,
        cost: 0
      });
  
      // Update accepted by
      repairTransfer.acceptedBy = acceptedBy;
      repairTransfer.acceptedAt = new Date();
  
      // Update faulty stock overall status
      faultyStock.updateQuantitiesAndStatus();
      
      // Save both records
      await faultyStock.save();
      await repairTransfer.save();
  
      console.log(`After accept - Transfer Status: ${repairTransfer.status}, UnderRepairQty: ${repairTransfer.underRepairQty}, PendingQty: ${repairTransfer.pendingUnderRepairQty}`);
  
      res.json({
        success: true,
        message: "Repair transfer accepted successfully",
        data: {
          transferId: repairTransfer._id,
          status: repairTransfer.status,
          underRepairQty: repairTransfer.underRepairQty,
          pendingUnderRepairQty: repairTransfer.pendingUnderRepairQty,
          product: repairTransfer.product?.productTitle,
          fromCenter: repairTransfer.fromCenter?.centerName,
          toCenter: repairTransfer.toCenter?.centerName,
          acceptedBy: acceptedBy,
          acceptedAt: new Date()
        }
      });
  
    } catch (error) {
      console.error("Accept repair transfer error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to accept repair transfer"
      });
    }
  };