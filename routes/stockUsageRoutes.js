import express from "express";
import {
  createStockUsage,
  getAllStockUsage,
  getStockUsageById,
  updateStockUsage,
  deleteStockUsage,
  cancelStockUsage,
  approveDamageRequest,
rejectDamageRequest,
getPendingDamageRequests,
getDamageRequestsByStatus,
getStockUsageByCustomer,
getStockUsageByBuilding,
getStockUsageByControlRoom,
getProductDevicesByCustomer,
getProductDevicesByBuilding,
getProductDevicesByControlRoom
} from "../controllers/stockUsageController.js";

import {
  validateCreateStockUsage,
  validateUpdateStockUsage,
  validateGetAllStockUsage,
  validateIdParam,
} from "../validations/stockUsageValidations.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();


router.post("/", protect, createStockUsage);
router.get("/", protect, getAllStockUsage);
router.get("/:id", protect, getStockUsageById);
router.put("/:id", protect, updateStockUsage);
router.delete("/:id", protect, deleteStockUsage);
router.patch("/:id/cancel", protect, cancelStockUsage);
router.patch('/:id/approve', protect, approveDamageRequest);
router.patch('/:id/reject', protect, rejectDamageRequest);
router.get('/pending', protect, getPendingDamageRequests);
router.get('/requests', protect, getDamageRequestsByStatus);
router.get('/customer/:customerId', protect,  getStockUsageByCustomer);
router.get('/building/:buildingId',protect,  getStockUsageByBuilding);
router.get('/control-room/:controlRoomId',protect,  getStockUsageByControlRoom);
router.get('/customer/:customerId/devices', protect, getProductDevicesByCustomer);
router.get('/building/:buildingId/devices', protect, getProductDevicesByBuilding);
router.get('/control-room/:controlRoomId/devices', protect, getProductDevicesByControlRoom);


export default router;