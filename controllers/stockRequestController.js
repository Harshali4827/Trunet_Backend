import StockRequest from '../models/StockRequest.js';
import Center from '../models/Center.js';
import User from '../models/User.js';
import StockPurchase from '../models/StockPurchase.js'; 
import mongoose from 'mongoose';

export const createStockRequest = async (req, res) => {
  try {
    const {
      warehouse,
      remark,
      products,
      status = 'Draft',
      orderNumber,
      date
    } = req.body;

    
    if (!orderNumber || orderNumber.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Order number is required'
      });
    }

    const trimmedOrderNumber = orderNumber.trim();

    
    const existingRequest = await StockRequest.findOne({ 
      orderNumber: trimmedOrderNumber 
    });
    
    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message: 'Order number already exists. Please use a unique order number.',
        duplicateOrderNumber: trimmedOrderNumber,
        existingRequestId: existingRequest._id
      });
    }

    
    let requestDate = new Date();
    if (date) {
      requestDate = new Date(date);
      if (isNaN(requestDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Please provide a valid date.'
        });
      }
      
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const providedDate = new Date(requestDate);
      providedDate.setHours(0, 0, 0, 0);
      
     
    }

    const user = await User.findById(req.user.id).populate('center');
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: 'User center information not found'
      });
    }

    const centerId = user.center._id;

    const centerExists = await Center.findById(centerId);
    if (!centerExists) {
      return res.status(404).json({
        success: false,
        message: 'Center not found'
      });
    }

    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Products array is required and cannot be empty'
      });
    }

    
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

    
    const stockRequest = new StockRequest({
      orderNumber: trimmedOrderNumber,
      warehouse,
      center: centerId,
      remark: remark || '',
      products,
      date: requestDate,
      status,
      createdBy: req.user.id
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email');

    res.status(201).json({
      success: true,
      message: 'Stock request created successfully',
      data: populatedRequest
    });

  } catch (error) {
    console.error('Error creating stock request:', error);
    
    
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === 'orderNumber') {
        return res.status(409).json({
          success: false,
          message: 'Order number already exists. Please use a unique order number.',
          duplicateOrderNumber: req.body.orderNumber
        });
      }
    }
    
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path}: ${error.value}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating stock request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAllStockRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      center,
      warehouse,
      startDate,
      endDate,
      createdAtStart,
      createdAtEnd,
      orderNumber,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') }; 
      } else {
        filter.status = status; 
      }
    }

    if (center) {
      if (center.includes(',')) {
        filter.center = { $in: center.split(',') }; 
      } else {
        filter.center = center;
      }
    }

    if (warehouse) {
      if (warehouse.includes(',')) {
        filter.warehouse = { $in: warehouse.split(',') }; 
      } else {
        filter.warehouse = warehouse;
      }
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (createdAtStart || createdAtEnd) {
      filter.createdAt = {};
      if (createdAtStart) filter.createdAt.$gte = new Date(createdAtStart);
      if (createdAtEnd) filter.createdAt.$lte = new Date(createdAtEnd);
    }

    if (orderNumber) {
      if (orderNumber.includes(',')) {
        filter.orderNumber = { $in: orderNumber.split(',').map(num => num.trim()) };
      } else {
        filter.orderNumber = { $regex: orderNumber, $options: 'i' }; 
      }
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { remark: { $regex: search, $options: 'i' } },
        { 'products.productRemark': { $regex: search, $options: 'i' } },
        { 'approvalInfo.approvedRemark': { $regex: search, $options: 'i' } },
        { 'receivingInfo.receivedRemark': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'date', 'orderNumber', 'status', 'approvalInfo.approvedAt', 'shippingInfo.shippedAt', 'receivingInfo.receivedAt'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    const stockRequests = await StockRequest.find(filter)
      .populate('warehouse', '_id centerName centerCode centerType') 
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const stockRequestsWithCenterStock = await Promise.all(
      stockRequests.map(async (request) => {
        const productIds = request.products.map(p => p.product._id);
        
        const centerStock = await StockPurchase.aggregate([
          {
            $match: {
              center: request.center._id,
              product: { $in: productIds }
            }
          },
          {
            $group: {
              _id: '$product',
              totalQuantity: { $sum: '$quantity' }
            }
          }
        ]);
        
        const centerStockMap = {};
        centerStock.forEach(stock => {
          centerStockMap[stock._id.toString()] = stock.totalQuantity;
        });
        
        const productsWithStock = request.products.map(product => ({
          ...product,
          centerStockQuantity: centerStockMap[product.product._id.toString()] || 0
        }));
        
        return {
          ...request,
          products: productsWithStock
        };
      })
    );

    const total = await StockRequest.countDocuments(filter);

    const statusCounts = await StockRequest.aggregate([
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
      message: 'Stock requests retrieved successfully',
      data: stockRequestsWithCenterStock,
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
    console.error('Error retrieving stock requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock requests',
      error: error.message
    });
  }
};

export const getStockRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id)
      .populate('warehouse', '_id centerName centerCode centerType') 
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('completionInfo.incompleteBy', '_id fullName email')
      .lean();

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const productIds = stockRequest.products.map(p => p.product._id);
    
    const centerStock = await StockPurchase.aggregate([
      {
        $match: {
          center: stockRequest.center._id,
          product: { $in: productIds }
        }
      },
      {
        $group: {
          _id: '$product',
          totalQuantity: { $sum: '$quantity' }
        }
      }
    ]);
    
    const centerStockMap = {};
    centerStock.forEach(stock => {
      centerStockMap[stock._id.toString()] = stock.totalQuantity;
    });
    
    const productsWithStock = stockRequest.products.map(product => ({
      ...product,
      centerStockQuantity: centerStockMap[product.product._id.toString()] || 0
    }));
    
    const stockRequestWithCenterStock = {
      ...stockRequest,
      products: productsWithStock
    };

    res.status(200).json({
      success: true,
      message: 'Stock request retrieved successfully',
      data: stockRequestWithCenterStock
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock request ID'
      });
    }

    console.error('Error retrieving stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving stock request',
      error: error.message
    });
  }
};

