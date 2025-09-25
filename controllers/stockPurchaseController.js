import StockPurchase from '../models/StockPurchase.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';

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
      products,
      status = 'draft'
    } = req.body;


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

        if (product.serialNumbers && product.serialNumbers.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Product "${productDoc.productTitle}" does not require serial number tracking`
          });
        }
   
        product.serialNumbers = [];
      }
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
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products,
      status
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
      status,
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

    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
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
        { remark: { $regex: search, $options: 'i' } }
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

    const statusCounts = await StockPurchase.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusStats = {};
    statusCounts.forEach(stat => {
      statusStats[stat._id] = stat.count;
    });

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
      transportAmount,
      remark,
      cgst,
      sgst,
      igst,
      products,
      status
    } = req.body;

    const existingPurchase = await StockPurchase.findById(id);
    if (!existingPurchase) {
      return res.status(404).json({
        success: false,
        message: 'Stock purchase not found'
      });
    }

    if (['completed', 'cancelled'].includes(existingPurchase.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed or cancelled purchases'
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
      ...(transportAmount !== undefined && { transportAmount }),
      ...(remark !== undefined && { remark }),
      ...(cgst !== undefined && { cgst }),
      ...(sgst !== undefined && { sgst }),
      ...(igst !== undefined && { igst }),
      ...(products && { products }),
      ...(status && { status })
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


export const checkInvoiceNumberAvailability = async (req, res) => {
  try {
    const { invoiceNo, excludeId } = req.query;

    if (!invoiceNo) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required'
      });
    }

    const filter = { 
      invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, 'i') } 
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const existingInvoice = await StockPurchase.findOne(filter);

    res.status(200).json({
      success: true,
      available: !existingInvoice,
      message: existingInvoice ? 
        `Invoice number '${invoiceNo}' is already in use` : 
        `Invoice number '${invoiceNo}' is available`
    });

  } catch (error) {
    console.error('Error checking invoice number availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking invoice number availability',
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

    if (purchase.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft purchases can be deleted'
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


export const updateStockPurchaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['draft', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const purchase = await StockPurchase.findById(id);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Stock purchase not found'
      });
    }

    const updatedPurchase = await StockPurchase.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .populate('vendor', 'businessName name email mobile')
      .populate('products.product', 'productTitle productCode productPrice');

    res.status(200).json({
      success: true,
      message: `Stock purchase status updated to ${status}`,
      data: updatedPurchase
    });

  } catch (error) {
    console.error('Error updating stock purchase status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock purchase status',
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