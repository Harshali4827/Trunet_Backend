import mongoose from "mongoose";

const areaSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: [true, "Partner ID is required"],
    },
    areaName: {
      type: String,
      required: [true, "Area name is required"],
      trim: true,
      minlength: [3, "Area name must be at least 3 characters"],
      maxlength: [50, "Area name cannot exceed 50 characters"],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Area", areaSchema);
