import StockTransfer from '../models/StockTransfer.js';
import Center from '../models/Center.js';
import User from '../models/User.js';
import StockPurchase from '../models/StockPurchase.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';


const validateUserCenter = async (userId) => {
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

  return user.center.centerName; 
};

export const createStockTransfer = async (req, res) => {
  try {
    const {
      toCenter,
      date,
      remark,
      products
    } = req.body;

    const fromCenter = await validateUserCenter(req.user?.id);

    if (!toCenter || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'To center and at least one product are required'
      });
    }

    for (let product of products) {
      if (!product.product || !product.quantity || product.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Each product must have a valid product ID and quantity (min 1)'
        });
      }
    }

    const toCenterExists = await Center.findById(toCenter);
    if (!toCenterExists) {
      return res.status(404).json({
        success: false,
        message: 'To center not found'
      });
    }

    if (fromCenter === toCenterExists.centerName) {
      return res.status(400).json({
        success: false,
        message: 'From center and to center cannot be the same'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    
    for (let product of products) {
      const stockData = await StockPurchase.aggregate([
        {
          $match: {
            outlet: fromCenter,
            'products.product': new mongoose.Types.ObjectId(product.product)
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.product': new mongoose.Types.ObjectId(product.product)
          }
        },
        {
          $group: {
            _id: '$products.product',
            totalAvailable: { $sum: '$products.availableQuantity' }
          }
        }
      ]);
      
      const currentAvailableStock = stockData.length > 0 ? stockData[0].totalAvailable : 0;
      
      if (product.quantity > currentAvailableStock) {
        const productDoc = await Product.findById(product.product);
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product "${productDoc.productTitle}". Available: ${currentAvailableStock}, Requested: ${product.quantity}`
        });
      }
    }

    
    const currentDate = new Date();
    const year = currentDate.getFullYear().toString().slice(-2);
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    
    
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    
    const count = await StockTransfer.countDocuments({
      toCenter: toCenter,
      createdAt: {
        $gte: startOfMonth,
        $lt: endOfMonth
      }
    });
    
    const transferNumber = `${toCenterExists.centerCode}/TR${month}${year}/${count + 1}`;

    const stockTransfer = new StockTransfer({
      fromCenter,
      toCenter,
      date: date || new Date(),
      transferNumber, 
      remark,
      products,
      status: 'Draft',
      createdBy: userId
    });

    const savedTransfer = await stockTransfer.save();

    const populatedTransfer = await StockTransfer.findById(savedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('createdBy', '_id fullName email');

    res.status(201).json({
      success: true,
      message: 'Stock transfer created successfully',
      data: populatedTransfer
    });

  } catch (error) {
    if (error.message.includes('User authentication') || error.message.includes('User not found')) {
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
      return res.status(400).json({
        success: false,
        message: 'Transfer number already exists. Please try again.'
      });
    }

    console.error('Error creating stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating stock transfer',
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


    try {
      const userFromCenter = await validateUserCenter(req.user?.id);
      filter.fromCenter = userFromCenter;
    } catch (error) {
    
      if (fromCenter) {
        filter.fromCenter = fromCenter;
      }
    }

    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }

    if (toCenter) {
      if (toCenter.includes(',')) {
        filter.toCenter = { $in: toCenter.split(',') };
      } else {
        filter.toCenter = toCenter;
      }
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
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

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
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    try {
      const userFromCenter = await validateUserCenter(req.user?.id);
      if (stockTransfer.fromCenter !== userFromCenter) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view transfers from your center.'
        });
      }
    } catch (error) {
      
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
      toCenter,
      date,
      remark,
      products,
      status
    } = req.body;

    
    const fromCenter = await validateUserCenter(req.user?.id);

    const existingTransfer = await StockTransfer.findById(id);
    if (!existingTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    if (existingTransfer.fromCenter !== fromCenter) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update transfers from your center.'
      });
    }

    
    if (['Completed', 'Rejected'].includes(existingTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed or rejected stock transfers'
      });
    }

    if (products && Array.isArray(products)) {
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one product is required'
        });
      }

      for (let product of products) {
        if (!product.product || !product.quantity || product.quantity < 1) {
          return res.status(400).json({
            success: false,
            message: 'Each product must have a valid product ID and quantity (min 1)'
          });
        }
      }

      
      for (let product of products) {
        const stockData = await StockPurchase.aggregate([
          {
            $match: {
              outlet: fromCenter,
              'products.product': new mongoose.Types.ObjectId(product.product)
            }
          },
          { $unwind: '$products' },
          {
            $match: {
              'products.product': new mongoose.Types.ObjectId(product.product)
            }
          },
          {
            $group: {
              _id: '$products.product',
              totalAvailable: { $sum: '$products.availableQuantity' }
            }
          }
        ]);
        
        const currentAvailableStock = stockData.length > 0 ? stockData[0].totalAvailable : 0;
        
        if (product.quantity > currentAvailableStock) {
          const productDoc = await Product.findById(product.product);
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product "${productDoc.productTitle}". Available: ${currentAvailableStock}, Requested: ${product.quantity}`
          });
        }
      }
    }

    if (toCenter) {
      const toCenterExists = await Center.findById(toCenter);
      if (!toCenterExists) {
        return res.status(404).json({
          success: false,
          message: 'To center not found'
        });
      }

      if (fromCenter === toCenterExists.centerName) {
        return res.status(400).json({
          success: false,
          message: 'From center and to center cannot be the same'
        });
      }
    }

    const userId = req.user?.id;
    const updateData = {
      updatedBy: userId,
      ...(toCenter && { toCenter }),
      ...(date && { date }),
      ...(remark !== undefined && { remark }),
      ...(products && { products }),
      ...(status && { status }),
      fromCenter 
    };

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer updated successfully',
      data: updatedTransfer
    });
  } catch (error) {
    if (error.message.includes('User authentication') || error.message.includes('Access denied')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

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

    
    const fromCenter = await validateUserCenter(req.user?.id);

    const stockTransfer = await StockTransfer.findById(id);
    
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    if (stockTransfer.fromCenter !== fromCenter) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete transfers from your center.'
      });
    }

    if (!['Draft', 'Rejected'].includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Draft or Rejected stock transfers can be deleted'
      });
    }

    await StockTransfer.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Stock transfer deleted successfully'
    });
  } catch (error) {
    if (error.message.includes('User authentication') || error.message.includes('Access denied')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

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

export const updateStockTransferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Draft', 'Completed', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: Draft, Completed, Rejected'
      });
    }

    
    const fromCenter = await validateUserCenter(req.user?.id);

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    if (stockTransfer.fromCenter !== fromCenter) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update transfers from your center.'
      });
    }

    const userId = req.user?.id;
    const updateData = {
      status,
      updatedBy: userId
    };

    
    if (status === 'Completed' && stockTransfer.status !== 'Completed') {
      
      
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: `Stock transfer status updated to ${status}`,
      data: updatedTransfer
    });
  } catch (error) {
    if (error.message.includes('User authentication') || error.message.includes('Access denied')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    console.error('Error updating stock transfer status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock transfer status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};