import express from "express";
import {
  getCenterAllStock,
  getAllAvailableProductsWithStock,
  getStockUsageByCenter
} from "../controllers/availableReportController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";
import { getResellerAvailableStock } from "../controllers/resellerStockController.js";

const router = express.Router();
const MODULE = "Available Stock";

router.get(
  "/centerstock",
  protect,
  authorizeAccess(MODULE, "available_stock_own_center", "available_stock_all_center"),
  getCenterAllStock
);

router.get(
  "/availablestock",
  protect,
  authorizeAccess(MODULE, "available_stock_own_center", "available_stock_all_center"),
  getAllAvailableProductsWithStock
);

router.get(
  "/transactions",
  protect,
  authorizeAccess(MODULE, "available_stock_own_center", "available_stock_all_center"),
  getStockUsageByCenter
);

router.get(
  "/reseller",
  protect,
  authorizeAccess(MODULE, "available_stock_own_center", "available_stock_all_center"),
  // getResellerProductsWithStock
  getResellerAvailableStock
);

export default router;