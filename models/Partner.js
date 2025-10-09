import mongoose from "mongoose";

const partnerSchema = new mongoose.Schema(
  {
    partnerName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Partner", partnerSchema);
