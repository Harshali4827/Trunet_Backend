
import { body, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

export const validatePartnerId = [
  param('id').custom((value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error('Invalid partner ID');
    }
    return true;
  }),
  validate,
];

export const validateCreatePartner = [
  body('partnerName')
    .isString().withMessage('Partner name must be a string')
    .trim()
    .notEmpty().withMessage('Partner name is required'),
  validate,
];


export const validateUpdatePartner = [
  body('partnerName')
    .optional()
    .isString().withMessage('Partner name must be a string')
    .trim(),
  validate,
];
