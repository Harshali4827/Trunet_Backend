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
  getProductDevicesByControlRoom,
  changeToDamageReturn,
  getDamageReturnRecordsWithStats,
  replaceProductSerial,
  returnProductSerial,
} from "../controllers/stockUsageController.js";

import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const MODULE = "Usage";

router.get(
  "/pending",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getPendingDamageRequests
);
router.get(
  "/requests",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getDamageRequestsByStatus
);
router.get(
  "/damage-return",
  protect,
  // authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getDamageReturnRecordsWithStats
);
router.post(
  "/",
  protect,
  authorizeAccess(MODULE, "manage_usage_own_center", "manage_usage_all_center"),
  createStockUsage
);

router.post(
  "/return/product",
  protect,
  authorizeAccess(MODULE, "manage_usage_own_center", "manage_usage_all_center"),
  returnProductSerial
);

router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "view_usage_own_center", "view_usage_all_center"),
  getAllStockUsage
);
router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getStockUsageById
);
router.put(
  "/:id",
  protect,
  authorizeAccess(MODULE, "allow_edit_usage"),
  updateStockUsage
);
router.delete(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_usage_own_center", "manage_usage_all_center"),
  deleteStockUsage
);
router.patch(
  "/:id/cancel",
  protect,
  authorizeAccess(MODULE, "manage_usage_own_center", "manage_usage_all_center"),
  cancelStockUsage
);

router.patch(
  "/:id/approve",
  protect,
  authorizeAccess(MODULE, "accept_damage_return"),
  approveDamageRequest
);

router.patch(
  "/:id/reject",
  protect,
  authorizeAccess(MODULE, "manage_usage_own_center", "manage_usage_all_center"),
  rejectDamageRequest
);

router.get(
  "/customer/:customerId",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getStockUsageByCustomer
);
router.get(
  "/building/:buildingId",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getStockUsageByBuilding
);
router.get(
  "/control-room/:controlRoomId",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getStockUsageByControlRoom
);
router.get(
  "/customer/:customerId/devices",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getProductDevicesByCustomer
);
router.get(
  "/building/:buildingId/devices",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getProductDevicesByBuilding
);
router.get(
  "/control-room/:controlRoomId/devices",
  protect,
  authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  getProductDevicesByControlRoom
);

router.patch(
  "/damage/:id/damage-return",
  protect,
  // authorizeAccess(MODULE,  "view_usage_own_center", "view_usage_all_center"),
  changeToDamageReturn
);

router.post('/replace-serial', protect, replaceProductSerial);

export default router;
