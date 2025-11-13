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

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    token,
    data: {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        role: user.role,
        center: user.center,
        lastLogin: user.lastLogin,
        permissions: user.permissions || [],
      },
    },
  });
};

export const login = async (req, res) => {
  try {
    console.log("Login request body:", req.body);

    const { loginId, email, password } = req.body;
    const identifier = loginId || email;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide login ID (email/mobile) and password",
      });
    }

    const user = await User.findByCredentials(identifier, password);
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
    )
    user.lastLogin = new Date();
    await user.save();

    await user.populate("center", "centerName centerCode centerType");
    await user.populate({
      path: "role",
      select: "roleTitle permissions",
    });
    if (user.role && user.role.permissions) {
      user.permissions = user.role.permissions;
    } else {
      user.permissions = [];
    }

    createSendToken(user, 200, res);
  } catch (error) {
    console.error("Login error:", error);

    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

export const register = async (req, res) => {
  try {
    console.log("Registration request body:", req.body);

    const {
      role,
      center,
      fullName,
      email,
      mobile,
      password,
      confirmPassword,
      status,
    } = req.body;

    if (!fullName || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: fullName, email, mobile, password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (center) {
      const centerExists = await Center.findById(center);
      if (!centerExists) {
        return res.status(404).json({
          success: false,
          message: "Center not found",
        });
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

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { mobile }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email or mobile already exists",
      });
    }

    const user = new User({
      role,
      center,
      fullName,
      email: email.toLowerCase(),
      mobile,
      password,
      confirmPassword,
      status: status || "Enable",
    });

    await user.save();

    await user.populate("role", "roleTitle");
    await user.populate("center", "centerName centerCode centerType");

    createSendToken(user, 201, res);
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
        message: "User with this email or mobile already exists",
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
    const user = await User.findById(req.user.id)
      .populate({
        path: "role",
        select: "roleTitle permissions",
      })
      .populate({
        path: "center",
        select: "centerName centerCode centerType addressLine1 city state",
        populate: [
          { path: "reseller", select:"businessName"},
          { path: "area", select: "areaName" }
        ],
      });

    const permissions =
      user.role && user.role.permissions ? user.role.permissions : [];

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
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
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      role: user.role,
      center: user.center,
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
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
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
      email,
      mobile,
      status,
      role,
      center,
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
    if (center) {
      const centerExists = await Center.findById(center);
      if (!centerExists) {
        return res.status(404).json({
          success: false,
          message: "Center not found",
        });
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
    if (email) user.email = email.toLowerCase();
    if (mobile) user.mobile = mobile;
    if (status) user.status = status;
    if (role) user.role = role;
    if (center) user.center = center;

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

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
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
    const filter = {};
  
    if (req.user) {
      filter.user = req.user.id;
    }
    const loginHistory = await LoginHistory.find(filter)
      .populate("user", "fullName email mobile status")
      .sort({ date: -1 })
      .lean();

    const formattedHistory = loginHistory.map(record => ({
      name: record.name,
      email: record.email,
      browser: record.browser,
      ip: record.ip,
      date: record.date
    }));

    res.status(200).json({
      success: true,
      data: {
        loginHistory: formattedHistory
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
