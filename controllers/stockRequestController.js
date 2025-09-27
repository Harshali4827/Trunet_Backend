import StockRequest from '../models/StockRequest.js';
import Center from '../models/Center.js';
import User from '../models/User.js';
import StockPurchase from '../models/StockPurchase.js'; 

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

  const allowedCenterTypes = ['Center', 'Outlet'];
  if (!allowedCenterTypes.includes(user.center.centerType)) {
    throw new Error(`Stock requests can only be created for center or outlet types. Your center type is: ${user.center.centerType}`);
  }

  return user.center._id;
};

export const createStockRequest = async (req, res) => {
  try {
    const {
      warehouse,
      remark,
      products,
      status = 'Draft'
    } = req.body;

    const centerId = await validateUserCenter(req.user?.id);

    if (!warehouse || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Warehouse and at least one product are required'
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

    const centerExists = await Center.findById(centerId);
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
      center: centerId, 
      remark,
      products,
      status,
      createdBy: userId
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate('warehouse', '_id warehouseName')
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
    if (error.message.includes('center or outlet types') || error.message.includes('User authentication')) {
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
      .populate('warehouse', '_id warehouseName')
      .populate('center', '_id centerName centerCode')
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
      .populate('warehouse', '_id warehouseName')
      .populate('center', '_id centerName centerCode')
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
      completionInfo
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (['Completed', 'Rejected', 'Incompleted'].includes(existingRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed, rejected, or incompleted stock requests'
      });
    }

    if (products && Array.isArray(products) && !['Draft', 'Submitted'].includes(existingRequest.status)) {
      const hasApprovedQuantityUpdates = products.some(newProduct => {
        const existingProduct = existingRequest.products.find(
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
          message: 'Cannot update approvedQuantity or approvedRemark for requests beyond Submitted status'
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
    .populate('warehouse', '_id warehouseName')
    .populate('center', '_id centerName centerCode')
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

    if (!['Draft', 'Rejected', 'Incompleted'].includes(stockRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Draft, Rejected, or Incompleted stock requests can be deleted'
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
    const { approvedRemark, productApprovals } = req.body;

    if (!productApprovals || !Array.isArray(productApprovals) || productApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals are required with approved quantities'
      });
    }

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (stockRequest.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve a stock request with status: ${stockRequest.status}. Status must be 'Submitted'`
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
      
      const productExists = stockRequest.products.some(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (!productExists) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${approval.productId} not found in this stock request`
        });
      }
    }

    const updatedRequest = await stockRequest.approveRequest(
      userId, 
      approvedRemark || '', 
      productApprovals
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse')
      .populate('center', '_id centerName centerCode')
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

    if (!shippedDate) {
      return res.status(400).json({
        success: false,
        message: 'Shipped date is required'
      });
    }

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (stockRequest.status !== 'Confirmed') {
      return res.status(400).json({
        success: false,
        message: `Cannot ship a stock request with status: ${stockRequest.status}. Status must be 'Confirmed'`
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
      .populate('warehouse')
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

    if (stockRequest.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as incomplete a stock request with status: ${stockRequest.status}. Status must be 'Shipped'`
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
    .populate('warehouse')
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
    const { receivedRemark, productReceipts, markAsIncomplete = false } = req.body;

    if (markAsIncomplete) {
      return markAsIncomplete(req, res);
    }

    if (!productReceipts || !Array.isArray(productReceipts) || productReceipts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product receipts are required with received quantities'
      });
    }

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (stockRequest.status !== 'Shipped') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete a stock request with status: ${stockRequest.status}. Status must be 'Shipped'`
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
      
      const productExists = stockRequest.products.some(
        p => p.product.toString() === receipt.productId.toString()
      );
      
      if (!productExists) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${receipt.productId} not found in this stock request`
        });
      }
    }

    const updatedRequest = await stockRequest.completeRequest(
      userId, 
      receivedRemark || '', 
      productReceipts
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate('warehouse')
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle productCode productImage')
      .populate('receivingInfo.receivedBy', '_id fullName email')
      .populate('completionInfo.completedBy', '_id fullName email')
      .populate('createdBy', '_id fullName email')
      .populate('updatedBy', '_id fullName email');

    res.status(200).json({
      success: true,
      message: 'Stock request completed successfully',
      data: populatedRequest
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

    const validStatuses = ['Draft', 'Submitted', 'Confirmed', 'Shipped', 'Incompleted', 'Completed', 'Rejected'];
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

    if (status === 'Confirmed') {
      if (!additionalInfo.productApprovals) {
        return res.status(400).json({
          success: false,
          message: 'Product approvals are required when confirming a stock request'
        });
      }
    }

    if (status === 'Shipped') {
      if (!additionalInfo.shippedDate) {
        return res.status(400).json({
          success: false,
          message: 'Shipped date is required when shipping a stock request'
        });
      }
    }

    if (status === 'Completed') {
      if (!additionalInfo.productReceipts) {
        return res.status(400).json({
          success: false,
          message: 'Product receipts are required when completing a stock request'
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
    .populate('warehouse')
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
    const { productApprovals, approvedRemark } = req.body;

    if (!productApprovals || !Array.isArray(productApprovals) || productApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product approvals are required with approved quantities and remarks'
      });
    }

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    const allowedStatuses = ['Submitted', 'Confirmed', 'Shipped', 'Incompleted'];
    if (!allowedStatuses.includes(stockRequest.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update approved quantities for stock request with status: ${stockRequest.status}. Allowed statuses: ${allowedStatuses.join(', ')}`
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

      const productExists = stockRequest.products.some(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (!productExists) {
        const productDoc = await mongoose.model('Product').findById(approval.productId);
        const productName = productDoc ? productDoc.productTitle : approval.productId;
        return res.status(400).json({
          success: false,
          message: `Product "${productName}" not found in this stock request`
        });
      }

      const existingProduct = stockRequest.products.find(
        p => p.product.toString() === approval.productId.toString()
      );
      
      if (approval.approvedQuantity > existingProduct.quantity) {
        const productDoc = await mongoose.model('Product').findById(approval.productId);
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

    const updatedProducts = stockRequest.products.map(productItem => {
      const approval = productApprovals.find(
        pa => pa.productId.toString() === productItem.product.toString()
      );
      
      if (approval) {
        return {
          ...productItem.toObject(),
          approvedQuantity: approval.approvedQuantity,
          approvedRemark: approval.approvedRemark || productItem.approvedRemark || ''
        };
      }
      return productItem;
    });


    const updateData = {
      products: updatedProducts,
      updatedBy: userId
    };

    if (approvedRemark !== undefined) {
      updateData.approvalInfo = {
        ...stockRequest.approvalInfo,
        approvedRemark: approvedRemark,
        approvedBy: stockRequest.approvalInfo.approvedBy || userId,
        approvedAt: stockRequest.approvalInfo.approvedAt || new Date()
      };
    }

    if (stockRequest.status === 'Submitted') {
      updateData.status = 'Confirmed';
      updateData.approvalInfo = {
        ...updateData.approvalInfo,
        approvedBy: userId,
        approvedAt: new Date()
      };
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

