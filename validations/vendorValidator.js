import { body } from 'express-validator';

export const createVendorValidator = [
  body('businessName').notEmpty().withMessage('Business name is required'),
  body('contactNumber').notEmpty().withMessage('Contact number is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('mobile')
  .optional()
  .isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('email').optional().isEmail().withMessage('Invalid email address'),
  body('gstNumber').optional().isString(),
  body('panNumber').optional().isString(),
  body('address1').optional().isString(),
  body('address2').optional().isString(),
  body('city').optional().isString(),
  body('state').optional().isString(),
  body('logo').optional().isString(),
];

export const updateVendorValidator = [
  body('businessName').optional(),
  body('contactNumber').optional(),
  body('name').optional(),
  body('mobile').optional(),
  body('email').optional().isEmail().withMessage('Invalid email address'),
  body('gstNumber').optional(),
  body('panNumber').optional(),
  body('address1').optional(),
  body('address2').optional(),
  body('city').optional(),
  body('state').optional(),
  body('logo').optional(),
];
