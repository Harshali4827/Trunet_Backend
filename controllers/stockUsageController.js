import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import Building from "../models/Building.js";
import ControlRoom from "../models/ControlRoomModel.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import EntityStockUsage from "../models/EntityStockUsage.js";
import ReturnRecord from "../models/ReturnRecord.js";

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

const checkUsageCenterAccess = async (userId, targetCenterId, permissions) => {
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

  if (
    permissions.manage_usage_all_center ||
    permissions.view_usage_all_center
  ) {
    return targetCenterId || user.center._id;
  }

  if (
    permissions.manage_usage_own_center ||
    permissions.view_usage_own_center
  ) {
    const userCenterId = user.center._id || user.center;

    if (
      targetCenterId &&
      targetCenterId.toString() !== userCenterId.toString()
    ) {
      throw new Error(
        "Access denied. You can only access your own center's usage data."
      );
    }

    return userCenterId;
  }

  throw new Error("Insufficient permissions to access usage data");
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

export const createStockUsage = async (req, res) => {
  try {
    const { hasAccess, permissions } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const {
      date,
      usageType,
      remark,
      customer,
      connectionType,
      packageAmount,
      packageDuration,
      onuCharges,
      installationCharges,
      reason,
      shiftingAmount,
      wireChangeAmount,
      fromBuilding,
      toBuilding,
      fromControlRoom,
      items,
    } = req.body;

    let centerId = req.body.center;
    if (!centerId) {
      centerId = await getUserCenterId(req.user._id);
    } else {
      centerId = await checkUsageCenterAccess(
        req.user._id,
        centerId,
        permissions
      );
    }

    const center = req.user.center;
    const createdBy = req.user.id;

    if (!usageType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Usage type and items are required",
      });
    }

    if (!center) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const validationError = await validateUsageTypeFields(usageType, {
      customer,
      fromBuilding,
      toBuilding,
      fromControlRoom,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const validatedItems = [];
    for (let item of items) {
      const validatedItem = await validateAndCalculateStock(item, center);
      if (!validatedItem) {
        return res.status(400).json({
          success: false,
          message: `Invalid product or insufficient stock for product ${item.product}`,
        });
      }
      validatedItems.push(validatedItem);
    }

    const initialStatus = usageType === "Damage Return" ? "pending" : "completed";

    const stockUsageData = {
      date: date || new Date(),
      usageType,
      center,
      remark,
      items: validatedItems,
      createdBy,
      status: initialStatus,
    };

    addUsageTypeSpecificFields(stockUsageData, {
      customer,
      connectionType,
      packageAmount,
      packageDuration,
      onuCharges,
      installationCharges,
      reason,
      shiftingAmount,
      wireChangeAmount,
      fromBuilding,
      toBuilding,
      fromControlRoom,
    });

    const stockUsage = new StockUsage(stockUsageData);
    await stockUsage.save();

    if (usageType !== "Damage") {
      await processStockDeduction(stockUsage);
      await addStockToUsageEntity(stockUsage);
    } else {
      await reserveStockForDamage(stockUsage);
    }

    const populatedStockUsage = await StockUsage.findById(stockUsage._id)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode _id productPrice trackSerialNumber",
        transform: (doc) => {
          if (doc) {
            return {
              productId: doc._id,
              productTitle: doc.productTitle,
              productCode: doc.productCode,
              productPrice: doc.productPrice,
              trackSerialNumber: doc.trackSerialNumber,
            };
          }
          return doc;
        },
      })
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Stock usage created successfully",
      data: populatedStockUsage,
    });
  } catch (error) {
    console.error("Create stock usage error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create stock usage",
    });
  }
};

const validateAndCalculateStock = async (item, center) => {
  const { product, quantity, serialNumbers } = item;

  console.log("Validating item:", { product, quantity, serialNumbers, center });

  if (!product || !quantity || quantity <= 0) {
    console.log("Invalid product or quantity");
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(product)) {
    console.log("Invalid product ID format");
    return null;
  }

  const productDoc = await Product.findById(product);
  console.log("Product found:", productDoc);

  if (!productDoc || productDoc.status !== "Enable") {
    console.log("Product not found or disabled");
    return null;
  }

  const centerStock = await CenterStock.findOne({
    center: center,
    product: product,
  });

  console.log("Center stock found:", centerStock);
  console.log(
    "Available quantity:",
    centerStock?.availableQuantity,
    "Requested quantity:",
    quantity
  );

  if (!centerStock) {
    console.log("No center stock found for this product");
    return null;
  }

  if (centerStock.availableQuantity < quantity) {
    console.log(
      `Insufficient stock: Available ${centerStock.availableQuantity}, Requested ${quantity}`
    );
    return null;
  }

  if (productDoc.trackSerialNumber === "Yes") {
    console.log("Product requires serial number tracking");

    if (
      serialNumbers &&
      Array.isArray(serialNumbers) &&
      serialNumbers.length > 0
    ) {
      console.log("Validating provided serial numbers:", serialNumbers);

      const availableSerials = [];
      for (const requestedSerial of serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) =>
            sn.serialNumber === requestedSerial &&
            sn.status === "available" &&
            sn.currentLocation?.toString() === center._id.toString()
        );

        console.log("Serial validation:", {
          requestedSerial,
          found: !!serial,
          serialStatus: serial?.status,
          serialLocation: serial?.currentLocation?.toString(),
          expectedLocation: center._id.toString(),
        });

        if (serial) {
          availableSerials.push(requestedSerial);
        }
      }

      console.log(
        "Available serials found (direct validation):",
        availableSerials
      );

      if (availableSerials.length !== serialNumbers.length) {
        console.log(
          `Serial number mismatch: Found ${availableSerials.length}, Required ${serialNumbers.length}`
        );
        return null;
      }
    } else {
      console.log("No serial numbers provided for serialized product");

      const availableSerials = centerStock.serialNumbers
        .filter(
          (sn) =>
            sn.status === "available" &&
            sn.currentLocation?.toString() === center._id.toString()
        )
        .slice(0, quantity)
        .map((sn) => sn.serialNumber);

      console.log("Automatically found serials:", availableSerials);

      if (availableSerials.length < quantity) {
        console.log(
          `Not enough available serials: Found ${availableSerials.length}, Required ${quantity}`
        );
        return null;
      }

      item.serialNumbers = availableSerials;
    }
  } else {
    console.log("Product does not require serial number tracking");
  }

  const result = {
    product,
    quantity,
    serialNumbers: serialNumbers || [],
    oldStock: centerStock.availableQuantity,
    newStock: centerStock.availableQuantity - quantity,
    totalStock: centerStock.totalQuantity,
    isSerialized: productDoc.trackSerialNumber === "Yes",
  };

  console.log("Validation successful:", result);
  return result;
};

// const processStockDeduction = async (stockUsage) => {
//   const CenterStock = mongoose.model("CenterStock");
//   const Product = mongoose.model("Product");

//   for (let item of stockUsage.items) {
//     const product = await Product.findById(item.product);
//     const centerStock = await CenterStock.findOne({
//       center: stockUsage.center,
//       product: item.product,
//     });

//     if (!centerStock) continue;

//     if (product.trackSerialNumber === "Yes") {
//       if (item.serialNumbers && item.serialNumbers.length > 0) {
//         for (const serialNumber of item.serialNumbers) {
//           const serial = centerStock.serialNumbers.find(
//             (sn) =>
//               sn.serialNumber === serialNumber && sn.status === "available"
//           );

//           if (serial) {
//             serial.status = "consumed";
//             serial.currentLocation = null;
//             serial.transferHistory.push({
//               fromCenter: stockUsage.center,
//               transferDate: new Date(),
//               transferType: "field_usage",
//               usageType: stockUsage.usageType,
//               referenceId: stockUsage._id,
//               remark: stockUsage.remark,
//             });
//           }
//         }
//       }

//       centerStock.availableQuantity -= item.quantity;
//       centerStock.totalQuantity -= item.quantity;
//     } else {
//       centerStock.availableQuantity -= item.quantity;
//       centerStock.totalQuantity -= item.quantity;
//     }

//     await centerStock.save();
//   }

//   stockUsage.status = "completed";
//   await stockUsage.save();
// };



const processStockDeduction = async (stockUsage) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product);
    const centerStock = await CenterStock.findOne({
      center: stockUsage.center,
      product: item.product,
    });

    if (!centerStock) continue;

    if (product.trackSerialNumber === "Yes") {
      let consumedCount = 0;
      
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        for (const serialNumber of item.serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (sn) =>
              sn.serialNumber === serialNumber && sn.status === "available"
          );

          if (serial) {
            serial.status = "consumed";
            serial.currentLocation = null;
            serial.consumedDate = new Date();
            serial.consumedBy = stockUsage.createdBy;
            serial.transferHistory.push({
              fromCenter: stockUsage.center,
              transferDate: new Date(),
              transferType: "field_usage",
              usageType: stockUsage.usageType,
              referenceId: stockUsage._id,
              remark: stockUsage.remark,
            });
            consumedCount++;
          }
        }
      }
      centerStock.availableQuantity -= consumedCount;
      centerStock.consumedQuantity += consumedCount;
      console.log(`✓ Consumed ${consumedCount} serialized items for product: ${product.productTitle}`);
      
    } else {

      centerStock.availableQuantity -= item.quantity;
      centerStock.consumedQuantity += item.quantity;
      centerStock.totalQuantity -= item.quantity;
      
      console.log(`✓ Consumed ${item.quantity} non-serialized items for product: ${product.productTitle}`);
    }

    await centerStock.save();
    console.log(`✓ CenterStock updated - Available: ${centerStock.availableQuantity}, Consumed: ${centerStock.consumedQuantity}, Total: ${centerStock.totalQuantity}`);
  }

  stockUsage.status = "completed";
  await stockUsage.save();
};


// const addStockToUsageEntity = async (stockUsage) => {
//   const EntityStock = mongoose.model("EntityStock");
//   const Product = mongoose.model("Product");

//   const entityConfig = getEntityConfig(stockUsage.usageType, stockUsage);

//   if (!entityConfig) {
//     console.log(
//       `No entity configuration for usage type: ${stockUsage.usageType}`
//     );
//     return;
//   }

//   for (let item of stockUsage.items) {
//     const product = await Product.findById(item.product);

//     await EntityStock.updateStock(
//       entityConfig.entityType,
//       entityConfig.entityId,
//       item.product,
//       item.quantity,
//       item.serialNumbers || [],
//       stockUsage._id,
//       stockUsage.usageType
//     );
//   }
// };


const addStockToUsageEntity = async (stockUsage) => {
  const EntityStock = mongoose.model("EntityStock");
  const Product = mongoose.model("Product");

  const entityConfig = getEntityConfig(stockUsage.usageType, stockUsage);

  if (!entityConfig) {
    console.log(
      `No entity configuration for usage type: ${stockUsage.usageType}`
    );
    return;
  }

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product);
    const existingEntityStock = await EntityStock.findOne({
      entityType: entityConfig.entityType,
      entityId: entityConfig.entityId,
      product: item.product
    });

    let existingSerials = [];
    let serialsToAdd = [];
    let serialsToUpdate = [];

    if (existingEntityStock && item.serialNumbers && item.serialNumbers.length > 0) {
      for (const serial of item.serialNumbers) {
        const existingSerial = existingEntityStock.serialNumbers.find(
          sn => sn.serialNumber === serial
        );
        
        if (existingSerial) {
          serialsToUpdate.push(serial);
        } else {
          serialsToAdd.push(serial);
        }
      }
      
      existingSerials = existingEntityStock.serialNumbers
        .filter(sn => item.serialNumbers.includes(sn.serialNumber))
        .map(sn => sn.serialNumber);
    } else if (item.serialNumbers && item.serialNumbers.length > 0) {
      serialsToAdd = [...item.serialNumbers];
    }

    console.log(`Entity Stock Update for ${entityConfig.entityType}:`, {
      product: item.product,
      quantity: item.quantity,
      totalSerials: item.serialNumbers?.length || 0,
      existingSerials: existingSerials.length,
      serialsToUpdate: serialsToUpdate.length,
      serialsToAdd: serialsToAdd.length
    });

    if (serialsToUpdate.length > 0 && existingEntityStock) {
      await EntityStock.findOneAndUpdate(
        {
          entityType: entityConfig.entityType,
          entityId: entityConfig.entityId,
          product: item.product,
          "serialNumbers.serialNumber": { $in: serialsToUpdate }
        },
        {
          $set: {
            "serialNumbers.$[elem].status": "assigned",
            "serialNumbers.$[elem].lastUpdated": new Date()
          }
        },
        {
          arrayFilters: [
            { "elem.serialNumber": { $in: serialsToUpdate }, "elem.status": "available" }
          ],
          new: true
        }
      );
      console.log(`✓ Updated ${serialsToUpdate.length} existing serials to assigned status`);
    }
    if (serialsToAdd.length > 0) {
      await EntityStock.updateStock(
        entityConfig.entityType,
        entityConfig.entityId,
        item.product,
        serialsToAdd.length,
        serialsToAdd,
        stockUsage._id,
        stockUsage.usageType
      );
      console.log(`✓ Added ${serialsToAdd.length} new serials to entity stock`);
    }

    if (!item.serialNumbers || item.serialNumbers.length === 0) {
      await EntityStock.updateStock(
        entityConfig.entityType,
        entityConfig.entityId,
        item.product,
        item.quantity,
        [],
        stockUsage._id,
        stockUsage.usageType
      );
    }
  }
};

