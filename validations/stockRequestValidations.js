import { body, param, query, validationResult } from "express-validator";
import StockRequest from "../models/StockRequest.js";
import OutletStock from "../models/OutletStock.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Center from "../models/Center.js";
import mongoose from "mongoose";

const customValidators = {
  isObjectId: (value) => {
    if (!value) return false;
    return mongoose.Types.ObjectId.isValid(value);
  },

  isValidOutlet: async (outletId) => {
    if (!outletId) return false;
    const outlet = await Center.findById(outletId);
    return outlet && outlet.centerType === "Outlet";
  },

  isValidCenter: async (centerId) => {
    if (!centerId) return false;
    const center = await Center.findById(centerId);
    return center && center.centerType?.toLowerCase() === "center";
  },

  productExists: async (productId) => {
    if (!productId) return false;
    const product = await Product.findById(productId);
    return !!product;
  },

  userExists: async (userId) => {
    if (!userId) return false;
    const user = await User.findById(userId);
    return !!user;
  },

  stockRequestExists: async (stockRequestId) => {
    if (!stockRequestId) return false;
    const stockRequest = await StockRequest.findById(stockRequestId);
    return !!stockRequest;
  },

  isUniqueOrderNumber: async (orderNumber, { req }) => {
    if (!orderNumber) return false;

    const filter = {
      orderNumber: { $regex: new RegExp(`^${orderNumber}$`, "i") },
    };

    if (req.params.id) {
      filter._id = { $ne: req.params.id };
    }

    const existing = await StockRequest.findOne(filter);
    return !existing;
  },

  isValidStatusTransition: async (newStatus, { req }) => {
    const { id } = req.params;
    if (!id) return false;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) return false;

    const validTransitions = {
      Draft: ["Submitted", "Rejected"],
      Submitted: ["Confirmed", "Rejected"],
      Confirmed: ["Shipped", "Rejected"],
      Shipped: ["Completed", "Incompleted", "Rejected"],
      Incompleted: ["Completed", "Rejected"],
      Completed: [],
      Rejected: ["Submitted"],
    };

    return validTransitions[stockRequest.status]?.includes(newStatus) || false;
  },

  hasValidProducts: (products) => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return false;
    }
    return products.every(
      (product) => product.product && product.quantity >= 1
    );
  },

  validateProductApprovals: async (productApprovals, { req }) => {
    if (
      !productApprovals ||
      !Array.isArray(productApprovals) ||
      productApprovals.length === 0
    ) {
      throw new Error(
        "Product approvals are required with approved quantities"
      );
    }

    const { id } = req.params;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      throw new Error("Stock request not found");
    }

    for (const approval of productApprovals) {
      if (!approval.productId || approval.approvedQuantity === undefined) {
        throw new Error(
          "Each product approval must have productId and approvedQuantity"
        );
      }

      const productExists = stockRequest.products.some(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (!productExists) {
        throw new Error(
          `Product with ID ${approval.productId} not found in this stock request`
        );
      }

      const product = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (approval.approvedQuantity > product.quantity) {
        throw new Error(
          `Approved quantity (${approval.approvedQuantity}) cannot be greater than requested quantity (${product.quantity}) for product ${approval.productId}`
        );
      }

      if (approval.approvedQuantity < 0) {
        throw new Error(
          `Approved quantity cannot be negative for product ${approval.productId}`
        );
      }
    }
    return true;
  },

  validateProductReceipts: async (productReceipts, { req }) => {
    if (
      !productReceipts ||
      !Array.isArray(productReceipts) ||
      productReceipts.length === 0
    ) {
      throw new Error("Product receipts are required with received quantities");
    }

    const { id } = req.params;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      throw new Error("Stock request not found");
    }

    for (const receipt of productReceipts) {
      if (!receipt.productId || receipt.receivedQuantity === undefined) {
        throw new Error(
          "Each product receipt must have productId and receivedQuantity"
        );
      }

      const productExists = stockRequest.products.some(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productExists) {
        throw new Error(
          `Product with ID ${receipt.productId} not found in this stock request`
        );
      }

      const product = stockRequest.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (
        receipt.receivedQuantity >
        (product.approvedQuantity || product.quantity)
      ) {
        throw new Error(
          `Received quantity (${
            receipt.receivedQuantity
          }) cannot be greater than approved quantity (${
            product.approvedQuantity || product.quantity
          }) for product ${receipt.productId}`
        );
      }

      if (receipt.receivedQuantity < 0) {
        throw new Error(
          `Received quantity cannot be negative for product ${receipt.productId}`
        );
      }
    }
    return true;
  },

  validateStockAvailability: async (warehouseId, productTransfers) => {
    for (const transfer of productTransfers) {
      const { productId, quantity } = transfer;

      const outletStock = await OutletStock.findOne({
        outlet: warehouseId,
        product: productId,
      });

      if (!outletStock || outletStock.availableQuantity < quantity) {
        const productDoc = await Product.findById(productId);
        const productName = productDoc ? productDoc.productTitle : productId;
        throw new Error(
          `Insufficient stock in outlet for product "${productName}". Required: ${quantity}, Available: ${
            outletStock ? outletStock.availableQuantity : 0
          }`
        );
      }

      const productDoc = await Product.findById(productId);
      if (productDoc?.trackSerialNumber === "Yes") {
        const fifoResult = outletStock.getFIFOStock(quantity);
        if (fifoResult.availableSerials.length < quantity) {
          throw new Error(
            `Insufficient serial numbers available for product ${productDoc.productTitle}. Requested: ${quantity}, Available: ${fifoResult.availableSerials.length}`
          );
        }
      }
    }
    return true;
  },

  isValidDate: (value) => {
    if (!value) return true;
    const date = new Date(value);
    return !isNaN(date.getTime());
  },

  isValidSerialNumbers: async (serialNumbers, { req }) => {
    if (!serialNumbers || !Array.isArray(serialNumbers)) {
      return true;
    }

    const serialSet = new Set(serialNumbers);
    if (serialSet.size !== serialNumbers.length) {
      throw new Error("Duplicate serial numbers in request");
    }

    return true;
  },
};

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
        value: error.value,
      })),
    });
  }
  next();
};

