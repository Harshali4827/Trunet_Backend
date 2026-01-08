// routes/testingMaterialRoutes.js
import express from "express";
import {
  createTestingMaterialRequest,
  acceptTestingMaterialRequest,
  getAllTestingMaterialRequests,
  getTestingMaterialRequestById,
  getAllUnderTestingProducts,
  getUnderTestingSerialsByProduct,
} from "../controllers/testingMaterialController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", createTestingMaterialRequest);
router.get("/", getAllTestingMaterialRequests);
router.get("/under-testing-product",getAllUnderTestingProducts)
router.get("/:id", getTestingMaterialRequestById);
router.put("/:id/accept", acceptTestingMaterialRequest);
router.get("/under-testing/product/:productId/serial", getUnderTestingSerialsByProduct)
export default router;