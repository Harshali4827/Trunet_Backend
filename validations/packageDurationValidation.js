import { body, param, validationResult } from "express-validator";
import mongoose from "mongoose";
import PackageDuration from "../models/PackageDuration.js";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

export const validatePackageDurationId = [
  param("id").custom((value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error("Invalid package duration ID");
    }
    return true;
  }),
  validate,
];

export const validateCreatePackageDuration = [
  body("packageDuration")
    .isString()
    .withMessage("Package duration must be a string")
    .trim()
    .notEmpty()
    .withMessage("Package duration is required")
    .custom(async (value) => {
      const existingDuration = await PackageDuration.findOne({
        packageDuration: { $regex: new RegExp(`^${value}$`, "i") },
      });

      if (existingDuration) {
        throw new Error("Package duration already exists");
      }
      return true;
    }),
  validate,
];

export const validateUpdatePackageDuration = [
  param("id").custom((value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error("Invalid package duration ID");
    }
    return true;
  }),
  body("packageDuration")
    .optional()
    .isString()
    .withMessage("Package duration must be a string")
    .trim()
    .notEmpty()
    .withMessage("Package duration cannot be empty")
    .custom(async (value, { req }) => {
      const existingDuration = await PackageDuration.findOne({
        packageDuration: { $regex: new RegExp(`^${value}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingDuration) {
        throw new Error("Package duration already exists");
      }
      return true;
    }),
  validate,
];

export const validateBulkPackageDurations = [
  body("packageDurations")
    .isArray()
    .withMessage("Package durations must be an array")
    .notEmpty()
    .withMessage("Package durations array cannot be empty"),
  body("packageDurations.*")
    .isString()
    .withMessage("Each package duration must be a string")
    .trim()
    .notEmpty()
    .withMessage("Package duration cannot be empty")
    .custom(async (value) => {
      const existingDuration = await PackageDuration.findOne({
        packageDuration: { $regex: new RegExp(`^${value}$`, "i") },
      });

      if (existingDuration) {
        throw new Error(`Package duration "${value}" already exists`);
      }
      return true;
    }),
  validate,
];
