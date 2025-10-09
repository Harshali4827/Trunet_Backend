import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
  {
    productCategory: {
      type: String,
      required: [true, "Product category is required"],
      unique: true,
      trim: true,
    },
    remark: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ProductCategory", productCategorySchema);
