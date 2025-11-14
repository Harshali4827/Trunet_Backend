import Product from "../models/Product.js";
;
import { validationResult } from "express-validator";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import csv from 'csv-parser';
import stream from 'stream';
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
      limit = 100,
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


export const downloadCSVTemplate = async (req, res) => {
  try {
    const csvHeaders = [
      'productCategory',
      'productTitle',
      'productCode',
      'productPrice',
      'salePrice',
      'hsnCode',
      'productWeight',
      'productBarcode',
      'status',
      'description',
      'trackSerialNumber',
      'repairable',
      'replaceable'
    ];

    // Create sample data
    const sampleData = [
      {
        productCategory: 'Electronics',
        productTitle: 'Sample Product 1',
        productCode: 'PROD001',
        productPrice: '1000',
        salePrice: '900',
        hsnCode: '85171200',
        productWeight: '1.5kg',
        productBarcode: '1234567890123',
        status: 'Enable',
        description: 'Sample product description',
        trackSerialNumber: 'Yes',
        repairable: 'Yes',
        replaceable: 'No'
      },
      {
        productCategory: 'Clothing',
        productTitle: 'Sample Product 2',
        productCode: 'PROD002',
        productPrice: '500',
        salePrice: '450',
        hsnCode: '61102000',
        productWeight: '0.2kg',
        productBarcode: '1234567890124',
        status: 'Enable',
        description: 'Another sample product',
        trackSerialNumber: 'No',
        repairable: 'No',
        replaceable: 'Yes'
      }
    ];

    // Convert to CSV
    let csvContent = csvHeaders.join(',') + '\n';
    
    sampleData.forEach(row => {
      const rowData = csvHeaders.map(header => {
        const value = row[header] || '';
        // Handle values that might contain commas
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      csvContent += rowData.join(',') + '\n';
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=product_bulk_upload_template.csv');
    
    res.send(csvContent);

  } catch (error) {
    console.error('Error generating CSV template:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating CSV template',
      error: error.message
    });
  }
};

const getOrCreateCategory = async (categoryName) => {
  try {
    if (!categoryName || typeof categoryName !== 'string') {
      throw new Error('Invalid category name');
    }

    const ProductCategory = mongoose.model("ProductCategory");
    const trimmedCategoryName = categoryName.trim();

    if (!trimmedCategoryName) {
      throw new Error('Category name cannot be empty');
    }

    // Check cache first
    if (categoryCache.has(trimmedCategoryName.toLowerCase())) {
      return categoryCache.get(trimmedCategoryName.toLowerCase());
    }

    // Find existing category (case-insensitive)
    let category = await ProductCategory.findOne({
      productCategory: { $regex: `^${trimmedCategoryName}$`, $options: 'i' }
    });

    // If not found, create new category
    if (!category) {
      try {
        category = await ProductCategory.create({
          productCategory: trimmedCategoryName,
          remark: `Auto-created during bulk import`
        });
      } catch (createError) {
        // Handle duplicate category creation race condition
        if (createError.code === 11000) {
          category = await ProductCategory.findOne({
            productCategory: { $regex: `^${trimmedCategoryName}$`, $options: 'i' }
          });
        } else {
          throw createError;
        }
      }
    }

    // Cache the result
    categoryCache.set(trimmedCategoryName.toLowerCase(), category._id);
    return category._id;

  } catch (error) {
    console.error(`Error processing category "${categoryName}":`, error);
    throw error;
  }
};

// Validate product data
const validateProductData = (productData) => {
  const errors = [];

  if (!productData.productTitle || productData.productTitle.trim() === '') {
    errors.push('Product title is required');
  }

  if (!productData.productCategory || productData.productCategory.trim() === '') {
    errors.push('Product category is required');
  }

  if (!productData.productPrice || isNaN(parseFloat(productData.productPrice))) {
    errors.push('Valid product price is required');
  }

  if (!productData.salePrice || isNaN(parseFloat(productData.salePrice))) {
    errors.push('Valid sale price is required');
  }

  if (!productData.hsnCode || productData.hsnCode.trim() === '') {
    errors.push('HSN code is required');
  }

  // Validate enum fields
  const validStatus = ['Enable', 'Disable'];
  if (productData.status && !validStatus.includes(productData.status)) {
    errors.push(`Status must be one of: ${validStatus.join(', ')}`);
  }

  const validSerialNumber = ['Yes', 'No'];
  if (productData.trackSerialNumber && !validSerialNumber.includes(productData.trackSerialNumber)) {
    errors.push(`Track serial number must be one of: ${validSerialNumber.join(', ')}`);
  }

  const validRepairable = ['Yes', 'No'];
  if (productData.repairable && !validRepairable.includes(productData.repairable)) {
    errors.push(`Repairable must be one of: ${validRepairable.join(', ')}`);
  }

  const validReplaceable = ['Yes', 'No'];
  if (productData.replaceable && !validReplaceable.includes(productData.replaceable)) {
    errors.push(`Replaceable must be one of: ${validReplaceable.join(', ')}`);
  }

  return errors;
};

const processCSVData = (csvData) => {
  return new Promise((resolve, reject) => {
    const results = [];

    const readableStream = new stream.Readable();
    readableStream.push(csvData);
    readableStream.push(null);

    readableStream
      .pipe(csv())
      .on('data', (data) => {
        results.push(data);
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

export const bulkImportProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    if (!req.file.mimetype.includes('csv') && !req.file.originalname.endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a valid CSV file'
      });
    }

    // Process CSV file from memory buffer
    const parsedData = await processCSVData(req.file.buffer.toString());

    if (parsedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or could not be parsed'
      });
    }

    const results = {
      total: parsedData.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    const productsToInsert = [];

    // Process each row
    for (let i = 0; i < parsedData.length; i++) {
      const row = parsedData[i];
      const rowNumber = i + 2; // +2 because header is row 1 and array index starts at 0

      try {
        // Validate required fields
        const validationErrors = validateProductData(row);
        if (validationErrors.length > 0) {
          results.errors.push({
            row: rowNumber,
            data: row,
            errors: validationErrors
          });
          results.failed++;
          continue;
        }

        // Get or create category
        const categoryId = await getOrCreateCategory(row.productCategory);

        // Prepare product data
        const productData = {
          productCategory: categoryId,
          productTitle: row.productTitle ? row.productTitle.toString().trim() : '',
          productCode: row.productCode ? row.productCode.toString().trim() : undefined,
          productPrice: parseFloat(row.productPrice),
          salePrice: parseFloat(row.salePrice),
          hsnCode: row.hsnCode ? row.hsnCode.toString().trim() : '',
          productWeight: row.productWeight ? row.productWeight.toString().trim() : '',
          productBarcode: row.productBarcode ? row.productBarcode.toString().trim() : '',
          status: row.status || 'Enable',
          description: row.description ? row.description.toString().trim() : '',
          trackSerialNumber: row.trackSerialNumber || 'No',
          repairable: row.repairable || 'No',
          replaceable: row.replaceable || 'No'
        };

        productsToInsert.push(productData);
        results.successful++;

      } catch (error) {
        results.errors.push({
          row: rowNumber,
          data: row,
          errors: [error.message]
        });
        results.failed++;
      }
    }

    // Insert all valid products
    if (productsToInsert.length > 0) {
      try {
        await Product.insertMany(productsToInsert, { ordered: false });
      } catch (insertError) {
        if (insertError.code === 11000) {
          // Handle duplicate product codes
          results.errors.push({
            row: 'Multiple',
            data: {},
            errors: ['Some products have duplicate product codes']
          });
          // Update successful count by subtracting failed duplicates
          const insertedCount = insertError.insertedDocs ? insertError.insertedDocs.length : 0;
          results.successful = insertedCount;
          results.failed = results.total - insertedCount;
        } else {
          throw insertError;
        }
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: `Bulk import completed. Successful: ${results.successful}, Failed: ${results.failed}`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed
      }
    };

    // Include errors if any
    if (results.errors.length > 0) {
      response.errors = results.errors;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in bulk import:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk import',
      error: error.message
    });
  }
};