const getEntityConfig = (usageType, stockUsage) => {
  const config = {
    Customer: {
      entityType: "customer",
      entityId: stockUsage.customer,
    },
    Building: {
      entityType: "building",
      entityId: stockUsage.fromBuilding,
    },
    "Building to Building": {
      entityType: "building",
      entityId: stockUsage.toBuilding,
    },
    "Control Room": {
      entityType: "controlRoom",
      entityId: stockUsage.fromControlRoom,
    },
    Damage: {
      entityType: "damage",
      entityId: stockUsage.center,
    },
    "Stolen from Center": {
      entityType: "stolen",
      entityId: stockUsage.center,
    },
    "Stolen from Field": {
      entityType: "stolen",
      entityId: stockUsage.center,
    },
    Other: {
      entityType: "other",
      entityId: stockUsage.center,
    },
  };

  return config[usageType];
};


export const getAllStockUsage = async (req, res) => {
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
      usageType,
      dateFilter,
      startDate,
      endDate,
      customer,
      building,
      controlRoom,
      status,
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    filter.usageType = { $ne: "Damage Return" };
    if (usageType) filter.usageType = usageType;
    if (status) filter.status = status;
    if (customer) filter.customer = customer;
    if (building) {
      filter.$or = [{ fromBuilding: building }, { toBuilding: building }];
    }
    if (controlRoom) filter.fromControlRoom = controlRoom;

    if (dateFilter || startDate || endDate) {
      filter.date = buildDateFilter(dateFilter, startDate, endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsage = await StockUsage.find(filter)
      .populate("center", "name centerType centerName")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode _id productPrice trackSerialNumber",

        transform: (doc) => {
          if (doc) {
            return {
              productId: doc._id,
              productTitle: doc.productTitle,
              productCode: doc.productCode,
              productPrice: doc.productPrice,
              trackSerialNumber: doc.trackSerialNumber,
            };
          }
          return doc;
        },
      })
      .populate("createdBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await StockUsage.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: stockUsage,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get all stock usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock usage records",
    });
  }
};


export const getStockUsageById = async (req, res) => {
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

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const filter = { _id: id };

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const stockUsage = await StockUsage.findById(id)
      .populate("center", "name centerType address1 address2 city state")
      .populate(
        "customer",
        "username name mobile email address1 address2 city state"
      )
      .populate(
        "fromBuilding",
        "buildingName displayName address1 address2 landmark pincode"
      )
      .populate(
        "toBuilding",
        "buildingName displayName address1 address2 landmark pincode"
      )
      .populate(
        "fromControlRoom",
        "buildingName displayName address1 address2 landmark pincode"
      )
      .populate({
        path: "items.product",
        select: "productTitle productCode _id productPrice trackSerialNumber",
        transform: (doc) => {
          if (doc) {
            return {
              productId: doc._id,
              productTitle: doc.productTitle,
              productCode: doc.productCode,
              productPrice: doc.productPrice,
              trackSerialNumber: doc.trackSerialNumber,
            };
          }
          return doc;
        },
      })
      .populate("createdBy", "name email role");

    if (!stockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    res.json({
      success: true,
      data: stockUsage,
    });
  } catch (error) {
    console.error("Get stock usage by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock usage record",
    });
  }
};

export const updateStockUsage = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(req, ["allow_edit_usage"]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. allow_edit_usage permission required.",
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const { permissions, userCenter } = checkStockUsagePermissions(req, [
      "manage_usage_own_center",
      "manage_usage_all_center",
    ]);

    const filter = { _id: id };

    if (
      permissions.manage_usage_own_center &&
      !permissions.manage_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const existingStockUsage = await StockUsage.findById(id);
    if (!existingStockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    if (updateData.usageType) {
      const validationError = await validateUsageTypeFields(
        updateData.usageType,
        {
          customer: updateData.customer,
          fromBuilding: updateData.fromBuilding,
          toBuilding: updateData.toBuilding,
          fromControlRoom: updateData.fromControlRoom,
        }
      );

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }
    }

    if (updateData.items && Array.isArray(updateData.items)) {
      const center = updateData.center || existingStockUsage.center;

      await restoreOldSerials(existingStockUsage, center);

      const validatedItems = [];
      for (let item of updateData.items) {
        const validatedItem = await validateAndCalculateStockForUpdate(
          item,
          center,
          existingStockUsage
        );
        if (!validatedItem) {
          return res.status(400).json({
            success: false,
            message: `Invalid product or insufficient stock for product ${item.product}`,
          });
        }
        validatedItems.push(validatedItem);
      }
      updateData.items = validatedItems;

      await consumeNewSerials(updateData, center, existingStockUsage);

      await updateEntityStockForUsage(existingStockUsage, updateData);
    }

    const updatedStockUsage = await StockUsage.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate("items.product", "productTitle productCode trackSerialNumber")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Stock usage updated successfully",
      data: updatedStockUsage,
    });
  } catch (error) {
    console.error("Update stock usage error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update stock usage",
    });
  }
};

const restoreOldSerials = async (existingStockUsage, center) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  console.log("=== RESTORING OLD SERIAL NUMBERS ===");

  for (let existingItem of existingStockUsage.items) {
    const product = await Product.findById(existingItem.product);

    if (
      product &&
      product.trackSerialNumber === "Yes" &&
      existingItem.serialNumbers
    ) {
      const centerStock = await CenterStock.findOne({
        center: center,
        product: existingItem.product,
      });

      if (!centerStock) continue;

      console.log("Restoring serials for product:", product.productTitle);
      console.log("Serials to restore:", existingItem.serialNumbers);

      let actuallyRestoredCount = 0;

      for (const oldSerial of existingItem.serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) => sn.serialNumber === oldSerial
        );

        if (serial) {
          if (serial.status === "consumed") {
            serial.status = "available";
            serial.currentLocation = center;
            serial.consumedDate = null;
            serial.consumedBy = null;
            serial.transferHistory.push({
              fromCenter: null,
              toCenter: center,
              transferDate: new Date(),
              transferType: "inbound_transfer",
              referenceId: existingStockUsage._id,
              remark: "Restored due to stock usage update",
            });
            actuallyRestoredCount++;
            console.log(`✓ Restored serial ${oldSerial} to available status`);
          } else {
            console.log(
              `⚠ Serial ${oldSerial} was not consumed (status: ${serial.status}), skipping restoration`
            );
          }
        } else {
          console.log(`✗ Serial ${oldSerial} not found in center stock`);
        }
      }

      if (actuallyRestoredCount > 0) {
        centerStock.availableQuantity += actuallyRestoredCount;
        centerStock.consumedQuantity = Math.max(
          0,
          centerStock.consumedQuantity - actuallyRestoredCount
        );

        await centerStock.save();
        console.log(
          `Updated center stock: +${actuallyRestoredCount} available, -${actuallyRestoredCount} consumed`
        );
      } else {
        console.log(
          "No serials were actually restored (none were in consumed status)"
        );
      }
    }
  }
};

const validateAndCalculateStockForUpdate = async (
  item,
  center,
  existingStockUsage
) => {
  const { product, quantity, serialNumbers } = item;

  console.log("=== VALIDATING STOCK FOR UPDATE ===");
  console.log("Validating item:", { product, quantity, serialNumbers, center });

  if (!product || !quantity || quantity <= 0) {
    console.log("Invalid product or quantity");
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(product)) {
    console.log("Invalid product ID format");
    return null;
  }

  const productDoc = await Product.findById(product);
  console.log("Product found:", productDoc);

  if (!productDoc || productDoc.status !== "Enable") {
    console.log("Product not found or disabled");
    return null;
  }

  const centerStock = await CenterStock.findOne({
    center: center,
    product: product,
  });

  console.log("Center stock after restoration:", {
    availableQuantity: centerStock?.availableQuantity,
    totalQuantity: centerStock?.totalQuantity,
    consumedQuantity: centerStock?.consumedQuantity,
  });

  if (!centerStock) {
    console.log("No center stock found for this product");
    return null;
  }

  if (productDoc.trackSerialNumber === "Yes") {
    console.log("Product requires serial number tracking");

    if (
      serialNumbers &&
      Array.isArray(serialNumbers) &&
      serialNumbers.length > 0
    ) {
      console.log("Validating provided serial numbers:", serialNumbers);

      const unavailableSerials = [];
      for (const requestedSerial of serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) =>
            sn.serialNumber === requestedSerial &&
            sn.status === "available" &&
            sn.currentLocation?.toString() === center.toString()
        );

        console.log("Serial validation:", {
          requestedSerial,
          found: !!serial,
          serialStatus: serial?.status,
          serialLocation: serial?.currentLocation?.toString(),
          expectedLocation: center.toString(),
        });

        if (!serial) {
          unavailableSerials.push(requestedSerial);
        }
      }

      if (unavailableSerials.length > 0) {
        console.log(
          `Unavailable serial numbers: ${unavailableSerials.join(", ")}`
        );
        return null;
      }

      console.log("All serial numbers are available");
    } else {
      console.log("No serial numbers provided for serialized product");
      return null;
    }
  } else {
    console.log("Product does not require serial number tracking");

    if (centerStock.availableQuantity < quantity) {
      console.log(
        `Insufficient stock: Available ${centerStock.availableQuantity}, Requested ${quantity}`
      );
      return null;
    }
  }

  const result = {
    product,
    quantity,
    serialNumbers: serialNumbers || [],
    oldStock: centerStock.availableQuantity,
    newStock:
      productDoc.trackSerialNumber === "Yes"
        ? centerStock.availableQuantity - (serialNumbers?.length || 0)
        : centerStock.availableQuantity - quantity,
    totalStock: centerStock.totalQuantity,
    isSerialized: productDoc.trackSerialNumber === "Yes",
  };

  console.log("Validation successful:", result);
  return result;
};

