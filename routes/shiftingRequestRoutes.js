import express from "express";
import {
  createShiftingRequest,
  getAllShiftingRequests,
  updateShiftingRequestStatus,
  getShiftingRequestById,
  getCustomerShiftingHistory,
  getCustomerCurrentCenter,
  deleteShiftingRequest,
  updateShiftingRequest,
  getShiftingRequestsByCustomer,
} from "../controllers/shiftingRequestController.js";
import { validateShiftingRequest } from "../validations/shiftingRequestValidator.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const MODULE = "Shifting";

authorizeAccess(MODULE, "view_own_purchase_stock", "view_all_purchase_stock"),
  router.post(
    "/",
    protect,
    authorizeAccess(
      MODULE,
      "manage_shifting_own_center", "manage_shifting_all_center"
    ),
    validateShiftingRequest,
    createShiftingRequest
  );
router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "view_shifting_own_center", "view_shifting_all_center"),
  getAllShiftingRequests
);
router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE, "view_shifting_own_center", "view_shifting_all_center"),
  getShiftingRequestById
);
router.get(
  "/customer/:customerId/requests",
  protect,
  authorizeAccess(MODULE, "view_shifting_own_center", "view_shifting_all_center"),
  getShiftingRequestsByCustomer
);
router.put(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_shifting_own_center", "manage_shifting_all_center"),
  updateShiftingRequest
);
router.delete(
  "/:id",
  protect,
  authorizeAccess(MODULE, "view_own_purchase_stock", "view_all_purchase_stock"),
  deleteShiftingRequest
);
router.put(
  "/:id/status",
  protect,
  authorizeAccess(MODULE, "accept_shifting_all_center", "accept_shifting_own_center"),
  updateShiftingRequestStatus
);

router.get(
  "/customers/:customerId/history",
  protect,
  authorizeAccess(MODULE, "view_shifting_own_center", "view_shifting_all_center"),
  getCustomerShiftingHistory
);
router.get(
  "/customers/:customerId/current-center",
  protect,
  authorizeAccess(MODULE, "view_shifting_own_center", "view_shifting_all_center"),
  getCustomerCurrentCenter
);

export default router;
