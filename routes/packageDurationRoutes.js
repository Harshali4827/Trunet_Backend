import express from "express";
import {
  createPackageDuration,
  getPackageDurations,
  getPackageDurationById,
  updatePackageDuration,
  deletePackageDuration,
} from "../controllers/packageDurationController.js";
import {
  validateCreatePackageDuration,
  validatePackageDurationId,
  validateUpdatePackageDuration,
} from "../validations/packageDurationValidation.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, validateCreatePackageDuration, createPackageDuration);
router.get("/", protect, getPackageDurations);
router.get("/:id", protect, validatePackageDurationId, getPackageDurationById);
router.put(
  "/:id",
  protect,
  validatePackageDurationId,
  validateUpdatePackageDuration,
  updatePackageDuration
);
router.delete(
  "/:id",
  protect,
  validatePackageDurationId,
  deletePackageDuration
);

export default router;
