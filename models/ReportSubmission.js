import mongoose from "mongoose";

const productItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    productQty: {
      type: Number,
      required: [true, "Product quantity is required"],
      min: [0, "Product quantity cannot be negative"],
    },
    damageQty: {
      type: Number,
      required: [true, "Damage quantity is required"],
      min: [0, "Damage quantity cannot be negative"],
      default: 0,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [200, "Comment cannot exceed 200 characters"],
    },
  },
  { _id: true }
);

const stockClosingSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    stockClosingForOtherCenter: {
      type: Boolean,
      required: [true, "Stock closing for other center flag is required"],
      default: false,
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: function () {
        return this.stockClosingForOtherCenter === true;
      },
    },
    products: [productItemSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Verified", "Rejected"],
      default: "Draft",
    },
    totalProductQty: {
      type: Number,
      default: 0,
    },
    totalDamageQty: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

stockClosingSchema.index({ date: 1, center: 1 });
stockClosingSchema.index({ "products.product": 1 });
stockClosingSchema.index({ stockClosingForOtherCenter: 1 });

stockClosingSchema.virtual("totalQty").get(function () {
  return this.totalProductQty + this.totalDamageQty;
});

stockClosingSchema.pre("save", function (next) {
  if (!this.products || this.products.length === 0) {
    return next(new Error("At least one product is required"));
  }

  for (const product of this.products) {
    if (product.damageQty > product.productQty) {
      return next(
        new Error(
          `Damage quantity cannot exceed product quantity for product ${product.product}`
        )
      );
    }
  }

  this.totalProductQty = this.products.reduce(
    (total, product) => total + product.productQty,
    0
  );
  this.totalDamageQty = this.products.reduce(
    (total, product) => total + product.damageQty,
    0
  );

  next();
});

stockClosingSchema.set("toJSON", { virtuals: true });
stockClosingSchema.set("toObject", { virtuals: true });

stockClosingSchema.statics.findByDateRange = function (startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).populate("center products.product");
};

stockClosingSchema.methods.isForOtherCenter = function () {
  return this.stockClosingForOtherCenter;
};

export default mongoose.model("StockClosing", stockClosingSchema);
