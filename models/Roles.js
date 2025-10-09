import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  module: {
    type: String,
    required: true,
    trim: true,
  },
  permissions: [
    {
      type: String,
      required: true,
      trim: true,
    },
  ],
});

const roleSchema = new mongoose.Schema(
  {
    roleTitle: {
      type: String,
      required: [true, "Role title is required"],
      unique: true,
      trim: true,
      maxlength: [50, "Role title cannot exceed 50 characters"],
    },
    permissions: [permissionSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

roleSchema.pre("save", function (next) {
  this.roleTitle = this.roleTitle.toLowerCase();
  next();
});

roleSchema.statics.roleExists = async function (roleTitle) {
  const role = await this.findOne({ roleTitle: roleTitle.toLowerCase() });
  return !!role;
};

export default mongoose.model("Role", roleSchema);
