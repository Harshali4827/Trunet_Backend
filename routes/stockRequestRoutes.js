import express from "express";
import {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  approveStockRequest,
  shipStockRequest,
  updateShippingInfo,
  rejectShipment,
  markAsIncomplete,
  completeStockRequest,
  completeIncompleteRequest,
  updateStockRequestStatus,
  getCenterSerialNumbers,
  updateApprovedQuantities,
  getMostRecentOrderNumber,
} from "../controllers/stockRequestController.js";
import { protect } from "../middlewares/authMiddleware.js";

import {
  validateCreateStockRequest,
  validateUpdateStockRequest,
  validateIdParam,
  validateStockRequestQuery,
  validateApproveStockRequest,
  validateShipStockRequest,
  validateCompleteStockRequest,
  validateCompleteIncompleteRequest,
  validateUpdateApprovedQuantities,
  validateRejectShipment,
  validateMarkAsIncomplete,
  validateUpdateShippingInfo,
} from "../validations/stockRequestValidations.js";

const router = express.Router();

router.post("/", protect, validateCreateStockRequest, createStockRequest);

router.get("/", protect, validateStockRequestQuery, getAllStockRequests);

router.get("/recent-order-number", protect, getMostRecentOrderNumber);

router.get("/:id", protect, validateIdParam, getStockRequestById);

router.put("/:id", protect, validateUpdateStockRequest, updateStockRequest);

router.delete("/:id", protect, validateIdParam, deleteStockRequest);

router.post(
  "/:id/approve",
  protect,
  validateApproveStockRequest,
  approveStockRequest
);

router.post("/:id/ship", protect, validateShipStockRequest, shipStockRequest);

router.post(
  "/:id/complete",
  protect,
  validateCompleteStockRequest,
  completeStockRequest
);

router.patch(
  "/:id/complete-incomplete",
  protect,
  validateCompleteIncompleteRequest,
  completeIncompleteRequest
);

router.patch(
  "/:id/shipping-info",
  protect,
  validateUpdateShippingInfo,
  updateShippingInfo
);

router.post(
  "/:id/reject-shipment",
  protect,
  validateRejectShipment,
  rejectShipment
);


router.get(
  "/serial-numbers/product/:productId",
  protect,
  getCenterSerialNumbers
);

router.post(
  "/:id/mark-incomplete",
  protect,
  validateMarkAsIncomplete,
  markAsIncomplete
);

router.patch(
  "/:id/approved-quantities",
  protect,
  validateUpdateApprovedQuantities,
  updateApprovedQuantities
);

router.patch("/:id/status", protect, validateIdParam, updateStockRequestStatus);

export default router;
