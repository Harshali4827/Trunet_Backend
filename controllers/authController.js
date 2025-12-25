import User from "../models/User.js";
import jwt from "jsonwebtoken";
import Center from "../models/Center.js";
import Role from "../models/Roles.js";
import LoginHistory from "../models/LoginHistory.js";

const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',');
    const clientIP = ips[0].trim();
    if (clientIP === '::1') {
      return '127.0.0.1';
    }
    return clientIP;
  }
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    if (realIP === '::1') return '127.0.0.1';
    return realIP;
  }
  const remoteAddr = req.connection.remoteAddress || 
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

  if (remoteAddr) {
    if (remoteAddr === '::1') {
      return '127.0.0.1';
    }
    if (remoteAddr.startsWith('::ffff:')) {
      return remoteAddr.substring(7);
    }
    return remoteAddr;
  }

  return 'Unknown';
};

const getBrowserInfo = (userAgent) => {
  if (!userAgent) return 'Unknown';

  let browser = 'Unknown';
  let version = '';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg') && !userAgent.includes('OPR')) {
    browser = 'Chrome';
    const match = userAgent.match(/Chrome\/([0-9.]+)/);
    version = match ? match[1] : '';
  }
  else if (userAgent.includes('Edg')) {
    browser = 'Edge';
    const match = userAgent.match(/Edg\/([0-9.]+)/);
    version = match ? match[1] : '';
  }
  else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
    const match = userAgent.match(/Firefox\/([0-9.]+)/);
    version = match ? match[1] : '';
  }
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
    const match = userAgent.match(/Version\/([0-9.]+)/);
    version = match ? match[1] : '';
  }
  else if (userAgent.includes('OPR')) {
    browser = 'Opera';
    const match = userAgent.match(/OPR\/([0-9.]+)/);
    version = match ? match[1] : '';
  }
  if (version) {
    const versionParts = version.split('.');
    const majorVersion = versionParts.slice(0, 2).join('.');
    return `${browser} ${majorVersion}`;
  }

  return browser;
};

// const signToken = (payload) => {
//   return jwt.sign(payload, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRES_IN,
//   });
// };

const signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '12h', 
  });
};

const signRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
};

// const createCenterSelectionToken = (user, res) => {
//   const token = signToken({
//     id: user._id,
//     step: 'center_selection'
//   });

//   res.status(200).json({
//     success: true,
//     token,
//     requiresCenterSelection: true,
//     data: {
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         email: user.email,
//         accessibleCenters: user.accessibleCenters,
//       },
//       message: "Please select a center to continue"
//     },
//   });
// };


const createCenterSelectionToken = (user, res) => {
  const token = signToken({
    id: user._id,
    step: 'center_selection'
  });

  // Also create a refresh token
  const refreshToken = signRefreshToken({
    id: user._id
  });

  res.status(200).json({
    success: true,
    token,
    refreshToken, // Add refresh token
    requiresCenterSelection: true,
    data: {
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        accessibleCenters: user.accessibleCenters,
      },
      message: "Please select a center to continue"
    },
  });
};
// const createFinalToken = (user, center, res) => {
//   const token = signToken({
//     id: user._id,
//     centerId: center._id,
//     step: 'complete'
//   });

//   res.status(200).json({
//     success: true,
//     token,
//     data: {
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         email: user.email,
//         mobile: user.mobile,
//         status: user.status,
//         role: user.role,
//         center: center, // Set the selected center to 'center' field for compatibility
//         lastLogin: user.lastLogin,
//         permissions: user.permissions || [],
//       },
//     },
//   });
// };

const createFinalToken = (user, center, res) => {
  const token = signToken({
    id: user._id,
    centerId: center._id,
    step: 'complete'
  });

  const refreshToken = signRefreshToken({
    id: user._id,
    centerId: center._id
  });

  res.status(200).json({
    success: true,
    token,
    refreshToken, // Add refresh token
    data: {
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        role: user.role,
        center: center,
        lastLogin: user.lastLogin,
        permissions: user.permissions || [],
      },
    },
  });
};

