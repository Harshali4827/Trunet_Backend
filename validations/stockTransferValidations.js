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
    Array.isArray(value) && value.every((item) => typeof item === "object")
  );
};

const isValidStatus = (value) => {
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
  const validStatuses = ["Pending", "Approved", "Rejected", "Not_Required"];
  return validStatuses.includes(value);
};

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

export const validateCreateStockTransfer = [
  body("toCenter")
    .notEmpty()
    .withMessage("To center is required")
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

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("remark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Remark must not exceed 500 characters"),

  body("status").optional().custom(isValidStatus).withMessage("Invalid status"),

  body("products")
    .isArray({ min: 1 })
    .withMessage("At least one product is required")
    .custom(isArrayOfObjects)
    .withMessage("Products must be an array of objects"),

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
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer for each product"),

  body("products.*.productRemark")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Product remark must not exceed 200 characters"),

  body("products.*.serialNumbers")
    .optional()
    .isArray()
    .withMessage("Serial numbers must be an array"),

  body("products.*.serialNumbers.*")
    .optional()
    .isString()
    .withMessage("Each serial number must be a string"),
];

export const validateUpdateStockTransfer = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

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

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("remark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Remark must not exceed 500 characters"),

  body("status").optional().custom(isValidStatus).withMessage("Invalid status"),

  body("products")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Products array must contain at least one item")
    .custom(isArrayOfObjects)
    .withMessage("Products must be an array of objects"),

  body("products.*.product")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid product ID")
    .custom(async (value) => {
      if (value) {
        const product = await Product.findById(value);
        if (!product) {
          throw new Error(`Product with ID ${value} not found`);
        }
      }
      return true;
    }),

  body("products.*.quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),

  body("products.*.approvedQuantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be a non-negative integer"),

  body("products.*.receivedQuantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Received quantity must be a non-negative integer"),
];

export const validateIdParam = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),
];

export const validateGetAllStockTransfers = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  query("status")
    .optional()
    .custom((value) => {
      if (!value) return true;
      const statuses = value.split(",");
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
      return statuses.every((status) => validStatuses.includes(status));
    })
    .withMessage("Invalid status value"),

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
    .isLength({ max: 100 })
    .withMessage("Transfer number must not exceed 100 characters"),

  query("search")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Search term must not exceed 200 characters"),

  query("sortBy")
    .optional()
    .isIn([
      "createdAt",
      "updatedAt",
      "date",
      "transferNumber",
      "status",
      "adminApproval.approvedAt",
      "adminApproval.rejectedAt",
      "approvalInfo.approvedAt",
      "shippingInfo.shippedAt",
      "receivingInfo.receivedAt",
    ])
    .withMessage("Invalid sort field"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage('Sort order must be either "asc" or "desc"'),
];

export const validateAdminApproval = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

  body("approvedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Approved remark must not exceed 500 characters"),

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

  body("modifications.*.approvedQuantity")
    .if(body("modifications").exists())
    .isInt({ min: 0 })
    .withMessage(
      "Approved quantity must be a non-negative integer for each modification"
    ),

  body("modifications.*.modificationReason")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Modification reason must not exceed 200 characters"),
];

export const validateAdminRejection = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

  body("rejectionReason")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Rejection reason must not exceed 500 characters"),
];

export const validateCenterApproval = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required with at least one item"),

  body("productApprovals.*.productId")
    .notEmpty()
    .withMessage("Product ID is required for each approval")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in approval"),

  body("productApprovals.*.approvedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Approved quantity must be a non-negative integer for each approval"
    ),

  body("productApprovals.*.approvedRemark")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Approved remark must not exceed 200 characters"),
];

export const validateShipping = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

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
    .isLength({ max: 1000 })
    .withMessage("Shipment details must not exceed 1000 characters"),

  body("shipmentRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Shipment remark must not exceed 500 characters"),

  body("documents")
    .optional()
    .isArray()
    .withMessage("Documents must be an array"),
];

export const validateCompletion = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

  body("productReceipts")
    .isArray({ min: 1 })
    .withMessage("Product receipts are required with at least one item"),

  body("productReceipts.*.productId")
    .notEmpty()
    .withMessage("Product ID is required for each receipt")
    .custom(isValidObjectId)
    .withMessage("Invalid product ID in receipt"),

  body("productReceipts.*.receivedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Received quantity must be a non-negative integer for each receipt"
    ),

  body("productReceipts.*.receivedRemark")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Received remark must not exceed 200 characters"),
];

export const validateIncompleteTransferCompletion = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

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
    .withMessage(
      "Approved quantity must be a non-negative integer for each approval"
    ),

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
    .withMessage(
      "Received quantity must be a non-negative integer for each receipt"
    ),
];

export const validateStatusUpdate = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),

  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .custom(isValidStatus)
    .withMessage("Invalid status"),

  body("approvedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Approved remark must not exceed 500 characters"),

  body("receivedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Received remark must not exceed 500 characters"),

  body("incompleteRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Incomplete remark must not exceed 500 characters"),
];

export const validateFileUpload = [
  param("id").isMongoId().withMessage("Invalid stock transfer ID"),
];
