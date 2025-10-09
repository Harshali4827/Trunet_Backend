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
  getShiftingRequestsByCustomer
} from "../controllers/shiftingRequestController.js";
import { validateShiftingRequest } from "../validations/shiftingRequestValidator.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, validateShiftingRequest, createShiftingRequest);
router.get("/", protect, getAllShiftingRequests);
router.get("/:id", protect, getShiftingRequestById);
router.get('/customer/:customerId/requests',protect, getShiftingRequestsByCustomer);
router.put('/:id', protect, updateShiftingRequest);
router.delete('/:id', protect, deleteShiftingRequest);
router.put("/:id/status", protect, updateShiftingRequestStatus);

router.get(
  "/customers/:customerId/history",
  protect,
  getCustomerShiftingHistory
);
router.get(
  "/customers/:customerId/current-center",
  protect,
  getCustomerCurrentCenter
);

export default router;
