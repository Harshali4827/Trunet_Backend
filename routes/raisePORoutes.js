import express from "express";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

import { approveRaisePO, createRaisePO, deletePO, getAllRaisePO, getLatestVoucherNumber, rejectRaisePO } from "../controllers/raisePOController.js";

const router = express.Router();

const MODULE = "Purchase";

router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "add_purchase_stock"
  ),
  createRaisePO
);

router.get(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "view_own_purchase_stock",
    "view_all_purchase_stock"
  ),
  getAllRaisePO
);


router.delete(
  "/:id",
  protect,
  deletePO
);

router.put('/:id/approve',protect,approveRaisePO)
router.put('/:id/reject',protect,rejectRaisePO)
router.get('/latest-voucher',protect, getLatestVoucherNumber);
export default router;
