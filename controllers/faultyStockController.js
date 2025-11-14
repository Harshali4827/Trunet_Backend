import mongoose from "mongoose";
import RepairTransfer from '../models/RepairTransfer.js'

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
  

  export const transferToRepairCenter = async (req, res) => {
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
  
          // Find existing faulty stock for this product from ANY center
          const existingFaultyStock = await FaultyStock.findOne({
            product: productId,
            overallStatus: "damaged"
          }).populate('center', 'centerName');
  
          if (!existingFaultyStock) {
            errors.push(`No faulty stock found for product: ${product.productTitle}`);
            continue;
          }
  
          if (existingFaultyStock.quantity < quantity) {
            errors.push(`Insufficient faulty stock quantity for ${product.productTitle}. Available: ${existingFaultyStock.quantity}, Requested: ${quantity}`);
            continue;
          }
  
          // Validate serial numbers if product tracks them
          if (product.trackSerialNumber === "Yes") {
            if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
              errors.push(`Serial numbers are required for product: ${product.productTitle}`);
              continue;
            }
            
            if (serialNumbers.length !== quantity) {
              errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${product.productTitle}`);
              continue;
            }
  
            // Verify serial numbers exist in the faulty stock
            const availableSerialNumbers = existingFaultyStock.serialNumbers.map(sn => sn.serialNumber);
            const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
            
            if (invalidSerials.length > 0) {
              errors.push(`Invalid serial numbers for product ${product.productTitle}: ${invalidSerials.join(', ')}`);
              continue;
            }
          }
  
          // Update the faulty stock - reduce quantity or remove if all transferred
          if (existingFaultyStock.quantity === quantity) {
            // Update status to "under_repair" instead of deleting
            existingFaultyStock.overallStatus = "under_repair";
            
            // Update serial numbers status if product tracks them
            if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
              existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
                if (serialNumbers.includes(sn.serialNumber)) {
                  return {
                    ...sn.toObject(),
                    status: "under_repair",
                    repairHistory: [
                      ...(sn.repairHistory || []),
                      {
                        date: new Date(),
                        status: "under_repair",
                        remark: damageRemark || "Transferred to repair center",
                        updatedBy: transferredBy,
                        cost: 0
                      }
                    ]
                  };
                }
                return sn;
              });
            }
            
            await existingFaultyStock.save();
          } else {
            // Reduce the quantity
            existingFaultyStock.quantity -= quantity;
            
            // Update serial numbers if product tracks them
            if (product.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
              // Mark transferred serials as under_repair and keep them in the record
              existingFaultyStock.serialNumbers = existingFaultyStock.serialNumbers.map(sn => {
                if (serialNumbers.includes(sn.serialNumber)) {
                  return {
                    ...sn.toObject(),
                    status: "under_repair",
                    repairHistory: [
                      ...(sn.repairHistory || []),
                      {
                        date: new Date(),
                        status: "under_repair",
                        remark: damageRemark || "Transferred to repair center",
                        updatedBy: transferredBy,
                        cost: 0
                      }
                    ]
                  };
                }
                return sn;
              });
            }
            
            await existingFaultyStock.save();
          }
  
          // Create repair transfer record
          const repairTransfer = new RepairTransfer({
            date: new Date(),
            faultyStock: existingFaultyStock._id,
            fromCenter: existingFaultyStock.center, // Use the center where faulty stock was originally reported
            toCenter: repairCenterId,
            product: productId,
            quantity: quantity,
            serialNumbers: serialNumbers ? serialNumbers.map(sn => ({
              serialNumber: sn,
              status: "under_repair",
              repairHistory: [{
                date: new Date(),
                status: "under_repair",
                remark: damageRemark || "Transferred to repair center",
                updatedBy: transferredBy,
                cost: 0
              }]
            })) : [],
            transferRemark: transferRemark || `Transferred to repair center: ${repairCenter.centerName}`,
            transferredBy: transferredBy,
            status: "transferred"
          });
  
          await repairTransfer.save();
  
          transferResults.push({
            product: product.productTitle,
            productCode: product.productCode,
            quantity: quantity,
            serialNumbers: serialNumbers || [],
            transferId: repairTransfer._id,
            fromCenter: existingFaultyStock.center.centerName,
            toCenter: repairCenter.centerName,
            status: "success"
          });
  
          console.log(`✓ Transferred to repair center: ${product.productTitle} (Qty: ${quantity}) from ${existingFaultyStock.center.centerName}`);
  
        } catch (error) {
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
      limit = 50,
    } = req.query;

    const RepairTransfer = mongoose.model("RepairTransfer");
    
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

    const FaultyStock = mongoose.model("FaultyStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
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
    const CenterStock = mongoose.model("CenterStock");
    const Product = mongoose.model("Product");

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        const { product, quantity, serialNumbers, productRemark, finalStatus } = item;

        if (!product || !mongoose.Types.ObjectId.isValid(product)) {
          errors.push(`Invalid product ID: ${product}`);
          continue;
        }

        if (!quantity || quantity < 1) {
          errors.push(`Invalid quantity for product ${product}`);
          continue;
        }

        if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
          errors.push(`Invalid final status for product ${product}. Must be "repaired" or "irreparable"`);
          continue;
        }

        const productDoc = await Product.findById(product);
        if (!productDoc) {
          errors.push(`Product not found: ${product}`);
          continue;
        }

        const repairTransfer = await RepairTransfer.findOne({
          product: product,
          toCenter: userCenter?._id || req.user.center,
          status: { $in: ["transferred", "in_repair"] }
        });

        if (!repairTransfer) {
          errors.push(`No active repair transfer found for product: ${productDoc.productTitle}`);
          continue;
        }
        if (quantity > repairTransfer.quantity) {
          errors.push(`Quantity (${quantity}) exceeds available repair quantity (${repairTransfer.quantity}) for ${productDoc.productTitle}`);
          continue;
        }

        if (productDoc.trackSerialNumber === "Yes") {
          if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            errors.push(`Serial numbers are required for product: ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`);
            continue;
          }
          const availableSerialNumbers = repairTransfer.serialNumbers.map(sn => sn.serialNumber);
          const invalidSerials = serialNumbers.filter(sn => !availableSerialNumbers.includes(sn));
          
          if (invalidSerials.length > 0) {
            errors.push(`Invalid serial numbers for product ${productDoc.productTitle}: ${invalidSerials.join(', ')}`);
            continue;
          }
        }

        repairTransfer.status = finalStatus === "repaired" ? "repaired" : "returned";
        repairTransfer.actualReturnDate = new Date();
        repairTransfer.repairUpdates.push({
          date: new Date(date),
          status: finalStatus,
          remark: productRemark || remark || `Marked as ${finalStatus}`,
          updatedBy: updatedBy,
          cost: 0
        });
        if (serialNumbers && serialNumbers.length > 0) {
          repairTransfer.serialNumbers = repairTransfer.serialNumbers.map(sn => {
            if (serialNumbers.includes(sn.serialNumber)) {
              return {
                ...sn.toObject(),
                status: finalStatus,
                repairHistory: [
                  ...(sn.repairHistory || []),
                  {
                    date: new Date(date),
                    status: finalStatus,
                    remark: productRemark || remark || `Marked as ${finalStatus}`,
                    updatedBy: updatedBy,
                    cost: 0
                  }
                ]
              };
            }
            return sn;
          });
        }

        await repairTransfer.save();

        const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
        if (faultyStock) {
          if (serialNumbers && serialNumbers.length > 0) {
            faultyStock.serialNumbers = faultyStock.serialNumbers.map(sn => {
              if (serialNumbers.includes(sn.serialNumber)) {
                return {
                  ...sn.toObject(),
                  status: finalStatus,
                  repairHistory: [
                    ...(sn.repairHistory || []),
                    {
                      date: new Date(date),
                      status: finalStatus,
                      remark: productRemark || remark || `Marked as ${finalStatus}`,
                      updatedBy: updatedBy,
                      cost: 0
                    }
                  ]
                };
              }
              return sn;
            });
          }
          faultyStock.updateOverallStatus();
          
          if (finalStatus === "repaired") {
            faultyStock.repairDate = new Date(date);
          }
          
          await faultyStock.save();

          if (finalStatus === "repaired") {
            const centerStock = await CenterStock.findOne({
              center: repairTransfer.fromCenter,
              product: product
            });

            if (centerStock) {
              if (productDoc.trackSerialNumber === "Yes" && serialNumbers && serialNumbers.length > 0) {
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
                        transferDate: new Date(date),
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
                      transferDate: new Date(date),
                      transferType: "return_from_repair",
                      referenceId: repairTransfer._id,
                      remark: `Returned from repair - ${finalStatus}`
                    });
                  }
                }
                
                centerStock.availableQuantity += quantity;
                centerStock.totalQuantity += quantity;
              } else {
                centerStock.availableQuantity += quantity;
                centerStock.totalQuantity += quantity;
              }
              
              await centerStock.save();
            } else {

              const newCenterStock = new CenterStock({
                center: repairTransfer.fromCenter,
                product: product,
                availableQuantity: quantity,
                totalQuantity: quantity,
                serialNumbers: productDoc.trackSerialNumber === "Yes" ? serialNumbers.map(sn => ({
                  serialNumber: sn,
                  status: "available",
                  currentLocation: repairTransfer.fromCenter,
                  transferHistory: [{
                    fromCenter: repairTransfer.toCenter,
                    toCenter: repairTransfer.fromCenter,
                    transferDate: new Date(date),
                    transferType: "return_from_repair",
                    referenceId: repairTransfer._id,
                    remark: `Returned from repair - ${finalStatus}`
                  }]
                })) : []
              });
              
              await newCenterStock.save();
            }
          }
        }

        results.push({
          product: productDoc.productTitle,
          productCode: productDoc.productCode,
          quantity: quantity,
          serialNumbers: serialNumbers || [],
          finalStatus: finalStatus,
          repairTransferId: repairTransfer._id,
          status: "success"
        });

        console.log(`✓ Marked as ${finalStatus}: ${productDoc.productTitle} (Qty: ${quantity})`);

      } catch (error) {
        errors.push(`Error processing ${item.product}: ${error.message}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to process any items",
        errors: errors
      });
    }

    if (errors.length > 0) {
      return res.json({
        success: true,
        message: `Partially completed. ${results.length} items processed successfully, ${errors.length} failed`,
        data: {
          processed: results,
          errors: errors,
          totalItems: results.length,
          totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
          repairedCount: results.filter(item => item.finalStatus === "repaired").length,
          irreparableCount: results.filter(item => item.finalStatus === "irreparable").length
        }
      });
    }
    res.json({
      success: true,
      message: `Successfully processed ${results.length} items`,
      data: {
        processed: results,
        totalItems: results.length,
        totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
        repairedCount: results.filter(item => item.finalStatus === "repaired").length,
        irreparableCount: results.filter(item => item.finalStatus === "irreparable").length
      }
    });

  } catch (error) {
    console.error("Mark as repaired/irreparable error:", error);
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
      limit = 50,
    } = req.query;

    const RepairTransfer = mongoose.model("RepairTransfer");
    
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
      const serialNumbers = transfer.serialNumbers || [];
      
      if (transfer.product?.trackSerialNumber === "Yes") {
  
        const underRepairSerials = serialNumbers.filter(serial => 
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
            totalSerialsCount: serialNumbers.length
          });
        }
      } else {
        const repairedCount = transfer.repairUpdates?.filter(update => 
          update.status === "repaired"
        ).length || 0;
        
        const availableQty = transfer.quantity - repairedCount;
        
        if (availableQty > 0) {
          repairItems.push({
            ...transfer.toObject(),
            quantity: availableQty,
            displayQuantity: availableQty,
            availableForRepair: true,
            repairedCount: repairedCount,
            originalQuantity: transfer.quantity
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
      limit = 50,
    } = req.query;

    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");
    
    const filter = {
      toCenter: userCenter?._id || req.user.center,
      status: "repaired"
    };

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

    const repairedTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber category")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);
    const repairedProducts = [];

    for (const transfer of repairedTransfers) {
      const productId = transfer.product._id;
      let existingProduct = repairedProducts.find(p => p.product._id.toString() === productId.toString());
      
      if (!existingProduct) {
        existingProduct = {
          product: transfer.product,
          totalRepairedQuantity: 0,
          repairTransfers: [],
          repairedSerials: [],
          repairDates: [],
          fromCenters: []
        };
        repairedProducts.push(existingProduct);
      }

      let repairedQuantity = 0;
      const repairedSerialsInTransfer = [];

      if (transfer.product.trackSerialNumber === "Yes") {
        transfer.serialNumbers.forEach(serial => {
          if (serial.status === "repaired") {
            repairedQuantity += 1;
            repairedSerialsInTransfer.push({
              serialNumber: serial.serialNumber,
              repairDate: transfer.actualReturnDate || transfer.updatedAt,
              repairHistory: serial.repairHistory,
              transferId: transfer._id
            });
          }
        });
      } else {
        repairedQuantity = transfer.quantity;
      }

      existingProduct.totalRepairedQuantity += repairedQuantity;
 
      existingProduct.repairTransfers.push({
        transferId: transfer._id,
        date: transfer.date,
        actualReturnDate: transfer.actualReturnDate,
        quantity: repairedQuantity,
        fromCenter: transfer.fromCenter,
        transferRemark: transfer.transferRemark,
        repairedSerials: repairedSerialsInTransfer,
        totalRepairCost: transfer.totalRepairCost
      });

      const repairDate = transfer.actualReturnDate || transfer.updatedAt;
      if (!existingProduct.repairDates.includes(repairDate)) {
        existingProduct.repairDates.push(repairDate);
      }

      const centerExists = existingProduct.fromCenters.some(center => 
        center._id.toString() === transfer.fromCenter._id.toString()
      );
      if (!centerExists) {
        existingProduct.fromCenters.push(transfer.fromCenter);
      }

      existingProduct.repairedSerials.push(...repairedSerialsInTransfer);
    }

    repairedProducts.forEach(product => {
      product.repairDates.sort((a, b) => new Date(b) - new Date(a));
      product.repairTransfers.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    repairedProducts.sort((a, b) => b.totalRepairedQuantity - a.totalRepairedQuantity);

    const total = await RepairTransfer.countDocuments(filter);

    const stats = await RepairTransfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRepairedTransfers: { $sum: 1 },
          totalRepairedItems: { $sum: "$quantity" },
          totalRepairCost: { $sum: "$totalRepairCost" }
        }
      }
    ]);
    const productStats = await RepairTransfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$product",
          repairedQuantity: { $sum: "$quantity" },
          transferCount: { $sum: 1 },
          totalRepairCost: { $sum: "$totalRepairCost" }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      {
        $unwind: "$productDetails"
      },
      {
        $project: {
          productName: "$productDetails.productTitle",
          productCode: "$productDetails.productCode",
          repairedQuantity: 1,
          transferCount: 1,
          totalRepairCost: 1
        }
      },
      { $sort: { repairedQuantity: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        repairedProducts,
        summary: {
          totalProducts: repairedProducts.length,
          totalRepairedTransfers: stats[0]?.totalRepairedTransfers || 0,
          totalRepairedItems: stats[0]?.totalRepairedItems || 0,
          totalRepairCost: stats[0]?.totalRepairCost || 0,
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