const consumeNewSerials = async (updateData, center, existingStockUsage) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  console.log("=== CONSUMING NEW SERIAL NUMBERS ===");

  for (let item of updateData.items) {
    const product = await Product.findById(item.product);

    if (product && product.trackSerialNumber === "Yes" && item.serialNumbers) {
      const centerStock = await CenterStock.findOne({
        center: center,
        product: item.product,
      });

      if (!centerStock) continue;

      console.log("Consuming serials for product:", product.productTitle);
      console.log("Serials to consume:", item.serialNumbers);

      let actuallyConsumedCount = 0;

      for (const newSerial of item.serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) => sn.serialNumber === newSerial && sn.status === "available"
        );

        if (serial) {
          serial.status = "consumed";
          serial.currentLocation = null;
          serial.consumedDate = new Date();
          serial.transferHistory.push({
            fromCenter: center,
            transferDate: new Date(),
            transferType: "field_usage",
            usageType: updateData.usageType || existingStockUsage.usageType,
            referenceId: existingStockUsage._id,
            remark: updateData.remark || existingStockUsage.remark,
          });
          actuallyConsumedCount++;
          console.log(`✓ Consumed serial ${newSerial}`);
        } else {
          const serialInfo = centerStock.serialNumbers.find(
            (sn) => sn.serialNumber === newSerial
          );
          console.log(
            `✗ Serial ${newSerial} not available for consumption. Status: ${
              serialInfo?.status || "not found"
            }`
          );
          throw new Error(
            `Serial number ${newSerial} is not available for consumption (status: ${
              serialInfo?.status || "not found"
            })`
          );
        }
      }

      if (actuallyConsumedCount > 0) {
        centerStock.availableQuantity -= actuallyConsumedCount;
        centerStock.consumedQuantity += actuallyConsumedCount;

        await centerStock.save();
        console.log(
          `Updated center stock: -${actuallyConsumedCount} available, +${actuallyConsumedCount} consumed`
        );
      }
    } else if (product && product.trackSerialNumber === "No") {
      const centerStock = await CenterStock.findOne({
        center: center,
        product: item.product,
      });

      if (centerStock) {
        const existingItem = existingStockUsage.items.find(
          (ei) => ei.product.toString() === item.product.toString()
        );

        const quantityDifference =
          item.quantity - (existingItem?.quantity || 0);

        if (quantityDifference !== 0) {
          centerStock.availableQuantity -= quantityDifference;
          centerStock.totalQuantity -= quantityDifference;
          await centerStock.save();
          console.log(
            `Updated non-serialized product quantity by ${quantityDifference}`
          );
        }
      }
    }
  }
};

// const updateEntityStockForUsage = async (existingStockUsage, updateData) => {
//   try {
//     console.log("=== UPDATING ENTITY STOCK RECORDS ===");

//     let EntityStock;
//     try {
//       EntityStock = mongoose.model("EntityStock");
//     } catch (error) {
//       console.log("EntityStock model not found, skipping entity stock update");
//       return;
//     }

//     const usageType = updateData.usageType || existingStockUsage.usageType;
//     const entityType = getEntityType(usageType);
//     const oldEntityId = getEntityId(existingStockUsage);
//     const newEntityId = getEntityId({
//       ...existingStockUsage.toObject(),
//       ...updateData,
//     });

//     console.log("Entity update details:", {
//       usageType,
//       entityType,
//       oldEntityId: oldEntityId?.toString(),
//       newEntityId: newEntityId?.toString(),
//     });

//     if (
//       oldEntityId &&
//       newEntityId &&
//       oldEntityId.toString() !== newEntityId.toString()
//     ) {
//       console.log("Entity changed, updating stock for both entities");

//       for (let item of existingStockUsage.items) {
//         await EntityStock.updateStock(
//           entityType,
//           oldEntityId,
//           item.product,
//           -item.quantity,
//           item.serialNumbers || [],
//           existingStockUsage._id
//         );
//       }

//       for (let item of updateData.items) {
//         await EntityStock.updateStock(
//           entityType,
//           newEntityId,
//           item.product,
//           item.quantity,
//           item.serialNumbers || [],
//           existingStockUsage._id
//         );
//       }
//     } else if (
//       oldEntityId &&
//       (!newEntityId || oldEntityId.toString() === newEntityId.toString())
//     ) {
//       console.log("Same entity, updating quantities if changed");

//       for (let i = 0; i < updateData.items.length; i++) {
//         const updatedItem = updateData.items[i];
//         const existingItem = existingStockUsage.items[i];

//         if (
//           existingItem &&
//           updatedItem.product.toString() === existingItem.product.toString()
//         ) {
//           const quantityDifference =
//             updatedItem.quantity - existingItem.quantity;
//           const serialDifference =
//             (updatedItem.serialNumbers || []).length -
//             (existingItem.serialNumbers || []).length;

//           if (quantityDifference !== 0 || serialDifference !== 0) {
//             await EntityStock.updateStock(
//               entityType,
//               oldEntityId,
//               updatedItem.product,
//               quantityDifference,
//               updatedItem.serialNumbers || [],
//               existingStockUsage._id
//             );
//           }
//         }
//       }
//     }

//     console.log("✓ Entity stock records updated successfully");
//   } catch (error) {
//     console.error("Error updating entity stock:", error);
//   }
// };



const updateEntityStockForUsage = async (existingStockUsage, updateData) => {
  try {
    console.log("=== UPDATING ENTITY STOCK RECORDS ===");

    let EntityStock;
    try {
      EntityStock = mongoose.model("EntityStock");
    } catch (error) {
      console.log("EntityStock model not found, skipping entity stock update");
      return;
    }

    const usageType = updateData.usageType || existingStockUsage.usageType;
    const entityType = getEntityType(usageType);
    const oldEntityId = getEntityId(existingStockUsage);
    const newEntityId = getEntityId({
      ...existingStockUsage.toObject(),
      ...updateData,
    });

    console.log("Entity update details:", {
      usageType,
      entityType,
      oldEntityId: oldEntityId?.toString(),
      newEntityId: newEntityId?.toString(),
    });

    if (
      oldEntityId &&
      newEntityId &&
      oldEntityId.toString() !== newEntityId.toString()
    ) {
      console.log("Entity changed, updating stock for both entities");

      for (let item of existingStockUsage.items) {
        const existingEntityStock = await EntityStock.findOne({
          entityType: entityType,
          entityId: oldEntityId,
          product: item.product,
        });

        if (existingEntityStock) {
          const serialsToRemove = item.serialNumbers || [];
          const updatedSerials = existingEntityStock.serialNumbers.filter(
            sn => !serialsToRemove.includes(sn.serialNumber)
          );

          const removedCount = existingEntityStock.serialNumbers.length - updatedSerials.length;

          await EntityStock.findOneAndUpdate(
            { entityType: entityType, entityId: oldEntityId, product: item.product },
            {
              $set: { serialNumbers: updatedSerials },
              $inc: {
                totalQuantity: -removedCount,
                availableQuantity: -removedCount,
              },
              lastUpdated: new Date(),
            }
          );
        }
      }
      for (let item of updateData.items) {
        const existingEntityStock = await EntityStock.findOne({
          entityType: entityType,
          entityId: newEntityId,
          product: item.product,
        });

        const existingSerials = existingEntityStock 
          ? existingEntityStock.serialNumbers.map(sn => sn.serialNumber)
          : [];
        const serialsToUpdate = [];
        const newSerials = [];

        for (const serial of item.serialNumbers || []) {
          if (existingSerials.includes(serial)) {
            serialsToUpdate.push(serial);
          } else {
            newSerials.push(serial);
          }
        }
        if (serialsToUpdate.length > 0 && existingEntityStock) {
          await EntityStock.findOneAndUpdate(
            {
              entityType: entityType,
              entityId: newEntityId,
              product: item.product,
              "serialNumbers.serialNumber": { $in: serialsToUpdate }
            },
            {
              $set: {
                "serialNumbers.$[elem].status": "assigned",
                "serialNumbers.$[elem].lastUpdated": new Date()
              }
            },
            {
              arrayFilters: [
                { "elem.serialNumber": { $in: serialsToUpdate } }
              ]
            }
          );
        }
        if (newSerials.length > 0) {
          await EntityStock.updateStock(
            entityType,
            newEntityId,
            item.product,
            newSerials.length,
            newSerials,
            existingStockUsage._id,
            usageType
          );
        }
      }
    } else if (
      oldEntityId &&
      (!newEntityId || oldEntityId.toString() === newEntityId.toString())
    ) {
      console.log("Same entity, updating quantities if changed");

      for (let i = 0; i < updateData.items.length; i++) {
        const updatedItem = updateData.items[i];
        const existingItem = existingStockUsage.items[i];

        if (
          existingItem &&
          updatedItem.product.toString() === existingItem.product.toString()
        ) {
          const quantityDifference = updatedItem.quantity - existingItem.quantity;
          
          const existingSerials = existingItem.serialNumbers || [];
          const updatedSerials = updatedItem.serialNumbers || [];
          
          const removedSerials = existingSerials.filter(s => !updatedSerials.includes(s));
          const addedSerials = updatedSerials.filter(s => !existingSerials.includes(s));
          const unchangedSerials = existingSerials.filter(s => updatedSerials.includes(s));

          if (quantityDifference !== 0 || removedSerials.length > 0 || addedSerials.length > 0) {
            const existingEntityStock = await EntityStock.findOne({
              entityType: entityType,
              entityId: oldEntityId,
              product: updatedItem.product,
            });

            if (existingEntityStock) {
              let currentSerials = existingEntityStock.serialNumbers;
              if (removedSerials.length > 0) {
                currentSerials = currentSerials.filter(
                  sn => !removedSerials.includes(sn.serialNumber)
                );
              }
              if (unchangedSerials.length > 0) {
                currentSerials = currentSerials.map(sn => 
                  unchangedSerials.includes(sn.serialNumber) 
                    ? { ...sn.toObject(), status: "assigned", lastUpdated: new Date() }
                    : sn
                );
              }
              const existingSerialNumbers = currentSerials.map(sn => sn.serialNumber);
              const newSerialsToAdd = addedSerials
                .filter(serial => !existingSerialNumbers.includes(serial))
                .map(serial => ({
                  serialNumber: serial,
                  status: "assigned",
                  assignedDate: new Date(),
                  usageReference: existingStockUsage._id,
                  usageType: usageType,
                }));

              if (newSerialsToAdd.length > 0) {
                currentSerials.push(...newSerialsToAdd);
              }

              await EntityStock.findOneAndUpdate(
                { entityType: entityType, entityId: oldEntityId, product: updatedItem.product },
                {
                  $set: { serialNumbers: currentSerials },
                  $inc: {
                    totalQuantity: quantityDifference,
                    availableQuantity: quantityDifference,
                  },
                  lastUpdated: new Date(),
                },
                { new: true }
              );
            }
          }
        }
      }
    }

    console.log("✓ Entity stock records updated successfully");
  } catch (error) {
    console.error("Error updating entity stock:", error);
  }
};

const getEntityType = (usageType) => {
  switch (usageType) {
    case "Customer":
      return "customer";
    case "Building":
    case "Building to Building":
      return "building";
    case "Control Room":
      return "controlRoom";
    default:
        return "other";
  }
};

const getEntityId = (stockUsage) => {
  switch (stockUsage.usageType) {
    case "Customer":
      return stockUsage.customer;
    case "Building":
      return stockUsage.fromBuilding;
    case "Building to Building":
      return stockUsage.toBuilding;
    case "Control Room":
      return stockUsage.fromControlRoom;
    default:
      return null;
  }
};

export const deleteStockUsage = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const filter = { _id: id };

    if (
      permissions.manage_usage_own_center &&
      !permissions.manage_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const stockUsage = await StockUsage.findById(id);
    if (!stockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    if (stockUsage.status === "completed") {
      await restoreStock(stockUsage);
    }

    await StockUsage.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Stock usage deleted successfully",
    });
  } catch (error) {
    console.error("Delete stock usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete stock usage record",
    });
  }
};

export const cancelStockUsage = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const filter = { _id: id };

    if (
      permissions.manage_usage_own_center &&
      !permissions.manage_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const stockUsage = await StockUsage.findById(id);
    if (!stockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    await stockUsage.cancelStockUsage();

    res.json({
      success: true,
      message: "Stock usage cancelled successfully",
      data: stockUsage,
    });
  } catch (error) {
    console.error("Cancel stock usage error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel stock usage",
    });
  }
};

