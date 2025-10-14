import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";
import StockTransfer from "../models/StockTransfer.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";

const isValidObjectId = (value) => {
  if (!value) return true;
  return mongoose.Types.ObjectId.isValid(value);
};

const isArrayOfObjects = (value) => {
  if (!value) return true;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "object")
  );
};

const isValidStatus = (value) => {
  if (!value) return true;
  const validStatuses = [
    "Draft",
    "Submitted",
    "Admin_Approved",
    "Admin_Rejected",
    "Confirmed",
    "Shipped",
    "Incompleted",
    "Completed",
    "Rejected",
  ];
  return validStatuses.includes(value);
};

const isValidAdminApprovalStatus = (value) => {
  if (!value) return true;
  const validStatuses = ["Approved", "Rejected"];
  return validStatuses.includes(value);
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
};

export const validateCreateStockTransfer = [
  body("fromCenter")
    .notEmpty()
    .withMessage("From center is required")
    .custom(isValidObjectId)
    .withMessage("Invalid to center ID")
    .custom(async (value, { req }) => {
      const center = await Center.findById(value);
      if (!center) {
        throw new Error("To center not found");
      }
      return true;
    }),

  body("transferNumber")
    .notEmpty()
    .withMessage("Transfer number is required")
    .isString()
    .withMessage("Transfer number must be a string")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Transfer number must be between 1 and 100 characters")
    .custom(async (value) => {
      const existingTransfer = await StockTransfer.findOne({
        transferNumber: value,
      });
      if (existingTransfer) {
        throw new Error("Transfer number already exists");
      }
      return true;
    }),

  body("products")
    .notEmpty()
    .withMessage("Products array is required")
    .custom(isArrayOfObjects)
    .withMessage("Products must be a non-empty array of objects")
    .custom((products) => {
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error("At least one product is required");
      }
      return true;
    }),

  body("products.*.product")
    .notEmpty()
    .withMessage("Product ID is required for each product")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID")
    .custom(async (value) => {
      const product = await Product.findById(value);
      if (!product) {
        throw new Error(`Product with ID ${value} not found`);
      }
      return true;
    }),

  body("products.*.quantity")
    .notEmpty()
    .withMessage("Quantity is required for each product")
    .isInt({ min: 1, max: 100000 })
    .withMessage("Quantity must be an integer between 1 and 100,000"),

  body("status").optional().custom(isValidStatus).withMessage("Invalid status"),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("remark")
    .optional()
    .isString()
    .withMessage("Remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateUpdateStockTransfer = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("toCenter")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid to center ID")
    .custom(async (value) => {
      if (value) {
        const center = await Center.findById(value);
        if (!center) {
          throw new Error("To center not found");
        }
      }
      return true;
    }),

  body("transferNumber")
    .optional()
    .isString()
    .withMessage("Transfer number must be a string")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Transfer number must be between 1 and 100 characters")
    .custom(async (value, { req }) => {
      if (value) {
        const existingTransfer = await StockTransfer.findOne({
          transferNumber: value,
          _id: { $ne: req.params.id },
        });
        if (existingTransfer) {
          throw new Error("Transfer number already exists");
        }
      }
      return true;
    }),

  body("products")
    .optional()
    .custom(isArrayOfObjects)
    .withMessage("Products must be a non-empty array of objects")
    .custom((products) => {
      if (products && (!Array.isArray(products) || products.length === 0)) {
        throw new Error("At least one product is required");
      }
      return true;
    }),

  body("products.*.product")
    .if(body("products").exists())
    .notEmpty()
    .withMessage("Product ID is required for each product")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID")
    .custom(async (value) => {
      const product = await Product.findById(value);
      if (!product) {
        throw new Error(`Product with ID ${value} not found`);
      }
      return true;
    }),

  body("products.*.quantity")
    .if(body("products").exists())
    .notEmpty()
    .withMessage("Quantity is required for each product")
    .isInt({ min: 1, max: 100000 })
    .withMessage("Quantity must be an integer between 1 and 100,000"),

  body("status").optional().custom(isValidStatus).withMessage("Invalid status"),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("remark")
    .optional()
    .isString()
    .withMessage("Remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateIdParam = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  handleValidationErrors,
];

