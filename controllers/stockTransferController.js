import StockTransfer from '../models/StockTransfer.js';
import Center from '../models/Center.js';
import User from '../models/User.js';
import CenterStock from '../models/CenterStock.js';
import mongoose from 'mongoose';

export const createStockTransfer = async (req, res) => {
  try {
    const {
      fromCenter,
      transferNumber,
      remark,
      products,
      date,
      status = 'Draft' // Default to 'Draft' if not provided
    } = req.body;

    // Validate required fields
    if (!transferNumber || transferNumber.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Transfer number is required'
      });
    }

    // Validate status if provided
    const validStatuses = ['Draft', 'Submitted'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "Draft" or "Submitted" when creating a transfer'
      });
    }

    const existingTransfer = await StockTransfer.findOne({ 
      transferNumber: transferNumber.trim() 
    });
    
    if (existingTransfer) {
      return res.status(409).json({
        success: false,
        message: 'Transfer number already exists. Please use a unique transfer number.',
        duplicateTransferNumber: transferNumber.trim(),
        existingTransferId: existingTransfer._id
      });
    }

    // Get logged in user's center (toCenter)
    const user = await User.findById(req.user.id).populate('center');
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: 'User center information not found'
      });
    }

    const toCenterId = user.center._id;

    // Validate centers exist
    const fromCenterExists = await Center.findById(fromCenter);
    const toCenterExists = await Center.findById(toCenterId);
    
    if (!fromCenterExists || !toCenterExists) {
      return res.status(404).json({
        success: false,
        message: 'Source or destination center not found'
      });
    }

    // Validate products array
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Products array is required and cannot be empty'
      });
    }

    // Validate each product
    for (const product of products) {
      if (!product.product || !product.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Each product must have product ID and quantity'
        });
      }
      
      if (product.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Product quantity must be greater than 0'
        });
      }
    }

    // Set date
    let transferDate = new Date();
    if (date) {
      transferDate = new Date(date);
      if (isNaN(transferDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Please provide a valid date.'
        });
      }
    }

    // Create stock transfer with the provided status
    const stockTransfer = new StockTransfer({
      transferNumber: transferNumber.trim(),
      fromCenter,
      toCenter: toCenterId,
      remark: remark || '',
      products,
      date: transferDate,
      status: status, // Use the status from request body
      createdBy: req.user.id
    });

    // If status is 'Submitted', validate stock availability and serial numbers
    if (status === 'Submitted') {
      try {
        await stockTransfer.validateSerialNumbers();
        await stockTransfer.validateStockAvailability();
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: `Cannot create transfer with Submitted status: ${validationError.message}`
        });
      }
    }

    const savedStockTransfer = await stockTransfer.save();

    // Populate and return
    const populatedTransfer = await StockTransfer.findById(savedStockTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email');

    res.status(201).json({
      success: true,
      message: `Stock transfer created successfully with status: ${status}`,
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error creating stock transfer:', error);
    
    // Handle duplicate transfer number
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === 'transferNumber') {
        return res.status(409).json({
          success: false,
          message: 'Transfer number already exists. Please use a unique transfer number.',
          duplicateTransferNumber: req.body.transferNumber
        });
      }
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    // Handle cast errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path}: ${error.value}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating stock transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const submitStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Submit the transfer
    const submittedTransfer = await stockTransfer.submitTransfer();

    const populatedTransfer = await StockTransfer.findById(submittedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer submitted successfully. Waiting for admin approval.',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error submitting stock transfer:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const approveStockTransferByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Approve by admin
    const approvedTransfer = await stockTransfer.approveByAdmin(userId);

    const populatedTransfer = await StockTransfer.findById(approvedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('adminApproval.approvedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer approved by admin successfully',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error approving stock transfer by admin:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const rejectStockTransferByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Reject by admin
    const rejectedTransfer = await stockTransfer.rejectByAdmin(userId);

    const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('adminApproval.rejectedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer rejected by admin',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error rejecting stock transfer by admin:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const confirmStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Validate product approvals if provided
    if (productApprovals && Array.isArray(productApprovals)) {
      // Validate each product approval
      for (const approval of productApprovals) {
        if (!approval.productId) {
          return res.status(400).json({
            success: false,
            message: 'Each approval must have a productId'
          });
        }
        
        if (approval.approvedQuantity === undefined || approval.approvedQuantity === null) {
          return res.status(400).json({
            success: false,
            message: 'Each approval must have an approvedQuantity'
          });
        }
        
        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: 'Approved quantity cannot be negative'
          });
        }

        // Find the corresponding product in the transfer
        const productItem = stockTransfer.products.find(
          p => p.product.toString() === approval.productId.toString()
        );
        
        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product with ID ${approval.productId} not found in this transfer`
          });
        }

        // Validate approved quantity doesn't exceed requested quantity
        if (approval.approvedQuantity > productItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${productItem.product}`
          });
        }
      }

      // Update product approved quantities before confirmation
      stockTransfer.products = stockTransfer.products.map(productItem => {
        const approval = productApprovals.find(
          pa => pa.productId.toString() === productItem.product.toString()
        );
        
        if (approval) {
          return {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedRemark: approval.approvedRemark || ''
          };
        }
        return productItem;
      });
    }

    // Confirm transfer (by destination center) with optional product approvals
    const confirmedTransfer = await stockTransfer.confirmTransfer(userId, productApprovals);

    const populatedTransfer = await StockTransfer.findById(confirmedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('centerApproval.approvedBy', '_id fullName email');

    // Prepare response message
    let message = 'Stock transfer confirmed successfully';
    if (productApprovals && productApprovals.length > 0) {
      message += ` with ${productApprovals.length} product quantity adjustment(s)`;
    }

    res.status(200).json({
      success: true,
      message,
      data: populatedTransfer,
      ...(productApprovals && {
        approvedQuantities: productApprovals.map(approval => ({
          productId: approval.productId,
          approvedQuantity: approval.approvedQuantity,
          approvedRemark: approval.approvedRemark || ''
        }))
      })
    });

  } catch (error) {
    console.error('Error confirming stock transfer:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID or transfer ID'
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

    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const shipStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      shippedDate, 
      expectedDeliveryDate, 
      shipmentDetails, 
      carrierInfo 
    } = req.body;

    console.log(`[DEBUG] Starting shipStockTransfer for transfer ID: ${id}`);

    const stockTransfer = await StockTransfer.findById(id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumber');

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    console.log(`[DEBUG] Found transfer: ${stockTransfer.transferNumber}, Status: ${stockTransfer.status}`);

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const shippingDetails = {
      ...(shippedDate && { shippedDate: new Date(shippedDate) }),
      ...(expectedDeliveryDate && { expectedDeliveryDate: new Date(expectedDeliveryDate) }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(carrierInfo && { carrierInfo })
    };

    // Pre-validate stock and serial number availability
    console.log(`[DEBUG] Pre-validating stock and serial number availability...`);
    const CenterStock = mongoose.model('CenterStock');
    
    for (const [index, productItem] of stockTransfer.products.entries()) {
      const product = await mongoose.model('Product').findById(productItem.product);
      const requiresSerials = product ? (product.trackSerialNumber === 'Yes') : false;
      
      console.log(`\n[DEBUG] Product ${index + 1}: ${product?.productTitle}`);
      console.log(`[DEBUG] - Requires serial numbers: ${requiresSerials}`);
      
      const centerStock = await CenterStock.findOne({
        center: stockTransfer.fromCenter._id,
        product: productItem.product._id
      });

      if (centerStock) {
        console.log(`[DEBUG] - Available quantity: ${centerStock.availableQuantity}`);
        
        if (requiresSerials) {
          const availableSerials = centerStock.serialNumbers?.filter(sn => sn.status === 'available') || [];
          console.log(`[DEBUG] - Available serial numbers: ${availableSerials.length}`);
          console.log(`[DEBUG] - Required quantity: ${productItem.approvedQuantity || productItem.quantity}`);
          
          if (availableSerials.length < (productItem.approvedQuantity || productItem.quantity)) {
            return res.status(400).json({
              success: false,
              message: `Insufficient serial numbers available for product "${product?.productTitle}". Available: ${availableSerials.length}, Required: ${productItem.approvedQuantity || productItem.quantity}`,
              details: {
                product: product?.productTitle,
                availableSerials: availableSerials.length,
                requiredQuantity: productItem.approvedQuantity || productItem.quantity
              }
            });
          }
        }
      }
    }

    console.log(`[DEBUG] All pre-validations passed. Attempting to ship transfer...`);
    
    // Ship transfer (stock will be deducted from fromCenter here)
    const shippedTransfer = await stockTransfer.shipTransfer(userId, shippingDetails);
    console.log(`[DEBUG] Transfer shipped successfully. New status: ${shippedTransfer.status}`);

    const populatedTransfer = await StockTransfer.findById(shippedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumber')
      .populate('createdBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer shipped successfully. Stock deducted from source center.',
      data: populatedTransfer
    });

  } catch (error) {
    console.error(`[DEBUG] ERROR in shipStockTransfer:`, error.message);
    console.error(`[DEBUG] Error stack:`, error.stack);
    
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const completeStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productReceipts } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Complete transfer (stock will be added to toCenter here)
    const completedTransfer = await stockTransfer.completeTransfer(userId, productReceipts);

    const populatedTransfer = await StockTransfer.findById(completedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer completed successfully. Stock added to destination center.',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error completing stock transfer:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const markStockTransferAsIncomplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { incompleteRemark } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Mark as incomplete
    const incompleteTransfer = await stockTransfer.markAsIncomplete(userId, incompleteRemark);

    const populatedTransfer = await StockTransfer.findById(incompleteTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer marked as incomplete',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error marking stock transfer as incomplete:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const rejectStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionRemark } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Reject transfer
    const rejectedTransfer = await stockTransfer.rejectTransfer(userId, rejectionRemark);

    const populatedTransfer = await StockTransfer.findById(rejectedTransfer._id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer rejected',
      data: populatedTransfer
    });

  } catch (error) {
    console.error('Error rejecting stock transfer:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAllStockTransfers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      fromCenter,
      toCenter,
      startDate,
      endDate,
      transferNumber,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    // Get user's center for filtering
    const user = await User.findById(req.user.id).populate('center');
    if (user && user.center) {
      // Show transfers where user's center is either fromCenter or toCenter
      filter.$or = [
        { fromCenter: user.center._id },
        { toCenter: user.center._id }
      ];
    }

    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }

    if (fromCenter) {
      filter.fromCenter = fromCenter;
    }

    if (toCenter) {
      filter.toCenter = toCenter;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (transferNumber) {
      if (transferNumber.includes(',')) {
        filter.transferNumber = { $in: transferNumber.split(',').map(num => num.trim()) };
      } else {
        filter.transferNumber = { $regex: transferNumber, $options: 'i' };
      }
    }

    if (search) {
      filter.$or = [
        { transferNumber: { $regex: search, $options: 'i' } },
        { remark: { $regex: search, $options: 'i' } },
        { 'products.productRemark': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'date', 'transferNumber', 'status'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    const stockTransfers = await StockTransfer.find(filter)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('adminApproval.approvedBy', '_id fullName email')
      .populate('adminApproval.rejectedBy', '_id fullName email')
      .populate('centerApproval.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await StockTransfer.countDocuments(filter);

    const statusCounts = await StockTransfer.aggregate([
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
      message: 'Stock transfers retrieved successfully',
      data: stockTransfers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      filters: {
        status: statusStats,
        total: total
      }
    });
  } catch (error) {
    console.error('Error retrieving stock transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock transfers',
      error: error.message
    });
  }
};

export const getStockTransferById = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id)
      .populate('fromCenter', '_id centerName centerCode')
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode trackSerialNumbers')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('adminApproval.approvedBy', '_id fullName email')
      .populate('adminApproval.rejectedBy', '_id fullName email')
      .populate('centerApproval.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email')
      .lean();

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Stock transfer retrieved successfully',
      data: stockTransfer
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock transfer ID'
      });
    }

    console.error('Error retrieving stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock transfer',
      error: error.message
    });
  }
};

