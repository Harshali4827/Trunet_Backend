import express from "express";
import { protect } from "../middlewares/authMiddleware.js";

import { getAllFaultyStockForWarehouse, getDamageAndUnderRepairProduct, getDamagedAndUnderRepairSerials, getRepairedProducts, getRepairedProductsInOutletStock, getRepairTransfersForCenter, markAsRepairedOrIrreparable, returnFromRepairCenter,transferRepairedToMainWarehouse,transferRepairedToResellerStock,transferToRepairCenter} from "../controllers/faultyStockController.js";
import { acceptDamageItems, acceptRepairTransfer, rejectDamageItems } from "../controllers/acceptDamageController.js";

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
router.get('/product-status',protect,getAllFaultyStockForWarehouse)
router.get('/repaired-products',protect, getRepairedProducts)
router.get('/outlet-repaired-stock',protect,getRepairedProductsInOutletStock)
router.post('/transfer-repaired-to-warehouse', protect, transferRepairedToMainWarehouse);
router.post('/transfer-to-reseller-center', protect, transferRepairedToResellerStock);
router.post('/accept-damage',protect,acceptDamageItems);
router.post('/reject-damage',protect,rejectDamageItems);
router.post('/accept-repair-transfer',protect, acceptRepairTransfer)


export default router;
