import { body } from 'express-validator';

export const validateShiftingRequest = [
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Invalid date format'),
  body('customer')
    .notEmpty().withMessage('Customer ID is required')
    .isMongoId().withMessage('Invalid Customer ID'),
  body('address1')
    .notEmpty().withMessage('Address1 is required'),
  body('remark')
    .notEmpty().withMessage('Remark is required'),
  body('address2')
    .optional()
    .isString().withMessage('Address2 must be a string'),
  body('city')
    .optional()
    .isString().withMessage('City must be a string'),
];
