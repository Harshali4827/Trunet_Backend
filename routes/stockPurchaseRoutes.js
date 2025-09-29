import express from 'express';
import {
  createStockPurchase,
  getAllStockPurchases,
  getStockPurchaseById,
  getAllProductsWithStock,
  updateStockPurchase,
  deleteStockPurchase,
  getPurchasesByVendor
} from '../controllers/stockPurchaseController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createStockPurchase);
router.get('/', protect, getAllStockPurchases);
router.get('/products-with-stock', protect, getAllProductsWithStock);
router.get('/:id', protect, getStockPurchaseById);
router.put('/:id', protect, updateStockPurchase);
router.delete('/:id', protect, deleteStockPurchase);
router.get('/vendor/:vendorId', protect, getPurchasesByVendor);

export default router;