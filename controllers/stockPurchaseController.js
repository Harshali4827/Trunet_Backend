import StockPurchase from '../models/StockPurchase.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Center from '../models/Center.js';

const validateUserOutletCenter = async (userId) => {
  if (!userId) {
    throw new Error('User authentication required');
  }

  const user = await User.findById(userId).populate('center', 'centerName centerCode centerType');
  
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.center) {
    throw new Error('User center information not found');
  }

  if (user.center.centerType !== 'Outlet') {
    throw new Error(`Stock purchases can only be created for outlet centers. Your center type is: ${user.center.centerType}`);
  }

  return user.center.centerName; 
};


const validateUserForOutletCenter = async (userId) => {
  if (!userId) {
    throw new Error('User authentication required');
  }

  const user = await User.findById(userId).populate('center', 'centerName centerCode centerType');
  
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.center) {
    throw new Error('User center information not found');
  }

  const allowedCenterTypes = ['Outlet', 'Center'];
  if (!allowedCenterTypes.includes(user.center.centerType)) {
    throw new Error(`Stock purchases can only be created for outlet or center types. Your center type is: ${user.center.centerType}`);
  }

  return user.center.centerName; 
};

export const createStockPurchase = async (req, res) => {
  try {
    const {
      type,
      date,
      invoiceNo,
      vendor,
      transportAmount = 0,
      remark = '',
      cgst = 0,
      sgst = 0,
      igst = 0,
      products
    } = req.body;

    const outlet = await validateUserOutletCenter(req.user?.id);

    if (!invoiceNo) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required'
      });
    }

    if (!vendor || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vendor and at least one product are required'
      });
    }

    const existingInvoice = await StockPurchase.findOne({ 
      invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, 'i') } 
    });
    
    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: `Invoice number '${invoiceNo}' already exists`
      });
    }

    const processedProducts = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (!product.product || !product.price || !product.purchasedQuantity) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${i} must have product ID, price, and purchased quantity`
        });
      }

      if (product.purchasedQuantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Purchased quantity for product at index ${i} must be at least 1`
        });
      }

      const productDoc = await Product.findById(product.product);
      if (!productDoc) {
        return res.status(404).json({
          success: false,
          message: `Product with ID ${product.product} not found`
        });
      }

      const existingPurchases = await StockPurchase.find({
        outlet: outlet,
        'products.product': product.product
      });

      let currentTotalAvailableStock = 0;
 
      existingPurchases.forEach(purchase => {
        purchase.products.forEach(prod => {
          if (prod.product.toString() === product.product) {
            currentTotalAvailableStock += prod.availableQuantity;
          }
        });
      });

      const availableQuantityForThisPurchase = currentTotalAvailableStock + product.purchasedQuantity;

      const processedProduct = {
        product: product.product,
        price: product.price,
        purchasedQuantity: product.purchasedQuantity,
        availableQuantity: availableQuantityForThisPurchase, 
        serialNumbers: product.serialNumbers || []
      };

      if (productDoc.trackSerialNumber === 'Yes') {
        if (!product.serialNumbers || !Array.isArray(product.serialNumbers)) {
          return res.status(400).json({
            success: false,
            message: `Product "${productDoc.productTitle}" requires serial numbers`
          });
        }
        
        if (product.serialNumbers.length !== product.purchasedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Product "${productDoc.productTitle}" requires exactly ${product.purchasedQuantity} serial numbers`
          });
        }

        const serialSet = new Set(product.serialNumbers);
        if (serialSet.size !== product.serialNumbers.length) {
          return res.status(400).json({
            success: false,
            message: `Duplicate serial numbers found for product: ${productDoc.productTitle}`
          });
        }
        
        processedProduct.serialNumbers = product.serialNumbers;
      } else {
        if (product.serialNumbers && product.serialNumbers.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Product "${productDoc.productTitle}" does not require serial number tracking`
          });
        }
        processedProduct.serialNumbers = [];
      }

      processedProducts.push(processedProduct);
    }

    const vendorExists = await Vendor.findById(vendor);
    if (!vendorExists) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const stockPurchase = new StockPurchase({
      type: type || 'new',
      date: date || new Date(),
      invoiceNo: invoiceNo.trim(),
      vendor,
      outlet: outlet, 
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products: processedProducts
    });

    const savedPurchase = await stockPurchase.save();

    const populatedPurchase = await StockPurchase.findById(savedPurchase._id)
      .populate('vendor', 'businessName name email mobile gstNumber')
      .populate('products.product', 'productTitle productCode productPrice trackSerialNumber');

    res.status(201).json({
      success: true,
      message: 'Stock purchase created successfully',
      data: populatedPurchase
    });

  } catch (error) {
    console.error('Error creating stock purchase:', error);
    
    if (error.message.includes('outlet centers') || error.message.includes('center types') || error.message.includes('User authentication')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (field === 'invoiceNo') {
        return res.status(400).json({
          success: false,
          message: `Invoice number '${req.body.invoiceNo}' already exists`
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error creating stock purchase',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAllStockPurchases = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      vendor,
      outlet,
      startDate,
      endDate,
      invoiceNo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (type) {
      filter.type = type;
    }

    if (vendor) {
      filter.vendor = vendor;
    }

    if (outlet) {
      filter.outlet = outlet;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { remark: { $regex: search, $options: 'i' } },
        { outlet: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'date', 'invoiceNo', 'totalAmount'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    const purchases = await StockPurchase.find(filter)
      .populate('vendor', 'businessName')
      .populate('products.product', 'productTitle')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Stock purchases retrieved successfully',
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
    });

  } catch (error) {
    console.error('Error retrieving stock purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock purchases',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


export const getStockPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const purchase = await StockPurchase.findById(id)
      .populate('vendor', 'businessName name email mobile gstNumber panNumber address1 address2 city state')
      .populate('products.product', 'productTitle productCode productPrice productImage trackSerialNumber repairable replaceable');

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Stock purchase not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Stock purchase retrieved successfully',
      data: purchase
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock purchase ID'
      });
    }

    console.error('Error retrieving stock purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock purchase',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type,
      date,
      invoiceNo,
      vendor,
      outlet,
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products
    } = req.body;

    const existingPurchase = await StockPurchase.findById(id);
    if (!existingPurchase) {
      return res.status(404).json({
        success: false,
        message: 'Stock purchase not found'
      });
    }

    if (invoiceNo && invoiceNo !== existingPurchase.invoiceNo) {
      const existingInvoice = await StockPurchase.findOne({ 
        invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, 'i') },
        _id: { $ne: id } 
      });
      
      if (existingInvoice) {
        return res.status(400).json({
          success: false,
          message: `Invoice number '${invoiceNo}' already exists`
        });
      }
    }

    if (products && Array.isArray(products)) {
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one product is required'
        });
      }

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        if (!product.product || !product.price || !product.purchasedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Product at index ${i} must have product ID, price, and purchased quantity`
          });
        }

        const productDoc = await Product.findById(product.product);
        if (!productDoc) {
          return res.status(404).json({
            success: false,
            message: `Product with ID ${product.product} not found`
          });
        }


        product.availableQuantity = product.purchasedQuantity;

        if (productDoc.trackSerialNumber === 'Yes') {
          if (!product.serialNumbers || !Array.isArray(product.serialNumbers)) {
            return res.status(400).json({
              success: false,
              message: `Product "${productDoc.productTitle}" requires serial numbers`
            });
          }
          
          if (product.serialNumbers.length !== product.purchasedQuantity) {
            return res.status(400).json({
              success: false,
              message: `Product "${productDoc.productTitle}" requires exactly ${product.purchasedQuantity} serial numbers`
            });
          }

          const serialSet = new Set(product.serialNumbers);
          if (serialSet.size !== product.serialNumbers.length) {
            return res.status(400).json({
              success: false,
              message: `Duplicate serial numbers found for product: ${productDoc.productTitle}`
            });
          }
        } else {
          product.serialNumbers = [];
        }
      }
    }

    if (vendor) {
      const vendorExists = await Vendor.findById(vendor);
      if (!vendorExists) {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found'
        });
      }
    }

    const updateData = {
      ...(type && { type }),
      ...(date && { date }),
      ...(invoiceNo && { invoiceNo: invoiceNo.trim() }),
      ...(vendor && { vendor }),
      ...(outlet && { outlet: outlet.trim() }),
      ...(transportAmount !== undefined && { transportAmount }),
      ...(remark !== undefined && { remark }),
      ...(cgst !== undefined && { cgst }),
      ...(sgst !== undefined && { sgst }),
      ...(igst !== undefined && { igst }),
      ...(products && { products })
    };

    const updatedPurchase = await StockPurchase.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('vendor', 'businessName name email mobile')
      .populate('products.product', 'productTitle productCode productPrice');

    res.status(200).json({
      success: true,
      message: 'Stock purchase updated successfully',
      data: updatedPurchase
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock purchase ID'
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (field === 'invoiceNo') {
        return res.status(400).json({
          success: false,
          message: `Invoice number '${req.body.invoiceNo}' already exists`
        });
      }
    }

    console.error('Error updating stock purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock purchase',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const deleteStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;

    const purchase = await StockPurchase.findById(id);
    
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Stock purchase not found'
      });
    }

    await StockPurchase.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Stock purchase deleted successfully'
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock purchase ID'
      });
    }

    console.error('Error deleting stock purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting stock purchase',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getPurchasesByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const purchases = await StockPurchase.find({ vendor: vendorId })
      .populate('vendor', 'businessName name email mobile')
      .populate('products.product', 'productTitle productCode')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments({ vendor: vendorId });

    res.status(200).json({
      success: true,
      message: 'Vendor purchases retrieved successfully',
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error retrieving vendor purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving vendor purchases',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getPurchasesByOutlet = async (req, res) => {
  try {
    const { outlet } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const purchases = await StockPurchase.find({ outlet: outlet })
      .populate('vendor', 'businessName name email mobile')
      .populate('products.product', 'productTitle productCode')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockPurchase.countDocuments({ outlet: outlet });

    res.status(200).json({
      success: true,
      message: 'Outlet purchases retrieved successfully',
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error retrieving outlet purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving outlet purchases',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAllProductsWithStock = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category } = req.query;

    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    let outlet;
    try {
      outlet = await validateUserForOutletCenter(req.user?.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    const productFilter = {};
    
    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      productFilter.category = category;
    }

    const products = await Product.find(productFilter)
      .select('productTitle productCode description category productPrice trackSerialNumber productImage repairable replaceable')
      .sort({ productTitle: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalProducts = await Product.countDocuments(productFilter);

    const stockData = await StockPurchase.aggregate([
      {
        $match: { outlet: outlet }
      },
      {
        $unwind: '$products'
      },
      {
        $group: {
          _id: '$products.product',
          totalPurchased: { $sum: '$products.purchasedQuantity' },
          totalAvailable: { $sum: '$products.availableQuantity' },
          purchaseCount: { $sum: 1 }
        }
      }
    ]);

    const stockMap = new Map();
    stockData.forEach(item => {
      stockMap.set(item._id.toString(), {
        totalPurchased: item.totalPurchased,
        totalAvailable: item.totalAvailable,
        purchaseCount: item.purchaseCount
      });
    });

    const productsWithStock = products.map(product => {
      const productId = product._id.toString();
      const stockInfo = stockMap.get(productId) || {
        totalPurchased: 0,
        totalAvailable: 0,
        purchaseCount: 0
      };

      return {
        ...product.toObject(),
        stock: stockInfo,
        outlet: outlet
      };
    });

    const categoryCounts = await Product.aggregate([
      { $match: productFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = {};
    categoryCounts.forEach(cat => {
      categoryStats[cat._id || 'Uncategorized'] = cat.count;
    });

    res.status(200).json({
      success: true,
      message: 'Products with stock information retrieved successfully',
      data: productsWithStock,
      outlet: outlet,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error retrieving products with stock:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving products with stock information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};