// Step 1: Initial login (returns centers list)
export const login = async (req, res) => {
  try {
    console.log("Login request body:", req.body);

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username and password",
      });
    }

    const user = await User.findByCredentials(username, password); 
    const browser = getBrowserInfo(req.headers['user-agent']);
    const ip = getClientIP(req);

    await LoginHistory.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        name: user.fullName,
        email: user.email,
        browser: browser,
        ip: ip,
        date: new Date()
      },
      { upsert: true, new: true }
    );

    user.lastLogin = new Date();
    await user.save();

    // Populate accessible centers
    await user.populate({
      path: "accessibleCenters",
      select: "centerName centerCode centerType addressLine1 city state",
      populate: [
        { path: "reseller", select: "businessName" },
        { path: "area", select: "areaName" }
      ],
    });

    await user.populate({
      path: "role",
      select: "roleTitle permissions",
    });

    // Check if user has only one center - auto-select it
    if (user.accessibleCenters && user.accessibleCenters.length === 1) {
      const selectedCenter = user.accessibleCenters[0];
      
      // Update user's center field for backward compatibility
      user.center = selectedCenter._id;
      await user.save();
      
      // Get full center details
      const centerDetails = await Center.findById(selectedCenter._id)
        .populate([
          { path: "reseller", select: "businessName" },
          { path: "area", select: "areaName" }
        ]);

      user.center = centerDetails;
      
      if (user.role && user.role.permissions) {
        user.permissions = user.role.permissions;
      } else {
        user.permissions = [];
      }
      
      return createFinalToken(user, centerDetails, res);
    }

    // Multiple centers - require selection
    createCenterSelectionToken(user, res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

// export const selectCenter = async (req, res) => {
//   try {
//     const { centerId } = req.body;
//     const userId = req.user.id;

//     if (!centerId) {
//       return res.status(400).json({
//         success: false,
//         message: "Center selection is required",
//       });
//     }

//     // Get user with accessible centers
//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Verify user has access to this center
//     const hasAccess = user.accessibleCenters.some(
//       center => center.toString() === centerId
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "You don't have access to this center",
//       });
//     }

//     // Update user's center field
//     user.center = centerId;
//     await user.save();

//     // Get populated user data for response
//     const populatedUser = await User.findById(userId)
//       .populate({
//         path: "role",
//         select: "roleTitle permissions",
//       })
//       .populate({
//         path: "center",
//         select: "centerName centerCode centerType addressLine1 city state",
//         populate: [
//           { path: "reseller", select: "businessName" },
//           { path: "area", select: "areaName" }
//         ],
//       })
//       .populate({
//         path: "accessibleCenters",
//         select: "centerName centerCode",
//       });

//     const permissions = populatedUser.role?.permissions || [];

//     // Create final token with center info
//     const token = signToken({
//       id: user._id,
//       centerId: centerId,
//       step: 'complete'
//     });

//     res.status(200).json({
//       success: true,
//       token,
//       data: {
//         user: {
//           _id: populatedUser._id,
//           fullName: populatedUser.fullName,
//           username: populatedUser.username,
//           email: populatedUser.email,
//           mobile: populatedUser.mobile,
//           status: populatedUser.status,
//           role: populatedUser.role,
//           center: populatedUser.center,
//           accessibleCenters: populatedUser.accessibleCenters,
//           lastLogin: populatedUser.lastLogin,
//           permissions: permissions,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Center selection error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error selecting center",
//     });
//   }
// };



export const selectCenter = async (req, res) => {
  try {
    const { centerId } = req.body;
    const userId = req.user.id;

    if (!centerId) {
      return res.status(400).json({
        success: false,
        message: "Center selection is required",
      });
    }

    // Get user with accessible centers
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify user has access to this center
    const hasAccess = user.accessibleCenters.some(
      center => center.toString() === centerId
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this center",
      });
    }

    // Update user's center field
    user.center = centerId;
    await user.save();

    // Get populated user data for response
    const populatedUser = await User.findById(userId)
      .populate({
        path: "role",
        select: "roleTitle permissions",
      })
      .populate({
        path: "center",
        select: "centerName centerCode centerType addressLine1 city state",
        populate: [
          { path: "reseller", select: "businessName" },
          { path: "area", select: "areaName" }
        ],
      })
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode",
      });

    const permissions = populatedUser.role?.permissions || [];

    // Create both tokens with center info
    const token = signToken({
      id: user._id,
      centerId: centerId,
      step: 'complete'
    });

    const refreshToken = signRefreshToken({
      id: user._id,
      centerId: centerId
    });

    res.status(200).json({
      success: true,
      token,
      refreshToken, // Add refresh token
      data: {
        user: {
          _id: populatedUser._id,
          fullName: populatedUser.fullName,
          username: populatedUser.username,
          email: populatedUser.email,
          mobile: populatedUser.mobile,
          status: populatedUser.status,
          role: populatedUser.role,
          center: populatedUser.center,
          accessibleCenters: populatedUser.accessibleCenters,
          lastLogin: populatedUser.lastLogin,
          permissions: permissions,
        },
      },
    });
  } catch (error) {
    console.error("Center selection error:", error);
    res.status(500).json({
      success: false,
      message: "Error selecting center",
    });
  }
};