const validateUsageTypeFields = async (usageType, fields) => {
  const { customer, fromBuilding, toBuilding, fromControlRoom } = fields;

  switch (usageType) {
    case "Customer":
      if (!customer) return "Customer is required for customer usage type";
      if (!mongoose.Types.ObjectId.isValid(customer))
        return "Invalid customer ID";
      const customerExists = await Customer.findById(customer);
      if (!customerExists) return "Customer not found";
      break;

    case "Building":
      if (!fromBuilding)
        return "From Building is required for building usage type";
      if (!mongoose.Types.ObjectId.isValid(fromBuilding))
        return "Invalid from building ID";
      const fromBuildingExists = await Building.findById(fromBuilding);
      if (!fromBuildingExists) return "From building not found";
      break;

    case "Building to Building":
      if (!fromBuilding || !toBuilding)
        return "Both From Building and To Building are required for building to building usage type";
      if (
        !mongoose.Types.ObjectId.isValid(fromBuilding) ||
        !mongoose.Types.ObjectId.isValid(toBuilding)
      )
        return "Invalid building IDs";
      const fromBldgExists = await Building.findById(fromBuilding);
      const toBldgExists = await Building.findById(toBuilding);
      if (!fromBldgExists || !toBldgExists)
        return "One or both buildings not found";
      break;

    case "Control Room":
      if (!fromControlRoom)
        return "From Control Room is required for control room usage type";
      if (!mongoose.Types.ObjectId.isValid(fromControlRoom))
        return "Invalid control room ID";
      const controlRoomExists = await ControlRoom.findById(fromControlRoom);
      if (!controlRoomExists) return "Control room not found";
      break;
  }

  return null;
};

const addUsageTypeSpecificFields = (stockUsageData, fields) => {
  const {
    customer,
    connectionType,
    packageAmount,
    packageDuration,
    onuCharges,
    installationCharges,
    reason,
    shiftingAmount,
    wireChangeAmount,
    fromBuilding,
    toBuilding,
    fromControlRoom,
  } = fields;

  switch (stockUsageData.usageType) {
    case "Customer":
      stockUsageData.customer = customer;
      stockUsageData.connectionType = connectionType;
      stockUsageData.packageAmount = packageAmount;
      stockUsageData.packageDuration = packageDuration;
      stockUsageData.onuCharges = onuCharges;
      stockUsageData.installationCharges = installationCharges;
      stockUsageData.reason = reason;
      stockUsageData.shiftingAmount = shiftingAmount;
      stockUsageData.wireChangeAmount = wireChangeAmount;
      break;

    case "Building":
      stockUsageData.fromBuilding = fromBuilding;
      break;

    case "Building to Building":
      stockUsageData.fromBuilding = fromBuilding;
      stockUsageData.toBuilding = toBuilding;
      break;

    case "Control Room":
      stockUsageData.fromControlRoom = fromControlRoom;
      break;
  }
};

const restoreStock = async (stockUsage, session) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product).session(session);

    if (product.trackSerialNumber === "No") {
      await CenterStock.findOneAndUpdate(
        {
          center: stockUsage.center,
          product: item.product,
        },
        {
          $inc: {
            totalQuantity: item.quantity,
            availableQuantity: item.quantity,
          },
        },
        { session }
      );
    }
  }
};



export const approveDamageRequest = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(req, [
      "accept_damage_return",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. accept_damage_return permission required.",
      });
    }

    const { id } = req.params;
    const { approvalRemark } = req.body;

    const approvedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const { permissions, userCenter } = checkStockUsagePermissions(req, [
      "view_usage_own_center",
      "view_usage_all_center",
    ]);
    const filter = { _id: id, usageType: "Damage Return" };

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const stockUsage = await StockUsage.findById(id);
    if (!stockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    if (stockUsage.usageType !== "Damage Return") {
      return res.status(400).json({
        success: false,
        message: "Only damage requests can be approved",
      });
    }

    if (stockUsage.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Damage request is already completed",
      });
    }

    await processDamageApproval(stockUsage, approvedBy, approvalRemark);

    stockUsage.status = "completed";
    stockUsage.approvedBy = approvedBy;
    stockUsage.approvalRemark = approvalRemark;
    stockUsage.approvalDate = new Date();
    await stockUsage.save();

    const populatedStockUsage = await StockUsage.findById(stockUsage._id)
      .populate("center", "name centerType")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber",
      })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json({
      success: true,
      message: "Damage request approved successfully",
      data: populatedStockUsage,
    });
  } catch (error) {
    console.error("Approve damage request error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to approve damage request",
    });
  }
};

/**
 * Reject damage request
 * - Changes stock usage status to "cancelled"
 * - Restores serial numbers to "available" status in center stock
 * - Restores center stock quantities
 */
export const rejectDamageRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { id } = req.params;
    const { rejectionRemark } = req.body;

    const rejectedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const filter = { _id: id, usageType: "Damage Return" };

    if (
      permissions.manage_usage_own_center &&
      !permissions.manage_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    }

    const stockUsage = await StockUsage.findById(id);
    if (!stockUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    if (stockUsage.usageType !== "Damage Return") {
      return res.status(400).json({
        success: false,
        message: "Only damage requests can be rejected",
      });
    }

    if (stockUsage.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot reject a completed damage request",
      });
    }

    if (stockUsage.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Damage request is already cancelled",
      });
    }

    await processDamageRejection(stockUsage, rejectedBy, rejectionRemark);

    stockUsage.status = "cancelled";
    stockUsage.rejectedBy = rejectedBy;
    stockUsage.rejectionRemark = rejectionRemark;
    stockUsage.rejectionDate = new Date();
    await stockUsage.save();

    const populatedStockUsage = await StockUsage.findById(stockUsage._id)
      .populate("center", "name centerType")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber",
      })
      .populate("createdBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: "Damage request rejected successfully",
      data: populatedStockUsage,
    });
  } catch (error) {
    console.error("Reject damage request error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject damage request",
    });
  }
};

/**
 * Get pending damage requests
 */
export const getPendingDamageRequests = async (req, res) => {
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

    const { center, page = 1, limit = 10, startDate, endDate } = req.query;

    const filter = {
      usageType: "Damage Return",
      status: "pending",
    };

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const damageRequests = await StockUsage.find(filter)
      .populate("center", "name centerType")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber",
      })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await StockUsage.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: damageRequests,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get pending damage requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending damage requests",
    });
  }
};

/**
 * Process damage approval - mark items as damaged in center stock
 */
/**
 * Process damage approval - mark items as damaged in center stock
 */
/**
 * Process damage approval - mark items as damaged in center stock
 */
const processDamageApproval = async (
  stockUsage,
  approvedBy,
  approvalRemark
) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  console.log("=== PROCESSING DAMAGE APPROVAL ===");

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product);
    const centerStock = await CenterStock.findOne({
      center: stockUsage.center,
      product: item.product,
    });

    if (!centerStock) {
      console.log(`No center stock found for product: ${item.product}`);
      continue;
    }

    console.log(
      `Processing damage approval for product: ${product?.productTitle}`
    );

    if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
      console.log("Processing serialized product damage approval");

      for (const serialNumber of item.serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) => sn.serialNumber === serialNumber && sn.status === "consumed"
        );

        if (serial) {
          serial.status = "damaged";
          serial.consumedDate = new Date();
          serial.consumedBy = approvedBy;
          serial.transferHistory.push({
            fromCenter: stockUsage.center,
            transferDate: new Date(),
            transferType: "damage_approved",
            referenceId: stockUsage._id,
            remark: approvalRemark || "Damage approved - marked as damaged",
          });
          console.log(`✓ Approved damage for serial ${serialNumber}`);
        } else {
          console.log(
            `✗ Serial ${serialNumber} not found or not in consumed status`
          );
        }
      }
    } else {
      console.log("Processing non-serialized product damage approval");
      console.log(`Damage approved for ${item.quantity} units`);
    }

    await centerStock.save();
    console.log(
      `✓ Damage approval processed for product: ${product?.productTitle}`
    );
  }

  await addStockToUsageEntity(stockUsage);

  console.log("=== DAMAGE APPROVAL PROCESSING COMPLETED ===");
};

/**
 * Process damage rejection - restore items to available status
 */
const processDamageRejection = async (
  stockUsage,
  rejectedBy,
  rejectionRemark
) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  console.log("=== PROCESSING DAMAGE REJECTION ===");

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product);
    const centerStock = await CenterStock.findOne({
      center: stockUsage.center,
      product: item.product,
    });

    if (!centerStock) {
      console.log(`No center stock found for product: ${item.product}`);
      continue;
    }

    console.log(
      `Processing damage rejection for product: ${product?.productTitle}`
    );

    if (product.trackSerialNumber === "Yes" && item.serialNumbers) {
      console.log("Processing serialized product damage rejection");

      let restoredCount = 0;

      for (const serialNumber of item.serialNumbers) {
        const serial = centerStock.serialNumbers.find(
          (sn) => sn.serialNumber === serialNumber && sn.status === "consumed"
        );

        if (serial) {
          serial.status = "available";
          serial.currentLocation = stockUsage.center;
          serial.consumedDate = null;
          serial.consumedBy = null;
          serial.transferHistory.push({
            fromCenter: null,
            toCenter: stockUsage.center,
            transferDate: new Date(),
            transferType: "damage_rejected",
            referenceId: stockUsage._id,
            remark: rejectionRemark || "Damage rejected - stock restored",
          });
          restoredCount++;
          console.log(`✓ Restored serial ${serialNumber} to available status`);
        } else {
          console.log(
            `✗ Serial ${serialNumber} not found or not in consumed status`
          );
        }
      }

      if (restoredCount > 0) {
        centerStock.availableQuantity += restoredCount;
        centerStock.consumedQuantity = Math.max(
          0,
          centerStock.consumedQuantity - restoredCount
        );
      }
    } else {
      console.log("Processing non-serialized product damage rejection");

      centerStock.availableQuantity += item.quantity;
      centerStock.totalQuantity += item.quantity;

      console.log(
        `Restored quantities: +${item.quantity} available, +${item.quantity} total`
      );
    }

    await centerStock.save();
    console.log(
      `✓ Damage rejection processed for product: ${product?.productTitle}`
    );
  }

  console.log("=== DAMAGE REJECTION PROCESSING COMPLETED ===");
};
/**
 * Get damage requests by status (for reporting)
 */
export const getDamageRequestsByStatus = async (req, res) => {
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
      status,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {
      usageType: "Damage",
    };

    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const damageRequests = await StockUsage.find(filter)
      .populate("center", "name centerType")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber",
      })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await StockUsage.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const stats = await StockUsage.aggregate([
      { $match: { ...filter, usageType: "Damage" } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalItems: { $sum: { $size: "$items" } },
        },
      },
    ]);

    res.json({
      success: true,
      data: damageRequests,
      statistics: stats,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get damage requests by status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch damage requests",
    });
  }
};

/**
 * Reserve stock for damage requests without consuming it
 * This marks serial numbers as 'consumed' temporarily until approval
 */
const reserveStockForDamage = async (stockUsage) => {
  const CenterStock = mongoose.model("CenterStock");
  const Product = mongoose.model("Product");

  console.log("=== RESERVING STOCK FOR DAMAGE REQUEST ===");

  for (let item of stockUsage.items) {
    const product = await Product.findById(item.product);
    const centerStock = await CenterStock.findOne({
      center: stockUsage.center,
      product: item.product,
    });

    if (!centerStock) {
      console.log(`No center stock found for product: ${item.product}`);
      continue;
    }

    console.log(
      `Reserving stock for damage - Product: ${product?.productTitle}`
    );

    if (product.trackSerialNumber === "Yes") {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        for (const serialNumber of item.serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (sn) =>
              sn.serialNumber === serialNumber && sn.status === "available"
          );

          if (serial) {
            serial.status = "consumed";
            serial.currentLocation = null;
            serial.transferHistory.push({
              fromCenter: stockUsage.center,
              transferDate: new Date(),
              transferType: "damage_reserved",
              usageType: stockUsage.usageType,
              referenceId: stockUsage._id,
              remark: "Reserved for damage approval",
            });
            console.log(
              `✓ Reserved serial ${serialNumber} for damage approval`
            );
          }
        }
      }

      centerStock.availableQuantity -= item.quantity;
      centerStock.consumedQuantity += item.quantity;
    } else {
      centerStock.availableQuantity -= item.quantity;
      centerStock.totalQuantity -= item.quantity;
      console.log(`Reserved ${item.quantity} units for damage approval`);
    }

    await centerStock.save();
    console.log(
      `✓ Stock reserved for damage - Product: ${product?.productTitle}`
    );
  }

  console.log("=== STOCK RESERVATION FOR DAMAGE COMPLETED ===");
};

