// controllers/testingMaterialController.js
import TestingMaterial from "../models/TestingMaterial.js";
import OutletStock from "../models/OutletStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";
import TestingStock from "../models/TestingStock.js";

// Check permissions for testing material
const checkTestingMaterialPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const testingModule = userPermissions.find((perm) => perm.module === "Testing Material");

  if (!testingModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    create_testing_request: testingModule.permissions.includes("create_testing_request"),
    view_testing_request: testingModule.permissions.includes("view_testing_request"),
    accept_testing_request: testingModule.permissions.includes("accept_testing_request"),
    complete_testing: testingModule.permissions.includes("complete_testing"),
    manage_testing_all_centers: testingModule.permissions.includes("manage_testing_all_centers"),
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

export const createTestingMaterialRequest = async (req, res) => {
    try {
      const { hasAccess, permissions } = checkTestingMaterialPermissions(req, [
        "create_testing_request",
      ]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. create_testing_request permission required.",
        });
      }
  
      const { toCenter, products, remark } = req.body;
  
      // Validate user center
      const user = await mongoose.model("User").findById(req.user.id).populate("center");
      if (!user || !user.center) {
        return res.status(400).json({
          success: false,
          message: "User center information not found",
        });
      }
  
      const fromCenterId = user.center._id;
  
      // Validate from center is an outlet
      const fromCenter = await Center.findById(fromCenterId);
      if (!fromCenter || fromCenter.centerType !== "Outlet") {
        return res.status(400).json({
          success: false,
          message: "User must be from an Outlet center to create testing material request",
        });
      }
  
      // Validate to center
      const toCenterDoc = await Center.findById(toCenter);
      if (!toCenterDoc) {
        return res.status(404).json({
          success: false,
          message: "Destination center not found",
        });
      }
  
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Products array is required and cannot be empty",
        });
      }
  
      // Validate each product and check stock availability
      const validatedProducts = [];
      const OutletStock = mongoose.model("OutletStock");
  
      for (const product of products) {
        if (!product.product || !product.quantity) {
          return res.status(400).json({
            success: false,
            message: "Each product must have product ID and quantity",
          });
        }
  
        if (product.quantity <= 0) {
          return res.status(400).json({
            success: false,
            message: "Product quantity must be greater than 0",
          });
        }
  
        // Check product exists
        const productDoc = await Product.findById(product.product);
        if (!productDoc) {
          return res.status(404).json({
            success: false,
            message: `Product ${product.product} not found`,
          });
        }
  
        // Check outlet stock availability
        const outletStock = await OutletStock.findOne({
          outlet: fromCenterId,
          product: product.product,
        });
  
        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `No stock available for product ${productDoc.productTitle} in your outlet`,
            productId: product.product,
            productName: productDoc.productTitle,
          });
        }
  
        // Check if product tracks serial numbers
        const tracksSerialNumbers = productDoc.trackSerialNumber === "Yes";
  
        if (tracksSerialNumbers) {
          // For serialized products
          if (!product.serialNumbers || !Array.isArray(product.serialNumbers)) {
            return res.status(400).json({
              success: false,
              message: `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers`,
            });
          }
  
          if (product.serialNumbers.length !== product.quantity) {
            return res.status(400).json({
              success: false,
              message: `Number of serial numbers (${product.serialNumbers.length}) must match quantity (${product.quantity}) for product ${productDoc.productTitle}`,
            });
          }
  
          // Validate serial numbers availability
          const unavailableSerials = [];
          const availableSerials = [];
  
          for (const serialNumber of product.serialNumbers) {
            const serial = outletStock.serialNumbers.find(
              (sn) =>
                sn.serialNumber === serialNumber &&
                sn.status === "available" &&
                sn.currentLocation?.toString() === fromCenterId.toString()
            );
  
            if (serial) {
              availableSerials.push(serialNumber);
            } else {
              unavailableSerials.push(serialNumber);
            }
          }
  
          if (unavailableSerials.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Some serial numbers are not available in your outlet stock for product ${productDoc.productTitle}: ${unavailableSerials.join(", ")}`,
              unavailableSerials,
              availableSerials,
            });
          }
  
          validatedProducts.push({
            product: product.product,
            quantity: product.quantity,
            serialNumbers: product.serialNumbers.map(serial => ({
              serialNumber: serial,
              status: "pending_testing"
            })),
            remark: product.remark || "",
          });
        } else {
          // For non-serialized products
          if (product.serialNumbers && product.serialNumbers.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
            });
          }
  
          // Check quantity availability
          if (outletStock.availableQuantity < product.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock available for product ${productDoc.productTitle}. Available: ${outletStock.availableQuantity}, Requested: ${product.quantity}`,
              availableQuantity: outletStock.availableQuantity,
              requestedQuantity: product.quantity,
            });
          }
  
          validatedProducts.push({
            product: product.product,
            quantity: product.quantity,
            serialNumbers: [],
            remark: product.remark || "",
          });
        }
      }
  
      // Generate request number manually (since middleware might not work with lean)
      const generateRequestNumber = async () => {
        const count = await TestingMaterial.countDocuments();
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const sequence = (count + 1).toString().padStart(4, "0");
        return `TM${year}${month}${day}${sequence}`;
      };
  
      // Generate request number
      const requestNumber = await generateRequestNumber();
      console.log('Generated requestNumber:', requestNumber);
  
      // Create testing material request
      const testingMaterial = new TestingMaterial({
        requestNumber: requestNumber, // Manually set request number
        fromCenter: fromCenterId,
        toCenter,
        products: validatedProducts,
        status: "pending_testing",
        requestedBy: req.user.id,
        remark: remark || "",
      });
  
      console.log('TestingMaterial document before save:', {
        hasRequestNumber: !!testingMaterial.requestNumber,
        requestNumber: testingMaterial.requestNumber,
        isNew: testingMaterial.isNew
      });
  
      // Save the testing material request
      const savedTestingMaterial = await testingMaterial.save();
      console.log('TestingMaterial after save:', {
        requestNumber: savedTestingMaterial.requestNumber,
        _id: savedTestingMaterial._id
      });
  
      // Update outlet stock - mark as pending_testing WITHOUT decreasing availableQuantity
      for (const product of validatedProducts) {
        const outletStock = await OutletStock.findOne({
          outlet: fromCenterId,
          product: product.product,
        });
  
        if (product.serialNumbers.length > 0) {
          // For serialized products - only update status
          for (const serialItem of product.serialNumbers) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialItem.serialNumber
            );
  
            if (serial) {
              // Mark as pending_testing WITHOUT decreasing availableQuantity
              serial.status = "pending_testing";
              
              // Add transfer history
              serial.transferHistory.push({
                fromCenter: fromCenterId,
                toCenter: toCenter,
                transferDate: new Date(),
                transferType: "outlet_to_testing",
                status: "pending_testing",
              });
            }
          }
          
          // DO NOT decrease availableQuantity here
          console.log(`Serialized product ${product.product}: Marked as pending_testing, availableQuantity remains ${outletStock.availableQuantity}`);
          
        } else {
          // For non-serialized products - only update pendingTestingQty
          if (!outletStock.pendingTestingQty) {
            outletStock.pendingTestingQty = 0;
          }
          
          // Increase pendingTestingQty but DON'T decrease availableQuantity yet
          outletStock.pendingTestingQty += product.quantity;
          
          console.log(`Non-serialized product ${product.product}: pendingTestingQty increased to ${outletStock.pendingTestingQty}, availableQuantity remains ${outletStock.availableQuantity}`);
        }
  
        await outletStock.save();
      }
  
      // Populate and return the saved document
      const populatedRequest = await TestingMaterial.findById(savedTestingMaterial._id)
        .populate("fromCenter", "_id centerName centerCode centerType")
        .populate("toCenter", "_id centerName centerCode centerType")
        .populate("products.product", "_id productTitle productCode trackSerialNumber")
        .populate("requestedBy", "_id fullName email")
        .populate("acceptedBy", "_id fullName email")
        .populate("completedBy", "_id fullName email");
  
      res.status(201).json({
        success: true,
        message: "Testing material request created successfully",
        data: populatedRequest,
      });
    } catch (error) {
      console.error("Error creating testing material request:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        errors: error.errors,
        code: error.code,
        keyValue: error.keyValue
      });
  
      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors,
          details: error.errors
        });
      }
  
      if (error.code === 11000) {
        // Duplicate key error - retry with new request number
        if (error.keyValue && error.keyValue.requestNumber) {
          return res.status(400).json({
            success: false,
            message: "Duplicate request number generated. Please try again.",
            duplicateRequestNumber: error.keyValue.requestNumber
          });
        }
      }
  
      res.status(500).json({
        success: false,
        message: "Error creating testing material request",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
        details: process.env.NODE_ENV === "development" ? {
          name: error.name,
          errors: error.errors
        } : undefined
      });
    }
  };


  export const acceptTestingMaterialRequest = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkTestingMaterialPermissions(req, [
        "accept_testing_request",
      ]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. accept_testing_request permission required.",
        });
      }
  
      const { id } = req.params;
      const { remark } = req.body || {};
  
      // Populate the testing material to ensure we have all data
      const testingMaterial = await TestingMaterial.findById(id)
        .populate("fromCenter", "_id centerName centerCode centerType")
        .populate("toCenter", "_id centerName centerCode centerType");
  
      if (!testingMaterial) {
        return res.status(404).json({
          success: false,
          message: "Testing material request not found",
        });
      }
  
      const user = await mongoose.model("User").findById(req.user.id).populate("center");
      if (!user || !user.center) {
        return res.status(400).json({
          success: false,
          message: "User center information not found",
        });
      }
  
      if (user.center._id.toString() !== testingMaterial.toCenter._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only accept testing material requests sent to your center",
        });
      }
  
      if (testingMaterial.status !== "pending_testing") {
        return res.status(400).json({
          success: false,
          message: `Testing material request is already ${testingMaterial.status}`,
        });
      }
  
      // Process each product
      for (const productItem of testingMaterial.products) {
        const productDoc = await Product.findById(productItem.product);
        if (!productDoc) {
          return res.status(404).json({
            success: false,
            message: `Product ${productItem.product} not found`,
          });
        }
  
        const outletStock = await OutletStock.findOne({
          outlet: testingMaterial.fromCenter._id,
          product: productItem.product,
        });
  
        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `Outlet stock not found for product ${productDoc.productTitle}`,
          });
        }
  
        if (productItem.serialNumbers.length > 0) {
          // For serialized products
          const serialsForTestingStock = [];
          
          // Validate each serial number
          for (const serialItem of productItem.serialNumbers) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialItem.serialNumber
            );
  
            if (!serial) {
              return res.status(400).json({
                success: false,
                message: `Serial number ${serialItem.serialNumber} not found in outlet stock`,
              });
            }
  
            if (serial.status !== "pending_testing") {
              return res.status(400).json({
                success: false,
                message: `Serial number ${serialItem.serialNumber} is not in pending_testing status. Current status: ${serial.status}`,
              });
            }
  
            // Update serial status in outlet stock
            serial.status = "under_testing";
            
            // Update currentLocation to testing center
            serial.currentLocation = testingMaterial.toCenter._id;
            
            // Add to transfer history if not already there
            serial.transferHistory.push({
              fromCenter: testingMaterial.fromCenter._id,
              toCenter: testingMaterial.toCenter._id,
              transferDate: new Date(),
              transferType: "outlet_to_testing",
              status: "under_testing",
            });
  
            // Prepare serial data for TestingStock - use "pending_testing" status for new entries
            serialsForTestingStock.push({
              serialNumber: serialItem.serialNumber,
              status: "under_testing"  // Changed from "pending_testing" to match what you want
            });
          }
  
          // ✅ Decrease availableQuantity when accepting
          const originalAvailableQty = outletStock.availableQuantity;
          outletStock.availableQuantity -= productItem.quantity;
          
          console.log(`Serialized product ${productItem.product}: 
            availableQuantity decreased from ${originalAvailableQty} to ${outletStock.availableQuantity},
            pendingTestingQty: ${outletStock.pendingTestingQty}`);
          
          // Save outlet stock changes
          await outletStock.save();
  
          // Update TestingStock
          console.log('Updating TestingStock with details:', {
            center: testingMaterial.toCenter._id,
            product: productItem.product,
            quantity: productItem.quantity,
            serialsCount: serialsForTestingStock.length,
            originalOutlet: testingMaterial.fromCenter._id,
            testingRequestId: testingMaterial._id,
            serialsForTestingStock
          });
  
          try {
            // Call the TestingStock update method
            const result = await TestingStock.updateTestingStock(
              testingMaterial.toCenter._id,           // centerId
              productItem.product,                    // productId
              productItem.quantity,                   // quantity
              serialsForTestingStock,                 // serialNumbers array
              testingMaterial.fromCenter._id,         // originalOutlet
              testingMaterial._id,                    // testingRequestId
              "testing_inbound"                      // transferType
            );
            
            console.log('TestingStock update successful:', {
              success: !!result,
              testingStockId: result?._id,
              totalQuantity: result?.totalQuantity,
              serialsAdded: result?.serialNumbers?.length
            });
            
          } catch (testingStockError) {
            console.error('Error updating TestingStock:', {
              message: testingStockError.message,
              stack: testingStockError.stack,
              code: testingStockError.code,
              keyValue: testingStockError.keyValue
            });
            throw testingStockError;
          }
        } else {
          // For non-serialized products
          if (outletStock.pendingTestingQty < productItem.quantity) {
            return res.status(400).json({
              success: false,
              message: `Invalid pending testing quantity for product ${productDoc.productTitle}. Available: ${outletStock.pendingTestingQty}, Requested: ${productItem.quantity}`,
            });
          }
  
          // Update outlet stock quantities
          const originalPendingQty = outletStock.pendingTestingQty;
          const originalAvailableQty = outletStock.availableQuantity;
          
          outletStock.pendingTestingQty -= productItem.quantity;
          outletStock.availableQuantity -= productItem.quantity; // ✅ Decrease availableQuantity
          
          console.log(`Non-serialized product ${productItem.product}: 
            pendingTestingQty decreased from ${originalPendingQty} to ${outletStock.pendingTestingQty},
            availableQuantity decreased from ${originalAvailableQty} to ${outletStock.availableQuantity}`);
          
          // Save outlet stock changes
          await outletStock.save();
  
          // Update TestingStock for non-serialized product
          console.log('Updating TestingStock (non-serialized) with:', {
            center: testingMaterial.toCenter._id,
            product: productItem.product,
            quantity: productItem.quantity,
            originalOutlet: testingMaterial.fromCenter._id,
            testingRequestId: testingMaterial._id
          });
  
          try {
            const result = await TestingStock.updateTestingStock(
              testingMaterial.toCenter._id,
              productItem.product,
              productItem.quantity,
              [],  // Empty array for non-serialized products
              testingMaterial.fromCenter._id,
              testingMaterial._id,
              "testing_inbound"
            );
            
            console.log('TestingStock update result (non-serialized):', {
              success: !!result,
              testingStockId: result?._id,
              totalQuantity: result?.totalQuantity
            });
            
          } catch (testingStockError) {
            console.error('Error updating TestingStock (non-serialized):', {
              message: testingStockError.message,
              stack: testingStockError.stack
            });
            throw testingStockError;
          }
        }
      }
  
      // Update testing material request status
      testingMaterial.status = "under_testing";
      testingMaterial.acceptedBy = req.user.id;
      testingMaterial.acceptedAt = new Date();
      if (remark) {
        testingMaterial.remark = remark;
      }
  
      // Update serial statuses in testing material
      testingMaterial.products.forEach(product => {
        if (product.serialNumbers && product.serialNumbers.length > 0) {
          product.serialNumbers.forEach(serial => {
            serial.status = "under_testing";
          });
        }
      });
  
      // Save testing material
      await testingMaterial.save();
  
      // Populate and return the updated document
      const populatedRequest = await TestingMaterial.findById(testingMaterial._id)
        .populate("fromCenter", "_id centerName centerCode centerType")
        .populate("toCenter", "_id centerName centerCode centerType")
        .populate("products.product", "_id productTitle productCode")
        .populate("requestedBy", "_id fullName email")
        .populate("acceptedBy", "_id fullName email")
        .populate("completedBy", "_id fullName email");
  
      res.status(200).json({
        success: true,
        message: "Testing material request accepted successfully",
        data: populatedRequest,
      });
    } catch (error) {
      console.error("Error accepting testing material request:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        keyValue: error.keyValue
      });
  
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: "Invalid testing material request ID",
        });
      }
  
      if (error.message && error.message.includes("already exists in TestingStock")) {
        return res.status(400).json({
          success: false,
          message: "Duplicate serial numbers detected. Some products are already in testing.",
          error: error.message,
        });
      }
  
      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          error: error.message,
          details: error.errors
        });
      }
  
      res.status(500).json({
        success: false,
        message: "Error accepting testing material request",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
        details: process.env.NODE_ENV === "development" ? {
          name: error.name,
          stack: error.stack
        } : undefined
      });
    }
  };

