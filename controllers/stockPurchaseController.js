import StockPurchase from "../models/StockPurchase.js";
import OutletStock from "../models/OutletStock.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import Center from "../models/Center.js";
import User from "../models/User.js"; 
import mongoose from "mongoose";

const getUserOutletId = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  
  const user = await User.findById(userId)
    .populate('center', 'centerName centerCode centerType');
  
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User center information not found");
  }

  if (user.center.centerType !== "Outlet") {
    throw new Error("User does not have outlet access");
  }

  return user.center._id;
};

const validateUserOutletAccess = async (userId) => {
  if (!userId) {
    throw new Error("User authentication required");
  }

  
  const user = await User.findById(userId)
    .populate('center', 'centerName centerCode centerType');
  
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.center) {
    throw new Error("User is not associated with any center");
  }

  if (user.center.centerType !== "Outlet") {
    throw new Error("User does not have outlet access privileges");
  }

  return user.center._id;
};


const getQuickOutletId = async (userId) => {
  const user = await User.findById(userId)
    .populate('center', 'centerType');
  
  return user?.center?.centerType === "Outlet" ? user.center._id : null;
};

export const createStockPurchase = async (req, res) => {
  try {
    const {
      type,
      date,
      invoiceNo,
      vendor,
      outlet,
      transportAmount = 0,
      remark = "",
      cgst = 0,
      sgst = 0,
      igst = 0,
      products,
    } = req.body;

    let outletId = outlet;
    if (!outletId) {
      
      outletId = await getUserOutletId(req.user._id);
    }

    const processedProducts = products.map((product) => {
      const processedProduct = {
        product: product.product,
        price: product.price,
        purchasedQuantity: product.purchasedQuantity,
        availableQuantity: product.purchasedQuantity,
        serialNumbers: [],
      };

      if (product.serialNumbers && product.serialNumbers.length > 0) {
        processedProduct.serialNumbers = product.serialNumbers.map(
          (serialNumber) => ({
            serialNumber:
              typeof serialNumber === "string"
                ? serialNumber
                : serialNumber.serialNumber,
            status: "available",
            currentLocation: outletId,
            transferredTo: null,
            transferDate: null,
          })
        );
      }

      return processedProduct;
    });

    const stockPurchase = new StockPurchase({
      type: type || "new",
      date: date || new Date(),
      invoiceNo: invoiceNo.trim(),
      vendor,
      outlet: outletId,
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products: processedProducts,
    });

    const savedPurchase = await stockPurchase.save();

    for (const productItem of savedPurchase.products) {
      await OutletStock.updateStock(
        outletId,
        productItem.product,
        productItem.purchasedQuantity,
        productItem.serialNumbers,
        savedPurchase._id
      );
    }

    const populatedPurchase = await StockPurchase.findById(savedPurchase._id)
      .populate("vendor", "businessName name email mobile gstNumber")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate(
        "products.product",
        "productTitle productCode productPrice trackSerialNumber"
      );

    res.status(201).json({
      success: true,
      message: "Stock purchase created successfully",
      data: populatedPurchase,
    });
  } catch (error) {
    console.error("Error creating stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockPurchases = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      vendor,
      startDate,
      endDate,
      invoiceNo,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    
    const outletId = await validateUserOutletAccess(req.user._id);

    const filter = { outlet: outletId };

    if (type) filter.type = type;
    if (vendor) filter.vendor = vendor;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: "i" };
    }

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "invoiceNo",
      "totalAmount",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const purchases = await StockPurchase.find(filter)
      .populate("vendor", "businessName")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Stock purchases retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving stock purchases:", error);
    handleControllerError(error, res);
  }
};

