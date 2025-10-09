import mongoose from "mongoose";

const shiftingRequestSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    address1: {
      type: String,
      required: [true, "Address1 is required"],
      trim: true,
    },
    address2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    remark: {
      type: String,
      required: [true, "Remark is required"],
      trim: true,
    },
    fromCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "From center is required"],
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "To center is required"],
    },
    status: {
      type: String,
      enum: ["Pending", "Approve", "Rejecte"],
      default: "Pending",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },

    customerCenterUpdated: {
      type: Boolean,
      default: false,
    },
    customerCenterUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

shiftingRequestSchema.index({ customer: 1, status: 1 });
shiftingRequestSchema.index({ fromCenter: 1, toCenter: 1 });
shiftingRequestSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("ShiftingRequest", shiftingRequestSchema);
