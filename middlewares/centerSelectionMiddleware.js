import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const verifyCenterSelectToken = async (req, res, next) => {
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
        message: "Token required for center selection",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if this is a center selection token
    if (!decoded.step || decoded.step !== 'center_selection') {
      return res.status(401).json({
        success: false,
        message: "Invalid token type. Please login again.",
      });
    }

    // Get user without password
    const user = await User.findById(decoded.id)
      .select("-password")
      .populate({
        path: "accessibleCenters",
        select: "centerName centerCode",
      });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      step: decoded.step,
      userData: user
    };

    next();
  } catch (error) {
    console.error("Center select middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login again.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};