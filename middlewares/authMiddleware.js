import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "You are not logged in. Please log in to get access.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await User.findById(decoded.id)
      .populate("role", "roleTitle")
      .populate("center", "centerName centerCode");

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: "The user belonging to this token no longer exists.",
      });
    }

    if (currentUser.status === "Disable") {
      return res.status(401).json({
        success: false,
        message:
          "Your account has been disabled. Please contact administrator.",
      });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please log in again.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Your token has expired. Please log in again.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role.roleTitle)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};
export const authorizeAccess = (module, ...actions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userPermissions = req.user.role?.permissions || [];

    const modulePermissions = userPermissions.find(
      (perm) => perm.module.toLowerCase() === module.toLowerCase()
    );

    if (!modulePermissions) {
      return res.status(403).json({
        success: false,
        message: `Access denied. No permissions for ${module} module.`,
      });
    }
    const hasPermission = actions.some((action) =>
      modulePermissions.permissions.includes(action)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required one of: ${actions.join(
          ", "
        )} for ${module} module.`,
      });
    }

    next();
  };
};