export const getStockPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const outletId = await validateUserOutletAccess(req.user._id);

    const purchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    })
      .populate("vendor", "businessName")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate(
        "products.product",
        "productTitle productCode productPrice productImage"
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock purchase retrieved successfully",
      data: purchase,
    });
  } catch (error) {
    console.error("Error retrieving stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const updateStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const outletId = await validateUserOutletAccess(req.user._id);

    const {
      type,
      date,
      invoiceNo,
      vendor,
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products,
    } = req.body;

    const existingPurchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    });

    if (!existingPurchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    const hasTransfers = existingPurchase.products.some(
      (product) => product.availableQuantity < product.purchasedQuantity
    );

    if (hasTransfers) {
      return res.status(400).json({
        success: false,
        message: "Cannot update stock purchase that has transferred stock",
      });
    }

    for (const productItem of existingPurchase.products) {
      await OutletStock.findOneAndUpdate(
        { outlet: outletId, product: productItem.product },
        {
          $inc: {
            totalQuantity: -productItem.purchasedQuantity,
            availableQuantity: -productItem.purchasedQuantity,
          },
          $pull: {
            serialNumbers: { purchaseId: existingPurchase._id },
          },
        }
      );
    }

    let processedProducts = existingPurchase.products;
    if (products && Array.isArray(products)) {
      processedProducts = products.map((product) => {
        const processedProduct = {
          product: product.product,
          price: product.price,
          purchasedQuantity: product.purchasedQuantity,
          availableQuantity: product.purchasedQuantity,
          serialNumbers: [],
        };

        if (product.serialNumbers && product.serialNumbers.length > 0) {
          processedProduct.serialNumbers = product.serialNumbers.map(
            (serialNumber) => ({
              serialNumber:
                typeof serialNumber === "string"
                  ? serialNumber
                  : serialNumber.serialNumber,
              status: "available",
              currentLocation: outletId,
              transferredTo: null,
              transferDate: null,
            })
          );
        }

        return processedProduct;
      });
    }

    const updateData = {
      ...(type && { type }),
      ...(date && { date }),
      ...(invoiceNo && { invoiceNo: invoiceNo.trim() }),
      ...(vendor && { vendor }),
      ...(transportAmount !== undefined && { transportAmount }),
      ...(remark !== undefined && { remark }),
      ...(cgst !== undefined && { cgst }),
      ...(sgst !== undefined && { sgst }),
      ...(igst !== undefined && { igst }),
      ...(products && { products: processedProducts }),
    };

    const updatedPurchase = await StockPurchase.findOneAndUpdate(
      { _id: id, outlet: outletId },
      updateData,
      { new: true, runValidators: true }
    );

    for (const productItem of updatedPurchase.products) {
      await OutletStock.updateStock(
        outletId,
        productItem.product,
        productItem.purchasedQuantity,
        productItem.serialNumbers,
        updatedPurchase._id
      );
    }

    const populatedPurchase = await StockPurchase.findById(updatedPurchase._id)
      .populate("vendor", "businessName name email mobile")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode productPrice");

    res.status(200).json({
      success: true,
      message: "Stock purchase updated successfully",
      data: populatedPurchase,
    });
  } catch (error) {
    console.error("Error updating stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const deleteStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const outletId = await validateUserOutletAccess(req.user._id);

    const purchase = await StockPurchase.findOne({
      _id: id,
      outlet: outletId,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Stock purchase not found or access denied",
      });
    }

    const hasTransfers = purchase.products.some(
      (product) => product.availableQuantity < product.purchasedQuantity
    );

    if (hasTransfers) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete stock purchase that has transferred stock",
      });
    }

    for (const productItem of purchase.products) {
      await OutletStock.findOneAndUpdate(
        { outlet: outletId, product: productItem.product },
        {
          $inc: {
            totalQuantity: -productItem.purchasedQuantity,
            availableQuantity: -productItem.purchasedQuantity,
          },
          $pull: {
            serialNumbers: { purchaseId: purchase._id },
          },
        }
      );
    }

    await StockPurchase.findOneAndDelete({ _id: id, outlet: outletId });

    res.status(200).json({
      success: true,
      message: "Stock purchase deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting stock purchase:", error);
    handleControllerError(error, res);
  }
};

export const getPurchasesByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const outletId = await validateUserOutletAccess(req.user._id);

    const purchases = await StockPurchase.find({
      vendor: vendorId,
      outlet: outletId,
    })
      .populate("vendor", "businessName name email mobile")
      .populate("outlet", "_id centerName centerCode centerType")
      .populate("products.product", "productTitle productCode")
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments({
      vendor: vendorId,
      outlet: outletId,
    });

    res.status(200).json({
      success: true,
      message: "Vendor purchases retrieved successfully",
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving vendor purchases:", error);
    handleControllerError(error, res);
  }
};

