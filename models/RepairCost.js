import mongoose from "mongoose";

const RepairCostSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    unique: true
  },
  repairCost: {
    type: Number,
    required: true,
    min: 0,
    default: 150 
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

RepairCostSchema.index({ product: 1 });
RepairCostSchema.index({ isActive: 1 });
RepairCostSchema.index({ repairCost: 1 });

RepairCostSchema.virtual('productDetails', {
  ref: 'Product',
  localField: 'product',
  foreignField: '_id',
  justOne: true
});

RepairCostSchema.set('toJSON', { virtuals: true });
RepairCostSchema.set('toObject', { virtuals: true });

const RepairCost = mongoose.model("RepairCost", RepairCostSchema);
export default RepairCost;