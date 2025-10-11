import { body, param, query, validationResult } from "express-validator";
import StockPurchase from "../models/StockPurchase.js";
import OutletStock from "../models/OutletStock.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import Vendor from "../models/Vendor.js";
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

  productExists: async (productId) => {
    if (!productId) return false;
    const product = await Product.findById(productId);
    return !!product;
  },

  isValidOutletSerial: async (serialNumber, { req }) => {
    if (!serialNumber) return false;

    const { outletId, productId } = req.params;
    const outletStock = await OutletStock.findOne({
      outlet: outletId,
      product: productId,
      "serialNumbers.serialNumber": serialNumber,
      "serialNumbers.status": "available",
    });

    return !!outletStock;
  },

  isValidCenterSerial: async (serialNumber, { req }) => {
    if (!serialNumber) return false;

    const { centerId, productId } = req.params;
    const centerStock = await CenterStock.findOne({
      center: centerId,
      product: productId,
      "serialNumbers.serialNumber": serialNumber,
      "serialNumbers.status": "available",
    });

    return !!centerStock;
  },

  isUniqueSerial: async (newSerialNumber, { req }) => {
    if (!newSerialNumber) return false;

    const outletExists = await OutletStock.findOne({
      "serialNumbers.serialNumber": newSerialNumber,
    });

    const centerExists = await CenterStock.findOne({
      "serialNumbers.serialNumber": newSerialNumber,
    });

    const purchaseExists = await StockPurchase.findOne({
      "products.serialNumbers.serialNumber": newSerialNumber,
    });

    return !outletExists && !centerExists && !purchaseExists;
  },

  isValidSerialNumbers: async (serialNumbers, { req }) => {
    if (!serialNumbers || !Array.isArray(serialNumbers)) {
      throw new Error("Serial numbers must be an array");
    }

    if (serialNumbers.length === 0) {
      throw new Error("At least one serial number is required");
    }

    const serialSet = new Set(serialNumbers);
    if (serialSet.size !== serialNumbers.length) {
      throw new Error("Duplicate serial numbers in request");
    }

    return true;
  },

  vendorExists: async (vendorId) => {
    if (!vendorId) return false;
    const vendor = await Vendor.findById(vendorId);
    return !!vendor;
  },

  isValidCenter: async (centerId) => {
    if (!centerId) return false;
    const center = await Center.findById(centerId);
    return center && center.centerType !== "Outlet";
  },

  isUniqueInvoice: async (invoiceNo, { req }) => {
    if (!invoiceNo) return false;

    const filter = {
      invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, "i") },
    };

    if (req.params.id) {
      filter._id = { $ne: req.params.id };
    }

    const existing = await StockPurchase.findOne(filter);
    return !existing;
  },

  isValidProducts: (products) => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return false;
    }
    return products.every(
      (product) =>
        product.product && product.price >= 0 && product.purchasedQuantity >= 1
    );
  },

  validateSerialNumbers: async (products) => {
    if (!products || !Array.isArray(products)) return true;

    for (const product of products) {
      if (!product.product) continue;

      const productDoc = await Product.findById(product.product);
      if (!productDoc) continue;

      if (productDoc.trackSerialNumber === "Yes") {
        if (!product.serialNumbers || !Array.isArray(product.serialNumbers)) {
          throw new Error(
            `Product "${productDoc.productTitle}" requires serial numbers`
          );
        }

        if (product.serialNumbers.length !== product.purchasedQuantity) {
          throw new Error(
            `Product "${productDoc.productTitle}" requires exactly ${product.purchasedQuantity} serial numbers`
          );
        }

        const serialNumbers = product.serialNumbers.map((serial) =>
          typeof serial === "string" ? serial : serial.serialNumber
        );

        const serialSet = new Set(serialNumbers);
        if (serialSet.size !== serialNumbers.length) {
          throw new Error(
            `Duplicate serial numbers found for product: ${productDoc.productTitle}`
          );
        }

        const existingSerials = await StockPurchase.find({
          "products.product": product.product,
          "products.serialNumbers.serialNumber": { $in: serialNumbers },
        });

        if (existingSerials.length > 0) {
          throw new Error(
            `Some serial numbers already exist in other purchases for product: ${productDoc.productTitle}`
          );
        }
      } else {
        if (product.serialNumbers && product.serialNumbers.length > 0) {
          throw new Error(
            `Product "${productDoc.productTitle}" does not require serial number tracking`
          );
        }
      }
    }
    return true;
  },
};

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: firstError.msg,
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
        value: error.value,
      })),
    });
  }
  next();
};