// export const register = async (req, res) => {
//   try {
//     console.log("Registration request body:", req.body);

//     const {
//       role,
//       centers,
//       fullName,
//       username,
//       email,
//       mobile,
//       password,
//       confirmPassword,
//       status,
//     } = req.body;

//     if (!fullName || !username || !email || !password) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Please provide all required fields: fullName, username, email, password",
//       });
//     }

//     if (password !== confirmPassword) {
//       return res.status(400).json({
//         success: false,
//         message: "Passwords do not match",
//       });
//     }

//     // Check if centers array is provided and not empty
//     if (!centers || !Array.isArray(centers) || centers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one center is required",
//       });
//     }

//     // Validate all centers exist
//     const centersExists = await Center.find({ _id: { $in: centers } });
//     if (centersExists.length !== centers.length) {
//       return res.status(404).json({
//         success: false,
//         message: "One or more centers not found",
//       });
//     }

//     if (role) {
//       const roleExists = await Role.findById(role);
//       if (!roleExists) {
//         return res.status(404).json({
//           success: false,
//           message: "Role not found",
//         });
//       }
//     }

//     const existingUser = await User.findOne({
//       $or: [
//         { email: email.toLowerCase() }, 
//         { mobile },
//         { username: username.toLowerCase() }
//       ],
//     });

//     if (existingUser) {
//       let message = "User with this ";
//       if (existingUser.email === email.toLowerCase()) {
//         message += "email";
//       } else if (existingUser.mobile === mobile) {
//         message += "mobile number";
//       } else {
//         message += "username";
//       }
//       message += " already exists";
      
//       return res.status(409).json({
//         success: false,
//         message,
//       });
//     }

//     // Create user without setting center initially
//     const user = new User({
//       role,
//       accessibleCenters: centers,
//       // Don't set center field yet - will be set after login
//       fullName,
//       username: username.toLowerCase(),
//       email: email.toLowerCase(),
//       mobile,
//       password,
//       confirmPassword,
//       status: status || "Enable",
//     });

//     await user.save();

//     await user.populate("role", "roleTitle");
//     // No need to populate center on registration

//     // For registration, if only one center, set it immediately
//     if (centers.length === 1) {
//       user.center = centers[0];
//       await user.save();
//       await user.populate("center", "centerName centerCode centerType");
//     }