export const getAllTestingMaterialRequests = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkTestingMaterialPermissions(req, [
        "view_testing_request",
      ]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. view_testing_request permission required.",
        });
      }
  
      const {
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc",
        status,
        fromCenter,
        toCenter,
        startDate,
        endDate,
      } = req.query;
  
      const filter = {};
  
      // Apply status filter - FIXED: Handle both string and array inputs
      if (status) {
        let statusArray;
        if (Array.isArray(status)) {
          // If status is already an array (from multiple query params)
          statusArray = status.map(s => s.trim());
        } else if (typeof status === 'string') {
          // If status is a comma-separated string
          statusArray = status.split(",").map(s => s.trim());
        } else {
          // If status is a single value
          statusArray = [String(status).trim()];
        }
        
        // Filter out empty strings
        statusArray = statusArray.filter(s => s.length > 0);
        
        if (statusArray.length > 0) {
          filter.status = { $in: statusArray };
        }
      }
  
      // Apply date range filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
  
      // Apply center filters based on permissions
      if (permissions.manage_testing_all_centers) {
        if (fromCenter) filter.fromCenter = fromCenter;
        if (toCenter) filter.toCenter = toCenter;
      } else {
        // Users can only see requests from/to their center
        if (userCenter) {
          const userCenterId = userCenter._id || userCenter;
          filter.$or = [
            { fromCenter: userCenterId },
            { toCenter: userCenterId },
          ];
        }
      }
  
      // Build sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
  
      const [testingMaterials, total, statusCounts] = await Promise.all([
        TestingMaterial.find(filter)
          .populate("fromCenter", "_id centerName centerCode centerType")
          .populate("toCenter", "_id centerName centerCode centerType")
          .populate("products.product", "_id productTitle productCode")
          .populate("requestedBy", "_id fullName email")
          .populate("acceptedBy", "_id fullName email")
          .populate("completedBy", "_id fullName email")
          .sort(sortOptions)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .lean(),
  
        TestingMaterial.countDocuments(filter),
  
        TestingMaterial.aggregate([
          { $match: filter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);
  
      const statusStats = statusCounts.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});
  
      res.status(200).json({
        success: true,
        message: "Testing material requests retrieved successfully",
        data: testingMaterials,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
        filters: {
          status: statusStats,
          total: total,
        },
      });
    } catch (error) {
      console.error("Error retrieving testing material requests:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving testing material requests",
        error: error.message,
      });
    }
  };