export const getAllProductsWithStock = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category } = req.query;
    
    // Get user's center information
    const user = await User.findById(req.user._id)
      .populate('center', 'centerName centerCode centerType');
    
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;
    const centerType = user.center.centerType;

    const productFilter = {};

    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      productFilter.category = category;
    }

    const products = await Product.find(productFilter)
      .select("productTitle productCode description category productPrice trackSerialNumber productImage")
      .sort({ productTitle: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalProducts = await Product.countDocuments(productFilter);

    let stockData = [];
    let centerDetails = null;

    if (centerType === "Outlet") {
      // For outlets, get stock from StockPurchase and OutletStock
      centerDetails = await Center.findById(centerId).select(
        "_id partner area centerType centerName centerCode"
      );

      stockData = await StockPurchase.aggregate([
        {
          $match: { outlet: centerId },
        },
        {
          $unwind: "$products",
        },
        {
          $group: {
            _id: "$products.product",
            totalPurchased: { $sum: "$products.purchasedQuantity" },
            totalAvailable: { $sum: "$products.availableQuantity" },
            purchaseCount: { $sum: 1 },
          },
        },
      ]);

      // Also get current stock status from OutletStock
      const outletStockData = await OutletStock.aggregate([
        {
          $match: { outlet: centerId }
        },
        {
          $group: {
            _id: "$product",
            currentTotalQuantity: { $sum: "$totalQuantity" },
            currentAvailableQuantity: { $sum: "$availableQuantity" }
          }
        }
      ]);

      // Merge both data sources
      const outletStockMap = new Map();
      outletStockData.forEach(item => {
        outletStockMap.set(item._id.toString(), {
          currentTotalQuantity: item.currentTotalQuantity,
          currentAvailableQuantity: item.currentAvailableQuantity
        });
      });

      // Update stockData with current quantities
      stockData = stockData.map(item => {
        const currentStock = outletStockMap.get(item._id.toString());
        return {
          ...item,
          currentTotalQuantity: currentStock?.currentTotalQuantity || 0,
          currentAvailableQuantity: currentStock?.currentAvailableQuantity || 0
        };
      });

    } else if (centerType === "Center") {
      // For centers, get stock from CenterStock
      centerDetails = await Center.findById(centerId).select(
        "_id partner area centerType centerName centerCode"
      );

      stockData = await CenterStock.aggregate([
        {
          $match: { center: centerId },
        },
        {
          $group: {
            _id: "$product",
            totalQuantity: { $sum: "$totalQuantity" },
            availableQuantity: { $sum: "$availableQuantity" },
            stockEntries: { $sum: 1 },
          },
        },
      ]);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid center type",
      });
    }

    const stockMap = new Map();
    stockData.forEach((item) => {
      if (centerType === "Outlet") {
        stockMap.set(item._id.toString(), {
          totalPurchased: item.totalPurchased,
          totalAvailable: item.totalAvailable || item.currentAvailableQuantity,
          purchaseCount: item.purchaseCount,
          currentTotalQuantity: item.currentTotalQuantity,
          currentAvailableQuantity: item.currentAvailableQuantity
        });
      } else {
        stockMap.set(item._id.toString(), {
          totalQuantity: item.totalQuantity,
          availableQuantity: item.availableQuantity,
          stockEntries: item.stockEntries,
        });
      }
    });

    const productsWithStock = products.map((product) => {
      const productId = product._id.toString();
      let stockInfo;

      if (centerType === "Outlet") {
        const stockData = stockMap.get(productId) || {
          totalPurchased: 0,
          totalAvailable: 0,
          purchaseCount: 0,
          currentTotalQuantity: 0,
          currentAvailableQuantity: 0
        };
        
        stockInfo = {
          totalPurchased: stockData.totalPurchased,
          totalAvailable: stockData.currentAvailableQuantity || stockData.totalAvailable,
          purchaseCount: stockData.purchaseCount,
          currentStock: stockData.currentAvailableQuantity || stockData.totalAvailable
        };
      } else {
        const stockData = stockMap.get(productId) || {
          totalQuantity: 0,
          availableQuantity: 0,
          stockEntries: 0,
        };
        
        stockInfo = {
          totalQuantity: stockData.totalQuantity,
          availableQuantity: stockData.availableQuantity,
          stockEntries: stockData.stockEntries,
          currentStock: stockData.availableQuantity
        };
      }

      return {
        ...product.toObject(),
        stock: stockInfo,
      };
    });

    // Calculate total stock summary
    const totalStockSummary = {
      totalProducts: productsWithStock.length,
      totalItemsInStock: 0,
      totalAvailableItems: 0
    };

    productsWithStock.forEach(product => {
      totalStockSummary.totalItemsInStock += centerType === "Outlet" 
        ? product.stock.totalPurchased 
        : product.stock.totalQuantity;
      totalStockSummary.totalAvailableItems += product.stock.currentStock;
    });

    res.status(200).json({
      success: true,
      message: `Products with stock information retrieved successfully for ${centerType.toLowerCase()}`,
      data: productsWithStock,
      center: centerDetails,
      stockSummary: {
        centerType,
        ...totalStockSummary
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving products with stock:", error);
    handleControllerError(error, res);
  }
};

export const getAvailableStock = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    })
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("outlet", "centerName centerCode centerType address");

    if (!outletStock) {
      const product = await Product.findById(productId).select(
        "productTitle productCode trackSerialNumber"
      );
      const outlet = await Center.findById(outletId).select(
        "centerName centerCode centerType address"
      );

      return res.status(200).json({
        success: true,
        message: "Available stock retrieved successfully",
        data: {
          product,
          outlet,
          totalAvailable: 0,
          availableByPurchase: [],
        },
      });
    }

    const stockByPurchase = await StockPurchase.aggregate([
      {
        $match: {
          outlet: new mongoose.Types.ObjectId(outletId),
          "products.product": new mongoose.Types.ObjectId(productId),
          "products.availableQuantity": { $gt: 0 },
        },
      },
      { $unwind: "$products" },
      {
        $match: {
          "products.product": new mongoose.Types.ObjectId(productId),
          "products.availableQuantity": { $gt: 0 },
        },
      },
      {
        $project: {
          purchaseId: "$_id",
          date: 1,
          invoiceNo: 1,
          availableQuantity: "$products.availableQuantity",
          serialNumbers: {
            $filter: {
              input: "$products.serialNumbers",
              as: "serial",
              cond: { $eq: ["$$serial.status", "available"] },
            },
          },
        },
      },
      { $sort: { date: 1 } },
    ]);

    const availableByPurchase = stockByPurchase.map((purchase) => ({
      purchaseId: purchase.purchaseId,
      availableQuantity: purchase.availableQuantity,
      serials: purchase.serialNumbers.map((sn) => sn.serialNumber),
      purchaseDate: purchase.date,
      invoiceNo: purchase.invoiceNo,
    }));

    res.status(200).json({
      success: true,
      message: "Available stock retrieved successfully",
      data: {
        product: outletStock.product,
        outlet: outletStock.outlet,
        totalAvailable: outletStock.availableQuantity,
        availableByPurchase,
      },
    });
  } catch (error) {
    console.error("Error retrieving available stock:", error);
    handleControllerError(error, res);
  }
};