export const validateIdParam = [
  param("id")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid stock request ID format")
    .custom(customValidators.stockRequestExists)
    .withMessage("Stock request not found"),
  handleValidationErrors,
];

export const validateWarehouseParam = [
  param("warehouseId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid warehouse ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Warehouse not found or invalid center type"),
  handleValidationErrors,
];

export const validateCenterParam = [
  param("centerId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format")
    .custom(customValidators.isValidCenter)
    .withMessage("Center not found or invalid center type"),
  handleValidationErrors,
];

export const validateCreateStockRequest = [
  body("warehouse")
    .notEmpty()
    .withMessage("Warehouse is required")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid warehouse ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Warehouse not found or invalid center type"),

  body("center")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format")
    .custom(customValidators.isValidCenter)
    .withMessage("Center not found or invalid center type"),

  body("date")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Date must be a valid date"),

  body("orderNumber")
    .trim()
    .notEmpty()
    .withMessage("Order number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Order number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueOrderNumber)
    .withMessage("Order number already exists"),

  body("remark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Remark must be less than 500 characters"),

  body("products")
    .isArray({ min: 1 })
    .withMessage("At least one product is required")
    .custom(customValidators.hasValidProducts)
    .withMessage("Each product must have product ID and quantity ≥ 1"),

  body("products.*.product")
    .notEmpty()
    .withMessage("Product ID is required")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid product ID format")
    .custom(customValidators.productExists)
    .withMessage("Product not found"),

  body("products.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1"),

  body("products.*.approvedQuantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Approved quantity must be non-negative"),

  body("products.*.receivedQuantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Received quantity must be non-negative"),

  body("status")
    .optional()
    .isIn([
      "Draft",
      "Submitted",
      "Confirmed",
      "Shipped",
      "Incompleted",
      "Completed",
      "Rejected",
    ])
    .withMessage("Invalid status"),

  handleValidationErrors,
];

export const validateUpdateStockRequest = [
  ...validateIdParam,

  body("warehouse")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid warehouse ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Warehouse not found or invalid center type"),

  body("center")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format")
    .custom(customValidators.isValidCenter)
    .withMessage("Center not found or invalid center type"),

  body("date")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Date must be a valid date"),

  body("orderNumber")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Order number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueOrderNumber)
    .withMessage("Order number already exists"),

  body("remark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Remark must be less than 500 characters"),

  body("products")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Products array must contain at least one item")
    .custom(customValidators.hasValidProducts)
    .withMessage("Each product must have product ID and quantity ≥ 1"),

  body("status")
    .optional()
    .isIn([
      "Draft",
      "Submitted",
      "Confirmed",
      "Shipped",
      "Incompleted",
      "Completed",
      "Rejected",
    ])
    .withMessage("Invalid status")
    .custom(customValidators.isValidStatusTransition)
    .withMessage("Invalid status transition"),

  handleValidationErrors,
];

export const validateApproveStockRequest = [
  ...validateIdParam,

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required")
    .custom(customValidators.validateProductApprovals)
    .withMessage("Product approval validation failed"),

  body("approvedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Approved remark must be less than 500 characters"),

  handleValidationErrors,
];