export const updateStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      warehouse,
      center,
      remark,
      products,
      status,
      approvalInfo,
      shippingInfo,
      receivingInfo,
      completionInfo,
      orderNumber 
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
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
      ...(warehouse && { warehouse }),
      ...(center && { center }),
      ...(remark !== undefined && { remark }),
      ...(status && { status }),
      ...(orderNumber && { orderNumber: orderNumber.trim() }), 
      ...(approvalInfo && { approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo } }),
      ...(shippingInfo && { shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo } }),
      ...(receivingInfo && { receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo } }),
      ...(completionInfo && { completionInfo: { ...existingRequest.completionInfo, ...completionInfo } })
    };

    if (products) {
      if (['Draft', 'Submitted'].includes(existingRequest.status)) {
        updateData.products = products;
      } else {
        updateData.products = existingRequest.products.map((existingProduct, index) => {
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
            ...existingRequest.approvalInfo,
            approvedAt: currentDate,
            approvedBy: userId,
            ...approvalInfo
          };
          break;
        case 'Shipped':
          updateData.shippingInfo = {
            ...existingRequest.shippingInfo,
            shippedAt: currentDate,
            shippedBy: userId,
            ...shippingInfo
          };
          break;
        case 'Completed':
          updateData.receivingInfo = {
            ...existingRequest.receivingInfo,
            receivedAt: currentDate,
            receivedBy: userId,
            ...receivingInfo
          };
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            completedOn: currentDate,
            completedBy: userId,
            ...completionInfo
          };
          break;
        case 'Incompleted':
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            incompleteRemark: completionInfo?.incompleteRemark || '',
            ...completionInfo
          };
          break;
        case 'Rejected':
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            ...completionInfo
          };
          break;
      }
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('warehouse', '_id centerName centerCode centerType') 
    .populate('center', '_id centerName centerCode centerType')
    .populate('products.product', '_id productTitle productCode productImage')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('approvalInfo.approvedBy', '_id fullName email')
    .populate('shippingInfo.shippedBy', '_id fullName email')
    .populate('receivingInfo.receivedBy', '_id fullName email')
    .populate('completionInfo.incompleteBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request updated successfully',
      data: updatedRequest
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock request ID'
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
        message: 'Order number already exists. Please use a different order number.'
      });
    }

    console.error('Error updating stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const deleteStockRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);
    
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (!['Submitted', 'Incompleted', 'Draft', 'Completed', 'Confirmed'].includes(stockRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Submitted, Incompleted, Draft, Confirmed and Completed stock requests can be deleted'
      });
    }

    await StockRequest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Stock request deleted successfully'
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock request ID'
      });
    }

    console.error('Error deleting stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting stock request',
      error: error.message
    });
  }
};

