import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import { getAllInvoices, getInvoice, markAsInvoiced } from "../controllers/invoiceController.js";

const router = express.Router();

router.post(
  "/mark-invoiced",
  protect,
  markAsInvoiced
);
router.get(
    "/",
    protect,
    getAllInvoices
);
router.get(
    "/:id",
    protect,
    getInvoice
);

export default router;
