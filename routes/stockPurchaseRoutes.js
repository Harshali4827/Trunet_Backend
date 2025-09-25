import express from 'express';
import {
  createStockPurchase,
  getAllStockPurchases,
  getStockPurchaseById,
  updateStockPurchase,
  deleteStockPurchase,
  updateStockPurchaseStatus,
  getPurchasesByVendor
} from '../controllers/stockPurchaseController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createStockPurchase);
router.get('/', protect, getAllStockPurchases);
router.get('/:id', protect, getStockPurchaseById);
router.put('/:id', protect, updateStockPurchase);
router.delete('/:id', protect, deleteStockPurchase);
router.patch('/:id/status', protect, updateStockPurchaseStatus);
router.get('/vendor/:vendorId', protect, getPurchasesByVendor);

export default router;