const buildDateFilter = (dateFilter, startDate, endDate) => {
  const now = new Date();
  let dateQuery = {};

  if (dateFilter) {
    switch (dateFilter) {
      case "Today":
        dateQuery = {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lte: new Date(now.setHours(23, 59, 59, 999)),
        };
        break;

      case "Yesterday":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        dateQuery = {
          $gte: new Date(yesterday.setHours(0, 0, 0, 0)),
          $lte: new Date(yesterday.setHours(23, 59, 59, 999)),
        };
        break;

      case "This Week":
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        dateQuery = {
          $gte: new Date(startOfWeek.setHours(0, 0, 0, 0)),
          $lte: new Date(now.setHours(23, 59, 59, 999)),
        };
        break;

      case "Last Week":
        const startOfLastWeek = new Date(now);
        startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
        const endOfLastWeek = new Date(now);
        endOfLastWeek.setDate(now.getDate() - now.getDay());
        dateQuery = {
          $gte: new Date(startOfLastWeek.setHours(0, 0, 0, 0)),
          $lte: new Date(endOfLastWeek.setHours(23, 59, 59, 999)),
        };
        break;

      case "This Month":
        dateQuery = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          ),
        };
        break;

      case "Last Month":
        dateQuery = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          $lte: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
        };
        break;

      case "This Year":
        dateQuery = {
          $gte: new Date(now.getFullYear(), 0, 1),
          $lte: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
        };
        break;

      case "Last Year":
        dateQuery = {
          $gte: new Date(now.getFullYear() - 1, 0, 1),
          $lte: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
        };
        break;
    }
  }

  if (startDate || endDate) {
    dateQuery = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(endDate);
  }

  return dateQuery;
};

