import mongoose from "mongoose";

const stockPurchaseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["new", "refurbish"],
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
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
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
            serialNumber: {
              type: String,
              trim: true,
              required: true,
            },
            status: {
              type: String,
              enum: [
                "available",
                "transferred",
                "sold",
                "returned",
                "consumed",
              ],
              default: "available",
            },
            currentLocation: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
              default: null,
            },
            transferredTo: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
              default: null,
            },
            transferDate: {
              type: Date,
              default: null,
            },
            consumedDate: {
              type: Date,
              default: null,
            },
          },
        ],
      },
    ],
    productAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "active",
        "cancelled",
        "fully_transferred",
        "partially_transferred",
      ],
      default: "active",
    },
  },
  { timestamps: true }
);

stockPurchaseSchema.pre("save", function (next) {
  this.productAmount = this.products.reduce((total, product) => {
    return total + product.price * product.purchasedQuantity;
  }, 0);

  const totalTax = this.cgst + this.sgst + this.igst;
  this.totalAmount = this.productAmount + totalTax;

  if (this.isNew) {
    for (const productItem of this.products) {
      productItem.availableQuantity = productItem.purchasedQuantity;

      if (productItem.serialNumbers && productItem.serialNumbers.length > 0) {
        if (
          productItem.serialNumbers.length !== productItem.purchasedQuantity
        ) {
          return next(
            new Error(
              `Serial numbers count must match purchased quantity for product ${productItem.product}`
            )
          );
        }

        productItem.serialNumbers = productItem.serialNumbers.map((serial) => ({
          serialNumber:
            typeof serial === "object" ? serial.serialNumber : serial,
          status: "available",
          currentLocation: this.outlet,
          transferredTo: null,
          transferDate: null,
          consumedDate: null,
        }));
      }
    }
  }

  const allProductsTransferred = this.products.every(
    (product) => product.availableQuantity === 0
  );

  const someProductsTransferred = this.products.some(
    (product) =>
      product.availableQuantity < product.purchasedQuantity &&
      product.availableQuantity > 0
  );

  if (allProductsTransferred) {
    this.status = "fully_transferred";
  } else if (someProductsTransferred) {
    this.status = "partially_transferred";
  } else {
    this.status = "active";
  }

  next();
});

export default mongoose.model("StockPurchase", stockPurchaseSchema);
