import mongoose from 'mongoose';

const stockTransferSchema = new mongoose.Schema(
  {
    fromCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Center',
      required: true
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Center',
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    transferNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    remark: {
      type: String,
      trim: true,
      default: "",
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        
        serialNumbers: [{
          type: String,
          trim: true
        }],
        approvedQuantity: {
          type: Number,
          min: [0, 'Approved quantity cannot be negative'],
        },
        approvedRemark: {
          type: String,
          trim: true,
        },
        receivedQuantity: {
          type: Number,
          min: [0, 'Received quantity cannot be negative'],
        },
        receivedRemark: {
          type: String,
          trim: true,
        },
        productInStock: {
          type: Number,
          default: 0,
          min: 0,
        },
        productRemark: {
          type: String,
          trim: true,
          default: "",
        },
        
        requiresSerialNumbers: {
          type: Boolean,
          default: false
        },
        
        availableSerials: [{
          serialNumber: String,
          purchaseId: mongoose.Schema.Types.ObjectId,
          addedAt: Date
        }]
      },
    ],
    
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Admin_Approved', 'Admin_Rejected', 'Confirmed', 'Shipped', 'Incompleted', 'Completed', 'Rejected'],
      default: 'Draft',
    },

    
    stockStatus: {
      sourceDeducted: {
        type: Boolean,
        default: false
      },
      destinationAdded: {
        type: Boolean,
        default: false
      },
      deductedAt: Date,
      addedAt: Date
    },

    
    adminApproval: {
      status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Not_Required'],
        default: 'Pending'
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedRemark: {
        type: String,
        trim: true,
      },
      rejectedAt: Date,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      rejectionReason: {
        type: String,
        trim: true,
      },
      
      modifications: [{
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        originalQuantity: Number,
        approvedQuantity: Number,
        modificationReason: String
      }]
    },

    approvalInfo: {
      approvedAt: {
        type: Date,
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedRemark: {
        type: String,
        trim: true,
      },
    },

    shippingInfo: {
      shippedAt: {
        type: Date,
      },
      shippedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      shippedDate: Date,
      expectedDeliveryDate: Date,
      shipmentDetails: String,
      shipmentRemark: String,
      documents: [String],
      shipmentRejected: {
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        rejectionRemark: String
      }
    },

    receivingInfo: {
      receivedAt: {
        type: Date,
      },
      receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      receivedRemark: {
        type: String,
        trim: true,
      },
    },
    
    completionInfo: {
      completedOn: Date,
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      incompleteOn: Date,
      incompleteBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      incompleteRemark: String,
    },

    challanDocument: {
      type: String,
      trim: true,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);


stockTransferSchema.pre('save', async function(next) {
  try {
    
    if (this.isModified('status') && this.status === 'Submitted') {
      this.adminApproval.status = 'Pending';
      await this.validateStockAvailability();
    }
    
    
    if (this.isModified('adminApproval.status') && this.adminApproval.status === 'Approved') {
      this.status = 'Admin_Approved';
    }
    
    
    if (this.isModified('adminApproval.status') && this.adminApproval.status === 'Rejected') {
      this.status = 'Admin_Rejected';
    }
    
    
    if (this.isModified('status') && ['Confirmed', 'Shipped', 'Completed'].includes(this.status)) {
      if (this.adminApproval.status !== 'Approved') {
        throw new Error('Admin approval is required before proceeding with this action');
      }
    }
    
    
    if (this.isModified('status') && this.status === 'Shipped' && !this.stockStatus.sourceDeducted) {
      await this.processSourceDeduction();
    }
    
    
    if (this.isModified('status') && this.status === 'Completed' && !this.stockStatus.destinationAdded) {
      await this.processDestinationAddition();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});


stockTransferSchema.pre('validate', async function(next) {
  try {
    
    if (this.toCenter && this.fromCenter.toString() === this.toCenter.toString()) {
      return next(new Error('From center and to center cannot be the same'));
    }
    
    
    if (!this.products || this.products.length === 0) {
      return next(new Error('At least one product is required for transfer'));
    }
    
    
    if (this.isModified('transferNumber')) {
      const StockTransfer = mongoose.model('StockTransfer');
      const existingTransfer = await StockTransfer.findOne({
        transferNumber: this.transferNumber,
        _id: { $ne: this._id }
      });
      
      if (existingTransfer) {
        return next(new Error('Transfer number must be unique'));
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});




stockTransferSchema.methods.submitTransfer = async function() {
  if (this.status !== 'Draft') {
    throw new Error('Only draft transfers can be submitted');
  }
  
  await this.validateStockAvailability();
  this.status = 'Submitted';
  this.adminApproval.status = 'Pending';
  
  return this.save();
};


stockTransferSchema.methods.approveByAdmin = async function(approvedBy, approvedRemark = '', modifications = []) {
  if (this.status !== 'Submitted') {
    throw new Error('Only submitted transfers can be approved by admin');
  }
  
  if (this.adminApproval.status !== 'Pending') {
    throw new Error('Transfer is not pending admin approval');
  }
  
  this.adminApproval.status = 'Approved';
  this.adminApproval.approvedBy = approvedBy;
  this.adminApproval.approvedAt = new Date();
  this.adminApproval.approvedRemark = approvedRemark;
  
  
  if (modifications.length > 0) {
    this.adminApproval.modifications = modifications;
    
    modifications.forEach(mod => {
      const productItem = this.products.find(p => p.product.toString() === mod.product.toString());
      if (productItem) {
        productItem.approvedQuantity = mod.approvedQuantity;
        productItem.approvedRemark = mod.modificationReason || '';
      }
    });
  }
  
  this.status = 'Admin_Approved';
  return this.save();
};


stockTransferSchema.methods.rejectByAdmin = async function(rejectedBy, rejectionReason = '') {
  if (this.status !== 'Submitted') {
    throw new Error('Only submitted transfers can be rejected by admin');
  }
  
  if (this.adminApproval.status !== 'Pending') {
    throw new Error('Transfer is not pending admin approval');
  }
  
  this.adminApproval.status = 'Rejected';
  this.adminApproval.rejectedBy = rejectedBy;
  this.adminApproval.rejectedAt = new Date();
  this.adminApproval.rejectionReason = rejectionReason;
  
  this.status = 'Admin_Rejected';
  return this.save();
};


stockTransferSchema.methods.bypassAdminApproval = async function(approvedBy, remark = '') {
  this.adminApproval.status = 'Not_Required';
  this.adminApproval.approvedBy = approvedBy;
  this.adminApproval.approvedAt = new Date();
  this.adminApproval.approvedRemark = remark;
  
  this.status = 'Admin_Approved';
  return this.save();
};


stockTransferSchema.methods.isAdminApproved = function() {
  return this.adminApproval.status === 'Approved' || this.adminApproval.status === 'Not_Required';
};


stockTransferSchema.methods.approveTransfer = async function(approvedBy, productApprovals = []) {
  if (!this.isAdminApproved()) {
    throw new Error('Admin approval is required before center approval');
  }
  
  if (this.status !== 'Admin_Approved') {
    throw new Error('Transfer must be admin approved before center approval');
  }
  
  this.status = 'Confirmed';
  this.approvalInfo.approvedBy = approvedBy;
  this.approvalInfo.approvedAt = new Date();

  if (productApprovals.length > 0) {
    this.products.forEach((product, index) => {
      const approval = productApprovals.find(pa => pa.productId.toString() === product.product.toString());
      if (approval) {
        product.approvedQuantity = approval.approvedQuantity;
        product.approvedRemark = approval.approvedRemark || '';
      }
    });
  }
  
  return this.save();
};


stockTransferSchema.methods.shipTransfer = async function(shippedBy, shippingDetails = {}) {
  if (!this.isAdminApproved()) {
    throw new Error('Admin approval is required before shipping');
  }
  
  if (this.status !== 'Confirmed' && this.status !== 'Admin_Approved') {
    throw new Error('Transfer must be confirmed or admin approved before shipping');
  }
  
  if (!this.stockStatus.sourceDeducted) {
    await this.processSourceDeduction();
  }
  
  this.status = 'Shipped';
  this.shippingInfo.shippedBy = shippedBy;
  this.shippingInfo.shippedAt = new Date();

  if (shippingDetails.shippedDate) this.shippingInfo.shippedDate = shippingDetails.shippedDate;
  if (shippingDetails.expectedDeliveryDate) this.shippingInfo.expectedDeliveryDate = shippingDetails.expectedDeliveryDate;
  if (shippingDetails.shipmentDetails) this.shippingInfo.shipmentDetails = shippingDetails.shipmentDetails;
  if (shippingDetails.shipmentRemark) this.shippingInfo.shipmentRemark = shippingDetails.shipmentRemark;
  if (shippingDetails.documents) this.shippingInfo.documents = shippingDetails.documents;
  
  return this.save();
};


stockTransferSchema.methods.completeTransfer = async function(receivedBy, productReceipts = []) {
  if (!this.isAdminApproved()) {
    throw new Error('Admin approval is required before completion');
  }
  
  if (this.status !== 'Shipped') {
    throw new Error('Transfer must be shipped before completion');
  }
  
  if (!this.stockStatus.destinationAdded) {
    await this.processDestinationAddition();
  }
  
  this.status = 'Completed';
  this.receivingInfo.receivedBy = receivedBy;
  this.receivingInfo.receivedAt = new Date();
  this.completionInfo.completedOn = new Date();
  this.completionInfo.completedBy = receivedBy;
  
  if (productReceipts.length > 0) {
    this.products.forEach((product, index) => {
      const receipt = productReceipts.find(pr => pr.productId.toString() === product.product.toString());
      if (receipt) {
        product.receivedQuantity = receipt.receivedQuantity;
        product.receivedRemark = receipt.receivedRemark || '';
      }
    });
  }
  
  return this.save();
};


stockTransferSchema.statics.findPendingAdminApproval = function() {
  return this.find({ 
    status: 'Submitted',
    'adminApproval.status': 'Pending' 
  })
    .populate('fromCenter', 'centerName centerCode')
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode trackSerialNumbers')
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 });
};

stockTransferSchema.statics.findAdminApproved = function() {
  return this.find({ 
    $or: [
      { status: 'Admin_Approved' },
      { status: 'Confirmed' },
      { status: 'Shipped' },
      { status: 'Completed' }
    ],
    'adminApproval.status': { $in: ['Approved', 'Not_Required'] }
  })
    .populate('fromCenter', 'centerName centerCode')
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode trackSerialNumbers')
    .populate('createdBy', 'fullName email')
    .populate('adminApproval.approvedBy', 'fullName email')
    .sort({ 'adminApproval.approvedAt': -1 });
};

stockTransferSchema.statics.findAdminRejected = function() {
  return this.find({ status: 'Admin_Rejected' })
    .populate('fromCenter', 'centerName centerCode')
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode trackSerialNumbers')
    .populate('createdBy', 'fullName email')
    .populate('adminApproval.rejectedBy', 'fullName email')
    .sort({ 'adminApproval.rejectedAt': -1 });
};


stockTransferSchema.methods.validateStockAvailability = async function() {
  const CenterStock = mongoose.model('CenterStock');
  const Product = mongoose.model('Product');
  
  for (const item of this.products) {
    const product = await Product.findById(item.product);
    const requiresSerialNumbers = product ? product.trackSerialNumbers : false;
    item.requiresSerialNumbers = requiresSerialNumbers;
    
    const centerStock = await CenterStock.findOne({
      center: this.fromCenter,
      product: item.product
    });
    
    if (!centerStock || centerStock.availableQuantity < item.quantity) {
      throw new Error(`Insufficient stock for product ${product?.productTitle}. Available: ${centerStock?.availableQuantity || 0}, Requested: ${item.quantity}`);
    }
    
    item.productInStock = centerStock.availableQuantity;
    
    if (requiresSerialNumbers && centerStock.serialNumbers) {
      const availableSerials = centerStock.serialNumbers
        .filter(sn => sn.status === 'available')
        .sort((a, b) => new Date(a.createdAt || a.transferHistory[0]?.transferDate) - new Date(b.createdAt || b.transferHistory[0]?.transferDate))
        .slice(0, item.quantity);
      
      if (availableSerials.length < item.quantity) {
        throw new Error(`Insufficient serial numbers available for product ${product?.productTitle}. Available: ${availableSerials.length}, Required: ${item.quantity}`);
      }
      
      item.availableSerials = availableSerials.map(serial => ({
        serialNumber: serial.serialNumber,
        purchaseId: serial.purchaseId,
        addedAt: serial.createdAt || serial.transferHistory[0]?.transferDate
      }));
    }
  }
};

stockTransferSchema.methods.processSourceDeduction = async function() {
  const CenterStock = mongoose.model('CenterStock');
  
  for (const item of this.products) {
    const centerStock = await CenterStock.findOne({
      center: this.fromCenter,
      product: item.product
    });
    
    if (!centerStock) {
      throw new Error(`Stock not found for product in source center`);
    }
    
    let serialNumbersToTransfer = [];
    const quantityToTransfer = item.approvedQuantity || item.quantity;
    
    if (item.requiresSerialNumbers) {
      const availableSerials = centerStock.serialNumbers
        .filter(sn => sn.status === 'available')
        .sort((a, b) => new Date(a.createdAt || a.transferHistory[0]?.transferDate) - new Date(b.createdAt || b.transferHistory[0]?.transferDate))
        .slice(0, quantityToTransfer);
      
      serialNumbersToTransfer = availableSerials.map(sn => sn.serialNumber);
      item.serialNumbers = serialNumbersToTransfer;
    }
    
    await centerStock.transferToCenter(
      this.toCenter,
      quantityToTransfer,
      serialNumbersToTransfer
    );
  }
  
  this.stockStatus.sourceDeducted = true;
  this.stockStatus.deductedAt = new Date();
  await this.save();
};

stockTransferSchema.methods.processDestinationAddition = async function() {
  const CenterStock = mongoose.model('CenterStock');
  
  for (const item of this.products) {
    let serialNumbers = [];
    const quantityToAdd = item.receivedQuantity || item.approvedQuantity || item.quantity;
    
    if (item.requiresSerialNumbers && item.serialNumbers && item.serialNumbers.length > 0) {
      serialNumbers = item.serialNumbers.slice(0, quantityToAdd);
    }
    
    await CenterStock.updateStock(
      this.toCenter,
      item.product,
      quantityToAdd,
      serialNumbers,
      this.fromCenter,
      "inbound_transfer"
    );
  }
  
  this.stockStatus.destinationAdded = true;
  this.stockStatus.addedAt = new Date();
  await this.save();
};


stockTransferSchema.index({ date: -1 });
stockTransferSchema.index({ fromCenter: 1 });
stockTransferSchema.index({ toCenter: 1 });
stockTransferSchema.index({ transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ 'adminApproval.status': 1 });
stockTransferSchema.index({ 'adminApproval.approvedAt': -1 });
stockTransferSchema.index({ 'adminApproval.rejectedAt': -1 });
stockTransferSchema.index({ challanDocument: 1 });
stockTransferSchema.index({ 'approvalInfo.approvedAt': -1 });
stockTransferSchema.index({ 'shippingInfo.shippedAt': -1 });
stockTransferSchema.index({ 'receivingInfo.receivedAt': -1 });
stockTransferSchema.index({ 'stockStatus.sourceDeducted': 1 });
stockTransferSchema.index({ 'stockStatus.destinationAdded': 1 });

export default mongoose.model('StockTransfer', stockTransferSchema);