export const approveStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals, approvedRemark } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    
    const updatedRequest = await stockRequest.approveRequest(
      userId,  
      approvedRemark || '',
      productApprovals
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request approved successfully',
      data: populatedRequest
    });

  } catch (error) {
    console.error('Error approving stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving stock request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const shipStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      shippedDate, 
      expectedDeliveryDate, 
      shipmentDetails, 
      shipmentRemark, 
      documents 
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
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

    const updatedRequest = await stockRequest.shipRequest(userId, shippingDetails);

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request shipped successfully',
      data: populatedRequest
    });
  } catch (error) {
    console.error('Error shipping stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error shipping stock request',
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

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
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

    const updatedRequest = await stockRequest.updateShippingInfo(shippingDetails);
    
    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('shippingInfo.shippedBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipping information updated successfully',
      data: populatedRequest
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

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const updatedRequest = await stockRequest.rejectShipment(userId);
    
    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('shippingInfo.shipmentRejected.rejectedBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.',
      data: populatedRequest
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

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const currentDate = new Date();
    
    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      {
        status: 'Incompleted',
        updatedBy: userId,
        completionInfo: {
          ...stockRequest.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          incompleteRemark: incompleteRemark || ''
        }
      },
      { new: true, runValidators: true }
    )
    .populate('warehouse', '_id centerName centerCode centerType')
    .populate('center', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode productImage')
    .populate('completionInfo.incompleteBy', '_id fullName email')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request marked as incomplete successfully',
      data: updatedRequest
    });
  } catch (error) {
    console.error('Error marking stock request as incomplete:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking stock request as incomplete',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const completeStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { productReceipts, receivedRemark } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    
    const updatedRequest = await stockRequest.completeWithStockTransfer(
      userId,
      productReceipts,
      receivedRemark
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request completed successfully and stock transferred to center',
      data: populatedRequest,
      transferSummary: stockRequest.stockTransferInfo
    });

  } catch (error) {
    console.error('Error completing stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing stock request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const completeIncompleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      productApprovals, 
      productReceipts,
      approvedRemark,
      receivedRemark
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    
    const productsToComplete = productReceipts && productReceipts.length > 0 
      ? productReceipts 
      : productApprovals;

    if (!productsToComplete || !Array.isArray(productsToComplete) || productsToComplete.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals or receipts are required'
      });
    }

    
    const finalProductReceipts = productReceipts && productReceipts.length > 0 
      ? productReceipts 
      : productApprovals.map(approval => ({
          productId: approval.productId,
          receivedQuantity: approval.approvedQuantity,
          receivedRemark: approval.approvedRemark || ''
        }));

    
    if (productApprovals && productApprovals.length > 0) {
      stockRequest.products = stockRequest.products.map(productItem => {
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

    
    const updatedRequest = await stockRequest.completeWithStockTransfer(
      userId,
      finalProductReceipts,
      receivedRemark
    );

    
    if (approvedRemark) {
      stockRequest.approvalInfo = {
        ...stockRequest.approvalInfo,
        approvedAt: new Date(),
        approvedBy: userId,
        approvedRemark: approvedRemark
      };
      await stockRequest.save();
    }

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse', '_id centerName centerCode centerType')
      .populate('center', '_id centerName centerCode centerType')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email')
      .populate('approvalInfo.approvedBy', '_id fullName email')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Incomplete stock request completed successfully and stock transferred to center',
      data: populatedRequest,
      transferSummary: stockRequest.stockTransferInfo
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock request ID'
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

    console.error('Error completing incomplete stock request:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing incomplete stock request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateStockRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...additionalInfo } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
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
      status,
      updatedBy: userId
    };

    const currentDate = new Date();

    switch (status) {
      case 'Confirmed':
        updateData.approvalInfo = {
          ...stockRequest.approvalInfo,
          approvedAt: currentDate,
          approvedBy: userId,
          approvedRemark: additionalInfo.approvedRemark || '',
          ...additionalInfo
        };
 
        if (additionalInfo.productApprovals) {
          updateData.products = stockRequest.products.map(productItem => {
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
          ...stockRequest.shippingInfo,
          shippedAt: currentDate,
          shippedBy: userId,
          shippedDate: additionalInfo.shippedDate ? new Date(additionalInfo.shippedDate) : currentDate,
          ...additionalInfo
        };
        break;

      case 'Completed':
        updateData.receivingInfo = {
          ...stockRequest.receivingInfo,
          receivedAt: currentDate,
          receivedBy: userId,
          receivedRemark: additionalInfo.receivedRemark || '',
          ...additionalInfo
        };
        
        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          completedOn: currentDate,
          completedBy: userId,
          ...additionalInfo
        };

        if (additionalInfo.productReceipts) {
          updateData.products = stockRequest.products.map(productItem => {
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
          ...stockRequest.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          incompleteRemark: additionalInfo.incompleteRemark || '',
          ...additionalInfo
        };
        break;

      case 'Rejected':
        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          incompleteRemark: additionalInfo.incompleteRemark || '',
          ...additionalInfo
        };
        break;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('warehouse', '_id centerName centerCode centerType')
    .populate('center', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode productImage')
    .populate('approvalInfo.approvedBy', '_id fullName email')
    .populate('shippingInfo.shippedBy', '_id fullName email')
    .populate('receivingInfo.receivedBy', '_id fullName email')
    .populate('completionInfo.incompleteBy', '_id fullName email')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: `Stock request status updated to ${status}`,
      data: updatedRequest
    });
  } catch (error) {
    console.error('Error updating stock request status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock request status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateApprovedQuantities = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const updatedProducts = stockRequest.products.map(productItem => {
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

    if (stockRequest.status === 'Submitted') {
      updateData.status = 'Confirmed';
      updateData.approvalInfo = {
        ...stockRequest.approvalInfo,
        approvedBy: userId,
        approvedAt: new Date()
      };
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('warehouse', '_id centerName centerCode centerType')
    .populate('center', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode productImage')
    .populate('createdBy', '_id fullName email')
    .populate('updatedBy', '_id fullName email')
    .populate('approvalInfo.approvedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Approved quantities updated successfully',
      data: updatedRequest
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock request ID'
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

export const getMostRecentOrderNumber = async (req, res) => {
  try {
    const mostRecentRequest = await StockRequest.findOne()
      .sort({ createdAt: -1 }) 
      .select('orderNumber createdAt') 
      .lean();

    if (!mostRecentRequest) {
      return res.status(404).json({
        success: false,
        message: 'No stock requests found',
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Most recent order number retrieved successfully',
      data: {
        orderNumber: mostRecentRequest.orderNumber,
        createdAt: mostRecentRequest.createdAt
      }
    });
  } catch (error) {
    console.error('Error retrieving most recent order number:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving most recent order number',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};