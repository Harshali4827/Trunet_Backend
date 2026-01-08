import express from "express";
import { protect } from "../middlewares/authMiddleware.js";

import { acceptRejectRepairedTransfer, acceptRejectResellerTransfer} from "../controllers/acceptDamageController.js";

const router = express.Router();

router.post('/warehouse-repaired',protect, acceptRejectRepairedTransfer);
router.post('/reseller-transfer',protect, acceptRejectResellerTransfer);

export default router;
