import express from 'express';
import {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  updateStockRequestStatus
} from '../controllers/stockRequestController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createStockRequest);
router.get('/', protect, getAllStockRequests);
router.get('/:id', protect, getStockRequestById);
router.put('/:id', protect, updateStockRequest);
router.delete('/:id', protect, deleteStockRequest);
router.patch('/:id/status', protect, updateStockRequestStatus);

export default router;