export const getStockUsageByCustomer = async (req, res) => {
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
    const { customerId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      status,
      product,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      center: userCenter,
    }).populate("center", "centerName centerCode");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer",
      });
    }

    const query = {
      usageType: "Customer",
      customer: customerId,
      center: userCenterId,
    };

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

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode address")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email")
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

        formattedData.push({
          _id: usage._id,
          Date: usage.date.toLocaleDateString(),
          Type: usage.usageType,
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": damageQty,
          "New Stock": item.newStock || 0,
          "Connection Type": usage.connectionType || "N/A",
          Remark: usage.remark || "",
          Status: usage.status,
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      customer: {
        id: customer._id,
        name: customer.name,
        username: customer.username,
        mobile: customer.mobile,
        currentCenter: customer.center,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by customer:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Get stock usage by building - AUTHENTICATED WITH USER CENTER
 */
export const getStockUsageByBuilding = async (req, res) => {
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

    const { buildingId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      status,
      product,
      usageType = "all",
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const building = await Building.findOne({
      _id: buildingId,
      center: userCenter,
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found or you don't have access to this building",
      });
    }

    const query = {
      center: userCenterId,
      $or: [
        { usageType: "Building", fromBuilding: buildingId },
        {
          usageType: "Building to Building",
          $or: [{ fromBuilding: buildingId }, { toBuilding: buildingId }],
        },
      ],
    };

    if (usageType && usageType !== "all") {
      if (usageType === "Building") {
        query.$or = [{ usageType: "Building", fromBuilding: buildingId }];
      } else if (usageType === "Building to Building") {
        query.$or = [
          { usageType: "Building to Building", fromBuilding: buildingId },
          { usageType: "Building to Building", toBuilding: buildingId },
        ];
      }
    }

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

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode address")
      .populate("fromBuilding", "buildingName displayName address1")
      .populate("toBuilding", "buildingName displayName address1")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const formattedData = [];

    stockUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        let transferType = "Usage";
        if (usage.usageType === "Building to Building") {
          if (usage.fromBuilding?._id.toString() === buildingId) {
            transferType = "Outgoing Transfer";
          } else if (usage.toBuilding?._id.toString() === buildingId) {
            transferType = "Incoming Transfer";
          }
        }

        formattedData.push({
          _id: usage._id,
          Date: usage.date.toLocaleDateString(),
          Type: transferType,
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": 0,
          "New Stock": item.newStock || 0,
          "From Building": usage.fromBuilding?.buildingName || "N/A",
          "To Building": usage.toBuilding?.buildingName || "N/A",
          Remark: usage.remark || "",
          Status: usage.status,
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      building: {
        id: building._id,
        name: building.buildingName,
        displayName: building.displayName,
        address: building.address1,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by building:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Get stock usage by control room - AUTHENTICATED WITH USER CENTER
 */
export const getStockUsageByControlRoom = async (req, res) => {
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

    const { controlRoomId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      status,
      product,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const controlRoom = await ControlRoom.findOne({
      _id: controlRoomId,
      center: userCenterId,
    });
    if (!controlRoom) {
      return res.status(404).json({
        success: false,
        message:
          "Control room not found or you don't have access to this control room",
      });
    }

    const query = {
      usageType: "Control Room",
      fromControlRoom: controlRoomId,
      center: userCenterId,
    };

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

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode address")
      .populate("fromControlRoom", "buildingName displayName address1")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const formattedData = [];

    stockUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        formattedData.push({
          _id: usage._id,
          Date: usage.date.toLocaleDateString(),
          Type: usage.usageType,
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": 0,
          "New Stock": item.newStock || 0,
          "Control Room":
            usage.fromControlRoom?.buildingName || "Unknown Control Room",
          Remark: usage.remark || "",
          Status: usage.status,
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      controlRoom: {
        id: controlRoom._id,
        name: controlRoom.buildingName,
        displayName: controlRoom.displayName,
        address: controlRoom.address1,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by control room:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Get stock usage by center - ONLY ALLOW ACCESS TO USER'S OWN CENTER
 */

export const getStockUsageByCenter = async (req, res) => {
  try {
    const { centerId } = req.params;
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
    } = req.query;

    const userCenter = req.user.center?._id || req.user.center;

    if (!userCenter) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    if (centerId !== userCenter.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own center's data",
      });
    }

    const center = await Center.findById(userCenter);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    const query = { center: userCenter };

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

    const stockUsages = await StockUsage.find(query)
      .populate("customer", "name username mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category",
      })
      .populate("createdBy", "name email")
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
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          "Old Stock": item.oldStock || 0,
          Qty: item.quantity,
          "Damage Qty": damageQty,
          "New Stock": item.newStock || 0,
          Entity: entityName,
          Remark: usage.remark || "",
          Status: usage.status,
          "Created By": usage.createdBy?.name || "Unknown",
          "Created At": usage.createdAt.toLocaleDateString(),
        });
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      center: {
        id: center._id,
        name: center.centerName,
        code: center.centerCode,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching stock usage by center:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getProductDevicesByCustomer = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
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

    const { customerId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      product,
      connectionType,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      center: userCenterId,
    }).populate("center", "centerName centerCode");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or you don't have access to this customer",
      });
    }

    const query = {
      usageType: "Customer",
      customer: customerId,
      center: userCenterId,
      status: "completed",
      "items.serialNumbers.0": { $exists: true },
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (product) query["items.product"] = product;
    if (connectionType) query.connectionType = connectionType;

    const total = await StockUsage.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode")
      .populate({
        path: "items.product",
        select: "productTitle productCode category trackSerialNumber _id",
        match: { trackSerialNumber: "Yes" },
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const filteredUsages = stockUsages
      .map((usage) => ({
        ...usage.toObject(),
        items: usage.items.filter(
          (item) =>
            item.product !== null &&
            item.serialNumbers &&
            item.serialNumbers.length > 0
        ),
      }))
      .filter((usage) => usage.items.length > 0);

    const formattedData = [];

    filteredUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        if (
          item.serialNumbers &&
          item.serialNumbers.length > 0 &&
          item.product
        ) {
          item.serialNumbers.forEach((serialNumber) => {
            formattedData.push({
              _id: `${usage._id}_${serialNumber}`,
              usageId: usage._id,
              center: {
                id: usage.center?._id,
                name: usage.center?.centerName,
                code: usage.center?.centerCode,
              },
    
              itemId: item._id,
              productId: item.product._id,
              Product: item.product.productTitle || "Unknown Product",
              "Serial No.": serialNumber,
              Type: usage.usageType,
              Date: usage.date.toLocaleDateString(),
              "Connection Type": usage.connectionType || "N/A",
              "Package Amount": usage.packageAmount || 0,
              "Package Duration": usage.packageDuration || "N/A",
              "ONU Charges": usage.onuCharges || 0,
              "Installation Charges": usage.installationCharges || 0,
              Remark: usage.remark || "",
              Option: getConnectionOption(usage.connectionType, usage.reason),
              Status: usage.status,
              "Product Code": item.product.productCode || "N/A",
              "Assigned Date": usage.date.toLocaleDateString(),
              "Product Category": item.product.category || "N/A",
              createdBy: usage.createdBy ? {
                id: usage.createdBy._id,
                name: usage.createdBy.name,
                email: usage.createdBy.email
              } : null,
            });
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      customer: {
        id: customer._id,
        name: customer.name,
        username: customer.username,
        mobile: customer.mobile,
        email: customer.email,
      },
      pagination: {
        total: formattedData.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(formattedData.length / limit),
      },
      summary: {
        totalDevices: formattedData.length,
        uniqueProducts: [...new Set(formattedData.map((item) => item.Product))]
          .length,
        connectionTypes: getConnectionTypeSummary(formattedData),
        centers: [...new Set(formattedData.map(item => item.center?.name).filter(Boolean))],
      },
    });
  } catch (error) {
    console.error("Error fetching product devices by customer:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


export const getProductDevicesByBuilding = async (req, res) => {
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

    const { buildingId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      product,
      usageType = "all",
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const building = await Building.findOne({
      _id: buildingId,
      center: userCenterId,
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found or you don't have access to this building",
      });
    }

    const query = {
      center: userCenterId,
      status: "completed",
      "items.serialNumbers.0": { $exists: true },
      $or: [
        { usageType: "Building", fromBuilding: buildingId },
        {
          usageType: "Building to Building",
          $or: [{ fromBuilding: buildingId }, { toBuilding: buildingId }],
        },
      ],
    };

    if (usageType && usageType !== "all") {
      if (usageType === "Building") {
        query.$or = [{ usageType: "Building", fromBuilding: buildingId }];
      } else if (usageType === "Building to Building") {
        query.$or = [
          { usageType: "Building to Building", fromBuilding: buildingId },
          { usageType: "Building to Building", toBuilding: buildingId },
        ];
      }
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (product) query["items.product"] = product;

    const total = await StockUsage.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category trackSerialNumber _id",
        match: { trackSerialNumber: "Yes" },
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const filteredUsages = stockUsages
      .map((usage) => ({
        ...usage.toObject(),
        items: usage.items.filter(
          (item) =>
            item.product !== null &&
            item.serialNumbers &&
            item.serialNumbers.length > 0
        ),
      }))
      .filter((usage) => usage.items.length > 0);

    const formattedData = [];

    filteredUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        if (
          item.serialNumbers &&
          item.serialNumbers.length > 0 &&
          item.product
        ) {
          let transferType = "Building Usage";
          if (usage.usageType === "Building to Building") {
            if (usage.fromBuilding?._id.toString() === buildingId) {
              transferType = "Outgoing Transfer";
            } else if (usage.toBuilding?._id.toString() === buildingId) {
              transferType = "Incoming Transfer";
            }
          }

          item.serialNumbers.forEach((serialNumber) => {
            formattedData.push({
              _id: `${usage._id}_${serialNumber}`,
              usageId: usage._id, 
              center: {
                id: usage.center?._id,
                name: usage.center?.centerName,
                code: usage.center?.centerCode,
              },
              productId: item.product._id, 
              Product: item.product.productTitle || "Unknown Product",
              "Serial No.": serialNumber,
              Type: transferType,
              Date: usage.date.toLocaleDateString(),
              "Connection Type": "Building Assignment",
              "Package Amount": 0,
              "Package Duration": "N/A",
              "ONU Charges": 0,
              "Installation Charges": 0,
              Remark: usage.remark || `Building: ${building.buildingName}`,
              Option: transferType,
              Status: usage.status,
              "Product Code": item.product.productCode || "N/A",
              "From Building": usage.fromBuilding?.buildingName || "N/A",
              "To Building": usage.toBuilding?.buildingName || "N/A",
              "Assigned Date": usage.date.toLocaleDateString(),
              "Product Category": item.product.category || "N/A",
            });
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      building: {
        id: building._id,
        name: building.buildingName,
        displayName: building.displayName,
        address: building.address1,
      },
      pagination: {
        total: formattedData.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(formattedData.length / limit),
      },
      summary: {
        totalDevices: formattedData.length,
        uniqueProducts: [...new Set(formattedData.map((item) => item.Product))]
          .length,
        incomingTransfers: formattedData.filter(
          (item) => item.Type === "Incoming Transfer"
        ).length,
        outgoingTransfers: formattedData.filter(
          (item) => item.Type === "Outgoing Transfer"
        ).length,
        buildingUsage: formattedData.filter(
          (item) => item.Type === "Building Usage"
        ).length,
      },
    });
  } catch (error) {
    console.error("Error fetching product devices by building:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Get product devices by control room - ONLY products with trackSerialNumber = "Yes"
 */
export const getProductDevicesByControlRoom = async (req, res) => {
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

    const { controlRoomId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      product,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const userCenterId = userCenter?._id || userCenter;
    if (!userCenterId) {
      return res.status(400).json({
        success: false,
        message: "User must be associated with a center",
      });
    }

    const controlRoom = await ControlRoom.findOne({
      _id: controlRoomId,
      center: userCenterId,
    });

    if (!controlRoom) {
      return res.status(404).json({
        success: false,
        message:
          "Control room not found or you don't have access to this control room",
      });
    }

    const query = {
      usageType: "Control Room",
      fromControlRoom: controlRoomId,
      center: userCenterId,
      status: "completed",
      "items.serialNumbers.0": { $exists: true },
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (product) query["items.product"] = product;

    const total = await StockUsage.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsages = await StockUsage.find(query)
      .populate("center", "centerName centerCode")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category trackSerialNumber _id",
        match: { trackSerialNumber: "Yes" },
      })
      .populate("createdBy", "name email")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));

    const filteredUsages = stockUsages
      .map((usage) => ({
        ...usage.toObject(),
        items: usage.items.filter(
          (item) =>
            item.product !== null &&
            item.serialNumbers &&
            item.serialNumbers.length > 0
        ),
      }))
      .filter((usage) => usage.items.length > 0);

    const formattedData = [];

    filteredUsages.forEach((usage) => {
      usage.items.forEach((item) => {
        if (
          item.serialNumbers &&
          item.serialNumbers.length > 0 &&
          item.product
        ) {
          item.serialNumbers.forEach((serialNumber) => {
            formattedData.push({
              _id: `${usage._id}_${serialNumber}`,
              usageId: usage._id, 
              Product: item.product.productTitle || "Unknown Product",
              "Serial No.": serialNumber,
              Type: usage.usageType,
              Date: usage.date.toLocaleDateString(),
              "Connection Type": "Control Room Assignment",
              "Package Amount": 0,
              "Package Duration": "N/A",
              "ONU Charges": 0,
              "Installation Charges": 0,
              Remark:
                usage.remark || `Control Room: ${controlRoom.buildingName}`,
              Option: "Infrastructure",
              Status: usage.status,
              "Product Code": item.product.productCode || "N/A",
              "Control Room": usage.fromControlRoom?.buildingName || "Unknown",
              "Assigned Date": usage.date.toLocaleDateString(),
              "Product Category": item.product.category || "N/A",
            });
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      controlRoom: {
        id: controlRoom._id,
        name: controlRoom.buildingName,
        displayName: controlRoom.displayName,
        address: controlRoom.address1,
      },
      pagination: {
        total: formattedData.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(formattedData.length / limit),
      },
      summary: {
        totalDevices: formattedData.length,
        uniqueProducts: [...new Set(formattedData.map((item) => item.Product))]
          .length,
      },
    });
  } catch (error) {
    console.error("Error fetching product devices by control room:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getConnectionOption = (connectionType, reason) => {
  if (connectionType === "NC") return "New Connection";
  if (connectionType === "Convert") return "Conversion";
  if (connectionType === "Shifting") return "Shifting";
  if (connectionType === "Repair") return "Repair";
  if (reason === "NC") return "New Connection";
  if (reason === "Convert") return "Conversion";
  if (reason === "Shifting") return "Shifting";
  if (reason === "Repair") return "Repair";
  return "Other";
};

const getEntityInfo = (usage, serialNumber) => {
  switch (usage.usageType) {
    case "Customer":
      return {
        name: usage.customer?.name || "Unknown Customer",
        type: "Customer",
        connectionType: usage.connectionType || "Customer Assignment",
        remark:
          usage.remark || `Customer: ${usage.customer?.name || "Unknown"}`,
        option: getConnectionOption(usage.connectionType, usage.reason),
      };
    case "Building":
      return {
        name: usage.fromBuilding?.buildingName || "Unknown Building",
        type: "Building",
        connectionType: "Building Assignment",
        remark:
          usage.remark ||
          `Building: ${usage.fromBuilding?.buildingName || "Unknown"}`,
        option: "Infrastructure",
      };
    case "Building to Building":
      const isFromBuilding = usage.fromBuilding ? true : false;
      return {
        name: isFromBuilding
          ? `From: ${usage.fromBuilding?.buildingName || "Unknown"}`
          : `To: ${usage.toBuilding?.buildingName || "Unknown"}`,
        type: "Building Transfer",
        connectionType: "Building Transfer",
        remark:
          usage.remark ||
          `Transfer: ${usage.fromBuilding?.buildingName || "Unknown"} → ${
            usage.toBuilding?.buildingName || "Unknown"
          }`,
        option: isFromBuilding ? "Outgoing Transfer" : "Incoming Transfer",
      };
    case "Control Room":
      return {
        name: usage.fromControlRoom?.buildingName || "Unknown Control Room",
        type: "Control Room",
        connectionType: "Control Room Assignment",
        remark:
          usage.remark ||
          `Control Room: ${usage.fromControlRoom?.buildingName || "Unknown"}`,
        option: "Infrastructure",
      };
    default:
      return {
        name: "Unknown Entity",
        type: usage.usageType,
        connectionType: usage.usageType,
        remark: usage.remark || usage.usageType,
        option: usage.usageType,
      };
  }
};


const getConnectionTypeSummary = (data) => {
  const summary = {};
  data.forEach((item) => {
    const connectionType = item["Connection Type"] || "Unknown";
    summary[connectionType] = (summary[connectionType] || 0) + 1;
  });
  return summary;
};





/********************** DAMAGE RETURN ****************************/


export const changeToDamageReturn = async (req, res) => {
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

    const { id } = req.params;
    const { remark } = req.body;
    const changedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock usage ID",
      });
    }

    const existingUsage = await StockUsage.findById(id)
      .populate("center", "name centerType")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber"
      });

    if (!existingUsage) {
      return res.status(404).json({
        success: false,
        message: "Stock usage record not found",
      });
    }

    if (existingUsage.usageType === "Damage Return") {
      return res.status(400).json({
        success: false,
        message: "This entry is already a Damage Return",
      });
    }

    const originalUsageType = existingUsage.usageType;
    
    existingUsage.usageType = "Damage Return";
    existingUsage.originalUsageType = originalUsageType;
    existingUsage.remark = remark || `Changed from ${originalUsageType} to Damage Return`;
    existingUsage.changedBy = changedBy;
    existingUsage.changeDate = new Date();
    existingUsage.status = "pending"
    await existingUsage.save();

    const populatedUsage = await StockUsage.findById(existingUsage._id)
      .populate("center", "name centerType")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode trackSerialNumber"
      })
      .populate("createdBy", "name email")
      .populate("changedBy", "name email");

    res.json({
      success: true,
      message: `Usage type changed from ${originalUsageType} to Damage Return successfully`,
      data: populatedUsage
    });

  } catch (error) {
    console.error("Change to damage return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to change to damage return",
    });
  }
};


/**
 * Get all Damage Return records with statistics
 */
export const getDamageReturnRecordsWithStats = async (req, res) => {
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
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const filter = {
      usageType: "Damage Return"
    };

    // Apply center filter based on permissions
    if (
      permissions.view_usage_own_center &&
      !permissions.view_usage_all_center &&
      userCenter
    ) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    // Date filtering
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (status) filter.status = status;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get records
    const damageReturnRecords = await StockUsage.find(filter)
      .populate("center", "name centerType centerName")
      .populate("customer", "username name mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode category trackSerialNumber"
      })
      .populate("createdBy", "name email")
      .populate("changedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await StockUsage.countDocuments(filter);

    // Get statistics
    const stats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalItems: { $sum: "$items.quantity" },
          totalValue: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
          uniqueProducts: { $addToSet: "$items.product" }
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

    // Get status distribution
    const statusStats = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get original usage type distribution
    const originalTypeStats = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$originalUsageType",
          count: { $sum: 1 }
        }
      }
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: damageReturnRecords,
      statistics: {
        totalRecords: total,
        totalItems: stats[0]?.totalItems || 0,
        totalValue: stats[0]?.totalValue || 0,
        uniqueProducts: stats[0]?.uniqueProductCount || 0,
        statusDistribution: statusStats,
        originalTypeDistribution: originalTypeStats
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
    console.error("Get damage return records with stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch damage return records",
    });
  }
};


// export const replaceProductSerial = async (req, res) => {
//   try {
//     const { hasAccess } = checkStockUsagePermissions(
//       req,
//       ["manage_usage_own_center", "manage_usage_all_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
//       });
//     }

//     const {
//       originalUsageId,
//       productId,
//       oldSerialNumber,
//       newSerialNumber
//     } = req.body;

//     const replacedBy = req.user.id;

//     console.log("=== SERIAL NUMBER REPLACEMENT REQUEST ===");
//     console.log("Request Body:", {
//       originalUsageId,
//       productId,
//       oldSerialNumber,
//       newSerialNumber
//     });
//     if (!originalUsageId || !productId || !oldSerialNumber || !newSerialNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "All fields are required: originalUsageId, productId, oldSerialNumber, newSerialNumber"
//       });
//     }

//     if (!mongoose.Types.ObjectId.isValid(originalUsageId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid originalUsageId format"
//       });
//     }

//     if (!mongoose.Types.ObjectId.isValid(productId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid productId format"
//       });
//     }

//     try {
//       const userCenterId = await getUserCenterId(req.user._id);
      
//       const StockUsage = mongoose.model("StockUsage");
//       const originalUsage = await StockUsage.findById(originalUsageId);
      
//       if (!originalUsage) {
//         return res.status(404).json({
//           success: false,
//           message: `Original stock usage record not found with ID: ${originalUsageId}`
//         });
//       }
//       if (originalUsage.center.toString() !== userCenterId.toString()) {
//         return res.status(403).json({
//           success: false,
//           message: "You can only replace products from your own center"
//         });
//       }
//       const CenterStock = mongoose.model("CenterStock");
//       const centerStock = await CenterStock.findOne({
//         center: userCenterId,
//         product: productId
//       });

//       if (!centerStock) {
//         return res.status(404).json({
//           success: false,
//           message: `Center stock not found for product: ${productId}`
//         });
//       }

//       console.log("Center stock found for product");
//       const oldSerial = centerStock.serialNumbers.find(
//         sn => sn.serialNumber === oldSerialNumber && sn.status === "consumed"
//       );
      
//       if (!oldSerial) {
//         return res.status(400).json({
//           success: false,
//           message: `Old serial number '${oldSerialNumber}' not found or not in consumed status. It might be already available or assigned to someone else.`
//         });
//       }

//       console.log(`✓ Old serial '${oldSerialNumber}' found with consumed status`);
//       const newSerial = centerStock.serialNumbers.find(
//         sn => sn.serialNumber === newSerialNumber && sn.status === "available"
//       );
      
//       if (!newSerial) {
//         return res.status(400).json({
//           success: false,
//           message: `New serial number '${newSerialNumber}' not found or not available. It might be already consumed or assigned.`
//         });
//       }

//       console.log(`✓ New serial '${newSerialNumber}' found with available status`);
//       console.log("Updating CenterStock serial number statuses...");
//       oldSerial.status = "available";
//       oldSerial.currentLocation = userCenterId;
//       oldSerial.consumedDate = null;
//       oldSerial.consumedBy = null;
//       oldSerial.transferHistory.push({
//         fromCenter: null,
//         toCenter: userCenterId,
//         transferDate: new Date(),
//         transferType: "replacement_return",
//         referenceId: originalUsageId,
//         remark: `Returned to stock - Replaced by ${newSerialNumber}`,
//         replacedBy: replacedBy
//       });
//       newSerial.status = "consumed";
//       newSerial.currentLocation = null;
//       newSerial.consumedDate = new Date();
//       newSerial.consumedBy = replacedBy;
//       newSerial.transferHistory.push({
//         fromCenter: userCenterId,
//         transferDate: new Date(),
//         transferType: "replacement_issue",
//         referenceId: originalUsageId,
//         remark: `Issued as replacement for ${oldSerialNumber}`,
//         replacedBy: replacedBy
//       });

//       console.log(`✓ CenterStock status updated: '${oldSerialNumber}' (consumed → available)`);
//       console.log(`✓ CenterStock status updated: '${newSerialNumber}' (available → consumed)`);
//       await centerStock.save();
//       console.log("✓ Center stock updated successfully");
//       console.log("Updating EntityStock serial numbers...");
//       const EntityStock = mongoose.model("EntityStock");
//       const entityType = getEntityType(originalUsage.usageType);
//       const entityId = getEntityId(originalUsage);
      
//       if (entityType && entityId) {
//         const entityStock = await EntityStock.findOne({
//           entityType: entityType,
//           entityId: entityId,
//           product: productId
//         });

//         if (entityStock) {
//           const entitySerial = entityStock.serialNumbers.find(
//             sn => sn.serialNumber === oldSerialNumber
//           );

//           if (entitySerial) {
//             entitySerial.serialNumber = newSerialNumber;
//             entitySerial.assignedDate = new Date();
//             console.log(`✓ EntityStock updated: '${oldSerialNumber}' → '${newSerialNumber}'`);
//           } else {
//             console.log(`⚠ Old serial '${oldSerialNumber}' not found in EntityStock, adding new serial`);
//             entityStock.serialNumbers.push({
//               serialNumber: newSerialNumber,
//               status: "used",
//               assignedDate: new Date(),
//               usageReference: originalUsageId,
//               usageType: originalUsage.usageType
//             });
//             entityStock.totalQuantity += 1;
//             entityStock.availableQuantity += 1;
//           }

//           await entityStock.save();
//           console.log("✓ Entity stock updated successfully");
//         } else {
//           console.log(`⚠ EntityStock not found for ${entityType}: ${entityId}`);
//         }
//       } else {
//         console.log("⚠ No entity type/ID found for this usage type");
//       }
//       let serialUpdated = false;
//       for (let item of originalUsage.items) {
//         if (item.product.toString() === productId.toString() && 
//             item.serialNumbers && 
//             item.serialNumbers.includes(oldSerialNumber)) {
//           const serialIndex = item.serialNumbers.indexOf(oldSerialNumber);
//           if (serialIndex !== -1) {
//             item.serialNumbers[serialIndex] = newSerialNumber;
//             serialUpdated = true;
//             console.log(`✓ Stock usage record updated: ${oldSerialNumber} → ${newSerialNumber}`);
//             break;
//           }
//         }
//       }

//       if (!serialUpdated) {
//         return res.status(404).json({
//           success: false,
//           message: `Could not find old serial number '${oldSerialNumber}' in the original stock usage record`
//         });
//       }

//       await originalUsage.save();
//       console.log("✓ Stock usage record saved successfully");

//       console.log("=== SERIAL REPLACEMENT COMPLETED SUCCESSFULLY ===");
//       res.json({
//         success: true,
//         message: `Serial number replaced successfully: ${oldSerialNumber} → ${newSerialNumber}`,
//         data: {
//           replacementDetails: {
//             oldSerialNumber: oldSerialNumber,
//             newSerialNumber: newSerialNumber,
//             productId: productId,
//             originalUsageId: originalUsageId,
//             entityType: entityType,
//             entityId: entityId,
//             replacedBy: req.user.name,
//             replacedAt: new Date()
//           },
//           statusChanges: {
//             oldSerial: {
//               from: "consumed",
//               to: "available"
//             },
//             newSerial: {
//               from: "available", 
//               to: "consumed"
//             }
//           }
//         }
//       });

//     } catch (error) {
//       console.error("Replacement process error:", error);
//       throw error;
//     }

//   } catch (error) {
//     console.error("Serial replacement error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to replace serial number",
//       error: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };




export const replaceProductSerial = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const {
      originalUsageId,
      productId,
      oldSerialNumber,
      newSerialNumber,
      statusReason = "Replacement"
    } = req.body;

    const replacedBy = req.user.id;

    console.log("=== SERIAL NUMBER REPLACEMENT REQUEST ===");
    console.log("Request Body:", {
      originalUsageId,
      productId,
      oldSerialNumber,
      newSerialNumber,
      statusReason
    });

    if (!originalUsageId || !productId || !oldSerialNumber || !newSerialNumber) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: originalUsageId, productId, oldSerialNumber, newSerialNumber"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(originalUsageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid originalUsageId format"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid productId format"
      });
    }

    try {
      const userCenterId = await getUserCenterId(req.user._id);
      
      const StockUsage = mongoose.model("StockUsage");
      const originalUsage = await StockUsage.findById(originalUsageId)
        .populate("customer", "name mobile")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName");
      
      if (!originalUsage) {
        return res.status(404).json({
          success: false,
          message: `Original stock usage record not found with ID: ${originalUsageId}`
        });
      }

      if (originalUsage.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only replace products from your own center"
        });
      }

      const CenterStock = mongoose.model("CenterStock");
      const centerStock = await CenterStock.findOne({
        center: userCenterId,
        product: productId
      });

      if (!centerStock) {
        return res.status(404).json({
          success: false,
          message: `Center stock not found for product: ${productId}`
        });
      }

      console.log("Center stock found for product");
      const oldSerial = centerStock.serialNumbers.find(
        sn => sn.serialNumber === oldSerialNumber && sn.status === "consumed"
      );
      
      if (!oldSerial) {
        return res.status(400).json({
          success: false,
          message: `Old serial number '${oldSerialNumber}' not found or not in consumed status. It might be already available or assigned to someone else.`
        });
      }

      console.log(`✓ Old serial '${oldSerialNumber}' found with consumed status`);
      const newSerial = centerStock.serialNumbers.find(
        sn => sn.serialNumber === newSerialNumber && sn.status === "available"
      );
      
      if (!newSerial) {
        return res.status(400).json({
          success: false,
          message: `New serial number '${newSerialNumber}' not found or not available. It might be already consumed or assigned.`
        });
      }

      console.log(`✓ New serial '${newSerialNumber}' found with available status`);
      const Product = mongoose.model("Product");
      const product = await Product.findById(productId);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found with ID: ${productId}`
        });
      }
      const entityType = getEntityType(originalUsage.usageType);
      const entityId = getEntityId(originalUsage);
      let replacementData = {
        date: new Date(),
        usageType: originalUsage.usageType,
        customer: originalUsage.customer,
        fromBuilding: originalUsage.fromBuilding,
        toBuilding: originalUsage.toBuilding,
        fromControlRoom: originalUsage.fromControlRoom,
        connectionType: originalUsage.connectionType,
        reason: originalUsage.reason,
        packageAmount: originalUsage.packageAmount || 0,
        packageDuration: originalUsage.packageDuration,
        onuCharges: originalUsage.onuCharges || 0,
        installationCharges: originalUsage.installationCharges || 0,
        shiftingAmount: originalUsage.shiftingAmount || 0,
        wireChangeAmount: originalUsage.wireChangeAmount || 0,
        product: productId,
        productType: "replace",
        replaceFor: oldSerialNumber,
        replaceProductName: product.productTitle,
        qty: 1,
        damageQty: 0,
        statusReason: statusReason,
        oldSerialNumber: oldSerialNumber,
        newSerialNumber: newSerialNumber,
        originalUsageId: originalUsageId,
        productId: productId,
        center: userCenterId,
        replacedBy: replacedBy,
        entityType: entityType,
        entityId: entityId,
        replacementDetails: {
          oldSerialStatus: { from: "consumed", to: "available" },
          newSerialStatus: { from: "available", to: "consumed" }
        }
      };

      console.log("Updating CenterStock serial number statuses...");
      oldSerial.status = "available";
      oldSerial.currentLocation = userCenterId;
      oldSerial.consumedDate = null;
      oldSerial.consumedBy = null;
      oldSerial.transferHistory.push({
        fromCenter: null,
        toCenter: userCenterId,
        transferDate: new Date(),
        transferType: "replacement_return",
        referenceId: originalUsageId,
        remark: `Returned to stock - Replaced by ${newSerialNumber}`,
        replacedBy: replacedBy
      });
      newSerial.status = "consumed";
      newSerial.currentLocation = null;
      newSerial.consumedDate = new Date();
      newSerial.consumedBy = replacedBy;
      newSerial.transferHistory.push({
        fromCenter: userCenterId,
        transferDate: new Date(),
        transferType: "replacement_issue",
        referenceId: originalUsageId,
        remark: `Issued as replacement for ${oldSerialNumber}`,
        replacedBy: replacedBy
      });

      console.log(`✓ CenterStock status updated: '${oldSerialNumber}' (consumed → available)`);
      console.log(`✓ CenterStock status updated: '${newSerialNumber}' (available → consumed)`);
      
      await centerStock.save();
      console.log("✓ Center stock updated successfully");
      console.log("Updating EntityStock serial numbers...");

      const EntityStock = mongoose.model("EntityStock");

      
      if (entityType && entityId) {
        const entityStock = await EntityStock.findOne({
          entityType: entityType,
          entityId: entityId,
          product: productId
        });

        if (entityStock) {
          const entitySerial = entityStock.serialNumbers.find(
            sn => sn.serialNumber === oldSerialNumber
          );

          if (entitySerial) {
            entitySerial.serialNumber = newSerialNumber;
            entitySerial.assignedDate = new Date();
            console.log(`✓ EntityStock updated: '${oldSerialNumber}' → '${newSerialNumber}'`);
          } else {
            console.log(`⚠ Old serial '${oldSerialNumber}' not found in EntityStock, adding new serial`);
            entityStock.serialNumbers.push({
              serialNumber: newSerialNumber,
              status: "used",
              assignedDate: new Date(),
              usageReference: originalUsageId,
              usageType: originalUsage.usageType
            });
            entityStock.totalQuantity += 1;
            entityStock.availableQuantity += 1;
          }

          await entityStock.save();
          console.log("✓ Entity stock updated successfully");
        } else {
          console.log(`⚠ EntityStock not found for ${entityType}: ${entityId}`);
        }
      } else {
        console.log("⚠ No entity type/ID found for this usage type");
      }
      let serialUpdated = false;
      for (let item of originalUsage.items) {
        if (item.product.toString() === productId.toString() && 
            item.serialNumbers && 
            item.serialNumbers.includes(oldSerialNumber)) {
          const serialIndex = item.serialNumbers.indexOf(oldSerialNumber);
          if (serialIndex !== -1) {
            item.serialNumbers[serialIndex] = newSerialNumber;
            serialUpdated = true;
            console.log(`✓ Stock usage record updated: ${oldSerialNumber} → ${newSerialNumber}`);
            break;
          }
        }
      }

      if (!serialUpdated) {
        return res.status(404).json({
          success: false,
          message: `Could not find old serial number '${oldSerialNumber}' in the original stock usage record`
        });
      }

      await originalUsage.save();
      console.log("✓ Stock usage record saved successfully");
      const replacementRecord = new ReplacementRecord(replacementData);
      await replacementRecord.save();
      console.log("✓ Replacement record saved to separate collection");

      console.log("=== SERIAL REPLACEMENT COMPLETED SUCCESSFULLY ===");
      
      res.json({
        success: true,
        message: `Serial number replaced successfully: ${oldSerialNumber} → ${newSerialNumber}`,
        data: {
          replacementDetails: {
            oldSerialNumber: oldSerialNumber,
            newSerialNumber: newSerialNumber,
            productId: productId,
            originalUsageId: originalUsageId,
            entityType: entityType,
            entityId: entityId,
            replacedBy: req.user.name,
            replacedAt: new Date(),
            replacementRecordId: replacementRecord._id,
            connectionType: originalUsage.connectionType,
            reason: originalUsage.reason
          },
          statusChanges: {
            oldSerial: {
              from: "consumed",
              to: "available"
            },
            newSerial: {
              from: "available", 
              to: "consumed"
            }
          }
        }
      });

    } catch (error) {
      console.error("Replacement process error:", error);
      throw error;
    }

  } catch (error) {
    console.error("Serial replacement error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to replace serial number",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};



export const returnProductSerial = async (req, res) => {
  try {
    const { hasAccess } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const {
      usageId,
      productId,
      serialNumber,
      remark = "Product return"
    } = req.body;

    const returnedBy = req.user.id;

    console.log("=== SINGLE PRODUCT RETURN REQUEST ===");
    console.log("Request Body:", { usageId, productId, serialNumber, remark });
    
    if (!usageId || !productId || !serialNumber) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: usageId, productId, serialNumber"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(usageId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }

    try {
      const userCenterId = await getUserCenterId(req.user._id);
      const originalUsage = await StockUsage.findById(usageId)
        .populate("customer", "name mobile")
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
          message: `Original stock usage record not found with ID: ${usageId}`
        });
      }
      
      if (originalUsage.center.toString() !== userCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only return products from your own center"
        });
      }
      const originalItem = originalUsage.items.find(
        item => item.product._id.toString() === productId.toString()
      );

      if (!originalItem) {
        return res.status(404).json({
          success: false,
          message: `Product not found in the original usage record`
        });
      }

      if (!originalItem.serialNumbers.includes(serialNumber)) {
        return res.status(400).json({
          success: false,
          message: `Serial number '${serialNumber}' was not found in the original usage for this product`
        });
      }
      const currentCenterStock = await CenterStock.findOne({
        center: userCenterId,
        product: productId
      });

      if (!currentCenterStock) {
        return res.status(404).json({
          success: false,
          message: `Center stock not found for product: ${productId}`
        });
      }

      // const centerStockUpdate = await CenterStock.findOneAndUpdate(
      //   {
      //     center: userCenterId,
      //     product: productId,
      //     "serialNumbers.serialNumber": serialNumber,
      //     "serialNumbers.status": "consumed",
      //     consumedQuantity: { $gt: 0 } 
      //   },
      //   {
      //     $set: {
      //       "serialNumbers.$.status": "available",
      //       "serialNumbers.$.currentLocation": userCenterId,
      //       "serialNumbers.$.consumedDate": null,
      //       "serialNumbers.$.consumedBy": null,
      //     },
      //     $push: {
      //       "serialNumbers.$.transferHistory": {
      //         fromCenter: null,
      //         toCenter: userCenterId,
      //         transferDate: new Date(),
      //         transferType: "return_from_field",
      //         referenceId: usageId,
      //         remark: `Returned from ${originalUsage.usageType} - ${remark}`,
      //         returnedBy: returnedBy
      //       }
      //     },
      //     $inc: {
      //       availableQuantity: 1,
      //       consumedQuantity: -1
      //     },
      //     lastUpdated: new Date()
      //   },
      //   { 
      //     new: true 
      //   }
      // );

      // if (!centerStockUpdate) {
      //   const existingCenterStock = await CenterStock.findOne({
      //     center: userCenterId,
      //     product: productId,
      //     "serialNumbers.serialNumber": serialNumber
      //   });
        
      //   if (existingCenterStock) {
      //     const serialInfo = existingCenterStock.serialNumbers.find(
      //       sn => sn.serialNumber === serialNumber
      //     );
          
      //     if (serialInfo && serialInfo.status === "consumed") {
      //       const newConsumedQuantity = Math.max(0, existingCenterStock.consumedQuantity - 1);
            
      //       const serialIndex = existingCenterStock.serialNumbers.findIndex(
      //         sn => sn.serialNumber === serialNumber
      //       );
            
      //       if (serialIndex !== -1) {
      //         existingCenterStock.serialNumbers[serialIndex].status = "available";
      //         existingCenterStock.serialNumbers[serialIndex].currentLocation = userCenterId;
      //         existingCenterStock.serialNumbers[serialIndex].consumedDate = null;
      //         existingCenterStock.serialNumbers[serialIndex].consumedBy = null;
      //         existingCenterStock.serialNumbers[serialIndex].transferHistory.push({
      //           fromCenter: null,
      //           toCenter: userCenterId,
      //           transferDate: new Date(),
      //           transferType: "return_from_field",
      //           referenceId: usageId,
      //           remark: `Returned from ${originalUsage.usageType} - ${remark}`,
      //           returnedBy: returnedBy
      //         });
      //       }
            
      //       existingCenterStock.availableQuantity += 1;
      //       existingCenterStock.consumedQuantity = newConsumedQuantity;
      //       existingCenterStock.lastUpdated = new Date();
            
      //       await existingCenterStock.save();
      //       console.log(`✓ CenterStock updated (manual): '${serialNumber}' (consumed → available)`);
      //     } else {
      //       return res.status(400).json({
      //         success: false,
      //         message: `Serial number '${serialNumber}' exists but is not in consumed status. Current status: ${serialInfo?.status || 'unknown'}`
      //       });
      //     }
      //   } else {
      //     return res.status(400).json({
      //       success: false,
      //       message: `Serial number '${serialNumber}' not found in center stock`
      //     });
      //   }
      // } else {
      //   console.log(`✓ CenterStock updated: '${serialNumber}' (consumed → available)`);
      // }
       // Update CenterStock serial number status
// Update CenterStock serial number status using array filters
const centerStockUpdate = await CenterStock.findOneAndUpdate(
  {
    center: userCenterId,
    product: productId,
    "serialNumbers.serialNumber": serialNumber,
    "serialNumbers.status": "consumed"
  },
  {
    $set: {
      "serialNumbers.$[elem].status": "available",
      "serialNumbers.$[elem].currentLocation": userCenterId,
      "serialNumbers.$[elem].consumedDate": null,
      "serialNumbers.$[elem].consumedBy": null,
    },
    $push: {
      "serialNumbers.$[elem].transferHistory": {
        fromCenter: null,
        toCenter: userCenterId,
        transferDate: new Date(),
        transferType: "return_from_field",
        referenceId: usageId,
        remark: `Returned from ${originalUsage.usageType} - ${remark}`,
        returnedBy: returnedBy
      }
    },
    $inc: {
      availableQuantity: 1,
      consumedQuantity: -1
    },
    lastUpdated: new Date()
  },
  { 
    arrayFilters: [
      { "elem.serialNumber": serialNumber, "elem.status": "consumed" }
    ],
    new: true 
  }
);

if (!centerStockUpdate) {
  // If findOneAndUpdate fails, use the manual update approach
  const existingCenterStock = await CenterStock.findOne({
    center: userCenterId,
    product: productId
  });
  
  if (existingCenterStock) {
    const serialIndex = existingCenterStock.serialNumbers.findIndex(
      sn => sn.serialNumber === serialNumber && sn.status === "consumed"
    );
    
    if (serialIndex !== -1) {
      existingCenterStock.serialNumbers[serialIndex].status = "available";
      existingCenterStock.serialNumbers[serialIndex].currentLocation = userCenterId;
      existingCenterStock.serialNumbers[serialIndex].consumedDate = null;
      existingCenterStock.serialNumbers[serialIndex].consumedBy = null;
      existingCenterStock.serialNumbers[serialIndex].transferHistory.push({
        fromCenter: null,
        toCenter: userCenterId,
        transferDate: new Date(),
        transferType: "return_from_field",
        referenceId: usageId,
        remark: `Returned from ${originalUsage.usageType} - ${remark}`,
        returnedBy: returnedBy
      });
      
      existingCenterStock.availableQuantity += 1;
      existingCenterStock.consumedQuantity = Math.max(0, existingCenterStock.consumedQuantity - 1);
      existingCenterStock.lastUpdated = new Date();
      
      await existingCenterStock.save();
      console.log(`✓ CenterStock updated (manual): '${serialNumber}' (consumed → available)`);
    } else {
      return res.status(400).json({
        success: false,
        message: `Serial number '${serialNumber}' not found in consumed status`
      });
    }
  } else {
    return res.status(400).json({
      success: false,
      message: `Center stock not found for product: ${productId}`
    });
  }
} else {
  console.log(`✓ CenterStock updated: '${serialNumber}' (consumed → available)`);
}

      const entityType = getEntityType(originalUsage.usageType);
      const entityId = getEntityId(originalUsage);

      if (entityType && entityId) {
        const entityStock = await EntityStockUsage.findOne({
          entityType: entityType,
          entityId: entityId,
          product: productId,
          "serialNumbers.serialNumber": serialNumber
        });

        if (entityStock) {
          const serialIndex = entityStock.serialNumbers.findIndex(
            sn => sn.serialNumber === serialNumber && sn.status === "assigned"
          );

          if (serialIndex !== -1) {
            entityStock.serialNumbers[serialIndex].status = "available";
            entityStock.serialNumbers[serialIndex].assignedDate = new Date();
            
            await entityStock.save();
            console.log(`✓ EntityStock updated: '${serialNumber}' (assigned → available)`);
          } else {
            console.log(`⚠ Serial '${serialNumber}' not found in entity stock or not in assigned status`);
          }
        } else {
          console.log(`⚠ EntityStock not found for ${entityType}: ${entityId}, product: ${productId}`);
        }
      }
      const returnData = {
        date: new Date(),
        originalUsageId: usageId,
        center: userCenterId,
        usageType: originalUsage.usageType,
        type: "return",
        customer: originalUsage.customer,
        fromBuilding: originalUsage.fromBuilding,
        toBuilding: originalUsage.toBuilding,
        fromControlRoom: originalUsage.fromControlRoom,
        items: [{
          product: productId,
          quantity: 1,
          serialNumber: serialNumber,
          oldStock: currentCenterStock.availableQuantity,
          newStock: currentCenterStock.availableQuantity + 1,
          totalStock: currentCenterStock.totalQuantity
        }],
        remark: remark,
        returnedBy: returnedBy,
        status: "completed"
      };

      const returnRecord = new ReturnRecord(returnData);
      await returnRecord.save();
      console.log("✓ Return record saved to separate collection");

      console.log("=== SINGLE PRODUCT RETURN COMPLETED SUCCESSFULLY ===");
      
      const populatedReturn = await ReturnRecord.findById(returnRecord._id)
        .populate("center", "name centerType")
        .populate("customer", "username name mobile")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName")
        .populate({
          path: "items.product",
          select: "productTitle productCode trackSerialNumber"
        })
        .populate("returnedBy", "name email")
        .populate("originalUsageId", "usageType date remark");

      res.json({
        success: true,
        message: `Product serial number '${serialNumber}' returned successfully.`,
        data: {
          returnRecord: populatedReturn,
          summary: {
            serialNumberReturned: serialNumber,
            productId: productId,
            originalUsageType: originalUsage.usageType,
            entityType: entityType,
            entityId: entityId,
            stockChanges: {
              availableQuantity: `${currentCenterStock.availableQuantity} → ${currentCenterStock.availableQuantity + 1}`,
              consumedQuantity: `${currentCenterStock.consumedQuantity} → ${Math.max(0, currentCenterStock.consumedQuantity - 1)}`
            }
          }
        }
      });

    } catch (error) {
      console.error("Return process error:", error);
      throw error;
    }

  } catch (error) {
    console.error("Product return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process product return",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};