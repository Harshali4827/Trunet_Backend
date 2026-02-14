import express from "express";

import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

import { getResellerForwardedQty } from "../controllers/resellerQuantity.js";

const MODULE = "Indent";
const router = express.Router();

router.get(
  "/reseller-forwarded-qty",
  protect,
  authorizeAccess(
    MODULE,
   "indent_all_center",
    "indent_own_center"
  ),
  getResellerForwardedQty
);

export default router;
