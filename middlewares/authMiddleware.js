import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Center from "../models/Center.js";

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

    // Check if center selection is completed
    if (decoded.step === 'center_selection') {
      return res.status(403).json({
        success: false,
        message: "Please select a center first",
        requiresCenterSelection: true
      });
    }

    // Check if token has centerId (it should for complete tokens)
    if (!decoded.centerId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Center information missing.",
      });
    }

    // Get user with populated data
    const currentUser = await User.findById(decoded.id)
      .populate({
        path: "role",
        select: "roleTitle permissions",
      })
      .populate({
        path: "center",
        select: "centerName centerCode centerType",
      })
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode",
      });

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

    // Check if user has access to the center in token
    const hasAccessToCenter = currentUser.accessibleCenters?.some(
      center => center._id.toString() === decoded.centerId
    );

    if (!hasAccessToCenter) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this center anymore.",
      });
    }

    // Instead of strict match, update user's center field if it doesn't match
    if (currentUser.center?._id?.toString() !== decoded.centerId) {
      // Update user's center field to match the token
      currentUser.center = decoded.centerId;
      await currentUser.save();
      
      // Repopulate center after update
      await currentUser.populate({
        path: "center",
        select: "centerName centerCode centerType",
      });
    }

    req.user = currentUser;
    req.selectedCenterId = decoded.centerId;
    
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
// Keep other middleware functions as they are...
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

export const authorize = (requiredPermissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }
    if (requiredPermissions.length === 0) {
      return next();
    }
    const userPermissions = req.user.role?.permissions || [];

    const hasPermission = requiredPermissions.some((requiredPerm) => {
      return userPermissions.some((modulePerm) => {
        return modulePerm.permissions.includes(requiredPerm);
      });
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
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