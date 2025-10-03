import express from "express";
import {
  createStockTransfer,
  getAllStockTransfers,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  submitStockTransfer,
  approveStockTransferByAdmin,
  rejectStockTransferByAdmin,
  confirmStockTransfer,
  shipStockTransfer,
  completeStockTransfer,
  markStockTransferAsIncomplete,
  rejectStockTransfer,
  getPendingAdminApprovalTransfers,
  getTransferStats,
  updateShippingInfo,
  rejectShipping,
  getMostRecentTransferNumber,
  updateApprovedQuantities,
} from "../controllers/stockTransferController.js";
import {
  validateCreateStockTransfer,
  validateUpdateStockTransfer,
  validateIdParam,
  validateAdminApproval,
  validateAdminRejection,
  validateShipping,
  validateUpdateShippingInfo,
  validateCompletion,
  validateConfirmation,
  validateIncompleteTransfer,
  validateRejectShipment,
  validateRejectTransfer,
  validateQueryParams,
  validateUpdateApprovedQuantities,
} from "../validations/stockTransferValidations.js";
import upload from "../config/multer.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, validateCreateStockTransfer, createStockTransfer)
  .get(protect, validateQueryParams, getAllStockTransfers);

router
  .route("/latest-transfer-number")
  .get(protect, getMostRecentTransferNumber);

router.route("/stats").get(protect, getTransferStats);

router
  .route("/:id")
  .get(protect, validateIdParam, getStockTransferById)
  .put(
    protect,
    validateIdParam,
    validateUpdateStockTransfer,
    updateStockTransfer
  )
  .delete(protect, validateIdParam, deleteStockTransfer);

router.post("/:id/submit", protect, validateIdParam, submitStockTransfer);

router.post(
  "/:id/approve",
  protect,
  validateIdParam,
  validateConfirmation,
  confirmStockTransfer
);

router.post(
  "/:id/reject",
  protect,
  validateIdParam,
  validateRejectTransfer,
  rejectStockTransfer
);

router.patch(
  "/:id/admin/approve",
  protect,
  validateIdParam,
  validateAdminApproval,
  approveStockTransferByAdmin
);

router.patch(
  "/:id/admin/reject",
  protect,
  validateIdParam,
  validateAdminRejection,
  rejectStockTransferByAdmin
);

router.post(
  "/:id/ship",
  protect,
  validateIdParam,
  validateShipping,
  shipStockTransfer
);

router.patch(
  "/:id/shipping-info",
  protect,
  validateIdParam,
  validateUpdateShippingInfo,
  updateShippingInfo
);

router.patch(
  "/:id/reject-shipping",
  protect,
  validateIdParam,
  validateRejectShipment,
  rejectShipping
);

router.post(
  "/:id/complete",
  protect,
  validateIdParam,
  validateCompletion,
  completeStockTransfer
);

router.post(
  "/:id/mark-incomplete",
  protect,
  validateIdParam,
  validateIncompleteTransfer,
  markStockTransferAsIncomplete
);

router.patch(
  "/:id/approved-quantities",
  protect,
  validateIdParam,
  validateUpdateApprovedQuantities,
  updateApprovedQuantities
);

router.get(
  "/admin/pending-approval",
  protect,
  getPendingAdminApprovalTransfers
);

export default router;