export const updateStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fromCenter,
      transferNumber,
      remark,
      products,
      date
    } = req.body;

    const existingTransfer = await StockTransfer.findById(id);
    if (!existingTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Only allow updates for Draft status
    if (existingTransfer.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft transfers can be updated'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const updateData = {
      updatedBy: userId,
      ...(fromCenter && { fromCenter }),
      ...(transferNumber && { transferNumber: transferNumber.trim() }),
      ...(remark !== undefined && { remark }),
      ...(date && { date: new Date(date) })
    };

    if (products) {
      updateData.products = products;
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('fromCenter', '_id centerName centerCode')
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode trackSerialNumbers')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer updated successfully',
      data: updatedTransfer
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock transfer ID'
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
      return res.status(400).json({
        success: false,
        message: 'Transfer number already exists. Please use a different transfer number.'
      });
    }

    console.error('Error updating stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const deleteStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Only allow deletion for Draft status
    if (stockTransfer.status == 'Completed' || stockTransfer.status == 'Shipped' || stockTransfer.status == 'Rejected') {
      return res.status(400).json({
        success: false,
        message: 'Only Completed, Shipped, Rejected transfers can not be deleted'
      });
    }

    await StockTransfer.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Stock transfer deleted successfully'
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock transfer ID'
      });
    }

    console.error('Error deleting stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting stock transfer',
      error: error.message
    });
  }
};

