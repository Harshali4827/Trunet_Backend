import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';

const usageTypes = [
  'Customer', 'Building', 'Building to Building', 'Control room', 
  'Damage', 'Stolen from Center', 'Stolen from Field', 'Other'
];

const connectionTypes = ['NC', 'Convert', 'Shifting', 'Repair'];
const stolenFromTypes = ['Customer', 'Building', 'Control room'];
const damageReturnStatuses = ['pending', 'accepted', 'rejected', 'not_applicable'];

// Common validation functions
const isValidObjectId = (value) => {
  if (value === null || value === undefined || value === '') return true;
  return mongoose.Types.ObjectId.isValid(value);
};

const isValidDate = (value) => {
  if (value === null || value === undefined || value === '') return true;
  return !isNaN(Date.parse(value));
};

// Create Stock Usage Validator
export const validateCreateStockUsage = [
  body('date').optional().isISO8601().toDate(),
  body('usageType')
    .isIn([
      'Customer',
      'Building', 
      'Building to Building',
      'Control Room',
      'Damage',
      'Stolen from Center',
      'Stolen from Field',
      'Other'
    ])
    .withMessage('Valid usage type is required'),
  body('center').isMongoId().withMessage('Valid center ID is required'),
  body('remark').optional().isString().trim(),
  
  // Customer fields
  body('customer').optional().isMongoId(),
  body('connectionType').optional().isIn(['NC', 'Convert', 'Shifting', 'Repair']),
  body('packageAmount').optional().isNumeric(),
  body('packageDuration').optional().isString(),
  body('onuCharges').optional().isNumeric(),
  body('installationCharges').optional().isNumeric(),
  body('reason').optional().isIn(['NC', 'Convert', 'Shifting', 'Repair']),
  body('shiftingAmount').optional().isNumeric(),
  body('wireChangeAmount').optional().isNumeric(),
  
  // Building fields
  body('fromBuilding').optional().isMongoId(),
  body('toBuilding').optional().isMongoId(),
  
  // Control Room fields
  body('fromControlRoom').optional().isMongoId(),
  
  // Items validation - THIS IS THE KEY FIX
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.product')
    .isMongoId()
    .withMessage('Valid product ID is required for each item'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Valid quantity (min 1) is required for each item'),
 // In validateCreateStockUsage and validateUpdateStockUsage
body('items.*.serialNumbers')
  .optional()
  .isArray(),
body('items.*.serialNumbers.*')
  .optional()
  .isString()
  .trim(),
  
  body('createdBy').optional().isMongoId()
];

export const validateUpdateStockUsage = [
  param('id').isMongoId().withMessage('Valid stock usage ID is required'),
  body('date').optional().isISO8601().toDate(),
  body('usageType')
    .optional()
    .isIn([
      'Customer',
      'Building', 
      'Building to Building',
      'Control Room',
      'Damage',
      'Stolen from Center',
      'Stolen from Field',
      'Other'
    ]),
  body('center').optional().isMongoId(),
  body('remark').optional().isString().trim(),
  
  // Customer fields
  body('customer').optional().isMongoId(),
  body('connectionType').optional().isIn(['NC', 'Convert', 'Shifting', 'Repair']),
  body('packageAmount').optional().isNumeric(),
  body('packageDuration').optional().isString(),
  body('onuCharges').optional().isNumeric(),
  body('installationCharges').optional().isNumeric(),
  body('reason').optional().isIn(['NC', 'Convert', 'Shifting', 'Repair']),
  body('shiftingAmount').optional().isNumeric(),
  body('wireChangeAmount').optional().isNumeric(),
  
  // Building fields
  body('fromBuilding').optional().isMongoId(),
  body('toBuilding').optional().isMongoId(),
  
  // Control Room fields
  body('fromControlRoom').optional().isMongoId(),
  
  // Items validation
  body('items')
    .optional()
    .isArray({ min: 1 }),
  body('items.*.product')
    .optional()
    .isMongoId(),
  body('items.*.quantity')
    .optional()
    .isInt({ min: 1 }),
  body('items.*.serialNumbers')
    .optional()
    .isArray(),
  
  body('createdBy').optional().isMongoId()
];

export const validateGetAllStockUsage = [
  query('center').optional().isMongoId(),
  query('usageType')
    .optional()
    .isIn([
      'Customer',
      'Building', 
      'Building to Building',
      'Control Room',
      'Damage',
      'Stolen from Center',
      'Stolen from Field',
      'Other'
    ]),
  query('dateFilter')
    .optional()
    .isIn([
      'Today',
      'Yesterday',
      'This Week',
      'Last Week',
      'This Month',
      'Last Month',
      'This Year',
      'Last Year'
    ]),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('customer').optional().isMongoId(),
  query('building').optional().isMongoId(),
  query('controlRoom').optional().isMongoId(),
  query('status').optional().isIn(['pending', 'completed', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isString(),
  query('sortOrder').optional().isIn(['asc', 'desc'])
];

export const validateIdParam = [
  param('id').isMongoId().withMessage('Valid ID is required')
];
// Damage Return Approval Validator
export const validateDamageReturnApproval = [
  param('id')
    .custom(isValidObjectId)
    .withMessage('Invalid stock usage ID'),
  
  body('status')
    .isIn(['accepted', 'rejected'])
    .withMessage('Status must be either accepted or rejected'),
  
  body('acceptedQuantities')
    .optional()
    .isArray()
    .withMessage('Accepted quantities must be an array')
    .custom((value, { req }) => {
      if (req.body.status === 'accepted' && (!value || value.length === 0)) {
        throw new Error('Accepted quantities are required when status is accepted');
      }
      return true;
    }),
  
  body('acceptedQuantities.*')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Each accepted quantity must be a non-negative integer'),
  
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Rejection reason must be between 1 and 500 characters')
    .custom((value, { req }) => {
      if (req.body.status === 'rejected' && (!value || value.trim().length === 0)) {
        throw new Error('Rejection reason is required when status is rejected');
      }
      return true;
    }),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

// Get by Usage Type Validator
export const validateGetByUsageType = [
  param('usageType')
    .isIn(usageTypes)
    .withMessage(`Usage type must be one of: ${usageTypes.join(', ')}`),
  
  query('center')
    .optional()
    .custom(isValidObjectId)
    .withMessage('Invalid center ID'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Stock Movement Validators
export const validateRetryStockMovement = [
  param('id')
    .custom(isValidObjectId)
    .withMessage('Invalid stock usage ID')
];

export const validateGetStockMovementSummary = [
  query('center')
    .notEmpty()
    .withMessage('Center ID is required')
    .custom(isValidObjectId)
    .withMessage('Invalid center ID'),
  
  query('startDate')
    .optional()
    .custom(isValidDate)
    .withMessage('Please provide a valid start date'),
  
  query('endDate')
    .optional()
    .custom(isValidDate)
    .withMessage('Please provide a valid end date')
];