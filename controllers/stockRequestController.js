import StockRequest from '../models/StockRequest.js';
import Center from '../models/Center.js';
import User from '../models/User.js';

export const createStockRequest = async (req, res) => {
  try {
    const {
      warehouse,
      center,
      remark,
      products,
      status = 'Draft'
    } = req.body;

    if (!warehouse || !center || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Warehouse, center, and at least one product are required'
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

    const centerExists = await Center.findById(center);
    if (!centerExists) {
      return res.status(404).json({
        success: false,
        message: 'Center not found'
      });
    }

  
    let userId = req.user?.id;
    
    if (!userId) {
     
      const defaultUser = await User.findOne().sort({ createdAt: 1 });
      if (defaultUser) {
        userId = defaultUser._id;
      } else {
        return res.status(400).json({
          success: false,
          message: 'No user found to assign as creator'
        });
      }
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    
    const generateOrderNumber = async () => {
      const prefix = 'SR';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const orderNumber = `${prefix}${timestamp}${random}`;
      
     
      const existingOrder = await StockRequest.findOne({ orderNumber });
      if (existingOrder) {
    
        return generateOrderNumber();
      }
      
      return orderNumber;
    };

    const orderNumber = await generateOrderNumber();

    const stockRequest = new StockRequest({
      orderNumber, 
      warehouse,
      center,
      remark,
      products,
      status,
      createdBy: userId
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate('warehouse', '_id warehouseName')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id fullName email'); 

    res.status(201).json({
      success: true,
      message: 'Stock request created successfully',
      data: populatedRequest
    });
  } catch (error) {
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
        message: 'Order number already exists. Please try again.'
      });
    }

    console.error('Error creating stock request:', error);
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
        { 'products.productRemark': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'date', 'orderNumber', 'status'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    const stockRequests = await StockRequest.find(filter)
      .populate('warehouse', '_id warehouseName')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id name email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

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
      data: stockRequests,
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
      .populate('warehouse', '_id warehouseName')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('createdBy', '_id name email')
      .populate('updatedBy', '_id name email')
      .populate('completionInfo.completedBy', '_id name email')
      .populate('completionInfo.incompleteBy', '_id name email');

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Stock request retrieved successfully',
      data: stockRequest
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
      shippingInfo,
      completionInfo
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (['Completed', 'Rejected'].includes(existingRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed or rejected stock requests'
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
      ...(products && { products }),
      ...(status && { status }),
      ...(shippingInfo && { shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo } }),
      ...(completionInfo && { completionInfo: { ...existingRequest.completionInfo, ...completionInfo } })
    };

    if (status) {
      const currentDate = new Date();
      
      switch (status) {
        case 'Shipped':
          updateData.shippingInfo = {
            ...existingRequest.shippingInfo,
            shippedDate: currentDate,
            ...shippingInfo
          };
          break;
        case 'Completed':
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            completedOn: currentDate,
            completedBy: userId,
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
    .populate('warehouse', '_id warehouseName')
    .populate('center', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode productImage')
    .populate('createdBy', '_id fullName email') 
    .populate('updatedBy', '_id fullName email'); 

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

    if (!['Draft', 'Rejected'].includes(stockRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Draft or Rejected stock requests can be deleted'
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


export const updateStockRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...additionalInfo } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Draft', 'Submitted', 'Confirmed', 'Shipped', 'Completed', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

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
      case 'Shipped':
        updateData.shippingInfo = {
          ...stockRequest.shippingInfo,
          shippedDate: currentDate,
          ...additionalInfo
        };
        break;
      case 'Completed':
        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          completedOn: currentDate,
          completedBy: userId,
          ...additionalInfo
        };
        break;
      case 'Rejected':
        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          incompleteOn: currentDate,
          incompleteBy: userId,
          ...additionalInfo
        };
        break;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('warehouse', '_id warehouseName')
    .populate('center', '_id centerName centerCode')
    .populate('products.product', '_id productTitle productCode productImage');

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