export const validateAdminApproval = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("approvedRemark")
    .optional()
    .isString()
    .withMessage("Approved remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Approved remark cannot exceed 500 characters"),

  body("modifications")
    .optional()
    .isArray()
    .withMessage("Modifications must be an array"),

  body("modifications.*.product")
    .if(body("modifications").exists())
    .notEmpty()
    .withMessage("Product ID is required for each modification")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in modification"),

  body("modifications.*.originalQuantity")
    .if(body("modifications").exists())
    .isInt({ min: 0 })
    .withMessage("Original quantity must be a non-negative integer"),

  body("modifications.*.approvedQuantity")
    .if(body("modifications").exists())
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be a non-negative integer"),

  body("modifications.*.modificationReason")
    .optional()
    .isString()
    .withMessage("Modification reason must be a string")
    .isLength({ max: 500 })
    .withMessage("Modification reason cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateAdminRejection = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("rejectionReason")
    .optional()
    .isString()
    .withMessage("Rejection reason must be a string")
    .isLength({ max: 500 })
    .withMessage("Rejection reason cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateShipping = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("shippedDate")
    .notEmpty()
    .withMessage("Shipped date is required")
    .isISO8601()
    .withMessage("Shipped date must be a valid ISO 8601 date"),

  body("expectedDeliveryDate")
    .optional()
    .isISO8601()
    .withMessage("Expected delivery date must be a valid ISO 8601 date"),

  body("shipmentDetails")
    .optional()
    .isString()
    .withMessage("Shipment details must be a string")
    .isLength({ max: 1000 })
    .withMessage("Shipment details cannot exceed 1000 characters"),

  body("shipmentRemark")
    .optional()
    .isString()
    .withMessage("Shipment remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Shipment remark cannot exceed 500 characters"),

  body("documents")
    .optional()
    .isArray()
    .withMessage("Documents must be an array"),

  body("documents.*")
    .optional()
    .isString()
    .withMessage("Each document must be a string"),

  body("carrierInfo.name")
    .optional()
    .isString()
    .withMessage("Carrier name must be a string")
    .isLength({ max: 100 })
    .withMessage("Carrier name cannot exceed 100 characters"),

  body("carrierInfo.trackingNumber")
    .optional()
    .isString()
    .withMessage("Tracking number must be a string")
    .isLength({ max: 100 })
    .withMessage("Tracking number cannot exceed 100 characters"),

  body("carrierInfo.contact")
    .optional()
    .isString()
    .withMessage("Carrier contact must be a string")
    .isLength({ max: 100 })
    .withMessage("Carrier contact cannot exceed 100 characters"),

  handleValidationErrors,
];

export const validateUpdateShippingInfo = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("shippedDate")
    .optional()
    .isISO8601()
    .withMessage("Shipped date must be a valid ISO 8601 date"),

  body("expectedDeliveryDate")
    .optional()
    .isISO8601()
    .withMessage("Expected delivery date must be a valid ISO 8601 date"),

  body("shipmentDetails")
    .optional()
    .isString()
    .withMessage("Shipment details must be a string")
    .isLength({ max: 1000 })
    .withMessage("Shipment details cannot exceed 1000 characters"),

  body("shipmentRemark")
    .optional()
    .isString()
    .withMessage("Shipment remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Shipment remark cannot exceed 500 characters"),

  body("documents")
    .optional()
    .isArray()
    .withMessage("Documents must be an array"),

  body("documents.*")
    .optional()
    .isString()
    .withMessage("Each document must be a string"),

  body("carrierInfo")
    .optional()
    .isObject()
    .withMessage("Carrier info must be an object"),

  handleValidationErrors,
];

export const validateCompletion = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("productReceipts")
    .optional()
    .isArray()
    .withMessage("Product receipts must be an array"),

  body("productReceipts.*.productId")
    .if(body("productReceipts").exists())
    .notEmpty()
    .withMessage("Product ID is required for each receipt")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in receipt"),

  body("productReceipts.*.receivedQuantity")
    .if(body("productReceipts").exists())
    .isInt({ min: 0 })
    .withMessage("Received quantity must be a non-negative integer"),

  body("productReceipts.*.receivedRemark")
    .optional()
    .isString()
    .withMessage("Received remark must be a string")
    .isLength({ max: 200 })
    .withMessage("Received remark cannot exceed 200 characters"),

  handleValidationErrors,
];

