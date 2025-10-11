import express from "express";
import {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
} from "../controllers/vendorController.js";
import {
  createVendorValidator,
  updateVendorValidator,
} from "../validations/vendorValidator.js";
import upload from "../config/multer.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Settings";
router.post(
  "/",
  protect,
  authorizeAccess(MODULE, "manage_vendors"),
  upload.single("logo"),
  createVendorValidator,
  createVendor
);
router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "manage_vendors"),
  getAllVendors
);
router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_vendors"),
  getVendorById
);
router.put(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_vendors"),
  upload.single("logo"),
  updateVendorValidator,
  updateVendor
);
router.delete(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_vendors"),
  deleteVendor
);

export default router;
