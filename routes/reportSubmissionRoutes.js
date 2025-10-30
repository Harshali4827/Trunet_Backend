import express from "express";
import {
  createStockClosing,
  getAllStockClosings,
  getStockClosingById,
  updateStockClosing,
  deleteStockClosing,
  updateStockClosingStatus,
} from "../controllers/reportSubmissionController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const MODULE = "Closing";

router.post(
  "/",
  protect,
  authorizeAccess(MODULE, "manage_closing_stock_own_center", "manage_closing_stock_all_center"),
  createStockClosing
);

router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "view_closing_stock_own_center", "view_closing_stock_all_center"),
  getAllStockClosings
);

router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE, "view_closing_stock_own_center", "view_closing_stock_all_center"),
  getStockClosingById
);

router.put(
  "/:id",
  protect,
  authorizeAccess(MODULE, "change_closing_qty"),
  updateStockClosing
);

router.patch(
  "/:id/status",
  protect,
  updateStockClosingStatus
)

router.delete(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_closing_stock_own_center", "manage_closing_stock_all_center"),
  deleteStockClosing
);

export default router;
