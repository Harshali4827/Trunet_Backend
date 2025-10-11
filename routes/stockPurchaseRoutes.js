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
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

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

const MODULE = "Purchase";

router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "add_purchase_stock"
  ),
  validateCreateStockPurchase,
  createStockPurchase
);

router.get(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateStockPurchaseQuery,
  getAllStockPurchases
);

router.get(
  "/products/with-stock",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateProductQuery,
  getAllProductsWithStock
);

router.get(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateIdParam,
  getStockPurchaseById
);

router.put(
  "/:id",
  protect,
  validateUpdateStockPurchase,
  updateStockPurchase
);

router.delete(
  "/:id",
  protect,
  validateIdParam,
  deleteStockPurchase
);

router.get(
  "/vendor/:vendorId",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateVendorIdParam,
  getPurchasesByVendor
);

router.get(
  "/stock/available/:productId",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateStockAvailabilityParams,
  getAvailableStock
);

router.get(
  "/stock/outlet-summary",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  getOutletStockSummary
);

router.get(
  "/stock/center-summary/:centerId",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  validateCenterIdParam,
  getCenterStockSummary
);

router.get(
  "/serial-numbers/product/:outletId/:productId",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
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
