import { body, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Warehouse from '../models/Warehouse.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

export const validateWarehouseId = [
  param('id')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid warehouse ID');
      }
      return true;
    }),
  validate,
];

export const validateCreateWarehouse = [
  body('warehouseName')
    .isString().withMessage('Warehouse name must be a string')
    .trim()
    .notEmpty().withMessage('Warehouse name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Warehouse name must be between 2 and 100 characters')
    .custom(async (value) => {
      const existingWarehouse = await Warehouse.findOne({ 
        warehouseName: { $regex: new RegExp(`^${value}$`, 'i') } 
      });
      
      if (existingWarehouse) {
        throw new Error('Warehouse name already exists');
      }
      return true;
    }),
  validate,
];

export const validateUpdateWarehouse = [
  param('id')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid warehouse ID');
      }
      return true;
    }),
  body('warehouseName')
    .optional()
    .isString().withMessage('Warehouse name must be a string')
    .trim()
    .notEmpty().withMessage('Warehouse name cannot be empty')
    .isLength({ min: 2, max: 100 }).withMessage('Warehouse name must be between 2 and 100 characters')
    .custom(async (value, { req }) => {
      const existingWarehouse = await Warehouse.findOne({ 
        warehouseName: { $regex: new RegExp(`^${value}$`, 'i') },
        _id: { $ne: req.params.id } 
      });
      
      if (existingWarehouse) {
        throw new Error('Warehouse name already exists');
      }
      return true;
    }),
  validate,
];

export const validateWarehouseName = [
  body('warehouseName')
    .isString().withMessage('Warehouse name must be a string')
    .trim()
    .notEmpty().withMessage('Warehouse name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Warehouse name must be between 2 and 100 characters'),
  validate,
];