export const validateCreateStockPurchase = [
  body("type")
    .optional()
    .isIn(["new", "refurbish"])
    .withMessage('Type must be either "new" or "refurbish"'),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("invoiceNo")
    .trim()
    .notEmpty()
    .withMessage("Invoice number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Invoice number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueInvoice)
    .withMessage("Invoice number already exists"),

  body("vendor")
    .notEmpty()
    .withMessage("Vendor is required")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid vendor ID format")
    .custom(customValidators.vendorExists)
    .withMessage("Vendor not found"),

  body("outlet")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Outlet not found or invalid center type"),

  body("transportAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Transport amount must be a non-negative number"),

  body("cgst")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("CGST must be a non-negative number"),

  body("sgst")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("SGST must be a non-negative number"),

  body("igst")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("IGST must be a non-negative number"),

  body("products")
    .isArray({ min: 1 })
    .withMessage("At least one product is required")
    .custom(customValidators.isValidProducts)
    .withMessage(
      "Each product must have product ID, non-negative price, and quantity ≥ 1"
    )
    .custom(customValidators.validateSerialNumbers)
    .withMessage("Serial number validation failed"),

  body("products.*.product")
    .notEmpty()
    .withMessage("Product ID is required")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid product ID format")
    .custom(customValidators.productExists)
    .withMessage("Product not found"),

  body("products.*.price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a non-negative number"),

  body("products.*.purchasedQuantity")
    .isInt({ min: 1 })
    .withMessage("Purchased quantity must be at least 1"),

  handleValidationErrors,
];

export const validateUpdateStockPurchase = [
  param("id")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid stock purchase ID format"),

  body("type")
    .optional()
    .isIn(["new", "refurbish"])
    .withMessage('Type must be either "new" or "refurbish"'),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("invoiceNo")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Invoice number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueInvoice)
    .withMessage("Invoice number already exists"),

  body("vendor")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid vendor ID format")
    .custom(customValidators.vendorExists)
    .withMessage("Vendor not found"),

  body("outlet")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Outlet not found or invalid center type"),

  body("transportAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Transport amount must be a non-negative number"),

  body("products")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Products array must contain at least one item")
    .custom(customValidators.isValidProducts)
    .withMessage(
      "Each product must have product ID, non-negative price, and quantity ≥ 1"
    )
    .custom(customValidators.validateSerialNumbers)
    .withMessage("Serial number validation failed"),

  handleValidationErrors,
];

export const validateIdParam = [
  param("id")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid ID format"),
  handleValidationErrors,
];

export const validateVendorIdParam = [
  param("vendorId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid vendor ID format")
    .custom(customValidators.vendorExists)
    .withMessage("Vendor not found"),
  handleValidationErrors,
];

export const validateOutletIdParam = [
  param("outletId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Outlet not found or invalid center type"),
  handleValidationErrors,
];

export const validateCenterIdParam = [
  param("centerId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format")
    .custom(customValidators.isValidCenter)
    .withMessage("Center not found or invalid center type"),
  handleValidationErrors,
];

export const validateStockPurchaseQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  query("type")
    .optional()
    .isIn(["new", "refurbish"])
    .withMessage('Type must be either "new" or "refurbish"'),

  query("vendor")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid vendor ID format"),

  query("outlet")
    .optional()
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid ISO 8601 date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid ISO 8601 date"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "updatedAt", "date", "invoiceNo", "totalAmount"])
    .withMessage("Invalid sort field"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage('Sort order must be either "asc" or "desc"'),

  handleValidationErrors,
];

export const validateProductQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  query("search")
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),

  handleValidationErrors,
];

export const validateStockAvailabilityParams = [
  param("outletId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Outlet not found or invalid center type"),

  param("productId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid product ID format")
    .custom(customValidators.productExists)
    .withMessage("Product not found"),

  handleValidationErrors,
];

export const validateOutletSerialParams = [
  param("outletId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid outlet ID format")
    .custom(customValidators.isValidOutlet)
    .withMessage("Outlet not found or invalid center type"),

  param("productId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid product ID format")
    .custom(customValidators.productExists)
    .withMessage("Product not found"),

  handleValidationErrors,
];

export const validateUpdateOutletSerial = [
  ...validateOutletSerialParams,

  param("serialNumber")
    .notEmpty()
    .withMessage("Serial number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Serial number must be between 1 and 100 characters")
    .custom(customValidators.isValidOutletSerial)
    .withMessage("Serial number not found or not available"),

  body("newSerialNumber")
    .notEmpty()
    .withMessage("New serial number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("New serial number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueSerial)
    .withMessage("New serial number already exists in the system"),

  handleValidationErrors,
];

export const validateDeleteOutletSerial = [
  ...validateOutletSerialParams,

  param("serialNumber")
    .notEmpty()
    .withMessage("Serial number is required")
    .custom(customValidators.isValidOutletSerial)
    .withMessage("Serial number not found or not available"),

  handleValidationErrors,
];

export const validateBulkOutletSerialOperations = [
  ...validateOutletSerialParams,

  body("serialNumbers")
    .isArray({ min: 1 })
    .withMessage("Serial numbers array is required with at least one item")
    .custom(customValidators.isValidSerialNumbers)
    .withMessage("Invalid serial numbers provided"),

  handleValidationErrors,
];

export const validateCenterSerialParams = [
  param("centerId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid center ID format")
    .custom(customValidators.isValidCenter)
    .withMessage("Center not found"),

  param("productId")
    .custom(customValidators.isObjectId)
    .withMessage("Invalid product ID format")
    .custom(customValidators.productExists)
    .withMessage("Product not found"),

  handleValidationErrors,
];

export const validateUpdateCenterSerial = [
  ...validateCenterSerialParams,

  param("serialNumber")
    .notEmpty()
    .withMessage("Serial number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Serial number must be between 1 and 100 characters")
    .custom(customValidators.isValidCenterSerial)
    .withMessage("Serial number not found or not available"),

  body("newSerialNumber")
    .notEmpty()
    .withMessage("New serial number is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("New serial number must be between 1 and 100 characters")
    .custom(customValidators.isUniqueSerial)
    .withMessage("New serial number already exists in the system"),

  handleValidationErrors,
];

export const validateDeleteCenterSerial = [
  ...validateCenterSerialParams,

  param("serialNumber")
    .notEmpty()
    .withMessage("Serial number is required")
    .custom(customValidators.isValidCenterSerial)
    .withMessage("Serial number not found or not available"),

  handleValidationErrors,
];
