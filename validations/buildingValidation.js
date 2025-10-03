import { body, param } from 'express-validator';

export const createBuildingValidator = [
  body('center')
    .notEmpty().withMessage('Center is required')
    .isMongoId().withMessage('Center must be a valid Mongo ID'),

  body('buildingName')
    .notEmpty().withMessage('Building name is required')
    .isString().withMessage('Building name must be a string'),

  body('displayName')
    .optional()
    .isString().withMessage('Display name must be a string'),

  body('address1')
    .notEmpty().withMessage('Address1 is required')
    .isString().withMessage('Address1 must be a string'),

  body('address2')
    .optional()
    .isString().withMessage('Address2 must be a string'),

  body('landmark')
    .optional()
    .isString().withMessage('Landmark must be a string'),

  // body('pincode')
  //   .notEmpty().withMessage('Pincode is required')
  //   .matches(/^[1-9][0-9]{5}$/).withMessage('Invalid Indian pincode'),
];

export const updateBuildingValidator = [
  param('id').isMongoId().withMessage('Invalid building ID'),
  ...createBuildingValidator,
];

export const buildingIdValidator = [
  param('id').isMongoId().withMessage('Invalid building ID'),
];
