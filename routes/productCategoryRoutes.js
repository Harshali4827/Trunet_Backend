import express from 'express';
import { createProductCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from '../controllers/productCategoryController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createProductCategory);
router.get('/',protect,  getAllCategories);
router.get('/:id',protect,  getCategoryById);
router.put('/:id',protect, updateCategory);
router.delete('/:id',protect,  deleteCategory);

export default router;