export const validateShipStockRequest = [
  ...validateIdParam,

  body("shippedDate")
    .notEmpty()
    .withMessage("Shipped date is required")
    .custom(customValidators.isValidDate)
    .withMessage("Shipped date must be a valid date"),

  body("expectedDeliveryDate")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Expected delivery date must be a valid date"),

  body("shipmentDetails")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Shipment details must be less than 1000 characters"),

  body("shipmentRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Shipment remark must be less than 500 characters"),

  body("documents")
    .optional()
    .isArray()
    .withMessage("Documents must be an array"),

  handleValidationErrors,
];

export const validateCompleteStockRequest = [
  ...validateIdParam,

  body("productReceipts")
    .isArray({ min: 1 })
    .withMessage("Product receipts are required")
    .custom(customValidators.validateProductReceipts)
    .withMessage("Product receipt validation failed"),

  body("receivedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Received remark must be less than 500 characters"),

  body("markAsIncomplete")
    .optional()
    .isBoolean()
    .withMessage("markAsIncomplete must be a boolean"),

  handleValidationErrors,
];

export const validateCompleteIncompleteRequest = [
  ...validateIdParam,

  body("productApprovals")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Product approvals array must contain at least one item")
    .custom(customValidators.validateProductApprovals)
    .withMessage("Product approval validation failed"),

  body("productReceipts")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Product receipts array must contain at least one item")
    .custom(customValidators.validateProductReceipts)
    .withMessage("Product receipt validation failed"),

  body("approvedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Approved remark must be less than 500 characters"),

  body("receivedRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Received remark must be less than 500 characters"),

  handleValidationErrors,
];

export const validateUpdateApprovedQuantities = [
  ...validateIdParam,

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required")
    .custom(customValidators.validateProductApprovals)
    .withMessage("Product approval validation failed"),

  handleValidationErrors,
];

export const validateStockRequestQuery = [
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
    .isIn([
      "Draft",
      "Submitted",
      "Confirmed",
      "Shipped",
      "Incompleted",
      "Completed",
      "Rejected",
    ])
    .withMessage("Invalid status"),

  query("center")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format"),

  query("warehouse")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid warehouse ID format"),

  query("startDate")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Start date must be a valid date"),

  query("endDate")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("End date must be a valid date"),

  query("createdAtStart")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Created at start must be a valid date"),

  query("createdAtEnd")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Created at end must be a valid date"),

  query("orderNumber")
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage("Order number must be between 1 and 100 characters"),

  query("search")
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),

  query("sortBy")
    .optional()
    .isIn([
      "createdAt",
      "updatedAt",
      "date",
      "orderNumber",
      "status",
      "approvalInfo.approvedAt",
      "shippingInfo.shippedAt",
      "receivingInfo.receivedAt",
    ])
    .withMessage("Invalid sort field"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage('Sort order must be either "asc" or "desc"'),

  handleValidationErrors,
];

export const validateStockTransfer = [
  ...validateIdParam,

  body("productReceipts")
    .isArray({ min: 1 })
    .withMessage("Product receipts are required")
    .custom(customValidators.validateProductReceipts)
    .withMessage("Product receipt validation failed"),

  body("productReceipts.*.serialNumbers")
    .optional()
    .isArray()
    .withMessage("Serial numbers must be an array")
    .custom(customValidators.isValidSerialNumbers)
    .withMessage("Invalid serial numbers provided"),

  handleValidationErrors,
];

export const validateRejectShipment = [
  ...validateIdParam,

  body("rejectionRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Rejection remark must be less than 500 characters"),

  handleValidationErrors,
];

export const validateMarkAsIncomplete = [
  ...validateIdParam,

  body("incompleteRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Incomplete remark must be less than 500 characters"),

  handleValidationErrors,
];

export const validateUpdateShippingInfo = [
  ...validateIdParam,

  body("shippedDate")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Shipped date must be a valid date"),

  body("expectedDeliveryDate")
    .optional()
    .custom(customValidators.isValidDate)
    .withMessage("Expected delivery date must be a valid date"),

  body("shipmentDetails")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Shipment details must be less than 1000 characters"),

  body("shipmentRemark")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Shipment remark must be less than 500 characters"),

  body("documents")
    .optional()
    .isArray()
    .withMessage("Documents must be an array"),

  handleValidationErrors,
];

export default {
  customValidators,
  handleValidationErrors,
  validateIdParam,
  validateCreateStockRequest,
  validateUpdateStockRequest,
  validateApproveStockRequest,
  validateShipStockRequest,
  validateCompleteStockRequest,
  validateCompleteIncompleteRequest,
  validateUpdateApprovedQuantities,
  validateStockRequestQuery,
  validateStockTransfer,
  validateRejectShipment,
  validateMarkAsIncomplete,
  validateUpdateShippingInfo,
};
