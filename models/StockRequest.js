import mongoose from 'mongoose';

const stockRequestSchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
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
      enum: ['Draft', 'Submitted', 'Confirmed', 'Shipped', 'Completed', 'Rejected'],
      default: 'Submitted',
    },
    
    shippingInfo: {
      shippedDate: Date,
      expectedDeliveryDate: Date,
      shipmentDetails: String,
      shipmentRemark: String,
      documents: [String],
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

// Pre-save middleware to generate order number
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

export default mongoose.model('StockRequest', stockRequestSchema);