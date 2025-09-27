import express from 'express';
import {
  createStockTransfer,
  getAllStockTransfers,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  updateStockTransferStatus
} from '../controllers/stockTransferController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createStockTransfer);
router.get('/', protect, getAllStockTransfers);
router.get('/:id', protect, getStockTransferById);
router.put('/:id', protect, updateStockTransfer);
router.delete('/:id', protect, deleteStockTransfer);
router.patch('/:id/status', protect, updateStockTransferStatus);

export default router;