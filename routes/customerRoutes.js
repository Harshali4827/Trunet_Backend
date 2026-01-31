import express from "express";
import upload from '../middlewares/upload.js';
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  importCustomers,
  getCustomersWithoutPagination,
  
} from "../controllers/customerController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Customer";
router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "manage_customer_all_center",
    "manage_customer_own_center"
  ),
  createCustomer
);
router.post(
  '/import',
  upload.single('file'),
  importCustomers
);
router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "view_customer_own_center","view_customer_all_center"),
  getCustomers
);
router.get(
  "/all",
  protect,
  authorizeAccess(MODULE, "view_customer_own_center","view_customer_all_center"),
  getCustomersWithoutPagination
);

router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE, "view_customer_own_center","view_customer_all_center"),
  getCustomerById
);

router.put(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_customer_all_center",
    "manage_customer_own_center"
  ),
  updateCustomer
);

router.delete(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_customer_all_center",
    "manage_customer_own_center"
  ),
  deleteCustomer
);

export default router;
