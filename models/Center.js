import mongoose from "mongoose";

const centerSchema = new mongoose.Schema(
  {
    reseller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reseller",
      required: function() {
        return this.centerType === "Center";
      },
    },
    area: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Area",
      required: function() {
        return this.centerType === "Center";
      },
    },
    centerType: {
      type: String,
      required: [true, "Center type is required"],
      enum: ["Center", "Outlet"],
      default: "Center",
    },
    centerName: {
      type: String,
      required: [true, "Center name is required"],
      trim: true,
    },
    centerCode: {
      type: String,
      required: [true, "Center code is required"],
      unique: true,
      sparse: true,
      uppercase: true,
    },
    email: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    mobile: {
      type: String,
      match: [/^[0-9]{10}$/, "Please provide a valid 10-digit mobile number"],
    },
    status: {
      type: String,
      enum: ["Enable", "Disable"],
      default: "Enable",
    },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    stockVerified: {
      type: String,
      enum: {
        values: ['Yes', 'No', ''],
        message: '`{VALUE}` is not a valid enum value for path `{PATH}`'
      },
      default: '', 
      trim: true
    },
  },
  { timestamps: true }
);

export default mongoose.model("Center", centerSchema);
