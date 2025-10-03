import { body } from 'express-validator';

export const createProductValidator = [
  body('productCategory').notEmpty().withMessage('Product category is required'),
  body('productTitle').notEmpty().withMessage('Product title is required'),
  // body('productCode').notEmpty().withMessage('Product code is required'),
  // body('productPrice').isNumeric().withMessage('Product price must be a number'),
  // body('status')
  //   .optional()
  //   .isIn(['Enable', 'Disable'])
  //   .withMessage('Status must be either Enable or Disable'),
  body('trackSerialNumber')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Track Serial Number must be Yes or No'),
  body('repairable')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Repairable must be Yes or No'),
  body('replaceable')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Replaceable must be Yes or No'),
];

export const updateProductValidator = [
  body('productCategory').optional(),
  body('productTitle').optional(),
  body('productCode').optional(),
  body('productPrice').optional().isNumeric(),
  body('status')
    .optional()
    .isIn(['Enable', 'Disable'])
    .withMessage('Status must be either Enable or Disable'),
  body('trackSerialNumber')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Track Serial Number must be Yes or No'),
  body('repairable')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Repairable must be Yes or No'),
  body('replaceable')
    .optional()
    .isIn(['Yes', 'No'])
    .withMessage('Replaceable must be Yes or No'),
];
