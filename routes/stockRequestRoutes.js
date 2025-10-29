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
  getStockRequestCount,
  getStockRequestNotifications,
} from "../controllers/stockRequestController.js";
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
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const MODULE = "Indent";

router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateCreateStockRequest,
  createStockRequest
);

router.get(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  validateStockRequestQuery,
  getAllStockRequests
);
router.get("/indent-count",
  protect,
  getStockRequestCount
)

router.get(
  "/recent-order-number",
  protect,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  getMostRecentOrderNumber
);

router.get(
  "/notification",
  protect,
  getStockRequestNotifications
)

router.get(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  validateIdParam,
  getStockRequestById
);

router.put(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
     "manage_indent"
  ),
  validateUpdateStockRequest,
  updateStockRequest
);

router.delete(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "delete_indent_own_center",
    "delete_indent_all_center"
  ),
  validateIdParam,
  deleteStockRequest
);

router.post(
  "/:id/approve",
  protect,
  authorizeAccess(
    MODULE,
    "stock_transfer_approve_from_outlet",
    "manage_indent"
  ),
  validateApproveStockRequest,
  approveStockRequest
);

router.post(
  "/:id/ship",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateShipStockRequest,
  shipStockRequest
);

router.post(
  "/:id/complete",
  protect,
  authorizeAccess(
    MODULE,
    "complete_indent",
    "manage_indent"
  ),
  validateCompleteStockRequest,
  completeStockRequest
);

router.patch(
  "/:id/complete-incomplete",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateCompleteIncompleteRequest,
  completeIncompleteRequest
);

router.patch(
  "/:id/shipping-info",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateUpdateShippingInfo,
  updateShippingInfo
);

router.post(
  "/:id/reject-shipment",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateRejectShipment,
  rejectShipment
);

router.get(
  "/serial-numbers/product/:productId",
  protect,
  authorizeAccess(
    MODULE,
   "indent_all_center",
    "indent_own_center"
  ),
  getCenterSerialNumbers
);

router.post(
  "/:id/mark-incomplete",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateMarkAsIncomplete,
  markAsIncomplete
);

router.patch(
  "/:id/approved-quantities",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateUpdateApprovedQuantities,
  updateApprovedQuantities
);

router.patch(
  "/:id/status",
  protect,
  authorizeAccess(
    MODULE,
    "manage_indent"
  ),
  validateIdParam,
  updateStockRequestStatus
);

export default router;
