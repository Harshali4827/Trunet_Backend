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
      unique: true,
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

stockRequestSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      const center = await mongoose.model('Center').findById(this.center).select('centerCode');
      if (!center) return next(new Error('Center not found'));
      
      const currentDate = new Date();
      const year = currentDate.getFullYear().toString().slice(-2);
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      
      const count = await mongoose.model('StockRequest').countDocuments({
        center: this.center,
        createdAt: {
          $gte: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
          $lt: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        }
      });
      
      this.orderNumber = `${center.centerCode}/${month}${year}/${count + 1}`;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

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
  this.approvalInfo.approvedRemark = approvedRemark;
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
  this.receivingInfo.receivedRemark = receivedRemark;
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