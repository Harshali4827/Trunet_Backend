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
        productRemark: {
          type: String,
          trim: true,
          default: "",
        },
      },
    ],
    status: {
      type: String,
      enum: ['Draft', 'Completed', 'Rejected'],
      default: 'Draft',
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
  if (this.isNew && !this.transferNumber) {
    try {
      const toCenter = await mongoose.model('Center').findById(this.toCenter).select('centerCode');
      if (!toCenter) return next(new Error('To Center not found'));
      
      const currentDate = new Date();
      const year = currentDate.getFullYear().toString().slice(-2);
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      
      const count = await mongoose.model('StockTransfer').countDocuments({
        toCenter: this.toCenter,
        createdAt: {
          $gte: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
          $lt: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        }
      });
      
      this.transferNumber = `${toCenter.centerCode}/TR${month}${year}/${count + 1}`;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});


stockTransferSchema.pre('validate', async function(next) {
  try {
    
    const toCenter = await mongoose.model('Center').findById(this.toCenter);
    if (toCenter && this.fromCenter === toCenter.centerName) {
      return next(new Error('From center and to center cannot be the same'));
    }
    
    
    if (!this.products || this.products.length === 0) {
      return next(new Error('At least one product is required for transfer'));
    }
    
    next();
  } catch (error) {
    next(error);
  }
});


stockTransferSchema.index({ date: -1 });
stockTransferSchema.index({ fromCenter: 1 });
stockTransferSchema.index({ toCenter: 1 });
stockTransferSchema.index({ transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ status: 1 });


stockTransferSchema.statics.findByFromCenter = function(fromCenter) {
  return this.find({ fromCenter })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email');
};

stockTransferSchema.statics.findByToCenter = function(toCenterId) {
  return this.find({ toCenter: toCenterId })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email');
};

stockTransferSchema.statics.findByStatus = function(status) {
  return this.find({ status })
    .populate('toCenter', 'centerName centerCode')
    .populate('products.product', 'productTitle productCode')
    .populate('createdBy', 'fullName email');
};

export default mongoose.model('StockTransfer', stockTransferSchema);