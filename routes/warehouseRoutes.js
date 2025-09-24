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

const router = express.Router();

router.post('/', validateCreateWarehouse, createWarehouse);

router.get('/', getWarehouses);

router.get('/:id', validateWarehouseId, getWarehouseById);

router.put('/:id', validateUpdateWarehouse, updateWarehouse);

router.delete('/:id', validateWarehouseId, deleteWarehouse);

export default router;