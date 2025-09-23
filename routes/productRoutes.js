import express from 'express';
import { 
  createProduct, 
  getAllProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct 
} from '../controllers/productController.js';
import { createProductValidator, updateProductValidator } from '../validations/productValidator.js';

const router = express.Router();

router.post('/', createProductValidator, createProduct);
router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.put('/:id', updateProductValidator, updateProduct);
router.delete('/:id', deleteProduct);

export default router;
