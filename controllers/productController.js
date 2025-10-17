import Product from "../models/Product.js";
import ProductCategory from "../models/ProductCategory.js";
import { validationResult } from "express-validator";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

const categoryCache = new Map();

const deleteOldImage = async (imagePath) => {
  if (imagePath && !imagePath.startsWith("http")) {
    const fullPath = path.join(process.cwd(), imagePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.error("Error deleting old image:", error);
    }
  }
};

export const createProduct = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  try {
    let productImage = "";
    if (req.file) {
      productImage = `uploads/products/${req.file.filename}`;
    }

    const productData = {
      ...req.body,
      productImage,
    };

    const product = await Product.create(productData);
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    if (req.file) {
      await deleteOldImage(`uploads/products/${req.file.filename}`);
    }

    const errorResponse = handleProductError(error, req.body);
    res.status(errorResponse.statusCode).json(errorResponse);
  }
};

const handleProductError = (error, bodyData = {}) => {
  let statusCode = 500;
  let message = "Internal server error";

  if (error.code === 11000) {
    statusCode = 409;
    const duplicateField = Object.keys(error.keyPattern || {})[0];
    const duplicateValue = bodyData[duplicateField];

    message =
      duplicateField === "productCode"
        ? `Product code ${duplicateValue} is already in use. Please choose a different code.`
        : `This ${duplicateField} already exists in the system.`;
  } else if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Invalid product data provided";
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid data format";
  }

  return {
    success: false,
    message,
    statusCode,
    ...(process.env.NODE_ENV === "development" && { debug: error.message }),
  };
};


const buildSearchFilters = (queryParams) => {
  const {
    search,
    category,
    status,
    minPrice,
    maxPrice,
    trackSerialNumber,
    repairable,
    replaceable,
  } = queryParams;

  const filters = {};

  if (search) {
    filters.$or = [
      { productTitle: { $regex: search, $options: "i" } },
      { productCode: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { productBarcode: { $regex: search, $options: "i" } },
      { "productCategory.productCategory": { $regex: search, $options: "i" } },
      { "productCategory.categoryCode": { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    if (Array.isArray(status)) {
      filters.status = { $in: status };
    } else if (status.includes(",")) {
      filters.status = { $in: status.split(",").map((s) => s.trim()) };
    } else if (["Enable", "Disable"].includes(status)) {
      filters.status = status;
    }
  }

  if (minPrice || maxPrice) {
    filters.productPrice = {};
    if (minPrice) filters.productPrice.$gte = Number(minPrice);
    if (maxPrice) filters.productPrice.$lte = Number(maxPrice);
  }

  if (trackSerialNumber && ["Yes", "No"].includes(trackSerialNumber)) {
    filters.trackSerialNumber = trackSerialNumber;
  }

  if (repairable && ["Yes", "No"].includes(repairable)) {
    filters.repairable = repairable;
  }

  if (replaceable && ["Yes", "No"].includes(replaceable)) {
    filters.replaceable = replaceable;
  }

  return filters;
};

const getCategoryId = async (category) => {
  try {
    const ProductCategory = mongoose.model("ProductCategory");

    if (!category) return null;

    if (mongoose.Types.ObjectId.isValid(category)) {
      const categoryById = await ProductCategory.findById(category);
      if (categoryById) return categoryById._id;
    }

    const categoryByName = await ProductCategory.findOne({
      $or: [
        { productCategory: { $regex: category, $options: "i" } },
        { categoryCode: { $regex: category, $options: "i" } },
      ],
    });

    return categoryByName ? categoryByName._id : null;
  } catch (error) {
    console.error("Error getting category ID:", error);
    return null;
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      status,
      minPrice,
      maxPrice,
      trackSerialNumber,
      repairable,
      replaceable,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filters = buildSearchFilters({
      search,
      status,
      minPrice,
      maxPrice,
      trackSerialNumber,
      repairable,
      replaceable,
    });

    if (category) {
      const categoryId = await getCategoryId(category);

      if (categoryId) {
        filters.productCategory = categoryId;
      } else {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
      }
    }

    const skip = (page - 1) * limit;

    const validSortFields = [
      "createdAt",
      "updatedAt",
      "productTitle",
      "productCode",
      "productPrice",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    const sort = { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };

    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(filters),
      Product.find(filters)
        .populate("productCategory", "productCategory categoryCode description")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v"),
    ]);

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "productCategory",
      "productCategory"
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProduct = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      if (req.file) {
        await deleteOldImage(`uploads/products/${req.file.filename}`);
      }
      return res.status(404).json({ message: "Product not found" });
    }
    let productImage = product.productImage;
    if (req.file) {
      if (product.productImage) {
        await deleteOldImage(product.productImage);
      }
      productImage = `uploads/products/${req.file.filename}`;
    }

    const updateData = {
      ...req.body,
      productImage,
    };

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: updatedProduct });
  } catch (error) {
    if (req.file) {
      await deleteOldImage(`uploads/products/${req.file.filename}`);
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