//     // Create token based on number of centers
//     if (centers.length === 1) {
//       const selectedCenter = await Center.findById(centers[0])
//         .populate([
//           { path: "reseller", select: "businessName" },
//           { path: "area", select: "areaName" }
//         ]);

//       createFinalToken(user, selectedCenter, res);
//     } else {
//       await user.populate({
//         path: "accessibleCenters",
//         select: "centerName centerCode centerType",
//       });
//       createCenterSelectionToken(user, res);
//     }
//   } catch (error) {
//     console.error("Registration error:", error);

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.code === 11000) {
//       return res.status(409).json({
//         success: false,
//         message: "User with this email, mobile or username already exists",
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };



export const register = async (req, res) => {
  try {
    console.log("Registration request body:", req.body);

    const {
      role,
      centers,
      fullName,
      username,
      email,
      mobile,
      password,
      confirmPassword,
      status,
    } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: fullName, username, email, password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Check if centers array is provided and not empty
    if (!centers || !Array.isArray(centers) || centers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one center is required",
      });
    }

    // Validate all centers exist
    const centersExists = await Center.find({ _id: { $in: centers } });
    if (centersExists.length !== centers.length) {
      return res.status(404).json({
        success: false,
        message: "One or more centers not found",
      });
    }

    if (role) {
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }
    }

    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() }, 
        { mobile },
        { username: username.toLowerCase() }
      ],
    });

    if (existingUser) {
      let message = "User with this ";
      if (existingUser.email === email.toLowerCase()) {
        message += "email";
      } else if (existingUser.mobile === mobile) {
        message += "mobile number";
      } else {
        message += "username";
      }
      message += " already exists";
      
      return res.status(409).json({
        success: false,
        message,
      });
    }

    // Create user without setting center initially
    const user = new User({
      role,
      accessibleCenters: centers,
      // Don't set center field yet - will be set after login
      fullName,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      mobile,
      password,
      confirmPassword,
      status: status || "Enable",
    });

    await user.save();

    await user.populate("role", "roleTitle");
    // No need to populate center on registration

    // For registration, if only one center, set it immediately
    if (centers.length === 1) {
      user.center = centers[0];
      await user.save();
      await user.populate("center", "centerName centerCode centerType");
    }

    // Create token based on number of centers
    if (centers.length === 1) {
      const selectedCenter = await Center.findById(centers[0])
        .populate([
          { path: "reseller", select: "businessName" },
          { path: "area", select: "areaName" }
        ]);

      createFinalToken(user, selectedCenter, res);
    } else {
      await user.populate({
        path: "accessibleCenters",
        select: "centerName centerCode centerType",
      });
      createCenterSelectionToken(user, res);
    }
  } catch (error) {
    console.error("Registration error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User with this email, mobile or username already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getMe = async (req, res) => {
  try {
    // Get user with selected center populated
    const user = await User.findById(req.user.id)
      .populate({
        path: "role",
        select: "roleTitle permissions",
      })
      .populate({
        path: "center", // Still using 'center' field for compatibility
        select: "centerName centerCode centerType addressLine1 city state",
        populate: [
          { path: "reseller", select:"businessName"},
          { path: "area", select: "areaName" }
        ],
      })
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode centerType",
      });

    const permissions =
      user.role && user.role.permissions ? user.role.permissions : [];

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center, // For backward compatibility
          accessibleCenters: user.accessibleCenters,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          permissions: permissions,
        },
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// export const switchCenter = async (req, res) => {
//   try {
//     const { centerId } = req.body;
//     const userId = req.user.id;

//     if (!centerId) {
//       return res.status(400).json({
//         success: false,
//         message: "Center ID is required",
//       });
//     }

//     // Get user with accessible centers
//     const user = await User.findById(userId)
//       .populate({
//         path: "accessibleCenters",
//         select: "_id centerName centerCode",
//       })
//       .populate({
//         path: "role",
//         select: "roleTitle permissions",
//       });

