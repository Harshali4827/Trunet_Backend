import mongoose from 'mongoose';

const stockPurchaseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["new", "Furnished"],
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    invoiceNo: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    outlet: {
      type: String,
      required: true,
      trim: true,
    },
    transportAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remark: {
      type: String,
      trim: true,
      default: "",
    },
    cgst: {
      type: Number,
      default: 0,
      min: 0,
    },
    sgst: {
      type: Number,
      default: 0,
      min: 0,
    },
    igst: {
      type: Number,
      default: 0,
      min: 0,
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        availableQuantity: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        purchasedQuantity: {
          type: Number,
          required: true,
          min: 1,
        },
        serialNumbers: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],
    totalAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

stockPurchaseSchema.pre('save', function(next) {
  this.totalAmount = this.products.reduce((total, product) => {
    return total + (product.price * product.purchasedQuantity);
  }, 0) + this.transportAmount;

  for (const productItem of this.products) {
    productItem.availableQuantity = productItem.purchasedQuantity;
    
    if (productItem.serialNumbers && productItem.serialNumbers.length > 0) {
      if (productItem.serialNumbers.length !== productItem.purchasedQuantity) {
        return next(new Error(`Serial numbers count must match purchased quantity for product ${productItem.product}`));
      }
    }
  }
  
  next();
});

stockPurchaseSchema.pre('validate', async function(next) {
  try {
    for (const productItem of this.products) {
      const product = await mongoose.model('Product').findById(productItem.product);
      
      if (product && product.trackSerialNumber === 'Yes') {
        if (!productItem.serialNumbers || productItem.serialNumbers.length === 0) {
          return next(new Error(`Serial numbers are required for product: ${product.productTitle}`));
        }
        
        if (productItem.serialNumbers.length !== productItem.purchasedQuantity) {
          return next(new Error(`Number of serial numbers (${productItem.serialNumbers.length}) must match purchased quantity (${productItem.purchasedQuantity}) for product: ${product.productTitle}`));
        }

        const serialSet = new Set(productItem.serialNumbers);
        if (serialSet.size !== productItem.serialNumbers.length) {
          return next(new Error(`Duplicate serial numbers found for product: ${product.productTitle}`));
        }
      } else if (productItem.serialNumbers && productItem.serialNumbers.length > 0) {
        if (productItem.serialNumbers.length !== productItem.purchasedQuantity) {
          return next(new Error(`Serial numbers count must match purchased quantity for product ${product.productTitle}`));
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

stockPurchaseSchema.index({ date: -1 });
stockPurchaseSchema.index({ vendor: 1 });
stockPurchaseSchema.index({ outlet: 1 });
stockPurchaseSchema.index({ invoiceNo: 1 }, { unique: true });

stockPurchaseSchema.virtual('totalTax').get(function() {
  return this.cgst + this.sgst + this.igst;
});

stockPurchaseSchema.virtual('grandTotal').get(function() {
  return this.totalAmount + this.totalTax;
});

stockPurchaseSchema.methods.addProduct = function(productData) {
  productData.availableQuantity = productData.purchasedQuantity;
  this.products.push(productData);
  return this.save();
};

stockPurchaseSchema.methods.removeProduct = function(productId) {
  this.products = this.products.filter(item => item.product.toString() !== productId.toString());
  return this.save();
};

stockPurchaseSchema.statics.findByVendor = function(vendorId) {
  return this.find({ vendor: vendorId }).populate('vendor products.product');
};

stockPurchaseSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('vendor products.product');
};

stockPurchaseSchema.statics.findByOutlet = function(outlet) {
  return this.find({ outlet: outlet }).populate('vendor products.product');
};

export default mongoose.model('StockPurchase', stockPurchaseSchema);