export const validateConfirmation = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("productApprovals")
    .optional()
    .isArray()
    .withMessage("Product approvals must be an array"),

  body("productApprovals.*.productId")
    .if(body("productApprovals").exists())
    .notEmpty()
    .withMessage("Product ID is required for each approval")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in approval"),

  body("productApprovals.*.approvedQuantity")
    .if(body("productApprovals").exists())
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be a non-negative integer"),

  body("productApprovals.*.approvedSerials")
    .optional()
    .isArray()
    .withMessage("Approved serials must be an array"),

  body("productApprovals.*.approvedSerials.*")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Serial number cannot be empty")
    .optional(),

  body("productApprovals.*.approvedRemark")
    .optional()
    .isString()
    .withMessage("Approved remark must be a string")
    .isLength({ max: 200 })
    .withMessage("Approved remark cannot exceed 200 characters"),

  body("productApprovals").custom(async (productApprovals, { req }) => {
    if (!productApprovals || !Array.isArray(productApprovals)) {
      return true;
    }

    const { id } = req.params;
    const stockTransfer = await StockTransfer.findById(id);
    if (!stockTransfer) {
      throw new Error("Stock transfer not found");
    }

    const Product = mongoose.model("Product");

    for (const approval of productApprovals) {
      if (!approval.productId) continue;

      const productItem = stockTransfer.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (!productItem) {
        throw new Error(`Product ${approval.productId} not found in transfer`);
      }

      const productDoc = await Product.findById(approval.productId);
      const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      if (tracksSerialNumbers) {
        if (approval.approvedQuantity > 0) {
          if (
            !approval.approvedSerials ||
            !Array.isArray(approval.approvedSerials)
          ) {
            throw new Error(
              `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers`
            );
          }

          if (approval.approvedSerials.length !== approval.approvedQuantity) {
            throw new Error(
              `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`
            );
          }

          const uniqueSerials = new Set(approval.approvedSerials);
          if (uniqueSerials.size !== approval.approvedSerials.length) {
            throw new Error(
              `Duplicate serial numbers found for product ${productDoc.productTitle}`
            );
          }

          const emptySerials = approval.approvedSerials.filter(
            (sn) => !sn || sn.trim() === ""
          );
          if (emptySerials.length > 0) {
            throw new Error(
              `Serial numbers cannot be empty for product ${productDoc.productTitle}`
            );
          }
        } else {
          if (approval.approvedSerials && approval.approvedSerials.length > 0) {
            throw new Error(
              `Serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`
            );
          }
        }
      } else {
        if (approval.approvedSerials && approval.approvedSerials.length > 0) {
          throw new Error(
            `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`
          );
        }
      }
    }

    return true;
  }),

  handleValidationErrors,
];

export const validateIncompleteTransfer = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("incompleteRemark")
    .optional()
    .isString()
    .withMessage("Incomplete remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Incomplete remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateRejectShipment = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  handleValidationErrors,
];

export const validateRejectTransfer = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("rejectionRemark")
    .optional()
    .isString()
    .withMessage("Rejection remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Rejection remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateQueryParams = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be an integer between 1 and 100"),

  query("fromCenter")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid from center ID"),

  query("toCenter")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid to center ID"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid ISO 8601 date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid ISO 8601 date"),

  query("transferNumber")
    .optional()
    .isString()
    .withMessage("Transfer number must be a string")
    .isLength({ max: 100 })
    .withMessage("Transfer number cannot exceed 100 characters"),

  query("search")
    .optional()
    .isString()
    .withMessage("Search term must be a string")
    .isLength({ max: 100 })
    .withMessage("Search term cannot exceed 100 characters"),

  query("sortBy").optional().isString().withMessage("Sort by must be a string"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage('Sort order must be either "asc" or "desc"'),

  handleValidationErrors,
];

export const validateCompleteIncompleteTransfer = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("productApprovals")
    .optional()
    .isArray()
    .withMessage("Product approvals must be an array"),

  body("productApprovals.*.productId")
    .if(body("productApprovals").exists())
    .notEmpty()
    .withMessage("Product ID is required for each approval")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in approval"),

  body("productApprovals.*.approvedQuantity")
    .if(body("productApprovals").exists())
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be a non-negative integer"),

  body("productApprovals.*.approvedRemark")
    .optional()
    .isString()
    .withMessage("Approved remark must be a string")
    .isLength({ max: 200 })
    .withMessage("Approved remark cannot exceed 200 characters"),

  body("productReceipts")
    .optional()
    .isArray()
    .withMessage("Product receipts must be an array"),

  body("productReceipts.*.productId")
    .if(body("productReceipts").exists())
    .notEmpty()
    .withMessage("Product ID is required for each receipt")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in receipt"),

  body("productReceipts.*.receivedQuantity")
    .if(body("productReceipts").exists())
    .isInt({ min: 0 })
    .withMessage("Received quantity must be a non-negative integer"),

  body("productReceipts.*.receivedRemark")
    .optional()
    .isString()
    .withMessage("Received remark must be a string")
    .isLength({ max: 200 })
    .withMessage("Received remark cannot exceed 200 characters"),

  handleValidationErrors,
];

export const validateUpdateApprovedQuantities = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("productApprovals")
    .notEmpty()
    .withMessage("Product approvals are required")
    .isArray()
    .withMessage("Product approvals must be an array")
    .custom((approvals) => approvals.length > 0)
    .withMessage("At least one product approval is required"),

  body("productApprovals.*.productId")
    .notEmpty()
    .withMessage("Product ID is required for each approval")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in approval"),

  body("productApprovals.*.approvedQuantity")
    .notEmpty()
    .withMessage("Approved quantity is required for each approval")
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be a non-negative integer"),

  body("productApprovals.*.approvedRemark")
    .optional()
    .isString()
    .withMessage("Approved remark must be a string")
    .isLength({ max: 200 })
    .withMessage("Approved remark cannot exceed 200 characters"),

  handleValidationErrors,
];

export const validateUpdateStatus = [
  param("id").custom(isValidObjectId).withMessage("Invalid stock transfer ID"),

  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .custom(isValidStatus)
    .withMessage("Invalid status"),

  handleValidationErrors,
];
