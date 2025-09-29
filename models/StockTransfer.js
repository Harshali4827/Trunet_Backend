import mongoose from 'mongoose';

const stockTransferSchema = new mongoose.Schema(
  {
    fromCenter: {
      type: String,
      required: true,
      trim: true,
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
      },
    ],
    
    
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Confirmed', 'Shipped', 'Incompleted', 'Completed', 'Rejected'],
      default: 'Draft',
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


stockTransferSchema.pre('validate', async function(next) {
  try {
    
    const toCenter = await mongoose.model('Center').findById(this.toCenter);
    if (toCenter && this.fromCenter === toCenter.centerName) {
      return next(new Error('From center and to center cannot be the same'));
    }
    
    
    if (!this.products || this.products.length === 0) {
      return next(new Error('At least one product is required for transfer'));
    }
    
    
    if (!this.transferNumber) {
      return next(new Error('Transfer number is required'));
    }
    
    
    if (this.isModified('transferNumber')) {
      const existingTransfer = await mongoose.model('StockTransfer').findOne({
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


// stockTransferSchema.pre('save', function(next) {
//   if (this.status === 'Completed' && !this.challanDocument) {
//     return next(new Error('Challan document is required when transfer status is Completed'));
//   }
//   next();
// });


stockTransferSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const now = new Date();
    
    switch (this.status) {
      case 'Confirmed':
        if (!this.approvalInfo.approvedAt) {
          this.approvalInfo.approvedAt = now;
        }
        break;
        
      case 'Shipped':
        if (!this.shippingInfo.shippedAt) {
          this.shippingInfo.shippedAt = now;
        }
        break;
        
      case 'Completed':
        if (!this.receivingInfo.receivedAt) {
          this.receivingInfo.receivedAt = now;
        }

        if (!this.completionInfo.completedOn) {
          this.completionInfo.completedOn = now;
        }
        break;
    }
  }
  next();
});




stockTransferSchema.methods.approveTransfer = function(approvedBy, productApprovals = []) {
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


stockTransferSchema.methods.shipTransfer = function(shippedBy, shippingDetails = {}) {
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


stockTransferSchema.methods.updateShippingInfo = function(shippingDetails = {}) {
  
  if (shippingDetails.shippedDate) this.shippingInfo.shippedDate = shippingDetails.shippedDate;
  if (shippingDetails.expectedDeliveryDate) this.shippingInfo.expectedDeliveryDate = shippingDetails.expectedDeliveryDate;
  if (shippingDetails.shipmentDetails) this.shippingInfo.shipmentDetails = shippingDetails.shipmentDetails;
  if (shippingDetails.shipmentRemark) this.shippingInfo.shipmentRemark = shippingDetails.shipmentRemark;
  if (shippingDetails.documents) this.shippingInfo.documents = shippingDetails.documents;
  
  return this.save();
};


stockTransferSchema.methods.rejectShipment = function(rejectedBy, rejectionRemark = '') {
  
  const previousShippingInfo = { ...this.shippingInfo.toObject() };
  
  
  this.shippingInfo = {
    shippedAt: undefined,
    shippedBy: undefined,
    shippedDate: undefined,
    expectedDeliveryDate: undefined,
    shipmentDetails: undefined,
    shipmentRemark: undefined,
    documents: [],
    
    shipmentRejected: {
      rejectedAt: new Date(),
      rejectedBy: rejectedBy,
      rejectionRemark: rejectionRemark,
      previousShippingData: previousShippingInfo 
    }
  };
  
  
  this.status = 'Confirmed';
  
  return this.save();
};


stockTransferSchema.methods.completeTransfer = function(receivedBy, productReceipts = []) {
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


stockTransferSchema.methods.completeIncompleteTransfer = function(
  completedBy, 
  productApprovals = [], 
  productReceipts = [], 
) {
  this.status = 'Completed';
  
  
  this.receivingInfo.receivedAt = new Date();
  this.receivingInfo.receivedBy = completedBy;
  
  this.completionInfo.completedOn = new Date();
  this.completionInfo.completedBy = completedBy;

  
  if (productApprovals.length > 0) {
    this.products.forEach(productItem => {
      const approval = productApprovals.find(
        pa => pa.productId.toString() === productItem.product.toString()
      );
      if (approval) {
        productItem.approvedQuantity = approval.approvedQuantity;
        productItem.approvedRemark = approval.approvedRemark || productItem.approvedRemark || '';
      }
    });
  }

  if (productReceipts.length > 0) {
    this.products.forEach(productItem => {
      const receipt = productReceipts.find(
        pr => pr.productId.toString() === productItem.product.toString()
      );
      if (receipt) {
        productItem.receivedQuantity = receipt.receivedQuantity;
        productItem.receivedRemark = receipt.receivedRemark || productItem.receivedRemark || '';
      }
    });
  }

  return this.save();
};


stockTransferSchema.methods.markAsIncomplete = function(incompleteBy, incompleteRemark = '') {
  this.status = 'Incompleted';
  this.completionInfo.incompleteOn = new Date();
  this.completionInfo.incompleteBy = incompleteBy;
  this.completionInfo.incompleteRemark = incompleteRemark;
  
  return this.save();
};


stockTransferSchema.statics.findByFromCenter = function(fromCenter) {
  return this.find({ fromCenter })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email')
    .populate('approvalInfo.approvedBy', 'fullName email')
    .populate('shippingInfo.shippedBy', 'fullName email')
    .populate('receivingInfo.receivedBy', 'fullName email');
};

stockTransferSchema.statics.findByToCenter = function(toCenterId) {
  return this.find({ toCenter: toCenterId })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email')
    .populate('approvalInfo.approvedBy', 'fullName email')
    .populate('shippingInfo.shippedBy', 'fullName email')
    .populate('receivingInfo.receivedBy', 'fullName email');
};

stockTransferSchema.statics.findByStatus = function(status) {
  return this.find({ status })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email')
    .populate('approvalInfo.approvedBy', 'fullName email')
    .populate('shippingInfo.shippedBy', 'fullName email')
    .populate('receivingInfo.receivedBy', 'fullName email');
};

stockTransferSchema.statics.updateChallanDocument = function(transferId, documentPath) {
  return this.findByIdAndUpdate(
    transferId,
    { 
      challanDocument: documentPath,
      status: 'Completed' 
    },
    { new: true }
  ).populate('toCenter', 'centerName centerCode')
   .populate('products.product', 'productTitle productCode')
   .populate('createdBy', 'fullName email')
   .populate('approvalInfo.approvedBy', 'fullName email')
   .populate('shippingInfo.shippedBy', 'fullName email')
   .populate('receivingInfo.receivedBy', 'fullName email');
};

stockTransferSchema.statics.findWithChallan = function() {
  return this.find({ challanDocument: { $ne: null } })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email')
    .populate('approvalInfo.approvedBy', 'fullName email')
    .populate('shippingInfo.shippedBy', 'fullName email')
    .populate('receivingInfo.receivedBy', 'fullName email');
};

stockTransferSchema.statics.isTransferNumberExists = async function(transferNumber, excludeId = null) {
  const query = { transferNumber };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await this.findOne(query);
  return !!existing;
};


stockTransferSchema.index({ date: -1 });
stockTransferSchema.index({ fromCenter: 1 });
stockTransferSchema.index({ toCenter: 1 });
stockTransferSchema.index({ transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ challanDocument: 1 });
stockTransferSchema.index({ 'approvalInfo.approvedAt': -1 });
stockTransferSchema.index({ 'shippingInfo.shippedAt': -1 });
stockTransferSchema.index({ 'receivingInfo.receivedAt': -1 });

export default mongoose.model('StockTransfer', stockTransferSchema);