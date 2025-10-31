// import { body } from "express-validator";
// export const createProductValidator = [
//   body("productCategory")
//     .notEmpty()
//     .withMessage("Product category is required"),
//   body("productTitle").notEmpty().withMessage("Product title is required"),
//   body("productCode")
//     .optional()
//     .isString()
//     .withMessage("Product code must be a string"),
//   body("productPrice")
//     .optional()
//     .isNumeric()
//     .withMessage("Product price must be a number"),
//   body("status")
//     .optional()
//     .isIn(["Enable", "Disable"])
//     .withMessage("Status must be either Enable or Disable"),
//   body("trackSerialNumber")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Track Serial Number must be Yes or No"),
//   body("repairable")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Repairable must be Yes or No"),
//   body("replaceable")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Replaceable must be Yes or No"),
// ];

// export const updateProductValidator = [
//   body("productCategory").optional(),
//   body("productTitle").optional(),
//   body("productCode").optional(),
//   body("productPrice").optional().isNumeric(),
//   body("status")
//     .optional()
//     .isIn(["Enable", "Disable"])
//     .withMessage("Status must be either Enable or Disable"),
//   body("trackSerialNumber")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Track Serial Number must be Yes or No"),
//   body("repairable")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Repairable must be Yes or No"),
//   body("replaceable")
//     .optional()
//     .isIn(["Yes", "No"])
//     .withMessage("Replaceable must be Yes or No"),
// ];




import { body } from "express-validator";
import mongoose from "mongoose";
export const createProductValidator = [
  body("productCategory")
    .notEmpty()
    .withMessage("Product category is required"),
  body("productTitle")
    .notEmpty()
    .withMessage("Product title is required")
    .custom(async (value, { req }) => {
      const Product = mongoose.model("Product");
      const existingProduct = await Product.findOne({ 
        productTitle: value,
        ...(req.params.id && { _id: { $ne: req.params.id } })
      });
      if (existingProduct) {
        throw new Error("Product already exists");
      }
      return true;
    }),
  body("productCode")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product code must be a string"),
  body("productPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Product price must be a valid number"),
  body("productWeight")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product weight must be a string"),
  body("productBarcode")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product barcode must be a string"),
  body("description")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Description must be a string"),
  body("status")
    .optional()
    .isIn(["Enable", "Disable"])
    .withMessage("Status must be either Enable or Disable"),
  body("trackSerialNumber")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Track Serial Number must be Yes or No"),
  body("repairable")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Repairable must be Yes or No"),
  body("replaceable")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Replaceable must be Yes or No"),
];

export const updateProductValidator = [
  body("productCategory").optional(),
  body("productTitle")
    .optional()
    .custom(async (value, { req }) => {
      if (value) {
        const Product = mongoose.model("Product");
        const existingProduct = await Product.findOne({ 
          productTitle: value,
          _id: { $ne: req.params.id }
        });
        if (existingProduct) {
          throw new Error("Product title already exists");
        }
      }
      return true;
    }),
  body("productCode")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product code must be a string"),
  body("productPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Product price must be a valid number"),
  body("productWeight")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product weight must be a string"),
  body("productBarcode")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Product barcode must be a string"),
  body("description")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Description must be a string"),
  body("status")
    .optional()
    .isIn(["Enable", "Disable"])
    .withMessage("Status must be either Enable or Disable"),
  body("trackSerialNumber")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Track Serial Number must be Yes or No"),
  body("repairable")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Repairable must be Yes or No"),
  body("replaceable")
    .optional()
    .isIn(["Yes", "No"])
    .withMessage("Replaceable must be Yes or No"),
];