import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkImportProducts,
  downloadCSVTemplate,
} from "../controllers/productController.js";
import {
  createProductValidator,
  updateProductValidator,
} from "../validations/productValidator.js";
import upload, { memoryUpload } from "../config/multer.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get('/download-template',protect, downloadCSVTemplate);
router.post('/bulk-import', protect, memoryUpload.single('csvFile'), bulkImportProducts);

router.post(
  "/",
  protect,
  upload.single("productImage"),
  createProductValidator,
  createProduct
);

router.put(
  "/:id",
  upload.single("productImage"),
  protect,
  updateProductValidator,
  updateProduct
);

router.get("/", protect, getAllProducts);
router.get("/:id", protect, getProductById);
router.delete("/:id", protect, deleteProduct);


export default router;