export const getTestingMaterialRequestById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkTestingMaterialPermissions(req, [
      "view_testing_request",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_testing_request permission required.",
      });
    }

    const { id } = req.params;

    const testingMaterial = await TestingMaterial.findById(id)
      .populate("fromCenter", "_id centerName centerCode centerType")
      .populate("toCenter", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode trackSerialNumber")
      .populate("requestedBy", "_id fullName email")
      .populate("acceptedBy", "_id fullName email")
      .populate("completedBy", "_id fullName email")
      .populate("testResults.product", "_id productTitle productCode")
      .populate("testResults.testedBy", "_id fullName email");

    // if (!testingMaterial) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Testing material request not found",
    //   });
    // }

    // Check access permissions
    if (!permissions.manage_testing_all_centers && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      if (
        testingMaterial.fromCenter._id.toString() !== userCenterId.toString() &&
        testingMaterial.toCenter._id.toString() !== userCenterId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view requests from/to your center.",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Testing material request retrieved successfully",
      data: testingMaterial,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid testing material request ID",
      });
    }

    console.error("Error retrieving testing material request:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving testing material request",
      error: error.message,
    });
  }
};


export const getAllUnderTestingProducts = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkTestingMaterialPermissions(req, [
        "view_testing_request",
      ]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. view_testing_request permission required.",
        });
      }
  
      const { centerId, status = "under_testing", includeSerials = false } = req.query;
      const user = await mongoose.model("User").findById(req.user.id).populate("center");
  
      // Determine which center to query
      let queryCenterId;
      if (centerId) {
        queryCenterId = centerId;
      } else if (user.center && user.center.centerType === "Center") {
        queryCenterId = user.center._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Center ID is required or user must be from a Center",
        });
      }
  
      console.log('Querying TestingStock for center:', queryCenterId);
  
      // Get all testing stocks for the center with underTestingQuantity > 0
      const testingStocks = await TestingStock.find({ 
        center: queryCenterId,
        underTestingQuantity: { $gt: 0 }
      })
      .populate("center", "_id centerName centerCode")
      .populate("product", "_id productTitle productCode trackSerialNumber category brand")
      .lean();
  
      console.log('Found testingStocks:', testingStocks.length);
  
      // Get outlet details for all serials
      const allOutletIds = [];
      const allTestingRequestIds = [];
      
      testingStocks.forEach(stock => {
        if (stock.serialNumbers && stock.serialNumbers.length > 0) {
          stock.serialNumbers.forEach(serial => {
            if (serial.originalOutlet && !allOutletIds.includes(serial.originalOutlet.toString())) {
              allOutletIds.push(serial.originalOutlet.toString());
            }
            if (serial.testingRequestId && !allTestingRequestIds.includes(serial.testingRequestId.toString())) {
              allTestingRequestIds.push(serial.testingRequestId.toString());
            }
          });
        }
      });
  
      // Fetch outlets in parallel
      let outlets = {};
      if (allOutletIds.length > 0) {
        const outletDocs = await Center.find({ _id: { $in: allOutletIds } })
          .select("_id centerName centerCode")
          .lean();
        
        outletDocs.forEach(outlet => {
          outlets[outlet._id.toString()] = outlet;
        });
      }
  
      // Fetch testing requests in parallel
      let testingRequests = {};
      if (allTestingRequestIds.length > 0) {
        const requestDocs = await TestingMaterial.find({ _id: { $in: allTestingRequestIds } })
          .select("_id requestNumber status requestedAt")
          .populate("requestedBy", "_id fullName email")
          .lean();
        
        requestDocs.forEach(request => {
          testingRequests[request._id.toString()] = request;
        });
      }
  
      // Process the data to get under testing products
      const underTestingProducts = testingStocks.map(stock => {
        const serialsUnderTesting = stock.serialNumbers.filter(
          serial => serial.status === "under_testing"
        );
  
        // Count by status
        const statusCount = {};
        stock.serialNumbers.forEach(serial => {
          statusCount[serial.status] = (statusCount[serial.status] || 0) + 1;
        });
  
        // Prepare serials data - ALWAYS include for serialized products
        const serialsData = [];
        if (stock.product?.trackSerialNumber === "Yes") {
          serialsUnderTesting.forEach(serial => {
            serialsData.push({
              serialNumber: serial.serialNumber,
              status: serial.status,
              testResult: serial.testResult,
              testRemark: serial.testRemark,
              testedAt: serial.testedAt,
              originalOutlet: outlets[serial.originalOutlet?.toString()] || serial.originalOutlet,
              testingRequest: testingRequests[serial.testingRequestId?.toString()] || null,
              currentLocation: serial.currentLocation,
              addedToTesting: serial.transferHistory?.[0]?.transferDate || serial._id.getTimestamp()
            });
          });
        }
  
        // Get outlets for this product's serials
        const productOutletIds = [];
        if (stock.serialNumbers && stock.serialNumbers.length > 0) {
          stock.serialNumbers.forEach(serial => {
            if (serial.originalOutlet && !productOutletIds.includes(serial.originalOutlet.toString())) {
              productOutletIds.push(serial.originalOutlet.toString());
            }
          });
        }
  
        const productOutlets = productOutletIds.map(id => outlets[id]).filter(Boolean);
  
        return {
          _id: stock._id,
          center: stock.center,
          product: stock.product,
          quantities: {
            total: stock.totalQuantity,
            available: stock.availableQuantity,
            underTesting: stock.underTestingQuantity,
            tested: stock.testedQuantity,
            passed: stock.passedQuantity,
            failed: stock.failedQuantity
          },
          serialized: stock.product?.trackSerialNumber === "Yes",
          serialNumbers: {
            total: stock.serialNumbers.length,
            underTesting: serialsUnderTesting.length,
            byStatus: statusCount,
            data: serialsData // Always include serials for serialized products
          },
          outlets: productOutlets,
          lastUpdated: stock.lastUpdated,
          createdAt: stock.createdAt
        };
      });
  
      // Group by product for summary
      const productSummary = underTestingProducts.reduce((acc, product) => {
        const productId = product.product._id.toString();
        if (!acc[productId]) {
          acc[productId] = {
            product: product.product,
            totalUnderTesting: 0,
            testingStocks: []
          };
        }
        acc[productId].totalUnderTesting += product.quantities.underTesting;
        acc[productId].testingStocks.push({
          testingStockId: product._id,
          quantity: product.quantities.underTesting,
          center: product.center
        });
        return acc;
      }, {});
  
      res.status(200).json({
        success: true,
        message: "Under testing products retrieved successfully",
        data: {
          products: underTestingProducts,
          summary: Object.values(productSummary),
          totalProducts: underTestingProducts.length,
          totalUnderTestingItems: underTestingProducts.reduce((sum, p) => sum + p.quantities.underTesting, 0),
          centerId: queryCenterId
        }
      });
  
    } catch (error) {
      console.error("Error getting under testing products:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving under testing products",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      });
    }
  };

  export const getUnderTestingSerialsByProduct = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkTestingMaterialPermissions(req, [
        "view_testing_request",
      ]);
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. view_testing_request permission required.",
        });
      }
  
      const { productId } = req.params;
      const { 
        centerId, 
        status = "under_testing",
        search
      } = req.query;
  
      const user = await mongoose.model("User").findById(req.user.id).populate("center");
  
      let queryCenterId;
      if (centerId) {
        queryCenterId = centerId;
      } else if (user.center && user.center.centerType === "Center") {
        queryCenterId = user.center._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Center ID is required or user must be from a Center",
        });
      }
  
      // Validate product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }
  
      // Get the testing stock for this product
      const testingStock = await TestingStock.findOne({
        center: queryCenterId,
        product: productId
      })
      .populate("center", "_id centerName ")
      .populate("product", "_id productTitle productCode trackSerialNumber")
      .populate({
        path: 'serialNumbers.testingRequestId',
        select: 'requestNumber status requestedBy requestedAt fromCenter',
        populate: {
          path: 'requestedBy',
          select: 'fullName email'
        }
      })
      .populate({
        path: 'serialNumbers.currentLocation',
        select: 'centerName centerCode'
      })
      .lean();
  
      if (!testingStock) {
        return res.status(404).json({
          success: false,
          message: "No testing stock found for this product",
          data: {
            centerId: queryCenterId,
            productId: productId,
            underTestingSerials: [],
            summary: {
              totalSerials: 0,
              underTesting: 0,
              tested: 0,
              failed: 0
            }
          }
        });
      }
  
      let filteredSerials = testingStock.serialNumbers.filter(
        serial => serial.status === status
      );
  
      // Apply search filter if provided
      if (search) {
        filteredSerials = filteredSerials.filter(serial =>
          serial.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
          (serial.testingRequestId?.requestNumber?.toLowerCase().includes(search.toLowerCase()))
        );
      }
  
      // Sort serials (newest first)
      filteredSerials.sort((a, b) => {
        const dateA = new Date(a.transferHistory[0]?.transferDate || a._id.getTimestamp());
        const dateB = new Date(b.transferHistory[0]?.transferDate || b._id.getTimestamp());
        return dateB - dateA;
      });
  
      // Get status counts
      const statusCount = {};
      testingStock.serialNumbers.forEach(serial => {
        statusCount[serial.status] = (statusCount[serial.status] || 0) + 1;
      });
  
      // Format the response
      const formattedSerials = filteredSerials.map(serial => ({
        serialNumber: serial.serialNumber,
        status: serial.status,
        testResult: serial.testResult,
        currentLocation: serial.currentLocation
      }));
  
      const testingRequests = await TestingMaterial.find({
        "products.product": productId,
        toCenter: queryCenterId,
        status: { $in: ["under_testing", "pending_testing"] }
      })
      .select("requestNumber status products requestedAt requestedBy")
      .populate("requestedBy", "fullName email")
      .lean();
  
      res.status(200).json({
        success: true,
        message: "Under testing serials retrieved successfully",
        data: {
          testingStockId: testingStock._id,
          center: testingStock.center,
          product: testingStock.product,
          quantities: {
            total: testingStock.totalQuantity,
            underTesting: testingStock.underTestingQuantity,
            passed: testingStock.passedQuantity,
            failed: testingStock.failedQuantity
          },
          availableSerials:formattedSerials,
          filters: {
            status: status,
            centerId: queryCenterId,
            searchApplied: !!search
          }
        }
      });
  
    } catch (error) {
      console.error("Error getting under testing serials:", error);
      
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }
  
      res.status(500).json({
        success: false,
        message: "Error retrieving under testing serials",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      });
    }
  };