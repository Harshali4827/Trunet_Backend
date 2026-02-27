// import mongoose from "mongoose";

// const permissionSchema = new mongoose.Schema({
//   module: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   permissions: [
//     {
//       type: String,
//       required: true,
//       trim: true,
//     },
//   ],
// });

// const roleSchema = new mongoose.Schema(
//   {
//     roleTitle: {
//       type: String,
//       required: [true, "Role title is required"],
//       unique: true,
//       trim: true,
//       maxlength: [50, "Role title cannot exceed 50 characters"],
//     },
//     permissions: [permissionSchema],
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       default: null,
//     },
//   },
//   { timestamps: true }
// );

// roleSchema.pre("save", function (next) {
//   this.roleTitle = this.roleTitle.toLowerCase();
//   next();
// });

// roleSchema.statics.roleExists = async function (roleTitle) {
//   const role = await this.findOne({ roleTitle: roleTitle.toLowerCase() });
//   return !!role;
// };

// export default mongoose.model("Role", roleSchema);



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
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
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
  
  // Auto-set isSuperAdmin based on roleTitle
  if (this.roleTitle === "superadmin") {
    this.isSuperAdmin = true;
  }
  
  next();
});

// Static method to create Superadmin role
roleSchema.statics.createSuperAdminRole = async function () {
  const existingSuperAdmin = await this.findOne({ roleTitle: "superadmin" });
  
  if (existingSuperAdmin) {
    return existingSuperAdmin;
  }

  const superAdminRole = new this({
    roleTitle: "superadmin",
    isSuperAdmin: true,
    // No permissions needed - superadmin has access to everything
    permissions: [],
  });

  return await superAdminRole.save();
};

roleSchema.statics.isSuperAdminRole = async function (roleId) {
  const role = await this.findById(roleId);
  return role && role.isSuperAdmin;
};

roleSchema.statics.roleExists = async function (roleTitle) {
  const role = await this.findOne({ roleTitle: roleTitle.toLowerCase() });
  return !!role;
};

export default mongoose.model("Role", roleSchema);