import { body } from 'express-validator';

export const createCustomerValidation = [
  body('username').notEmpty().withMessage('Username is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('center').notEmpty().withMessage('Center is required'),
  body('partner').notEmpty().withMessage('Partner is required'),
  body('area').notEmpty().withMessage('Area is required'),
  body('mobile').matches(/^[0-9]{10}$/).withMessage('Mobile must be 10 digits'),
  body('email').isEmail().withMessage('Valid email is required'),
];

export const updateCustomerValidation = [
  body('name').optional().notEmpty(),
  body('center').optional().notEmpty(),
  body('partner').optional().notEmpty(),
  body('area').optional().notEmpty(),
  body('mobile').optional().matches(/^[0-9]{10}$/),
  body('email').optional().isEmail(),
];
