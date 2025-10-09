import express from "express";
import {
  createStockPurchase,
  getAllStockPurchases,
  getStockPurchaseById,
  getAllProductsWithStock,
  updateStockPurchase,
  deleteStockPurchase,
  getPurchasesByVendor,
  getAvailableStock,
  getOutletStockSummary,
  getCenterStockSummary,
  getOutletSerialNumbers,
  updateOutletSerialNumber,
  deleteOutletSerialNumber,
} from "../controllers/stockPurchaseController.js";
import { protect } from "../middlewares/authMiddleware.js";

import {
  validateCreateStockPurchase,
  validateUpdateStockPurchase,
  validateIdParam,
  validateVendorIdParam,
  validateCenterIdParam,
  validateStockPurchaseQuery,
  validateProductQuery,
  validateStockAvailabilityParams,
  validateUpdateOutletSerial,
  validateDeleteOutletSerial,
} from "../validations/stockPurchaseValidations.js";

const router = express.Router();

router.post("/", protect, validateCreateStockPurchase, createStockPurchase);

router.get("/", protect, validateStockPurchaseQuery, getAllStockPurchases);

router.get(
  "/products/with-stock",
  protect,
  validateProductQuery,
  getAllProductsWithStock
);

router.get("/:id", protect, validateIdParam, getStockPurchaseById);

router.put("/:id", protect, validateUpdateStockPurchase, updateStockPurchase);

router.delete("/:id", protect, validateIdParam, deleteStockPurchase);

router.get(
  "/vendor/:vendorId",
  protect,
  validateVendorIdParam,
  getPurchasesByVendor
);

router.get(
  "/stock/available/:productId",
  protect,
  validateStockAvailabilityParams,
  getAvailableStock
);

router.get("/stock/outlet-summary", protect, getOutletStockSummary);

router.get(
  "/stock/center-summary/:centerId",
  protect,
  validateCenterIdParam,
  getCenterStockSummary
);

router.get(
  "/serial-numbers/product/:outletId/:productId",
  protect,
  getOutletSerialNumbers
);

router.put(
  "/serial-numbers/product/:productId/serial/:serialNumber",
  protect,
  validateUpdateOutletSerial,
  updateOutletSerialNumber
);

router.delete(
  "/serial-numbers/product/:productId/serial/:serialNumber",
  protect,
  validateDeleteOutletSerial,
  deleteOutletSerialNumber
);

export default router;
