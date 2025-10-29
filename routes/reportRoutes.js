
import express from "express";
import {
  getAllStockPurchasesReports,
  getAllStockRequestsReports,
  getMonthlyStockRequestsSummary,
  getAllStockTransfersReports,
  getMonthlyStockTransfersSummary,
  getMonthlyStockUsageSummary,
  getAllStockUsageReports,
  getAllStolenStockReports,
  getProductDetailsBySerialNumber,
  getONUTrackReport,
  getReplacementRecords
} from "../controllers/reportController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Report";

router.get(
  "/requests",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getAllStockRequestsReports
);

router.get(
  "/purchased",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getAllStockPurchasesReports
);

router.get(
  "/requests/summary",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getMonthlyStockRequestsSummary
);

router.get(
  "/transfers",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getAllStockTransfersReports
);

router.get(
  "/transfers/summary",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getMonthlyStockTransfersSummary
);

router.get(
  "/usages",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getAllStockUsageReports
);

router.get(
  "/usages/summary",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getMonthlyStockUsageSummary
);

router.get(
  "/stolenstock",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getAllStolenStockReports
);

router.get(
  "/serialreport",
  protect,
  authorizeAccess(MODULE, "view_own_report", "view_all_report"),
  getProductDetailsBySerialNumber
);

router.get(
  "/onu-report",
  protect,
  authorizeAccess(MODULE, "view_own_report","view_all_report"),
  getONUTrackReport
);

router.get(
  "/replace-report",
  protect,
  authorizeAccess(MODULE, "view_own_report","view_all_report"),
  getReplacementRecords
)
export default router;