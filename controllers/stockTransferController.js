import StockTransfer from '../models/StockTransfer.js';
import Center from '../models/Center.js';
import User from '../models/User.js';
import StockPurchase from '../models/StockPurchase.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

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
      transferNumber, 
      remark,
      products,
      status = 'Draft' 
    } = req.body;

    const fromCenter = await validateUserCenter(req.user?.id);

    if (!toCenter || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'To center and at least one product are required'
      });
    }

    
    if (!transferNumber) {
      return res.status(400).json({
        success: false,
        message: 'Transfer number is required'
      });
    }

    
    const existingTransfer = await StockTransfer.findOne({ transferNumber });
    if (existingTransfer) {
      return res.status(400).json({
        success: false,
        message: 'Transfer number already exists. Please use a different transfer number.'
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

    const stockTransfer = new StockTransfer({
      fromCenter,
      toCenter,
      date: date || new Date(),
      transferNumber, 
      remark,
      products,
      status,
      createdBy: userId
    });

    const savedTransfer = await stockTransfer.save();

    const populatedTransfer = await StockTransfer.findById(savedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('createdBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email');

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
        message: 'Transfer number already exists. Please use a different transfer number.'
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
        { 'products.productRemark': { $regex: search, $options: 'i' } },
        { 'approvalInfo.approvedRemark': { $regex: search, $options: 'i' } },
        { 'receivingInfo.receivedRemark': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'date', 'transferNumber', 'status', 'approvalInfo.approvedAt', 'shippingInfo.shippedAt', 'receivingInfo.receivedAt'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    const stockTransfers = await StockTransfer.find(filter)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email')
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
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email');

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
      transferNumber, 
      remark,
      products,
      status,
      approvalInfo,
      shippingInfo,
      receivingInfo,
      completionInfo
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

    
    if (['Completed', 'Rejected', 'Incompleted'].includes(existingTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed, rejected, or incompleted stock transfers'
      });
    }

    
    if (transferNumber && transferNumber !== existingTransfer.transferNumber) {
      const existingTransferNumber = await StockTransfer.findOne({ 
        transferNumber,
        _id: { $ne: id } 
      });
      
      if (existingTransferNumber) {
        return res.status(400).json({
          success: false,
          message: 'Transfer number already exists. Please use a different transfer number.'
        });
      }
    }

    if (products && Array.isArray(products) && !['Draft', 'Submitted'].includes(existingTransfer.status)) {
      const hasApprovedQuantityUpdates = products.some(newProduct => {
        const existingProduct = existingTransfer.products.find(
          p => p.product.toString() === newProduct.product
        );
        return existingProduct && (
          newProduct.approvedQuantity !== undefined ||
          newProduct.approvedRemark !== undefined
        );
      });

      if (hasApprovedQuantityUpdates) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update approvedQuantity or approvedRemark for transfers beyond Submitted status'
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

      for (let product of products) {
        if (!product.product || !product.quantity || product.quantity < 1) {
          return res.status(400).json({
            success: false,
            message: 'Each product must have a valid product ID and quantity (min 1)'
          });
        }
      }

      
      if (['Draft', 'Submitted'].includes(existingTransfer.status)) {
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
      ...(transferNumber && { transferNumber }),
      ...(remark !== undefined && { remark }),
      ...(status && { status }),
      ...(approvalInfo && { approvalInfo: { ...existingTransfer.approvalInfo, ...approvalInfo } }),
      ...(shippingInfo && { shippingInfo: { ...existingTransfer.shippingInfo, ...shippingInfo } }),
      ...(receivingInfo && { receivingInfo: { ...existingTransfer.receivingInfo, ...receivingInfo } }),
      ...(completionInfo && { completionInfo: { ...existingTransfer.completionInfo, ...completionInfo } }),
      fromCenter 
    };

    if (products) {
      if (['Draft', 'Submitted'].includes(existingTransfer.status)) {
        updateData.products = products;
      } else {
        updateData.products = existingTransfer.products.map((existingProduct, index) => {
          const newProduct = products.find(p => p.product.toString() === existingProduct.product.toString());
          if (newProduct) {
            return {
              ...existingProduct.toObject(),
              quantity: newProduct.quantity !== undefined ? newProduct.quantity : existingProduct.quantity,
              productRemark: newProduct.productRemark !== undefined ? newProduct.productRemark : existingProduct.productRemark,
              receivedQuantity: newProduct.receivedQuantity !== undefined ? newProduct.receivedQuantity : existingProduct.receivedQuantity,
              receivedRemark: newProduct.receivedRemark !== undefined ? newProduct.receivedRemark : existingProduct.receivedRemark
            };
          }
          return existingProduct;
        });
      }
    }

    if (status) {
      const currentDate = new Date();
      
      switch (status) {
        case 'Confirmed':
          updateData.approvalInfo = {
            ...existingTransfer.approvalInfo,
            approvedAt: currentDate,
            approvedBy: userId,
            ...approvalInfo
          };
          break;
        case 'Shipped':
          updateData.shippingInfo = {
            ...existingTransfer.shippingInfo,
            shippedAt: currentDate,
            shippedBy: userId,
            ...shippingInfo
          };
          break;
        case 'Completed':
          updateData.receivingInfo = {
            ...existingTransfer.receivingInfo,
            receivedAt: currentDate,
            receivedBy: userId,
            ...receivingInfo
          };
          updateData.completionInfo = {
            ...existingTransfer.completionInfo,
            completedOn: currentDate,
            completedBy: userId,
            ...completionInfo
          };
          break;
        case 'Incompleted':
          updateData.completionInfo = {
            ...existingTransfer.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            incompleteRemark: completionInfo?.incompleteRemark || '',
            ...completionInfo
          };
          break;
        case 'Rejected':
          updateData.completionInfo = {
            ...existingTransfer.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            ...completionInfo
          };
          break;
      }
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('approvalInfo.approvedBy', '_id fullName email')
    .populate('shippingInfo.shippedBy', '_id fullName email')
    .populate('receivingInfo.receivedBy', '_id fullName email')
    .populate('completionInfo.incompleteBy', '_id fullName email');

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

    if (!['Submitted', 'Incompleted', 'Draft', 'Completed', 'Confirmed'].includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Submitted, Incompleted, Draft, Confirmed and Completed stock transfers can be deleted'
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



export const approveStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals} = req.body; 

    if (!productApprovals || !Array.isArray(productApprovals) || productApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals are required with approved quantities'
      });
    }

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    if (stockTransfer.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve a stock transfer with status: ${stockTransfer.status}. Status must be 'Submitted'`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    for (const approval of productApprovals) {
      if (!approval.productId || approval.approvedQuantity === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each product approval must have productId and approvedQuantity'
        });
      }
      
      const productExists = stockTransfer.products.some(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (!productExists) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${approval.productId} not found in this stock transfer`
        });
      }
    }

    
    const updatedTransfer = await stockTransfer.approveTransfer(
      userId,  
      productApprovals
    );

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer approved successfully',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error approving stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving stock transfer',
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
      shipmentRemark, 
      documents 
    } = req.body;

    if (!shippedDate) {
      return res.status(400).json({
        success: false,
        message: 'Shipped date is required'
      });
    }

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    if (stockTransfer.status !== 'Confirmed') {
      return res.status(400).json({
        success: false,
        message: `Cannot ship a stock transfer with status: ${stockTransfer.status}. Status must be 'Confirmed'`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const shippingDetails = {
      shippedDate: new Date(shippedDate),
      ...(expectedDeliveryDate && { expectedDeliveryDate: new Date(expectedDeliveryDate) }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && { documents: Array.isArray(documents) ? documents : [documents] })
    };

    const updatedTransfer = await stockTransfer.shipTransfer(userId, shippingDetails);

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer shipped successfully',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error shipping stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error shipping stock transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
      shipmentRemark, 
      documents 
    } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    if (stockTransfer.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot update shipping information for stock transfer with status: ${stockTransfer.status}. Status must be 'Shipped'`
      });
    }

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
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && { documents: Array.isArray(documents) ? documents : [documents] })
    };

    
    const updatedTransfer = await stockTransfer.updateShippingInfo(shippingDetails);
    
    
    updatedTransfer.updatedBy = userId;
    await updatedTransfer.save();

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipping information updated successfully',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error updating shipping information:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating shipping information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    
    if (stockTransfer.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject shipment for stock transfer with status: ${stockTransfer.status}. Status must be 'Shipped'`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    
    const updatedTransfer = await stockTransfer.rejectShipment(userId);
    
    
    updatedTransfer.updatedBy = userId;
    await updatedTransfer.save();

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('shippingInfo.shipmentRejected.rejectedBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error rejecting shipment:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting shipment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const markAsIncomplete = async (req, res) => {
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

    if (stockTransfer.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as incomplete a stock transfer with status: ${stockTransfer.status}. Status must be 'Shipped'`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const updatedTransfer = await stockTransfer.markAsIncomplete(userId, incompleteRemark);

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('completionInfo.incompleteBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer marked as incomplete successfully',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error marking stock transfer as incomplete:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking stock transfer as incomplete',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const completeStockTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productReceipts } = req.body;

    if (!productReceipts || !Array.isArray(productReceipts) || productReceipts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product receipts are required with received quantities'
      });
    }

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    if (stockTransfer.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete a stock transfer with status: ${stockTransfer.status}. Status must be 'Shipped'`
      });
    }

     if (!stockTransfer.challanDocument) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete stock transfer. Challan document is required. Please upload the challan document.',
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    for (const receipt of productReceipts) {
      if (!receipt.productId || receipt.receivedQuantity === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each product receipt must have productId and receivedQuantity'
        });
      }
      
      const productExists = stockTransfer.products.some(
        p => p.product.toString() === receipt.productId.toString()
      );
      
      if (!productExists) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${receipt.productId} not found in this stock transfer`
        });
      }
    }

    const updatedTransfer = await stockTransfer.completeTransfer(
      userId, 
      productReceipts
    );

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock transfer completed successfully',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Error completing stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing stock transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const completeIncompleteTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      productApprovals, 
      productReceipts 
    } = req.body;

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    if (stockTransfer.status !== 'Incompleted') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete a stock transfer with status: ${stockTransfer.status}. Status must be 'Incompleted'`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    if (productApprovals && Array.isArray(productApprovals)) {
      for (const approval of productApprovals) {
        if (!approval.productId || approval.approvedQuantity === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Each product approval must have productId and approvedQuantity'
          });
        }

        const productExists = stockTransfer.products.some(
          p => p.product.toString() === approval.productId.toString()
        );
        
        if (!productExists) {
          const productDoc = await Product.findById(approval.productId);
          const productName = productDoc ? productDoc.productTitle : approval.productId;
          return res.status(400).json({
            success: false,
            message: `Product "${productName}" not found in this stock transfer`
          });
        }

        const existingProduct = stockTransfer.products.find(
          p => p.product.toString() === approval.productId.toString()
        );
        
        if (approval.approvedQuantity > existingProduct.quantity) {
          const productDoc = await Product.findById(approval.productId);
          const productName = productDoc ? productDoc.productTitle : approval.productId;
          return res.status(400).json({
            success: false,
            message: `Approved quantity (${approval.approvedQuantity}) cannot be greater than requested quantity (${existingProduct.quantity}) for product "${productName}"`
          });
        }

        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity cannot be negative for product ${approval.productId}`
          });
        }
      }
    }

    if (productReceipts && Array.isArray(productReceipts)) {
      for (const receipt of productReceipts) {
        if (!receipt.productId || receipt.receivedQuantity === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Each product receipt must have productId and receivedQuantity'
          });
        }

        const productExists = stockTransfer.products.some(
          p => p.product.toString() === receipt.productId.toString()
        );
        
        if (!productExists) {
          return res.status(400).json({
            success: false,
            message: `Product with ID ${receipt.productId} not found in this stock transfer`
          });
        }

        if (receipt.receivedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Received quantity cannot be negative for product ${receipt.productId}`
          });
        }
      }
    }

    const updatedTransfer = await stockTransfer.completeIncompleteTransfer(
      userId,
      productApprovals || [],
      productReceipts || []
    );

    const populatedTransfer = await StockTransfer.findById(updatedTransfer._id)
      .populate('toCenter', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Incomplete stock transfer completed successfully',
      data: populatedTransfer
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

    console.error('Error completing incomplete stock transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing incomplete stock transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateStockTransferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...additionalInfo } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Draft', 'Submitted', 'Confirmed', 'Shipped', 'Incompleted', 'Completed', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

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

    if (status === 'Confirmed') {
      if (!additionalInfo.productApprovals) {
        return res.status(400).json({
          success: false,
          message: 'Product approvals are required when confirming a stock transfer'
        });
      }
    }

    if (status === 'Shipped') {
      if (!additionalInfo.shippedDate) {
        return res.status(400).json({
          success: false,
          message: 'Shipped date is required when shipping a stock transfer'
        });
      }
    }

    if (status === 'Completed') {
      if (!additionalInfo.productReceipts) {
        return res.status(400).json({
          success: false,
          message: 'Product receipts are required when completing a stock transfer'
        });
      }
    }

    const updateData = {
      status,
      updatedBy: userId
    };

    const currentDate = new Date();

    switch (status) {
      case 'Confirmed':
        updateData.approvalInfo = {
          ...stockTransfer.approvalInfo,
          approvedAt: currentDate,
          approvedBy: userId,
          approvedRemark: additionalInfo.approvedRemark || '',
          ...additionalInfo
        };
 
        if (additionalInfo.productApprovals) {
          updateData.products = stockTransfer.products.map(productItem => {
            const approval = additionalInfo.productApprovals.find(
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
        break;

      case 'Shipped':
        updateData.shippingInfo = {
          ...stockTransfer.shippingInfo,
          shippedAt: currentDate,
          shippedBy: userId,
          shippedDate: additionalInfo.shippedDate ? new Date(additionalInfo.shippedDate) : currentDate,
          ...additionalInfo
        };
        break;

      case 'Completed':
        updateData.receivingInfo = {
          ...stockTransfer.receivingInfo,
          receivedAt: currentDate,
          receivedBy: userId,
          receivedRemark: additionalInfo.receivedRemark || '',
          ...additionalInfo
        };
        
        updateData.completionInfo = {
          ...stockTransfer.completionInfo,
          completedOn: currentDate,
          completedBy: userId,
          ...additionalInfo
        };

        if (additionalInfo.productReceipts) {
          updateData.products = stockTransfer.products.map(productItem => {
            const receipt = additionalInfo.productReceipts.find(
              pr => pr.productId.toString() === productItem.product.toString()
            );
            if (receipt) {
              return {
                ...productItem.toObject(),
                receivedQuantity: receipt.receivedQuantity,
                receivedRemark: receipt.receivedRemark || ''
              };
            }
            return productItem;
          });
        }
        break;

      case 'Incompleted':
        updateData.completionInfo = {
          ...stockTransfer.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          incompleteRemark: additionalInfo.incompleteRemark || '',
          ...additionalInfo
        };
        break;

      case 'Rejected':
        updateData.completionInfo = {
          ...stockTransfer.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          incompleteRemark: additionalInfo.incompleteRemark || '',
          ...additionalInfo
        };
        break;
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('approvalInfo.approvedBy', '_id fullName email')
    .populate('shippingInfo.shippedBy', '_id fullName email')
    .populate('receivingInfo.receivedBy', '_id fullName email')
    .populate('completionInfo.incompleteBy', '_id fullName email')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: `Stock transfer status updated to ${status}`,
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Error updating stock transfer status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock transfer status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateApprovedQuantities = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    if (!productApprovals || !Array.isArray(productApprovals) || productApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals are required with approved quantities and remarks'
      });
    }

    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      return res.status(404).json({
        success: false,
        message: 'Stock transfer not found'
      });
    }

    const allowedStatuses = ['Submitted', 'Confirmed', 'Shipped', 'Incompleted'];
    if (!allowedStatuses.includes(stockTransfer.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update approved quantities for stock transfer with status: ${stockTransfer.status}. Allowed statuses: ${allowedStatuses.join(', ')}`
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    for (const approval of productApprovals) {
      if (!approval.productId || approval.approvedQuantity === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each product approval must have productId and approvedQuantity'
        });
      }

      const productExists = stockTransfer.products.some(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (!productExists) {
        const productDoc = await Product.findById(approval.productId);
        const productName = productDoc ? productDoc.productTitle : approval.productId;
        return res.status(400).json({
          success: false,
          message: `Product "${productName}" not found in this stock transfer`
        });
      }

      const existingProduct = stockTransfer.products.find(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (approval.approvedQuantity > existingProduct.quantity) {
        const productDoc = await Product.findById(approval.productId);
        const productName = productDoc ? productDoc.productTitle : approval.productId;
        return res.status(400).json({
          success: false,
          message: `Approved quantity (${approval.approvedQuantity}) cannot be greater than requested quantity (${existingProduct.quantity}) for product "${productName}"`
        });
      }

      if (approval.approvedQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: `Approved quantity cannot be negative for product ${approval.productId}`
        });
      }
    }

    const updatedProducts = stockTransfer.products.map(productItem => {
      const approval = productApprovals.find(
        pa => pa.productId.toString() === productItem.product.toString()
      );
      
      if (approval) {
        return {
          ...productItem.toObject(),
          approvedQuantity: approval.approvedQuantity,
        };
      }
      return productItem;
    });

    const updateData = {
      products: updatedProducts,
      updatedBy: userId
    };

    if (stockTransfer.status === 'Submitted') {
      updateData.status = 'Confirmed';
      updateData.approvalInfo = {
        ...stockTransfer.approvalInfo,
        approvedBy: userId,
        approvedAt: new Date()
      };
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('approvalInfo.approvedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Approved quantities updated successfully',
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

    console.error('Error updating approved quantities:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating approved quantities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


export const updateChallanDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Challan document file is required.'
      });
    }

    const absolutePath = req.file.path;
    const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
    
    console.log('Absolute path:', absolutePath);
    console.log('Relative path:', relativePath);

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
    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      { 
        challanDocument: relativePath, 
        updatedBy: userId
      },
      { new: true, runValidators: true }
    )
    .populate('toCenter', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Challan document updated successfully',
      data: updatedTransfer
    });
  } catch (error) {
    if (error.message.includes('User authentication') || error.message.includes('Access denied')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }

    console.error('Error updating challan document:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating challan document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getLatestTransferNumber = async (req, res) => {
  try {
    
    const latestTransfer = await StockTransfer.findOne()
      .sort({ createdAt: -1 }) 
      .select('transferNumber createdAt') 
      .lean();

    if (!latestTransfer) {
      return res.status(200).json({
        success: true,
        message: 'No stock transfers found',
        data: {
          latestTransferNumber: null,
          suggestion: 'Create your first transfer number'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Latest transfer number retrieved successfully',
      data: {
        latestTransferNumber: latestTransfer.transferNumber,
        lastCreated: latestTransfer.createdAt,
      }
    });

  } catch (error) {
    console.error('Error retrieving latest transfer number:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving latest transfer number',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};