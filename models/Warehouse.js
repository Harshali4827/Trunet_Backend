import mongoose from "mongoose";

const wareHouseSchema = new mongoose.Schema(
  {
    warehouseName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Warehouse", wareHouseSchema);