//     // Verify user has access to this center
//     const hasAccess = user.accessibleCenters.some(
//       center => center._id.toString() === centerId
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "You don't have access to this center",
//       });
//     }

//     // Update user's center field
//     user.center = centerId;
//     await user.save();

//     // Get full center details
//     const selectedCenter = await Center.findById(centerId)
//       .populate([
//         { path: "reseller", select: "businessName" },
//         { path: "area", select: "areaName" }
//       ]);

//     if (user.role && user.role.permissions) {
//       user.permissions = user.role.permissions;
//     } else {
//       user.permissions = [];
//     }

//     // Create new token with new center
//     const token = signToken({
//       id: user._id,
//       centerId: centerId,
//       step: 'complete'
//     });

//     res.status(200).json({
//       success: true,
//       token,
//       data: {
//         user: {
//           _id: user._id,
//           fullName: user.fullName,
//           username: user.username,
//           email: user.email,
//           mobile: user.mobile,
//           status: user.status,
//           role: user.role,
//           center: selectedCenter, // Set the selected center
//           lastLogin: user.lastLogin,
//           permissions: user.permissions,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Switch center error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error switching center",
//     });
//   }
// };



export const switchCenter = async (req, res) => {
  try {
    const { centerId } = req.body;
    const userId = req.user.id;

    if (!centerId) {
      return res.status(400).json({
        success: false,
        message: "Center ID is required",
      });
    }

    // Get user with accessible centers
    const user = await User.findById(userId)
      .populate({
        path: "accessibleCenters",
        select: "_id centerName centerCode",
      })
      .populate({
        path: "role",
        select: "roleTitle permissions",
      });

    // Verify user has access to this center
    const hasAccess = user.accessibleCenters.some(
      center => center._id.toString() === centerId
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this center",
      });
    }

    // Update user's center field
    user.center = centerId;
    await user.save();

    // Get full center details
    const selectedCenter = await Center.findById(centerId)
      .populate([
        { path: "reseller", select: "businessName" },
        { path: "area", select: "areaName" }
      ]);

    if (user.role && user.role.permissions) {
      user.permissions = user.role.permissions;
    } else {
      user.permissions = [];
    }

    // Create new tokens with new center
    const token = signToken({
      id: user._id,
      centerId: centerId,
      step: 'complete'
    });

    const refreshToken = signRefreshToken({
      id: user._id,
      centerId: centerId
    });

    res.status(200).json({
      success: true,
      token,
      refreshToken, // Return new refresh token
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: selectedCenter,
          lastLogin: user.lastLogin,
          permissions: user.permissions,
        },
      },
    });
  } catch (error) {
    console.error("Switch center error:", error);
    res.status(500).json({
      success: false,
      message: "Error switching center",
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!(await user.correctPassword(currentPassword, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    user.confirmPassword = confirmNewPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
    
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      status,
      role,
      center,
      dateFrom,
      dateTo,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (role && role !== "all") {
      filter.role = role;
    }

    if (center && center !== "all") {
      filter.center = center;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo);
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const users = await User.find(filter)
      .populate("role", "roleTitle")
      .populate({
        path: "center",
        select: "centerName centerCode centerType addressLine1 city state",
        populate: [
          { path: "reseller", select: "businessName" }
        ],
      })
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode",
      })
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limitNum);

    const formattedUsers = users.map((user) => ({
      _id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      role: user.role,
      center: user.center,
      accessibleCenters: user.accessibleCenters,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalUsers,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          nextPage: pageNum < totalPages ? pageNum + 1 : null,
          prevPage: pageNum > 1 ? pageNum - 1 : null,
        },
        filters: {
          search: search || "",
          status: status || "all",
          role: role || "all",
          center: center || "all",
          dateFrom: dateFrom || "",
          dateTo: dateTo || "",
        },
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate("role", "roleTitle")
      .populate({
        path: "center",
        select: "centerName centerCode centerType addressLine1 city state",
        populate: [
          { path: "reseller", select: "businessName" },
          { path: "area", select: "areaName" },
        ],
      })
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode",
      })
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
          accessibleCenters: user.accessibleCenters,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      username,
      email,
      mobile,
      status,
      role,
      centers,
      password,
      confirmPassword,
    } = req.body;
    
    const user = await User.findById(id).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check for unique fields
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id },
      });
      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: "Email already in use by another user",
        });
      }
    }

    if (mobile && mobile !== user.mobile) {
      const mobileExists = await User.findOne({ mobile, _id: { $ne: id } });
      if (mobileExists) {
        return res.status(409).json({
          success: false,
          message: "Mobile number already in use by another user",
        });
      }
    }

    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
      const usernameExists = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: id },
      });
      if (usernameExists) {
        return res.status(409).json({
          success: false,
          message: "Username already in use by another user",
        });
      }
    }

    if (centers) {
      if (!Array.isArray(centers) || centers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one center is required",
        });
      }
      
      const centersExists = await Center.find({ _id: { $in: centers } });
      if (centersExists.length !== centers.length) {
        return res.status(404).json({
          success: false,
          message: "One or more centers not found",
        });
      }
      
      user.accessibleCenters = centers;
      
      // If current center is not in new centers, set to first center
      if (!centers.includes(user.center?.toString())) {
        user.center = centers[0];
      }
    }

    if (role) {
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }
    }

    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "Passwords do not match",
        });
      }

      user.password = password;
      user.confirmPassword = confirmPassword;
    }

    if (fullName) user.fullName = fullName;
    if (username) user.username = username.toLowerCase();
    if (email) user.email = email.toLowerCase();
    if (mobile) user.mobile = mobile;
    if (status) user.status = status;
    if (role) user.role = role;

    await user.save();
    await user.populate("role", "roleTitle");
    await user.populate({
      path: "center",
      select: "centerName centerCode centerType addressLine1 city state",
      populate: [
        { path: "reseller", select: "businessName" },
        { path: "area", select: "areaName" },
      ],
    });
    await user.populate({
      path: "accessibleCenters",
      select: "centerName centerCode",
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
          accessibleCenters: user.accessibleCenters,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId } = req.query;
    
    const filter = {};
    if (userId) {
      filter.user = userId;
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const loginHistory = await LoginHistory.find(filter)
      .populate("user", "fullName username email mobile status")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalRecords = await LoginHistory.countDocuments(filter);

    const formattedHistory = loginHistory.map(record => ({
      _id: record._id,
      user: record.user ? {
        _id: record.user._id,
        fullName: record.user.fullName,
        username: record.user.username,
        email: record.user.email,
        mobile: record.user.mobile,
        status: record.user.status
      } : {
        fullName: record.name,
        email: record.email
      },
      browser: record.browser,
      ip: record.ip,
      date: record.date
    }));

    res.status(200).json({
      success: true,
      data: {
        loginHistory: formattedHistory,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalRecords / limitNum),
          totalRecords: totalRecords,
          hasNextPage: pageNum < Math.ceil(totalRecords / limitNum),
          hasPrevPage: pageNum > 1,
        }
      },
    });
  } catch (error) {
    console.error("Get login history error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching login history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user && req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    await LoginHistory.deleteMany({ user: id });
    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: {
        deletedUser: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.headers.authorization?.split(' ')[1];
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Get user
    const user = await User.findById(decoded.id)
      .populate({
        path: "center",
        select: "centerName centerCode",
      });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Create new access token
    const token = signToken({
      id: user._id,
      centerId: decoded.centerId || user.center?._id,
      step: 'complete'
    });
    
    // Optional: Create new refresh token (rotate refresh tokens)
    const newRefreshToken = signRefreshToken({
      id: user._id,
      centerId: decoded.centerId || user.center?._id
    });
    
    res.status(200).json({
      success: true,
      token,
      refreshToken: newRefreshToken // Return new refresh token
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};