export const getPendingAdminApprovalTransfers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pendingTransfers = await StockTransfer.findPendingAdminApproval({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });

    const total = await StockTransfer.countDocuments({
      status: "Submitted",
      "adminApproval.status": { $exists: false }
    });

    res.status(200).json({
      success: true,
      message: 'Pending admin approval transfers retrieved successfully',
      data: pendingTransfers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error retrieving pending admin approval transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving pending admin approval transfers',
      error: error.message
    });
  }
};

export const getTransferStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('center');
    let centerId = null;

    if (user && user.center) {
      centerId = user.center._id;
    }

    const stats = await StockTransfer.getTransferStats(centerId);

    res.status(200).json({
      success: true,
      message: 'Transfer statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error retrieving transfer statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving transfer statistics',
      error: error.message
    });
  }
};

export const updateShippingInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      shippedDate, 
      expectedDeliveryDate, 
      shipmentDetails, 
      carrierInfo,
      documents 
    } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Only allow updating shipping info for Shipped or Confirmed status
    if (!['Shipped', 'Confirmed'].includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Shipping info can only be updated for Shipped or Confirmed transfers'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const updateData = {
      updatedBy: userId
    };

    // Build shipping info update
    if (shippedDate || expectedDeliveryDate || shipmentDetails || carrierInfo || documents) {
      updateData.shippingInfo = {
        ...stockTransfer.shippingInfo.toObject(),
        ...(shippedDate && { shippedDate: new Date(shippedDate) }),
        ...(expectedDeliveryDate && { expectedDeliveryDate: new Date(expectedDeliveryDate) }),
        ...(shipmentDetails && { shipmentDetails }),
        ...(carrierInfo && { carrierInfo }),
        ...(documents && { documents: Array.isArray(documents) ? documents : [documents] })
      };
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('fromCenter', '_id centerName centerCode')
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode trackSerialNumbers')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('shippingInfo.shippedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipping information updated successfully',
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Error updating shipping information:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating shipping information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const rejectShipping = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionRemark } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Only allow rejecting shipping for Shipped status
    if (stockTransfer.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: 'Only shipped transfers can have shipping rejected'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Store previous shipping info for reference
    const previousShippingInfo = { ...stockTransfer.shippingInfo.toObject() };

    // Revert stock deduction if it was already done
    if (stockTransfer.stockStatus.sourceDeducted) {
      await revertStockDeduction(stockTransfer);
    }

    const updateData = {
      status: 'Confirmed', // Revert back to Confirmed status
      updatedBy: userId,
      shippingInfo: {
        // Clear shipping info but keep rejection record
        shippedAt: null,
        shippedBy: null,
        shippedDate: null,
        expectedDeliveryDate: null,
        shipmentDetails: null,
        carrierInfo: null,
        documents: [],
        shipmentRejected: {
          rejectedAt: new Date(),
          rejectedBy: userId,
          rejectionRemark: rejectionRemark || '',
          previousShippingData: previousShippingInfo
        }
      },
      stockStatus: {
        ...stockTransfer.stockStatus,
        sourceDeducted: false,
        deductedAt: null
      }
    };

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('fromCenter', '_id centerName centerCode')
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode trackSerialNumbers')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('shippingInfo.shipmentRejected.rejectedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipping rejected successfully. Transfer reverted to Confirmed status and stock deduction reversed.',
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Error rejecting shipping:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting shipping',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function to revert stock deduction
const revertStockDeduction = async (stockTransfer) => {
  try {
    const CenterStock = mongoose.model('CenterStock');
    
    for (const item of stockTransfer.products) {
      const centerStock = await CenterStock.findOne({
        center: stockTransfer.fromCenter,
        product: item.product
      });

      if (centerStock) {
        const quantityToRevert = item.approvedQuantity || item.quantity;
        
        if (item.requiresSerialNumbers && item.serialNumbers && item.serialNumbers.length > 0) {
          // Revert serial numbers back to available status
          await centerStock.revertSerialNumbers(item.serialNumbers);
        } else {
          // Revert quantity
          centerStock.availableQuantity += quantityToRevert;
          centerStock.totalQuantity += quantityToRevert;
          await centerStock.save();
        }
      }
    }
  } catch (error) {
    console.error('Error reverting stock deduction:', error);
    throw new Error(`Failed to revert stock deduction: ${error.message}`);
  }
};

export const getMostRecentTransferNumber = async (req, res) => {
  try {
    const mostRecentTransfer = await StockTransfer.findOne()
      .sort({ createdAt: -1 })
      .select('transferNumber createdAt')
      .lean();

    if (!mostRecentTransfer) {
      return res.status(404).json({
        success: false,
        message: 'No stock transfers found',
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Most recent transfer number retrieved successfully',
      data: {
        transferNumber: mostRecentTransfer.transferNumber,
        createdAt: mostRecentTransfer.createdAt
      }
    });
  } catch (error) {
    console.error('Error retrieving most recent transfer number:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving most recent transfer number',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateApprovedQuantities = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    // Only allow updating approved quantities for Admin_Approved or Confirmed status
    if (!['Admin_Approved', 'Confirmed'].includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Approved quantities can only be updated for Admin Approved or Confirmed transfers'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Validate product approvals
    if (!productApprovals || !Array.isArray(productApprovals) || productApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals array is required and cannot be empty'
      });
    }

    // Validate each product approval
    for (const approval of productApprovals) {
      if (!approval.productId) {
        return res.status(400).json({
          success: false,
          message: 'Each approval must have a productId'
        });
      }
      
      if (approval.approvedQuantity === undefined || approval.approvedQuantity === null) {
        return res.status(400).json({
          success: false,
          message: 'Each approval must have an approvedQuantity'
        });
      }
      
      if (approval.approvedQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Approved quantity cannot be negative'
        });
      }

      // Find the corresponding product in the transfer
      const productItem = stockTransfer.products.find(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${approval.productId} not found in this transfer`
        });
      }

      // Validate approved quantity doesn't exceed requested quantity
      if (approval.approvedQuantity > productItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${productItem.product}`
        });
      }
    }

    // Update product approved quantities
    const updatedProducts = stockTransfer.products.map(productItem => {
      const approval = productApprovals.find(
        pa => pa.productId.toString() === productItem.product.toString()
      );
      
      if (approval) {
        return {
          ...productItem.toObject(),
          approvedQuantity: approval.approvedQuantity,
          approvedRemark: approval.approvedRemark || ''
        };
      }
      return productItem;
    });

    const updateData = {
      products: updatedProducts,
      updatedBy: userId
    };

    // If transfer is in Admin_Approved status and we're updating quantities, 
    // we might want to track this as a modification
    if (stockTransfer.status === 'Admin_Approved') {
      updateData.status = 'Admin_Approved'; // Keep same status but quantities updated
      
      // Note: Since modifications field was removed from schema, we're not tracking modifications
      // If you need to track modifications, you'll need to add the modifications field back to the schema
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('fromCenter', '_id centerName centerCode')
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode trackSerialNumbers')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('adminApproval.approvedBy', '_id fullName email');
    // Removed the problematic populate: .populate('adminApproval.modifications.product', '_id productTitle productCode');

    res.status(200).json({
      success: true,
      message: 'Approved quantities updated successfully',
      data: updatedTransfer,
     
    });

  } catch (error) {
    console.error('Error updating approved quantities:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID or transfer ID'
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

    res.status(500).json({
      success: false,
      message: 'Error updating approved quantities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};