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
  completeIncompleteStockTransfer,
  updateApprovedQuantities,
  getWarehouseProductSummary,
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
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Transfer";

router
  .route("/")
  .post(
    protect,
    authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
    validateCreateStockTransfer,
    createStockTransfer
  )
  .get(
    protect,
    authorizeAccess(MODULE, "stock_transfer_own_center", "stock_transfer_all_center"),
    validateQueryParams,
    getAllStockTransfers
  );

router
  .route("/latest-transfer-number")
  .get(
    protect,
    authorizeAccess(MODULE, "stock_transfer_own_center", "stock_transfer_all_center"),
    getMostRecentTransferNumber
  );

router.get(
  "/summary/original-outlet",
  protect,
  authorizeAccess(MODULE, "stock_transfer_own_center", "stock_transfer_all_center"),
  getWarehouseProductSummary
);

router
  .route("/stats")
  .get(
    protect,
    authorizeAccess(MODULE, "stock_transfer_own_center", "stock_transfer_all_center"),
    getTransferStats
  );

router
  .route("/:id")
  .get(
    protect,
    authorizeAccess(MODULE, "stock_transfer_own_center", "stock_transfer_all_center"),
    validateIdParam,
    getStockTransferById
  )
  .put(
    protect,
    authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
    validateIdParam,
    validateUpdateStockTransfer,
    updateStockTransfer
  )
  .delete(
    protect,
    authorizeAccess(MODULE, "delete_transfer_own_center", "delete_transfer_all_center"),
    validateIdParam,
    deleteStockTransfer
  );

router.post(
  "/:id/submit",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  submitStockTransfer
);

router.post(
  "/:id/approve",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center", "approval_transfer_center"),
  validateIdParam,
  validateConfirmation,
  confirmStockTransfer
);

router.post(
  "/:id/reject",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateRejectTransfer,
  rejectStockTransfer
);

router.patch(
  "/:id/admin/approve",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateAdminApproval,
  approveStockTransferByAdmin
);

router.patch(
  "/:id/admin/reject",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateAdminRejection,
  rejectStockTransferByAdmin
);

router.post(
  "/:id/ship",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateShipping,
  shipStockTransfer
);

router.patch(
  "/:id/shipping-info",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateUpdateShippingInfo,
  updateShippingInfo
);

router.patch(
  "/:id/reject-shipment",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateRejectShipment,
  rejectShipping
);

router.post(
  "/:id/complete",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateCompletion,
  completeStockTransfer
);

router.post(
  "/:id/mark-incomplete",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateIncompleteTransfer,
  markStockTransferAsIncomplete
);

router.patch(
  "/:id/complete-incomplete",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  completeIncompleteStockTransfer
);

router.patch(
  "/:id/approved-quantities",
  protect,
  authorizeAccess(MODULE, "manage_stock_transfer_own_center", "manage_stock_transfer_all_center"),
  validateIdParam,
  validateUpdateApprovedQuantities,
  updateApprovedQuantities
);

router.get(
  "/admin/pending-approval",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  getPendingAdminApprovalTransfers
);

export default router;