export const getOutletStockSummary = async (req, res) => {
  try {
    
    const outletId = await getUserOutletId(req.user._id);

    const outlet = await Center.findById(outletId).select(
      "centerName centerCode centerType address phone email"
    );

    if (!outlet) {
      return res.status(404).json({
        success: false,
        message: "Outlet not found",
      });
    }

    const stockSummary = await OutletStock.find({ outlet: outletId })
      .populate(
        "product",
        "productTitle productCode category trackSerialNumber productImage"
      )
      .populate("outlet", "centerName centerCode centerType")
      .sort({ "product.productTitle": 1 });

    const totalProducts = stockSummary.length;
    const totalQuantity = stockSummary.reduce(
      (sum, item) => sum + item.totalQuantity,
      0
    );
    const availableQuantity = stockSummary.reduce(
      (sum, item) => sum + item.availableQuantity,
      0
    );

    res.status(200).json({
      success: true,
      message: "Outlet stock summary retrieved successfully",
      data: {
        outlet,
        summary: {
          totalProducts,
          totalQuantity,
          availableQuantity,
          inTransitQuantity: totalQuantity - availableQuantity,
        },
        products: stockSummary,
      },
    });
  } catch (error) {
    console.error("Error retrieving outlet stock summary:", error);
    handleControllerError(error, res);
  }
};

export const getCenterStockSummary = async (req, res) => {
  try {
    const { centerId } = req.params;

    const center = await Center.findById(centerId).select(
      "centerName centerCode centerType address phone email"
    );

    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    const stockSummary = await CenterStock.getCenterStockSummary(centerId);

    const responseData = Array.isArray(stockSummary)
      ? stockSummary.map((item) => ({
          ...item,
          center: center,
        }))
      : stockSummary;

    res.status(200).json({
      success: true,
      message: "Center stock summary retrieved successfully",
      data: {
        center,
        stockSummary: responseData,
      },
    });
  } catch (error) {
    console.error("Error retrieving center stock summary:", error);
    handleControllerError(error, res);
  }
};

