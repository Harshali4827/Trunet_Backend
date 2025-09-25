import express from 'express';
import {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse
} from '../controllers/warehouseController.js';
import {
  validateCreateWarehouse,
  validateUpdateWarehouse,
  validateWarehouseId,
} from '../validations/warehouseValidation.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, validateCreateWarehouse, createWarehouse);

router.get('/', protect, getWarehouses);

router.get('/:id', protect, validateWarehouseId, getWarehouseById);

router.put('/:id', protect, validateUpdateWarehouse, updateWarehouse);

router.delete('/:id', protect, validateWarehouseId, deleteWarehouse);

export default router;