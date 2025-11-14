// import mongoose from "mongoose";
// import bcrypt from "bcryptjs";

// const userSchema = new mongoose.Schema(
//   {
//     role: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Role",
//       required: [true, "Role is required"],
//     },
//     center: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Center",
//       required: [true, "Center is required"],
//     },
//     fullName: {
//       type: String,
//       required: [true, "Full name is required"],
//       trim: true,
//       maxlength: [100, "Full name cannot exceed 100 characters"],
//     },
//     email: {
//       type: String,
//       required: [true, "Email is required"],
//       unique: true,
//       lowercase: true,
//       trim: true,
//       match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
//     },
//     mobile: {
//       type: String,
//       required: [true, "Mobile number is required"],
//       match: [/^[0-9]{10}$/, "Please provide a valid 10-digit mobile number"],
//     },
//     status: {
//       type: String,
//       enum: ["Enable", "Disable"],
//       default: "Enable",
//     },
//     password: {
//       type: String,
//       required: [true, "Password is required"],
//       minlength: [6, "Password must be at least 6 characters"],
//       select: false,
//     },
//     lastLogin: {
//       type: Date,
//     },
//     loginAttempts: {
//       type: Number,
//       default: 0,
//     },
//     lockUntil: {
//       type: Date,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// userSchema
//   .virtual("confirmPassword")
//   .get(function () {
//     return this._confirmPassword;
//   })
//   .set(function (value) {
//     this._confirmPassword = value;
//   });

// userSchema.pre("validate", function (next) {
//   if (this.isModified("password")) {
//     if (this.password !== this._confirmPassword) {
//       this.invalidate("confirmPassword", "Passwords do not match");
//     }
//   }
//   next();
// });

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();

//   try {
//     const salt = await bcrypt.genSalt(12);
//     this.password = await bcrypt.hash(this.password, salt);
//     next();
//   } catch (error) {
//     next(error);
//   }
// });

// userSchema.methods.correctPassword = async function (
//   candidatePassword,
//   userPassword
// ) {
//   return await bcrypt.compare(candidatePassword, userPassword);
// };

// userSchema.methods.isLocked = function () {
//   return !!(this.lockUntil && this.lockUntil > Date.now());
// };

// userSchema.methods.incrementLoginAttempts = async function () {
//   if (this.lockUntil && this.lockUntil < Date.now()) {
//     return await this.updateOne({
//       $set: { loginAttempts: 1 },
//       $unset: { lockUntil: 1 },
//     });
//   }

//   const updates = { $inc: { loginAttempts: 1 } };

//   if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
//     updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
//   }

//   return await this.updateOne(updates);
// };

// userSchema.statics.findByCredentials = async function (loginId, password) {
//   const isEmail = /^\S+@\S+\.\S+$/.test(loginId);
//   const query = isEmail
//     ? { email: loginId.toLowerCase() }
//     : { mobile: loginId };

//   const user = await this.findOne(query)
//     .select("+password +loginAttempts +lockUntil")
//     .populate("role", "roleTitle")
//     .populate("center", "centerName centerCode centerType");

//   if (!user) {
//     throw new Error("Invalid login credentials");
//   }

//   if (user.status === "Disable") {
//     throw new Error("Account is disabled. Please contact administrator.");
//   }

//   if (user.isLocked()) {
//     throw new Error(
//       "Account locked due to too many failed attempts. Try again later."
//     );
//   }

//   const isPasswordCorrect = await user.correctPassword(password, user.password);

//   if (!isPasswordCorrect) {
//     await user.incrementLoginAttempts();
//     throw new Error("Invalid login credentials");
//   }

//   if (user.loginAttempts > 0 || user.lockUntil) {
//     await user.updateOne({
//       $set: { loginAttempts: 0 },
//       $unset: { lockUntil: 1 },
//     });
//   }

//   user.lastLogin = Date.now();
//   await user.save();

//   return user;
// };

// export default mongoose.model("User", userSchema);





import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "Role is required"],
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "Center is required"],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      match: [/^[0-9]{10}$/, "Please provide a valid 10-digit mobile number"],
    },
    status: {
      type: String,
      enum: ["Enable", "Disable"],
      default: "Enable",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema
  .virtual("confirmPassword")
  .get(function () {
    return this._confirmPassword;
  })
  .set(function (value) {
    this._confirmPassword = value;
  });

userSchema.pre("validate", function (next) {
  if (this.isModified("password")) {
    if (this.password !== this._confirmPassword) {
      this.invalidate("confirmPassword", "Passwords do not match");
    }
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }

  return await this.updateOne(updates);
};

userSchema.statics.findByCredentials = async function (identifier, password) {
  // Check if identifier is email
  const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
  // Check if identifier is mobile (10 digits)
  const isMobile = /^[0-9]{10}$/.test(identifier);
  // Check if identifier is username (letters, numbers, underscores)
  const isUsername = /^[a-zA-Z0-9_]+$/.test(identifier);

  let query = {};
  
  if (isEmail) {
    query = { email: identifier.toLowerCase() };
  } else if (isMobile) {
    query = { mobile: identifier };
  } else if (isUsername) {
    query = { username: identifier.toLowerCase() };
  } else {
    throw new Error("Invalid login identifier");
  }

  const user = await this.findOne(query)
    .select("+password +loginAttempts +lockUntil")
    .populate("role", "roleTitle")
    .populate("center", "centerName centerCode centerType");

  if (!user) {
    throw new Error("Invalid login credentials");
  }

  if (user.status === "Disable") {
    throw new Error("Account is disabled. Please contact administrator.");
  }

  if (user.isLocked()) {
    throw new Error(
      "Account locked due to too many failed attempts. Try again later."
    );
  }

  const isPasswordCorrect = await user.correctPassword(password, user.password);

  if (!isPasswordCorrect) {
    await user.incrementLoginAttempts();
    throw new Error("Invalid login credentials");
  }

  if (user.loginAttempts > 0 || user.lockUntil) {
    await user.updateOne({
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 },
    });
  }

  user.lastLogin = Date.now();
  await user.save();

  return user;
};

export default mongoose.model("User", userSchema);