export const getOutletSerialNumbers = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    })
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    if (!outletStock) {
      return res.status(200).json({
        success: true,
        message: "No stock found for the specified product",
        data: {
          outlet: await Center.findById(outletId).select(
            "centerName centerCode centerType"
          ),
          product: await Product.findById(productId).select(
            "productTitle productCode trackSerialNumber"
          ),
          availableSerials: [],
          totalAvailable: 0,
        },
      });
    }

    const availableSerials = outletStock.serialNumbers
      .filter((sn) => sn.status === "available")
      .map((sn) => ({
        serialNumber: sn.serialNumber,
        purchaseId: sn.purchaseId,
        currentLocation: sn.currentLocation,
        status: sn.status,
      }));

    res.status(200).json({
      success: true,
      message: "Available serial numbers retrieved successfully",
      data: {
        outletStock: {
          _id: outletStock._id,
          outlet: outletStock.outlet,
          product: outletStock.product,
          totalQuantity: outletStock.totalQuantity,
          availableQuantity: outletStock.availableQuantity,
        },
        availableSerials,
        totalAvailable: availableSerials.length,
      },
    });
  } catch (error) {
    console.error("Error retrieving outlet serial numbers:", error);
    handleControllerError(error, res);
  }
};

export const updateOutletSerialNumber = async (req, res) => {
  try {
    const { productId, serialNumber } = req.params;
    const { newSerialNumber } = req.body;
    
    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    });

    if (!outletStock) {
      return res.status(404).json({
        success: false,
        message: "Outlet stock not found for the specified product",
      });
    }

    const serialIndex = outletStock.serialNumbers.findIndex(
      (sn) => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serialIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Serial number not found or not available",
      });
    }

    const oldSerialNumber = outletStock.serialNumbers[serialIndex].serialNumber;
    outletStock.serialNumbers[serialIndex].serialNumber = newSerialNumber;
    outletStock.lastUpdated = new Date();

    await outletStock.save();

    await StockPurchase.updateOne(
      {
        outlet: outletId,
        "products.product": productId,
        "products.serialNumbers.serialNumber": oldSerialNumber,
      },
      {
        $set: {
          "products.$[product].serialNumbers.$[serial].serialNumber":
            newSerialNumber,
        },
      },
      {
        arrayFilters: [
          { "product.product": new mongoose.Types.ObjectId(productId) },
          { "serial.serialNumber": oldSerialNumber },
        ],
      }
    );

    const updatedStock = await OutletStock.findById(outletStock._id)
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    res.status(200).json({
      success: true,
      message: "Serial number updated successfully",
      data: {
        outletStock: updatedStock,
        oldSerialNumber,
        newSerialNumber,
        updatedAt: outletStock.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error updating outlet serial number:", error);
    handleControllerError(error, res);
  }
};

export const deleteOutletSerialNumber = async (req, res) => {
  try {
    const { productId, serialNumber } = req.params;
    
    const outletId = await getUserOutletId(req.user._id);

    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
    });

    if (!outletStock) {
      return res.status(404).json({
        success: false,
        message: "Outlet stock not found for the specified product",
      });
    }

    const serialIndex = outletStock.serialNumbers.findIndex(
      (sn) => sn.serialNumber === serialNumber && sn.status === "available"
    );

    if (serialIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Serial number not found or not available",
      });
    }

    outletStock.serialNumbers.splice(serialIndex, 1);
    outletStock.totalQuantity -= 1;
    outletStock.availableQuantity -= 1;
    outletStock.lastUpdated = new Date();

    await outletStock.save();

    await StockPurchase.updateOne(
      {
        outlet: outletId,
        "products.product": productId,
        "products.serialNumbers.serialNumber": serialNumber,
      },
      {
        $pull: {
          "products.$[product].serialNumbers": { serialNumber: serialNumber },
        },
        $inc: {
          "products.$[product].availableQuantity": -1,
          "products.$[product].purchasedQuantity": -1,
        },
      },
      {
        arrayFilters: [
          { "product.product": new mongoose.Types.ObjectId(productId) },
        ],
      }
    );

    const updatedStock = await OutletStock.findById(outletStock._id)
      .populate("outlet", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    res.status(200).json({
      success: true,
      message: "Serial number deleted and stock adjusted successfully",
      data: {
        outletStock: updatedStock,
        deletedSerialNumber: serialNumber,
        stockAdjustment: {
          totalQuantity: -1,
          availableQuantity: -1,
        },
        updatedAt: outletStock.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error deleting outlet serial number:", error);
    handleControllerError(error, res);
  }
};

const handleControllerError = (error, res) => {
  console.error("Controller Error:", error);

  if (
    error.message.includes("User center information not found") ||
    error.message.includes("User authentication required") ||
    error.message.includes("User does not have outlet access") ||
    error.message.includes("User not found") ||
    error.message.includes("User ID is required")
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

  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate invoice number found",
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