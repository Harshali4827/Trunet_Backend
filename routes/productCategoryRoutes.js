import express from 'express';
import { createProductCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from '../controllers/productCategoryController.js';

const router = express.Router();

router.post('/', createProductCategory);
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);
router.put('/:id',updateCategory);
router.delete('/:id', deleteCategory);

export default router;
