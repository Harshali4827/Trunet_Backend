import express from "express";
import { protect } from "../middlewares/authMiddleware.js";

import { getDamageAndUnderRepairProduct, getDamagedAndUnderRepairSerials, getRepairedProducts, getRepairTransfersForCenter, markAsRepairedOrIrreparable, returnFromRepairCenter, transferToRepairCenter } from "../controllers/faultyStockController.js";

const router = express.Router();

const MODULE = "Purchase";

router.post(
  "/transfer",
  protect,
  transferToRepairCenter
);

router.post('/return-from-repair',protect, returnFromRepairCenter);

router.get('/repair-transfers/center',protect,getRepairTransfersForCenter)
router.get('/serials/:productId', protect, getDamagedAndUnderRepairSerials)
router.post('/mark-repair-status',protect,markAsRepairedOrIrreparable)

router.get('/damage-products',protect,getDamageAndUnderRepairProduct)
router.get('/repaired-products',protect, getRepairedProducts)

export default router;
