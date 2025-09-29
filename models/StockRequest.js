import mongoose from 'mongoose';

const stockRequestSchema = new mongoose.Schema(
  {
    warehouse: {
      type: String,
      required: [true, 'Warehouse is required'],
    },
    
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Center',
      required: [true, 'Center is required'],
    },
    
    date: {
      type: Date,
      required: true,
      default: () => new Date().setHours(0, 0, 0, 0),
    },
    
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      trim: true,
    },
    
    remark: {
      type: String,
      trim: true,
    },
    
    products: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Product is required'],
      },
      quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [1, 'Quantity must be at least 1'],
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
      },
    }],
    
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Confirmed', 'Shipped','Incompleted', 'Completed', 'Rejected'],
      default: 'Submitted',
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
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user is required'],
    },
    
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { 
    timestamps: true 
  }
);

// REMOVED: The automatic orderNumber generation pre-save hook
// Order numbers will now be provided manually from the user interface

stockRequestSchema.pre('save', function(next) {
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

stockRequestSchema.methods.approveRequest = function(approvedBy, approvedRemark = '', productApprovals = []) {
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



stockRequestSchema.methods.updateShippingInfo = function(shippingDetails = {}) {
  
  if (shippingDetails.shippedDate) this.shippingInfo.shippedDate = shippingDetails.shippedDate;
  if (shippingDetails.expectedDeliveryDate) this.shippingInfo.expectedDeliveryDate = shippingDetails.expectedDeliveryDate;
  if (shippingDetails.shipmentDetails) this.shippingInfo.shipmentDetails = shippingDetails.shipmentDetails;
  if (shippingDetails.shipmentRemark) this.shippingInfo.shipmentRemark = shippingDetails.shipmentRemark;
  if (shippingDetails.documents) this.shippingInfo.documents = shippingDetails.documents;
  
  return this.save();
};



stockRequestSchema.methods.rejectShipment = function(rejectedBy, rejectionRemark = '') {
  
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



stockRequestSchema.methods.completeIncompleteRequest = function(
  completedBy, 
  productApprovals = [], 
  productReceipts = [], 
  approvedRemark = '', 
  receivedRemark = ''
) {
  this.status = 'Completed';
  
  
  if (approvedRemark) {
    if (!this.approvalInfo.approvedBy) {
      this.approvalInfo.approvedBy = completedBy;
      this.approvalInfo.approvedAt = new Date();
    }
  }

  
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

stockRequestSchema.methods.shipRequest = function(shippedBy, shippingDetails = {}) {
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

stockRequestSchema.methods.completeRequest = function(receivedBy, receivedRemark = '', productReceipts = []) {
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

export default mongoose.model('StockRequest', stockRequestSchema);