import RepairCost from "../models/RepairCost.js";
import Product from "../models/Product.js";
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export const getAllRepairCosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};
    const [repairCosts, total] = await Promise.all([
      RepairCost.find(filter)
        .populate({
          path: "product",
          select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
        })
        .populate("createdBy", "_id fullName email")
        .populate("updatedBy", "_id fullName email")
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),

      RepairCost.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: "Repair costs retrieved successfully",
      data: repairCosts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error retrieving repair costs:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair costs",
      error: error.message
    });
  }
};
export const getRepairCostById = async (req, res) => {
  try {
    const { id } = req.params;

    const repairCost = await RepairCost.findById(id)
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .lean();

    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }
    
    console.error("Error retrieving repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair cost",
      error: error.message
    });
  }
};

export const getRepairCostByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const repairCost = await RepairCost.findOne({ product: productId })
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .lean();

    if (!repairCost) {
      return res.status(200).json({
        success: true,
        message: "No specific repair cost found for this product. Using default.",
        data: {
          product: product,
          repairCost: 150,
          isDefault: true
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }
    
    console.error("Error retrieving repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair cost",
      error: error.message
    });
  }
};

export const createRepairCost = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { product, repairCost} = req.body;

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    if (!repairCost || repairCost < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid repair cost (greater than or equal to 0) is required"
      });
    }

    const productExists = await Product.findById(product);
    if (!productExists) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const existingRepairCost = await RepairCost.findOne({ product });
    if (existingRepairCost) {
      return res.status(400).json({
        success: false,
        message: "Repair cost already exists for this product. Use update instead."
      });
    }
    const newRepairCost = new RepairCost({
      product,
      repairCost: parseFloat(repairCost),
      createdBy: userId,
      updatedBy: userId
    });

    await newRepairCost.save();

    const populatedRepairCost = await RepairCost.findById(newRepairCost._id)
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(201).json({
      success: true,
      message: "Repair cost created successfully",
      data: populatedRepairCost
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Repair cost already exists for this product"
      });
    }

    console.error("Error creating repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error creating repair cost",
      error: error.message
    });
  }
};

export const updateRepairCost = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { id } = req.params;
    const { repairCost} = req.body;

    const existingRepairCost = await RepairCost.findById(id);
    if (!existingRepairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    if (repairCost !== undefined && repairCost < 0) {
      return res.status(400).json({
        success: false,
        message: "Repair cost must be greater than or equal to 0"
      });
    }
    const updateData = {
      updatedBy: userId,
      updatedAt: new Date()
    };

    if (repairCost !== undefined) {
      updateData.repairCost = parseFloat(repairCost);
    }
    const updatedRepairCost = await RepairCost.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Repair cost updated successfully",
      data: updatedRepairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors
      });
    }

    console.error("Error updating repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error updating repair cost",
      error: error.message
    });
  }
};

export const deleteRepairCost = async (req, res) => {
  try {
    const { id } = req.params;

    const repairCost = await RepairCost.findById(id);
    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    await RepairCost.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Repair cost deleted successfully"
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    console.error("Error deleting repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting repair cost",
      error: error.message
    });
  }
};


//////////*************** Bulk Upload Data ************************/



// export const downloadRepairCostTemplate = async (req, res) => {
//   try {
//     const csvHeaders = [
//       'productTitle',
//       'repairCost',
//     ];

//     // Get sample products from database for the template
//     const sampleProducts = await Product.find({})
//       .select('productTitle')
//       .limit(2)
//       .lean();

//     // Create sample data with actual product titles
//     const sampleData = sampleProducts.map((product, index) => ({
//       productTitle: product.productTitle,
//       repairCost: (100 + (index * 50)).toFixed(2)
//     }));

//     // If no products in DB, use generic examples
//     if (sampleData.length === 0) {
//       sampleData.push(
//         { productTitle: 'iPhone 14 Pro Max', repairCost: '250.00' },
//         { productTitle: 'Samsung Galaxy S23', repairCost: '150.00' },
//         { productTitle: 'MacBook Air M2', repairCost: '350.00' },
//         { productTitle: 'Sony WH-1000XM4', repairCost: '120.00' },
//         { productTitle: 'Dell XPS 13', repairCost: '280.00' }
//       );
//     }

//     // Convert to CSV
//     let csvContent = csvHeaders.join(',') + '\n';
    
//     sampleData.forEach(row => {
//       const rowData = csvHeaders.map(header => {
//         const value = row[header] || '';
//         // Handle values that might contain commas
//         return `"${value.toString().replace(/"/g, '""')}"`;
//       });
//       csvContent += rowData.join(',') + '\n';
//     });

//     // Set headers for file download
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', 'attachment; filename=repair_costs_template.csv');
    
//     res.send(csvContent);

//   } catch (error) {
//     console.error('Error generating CSV template:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error generating CSV template',
//       error: error.message
//     });
//   }
// };



export const downloadRepairCostTemplate = async (req, res) => {
  try {
    const csvHeaders = [
      'Product Title',
      'Repair Cost'
    ];
    const sampleProducts = await Product.find({})
      .select('productTitle')
      .limit(3)
      .lean();

    let sampleData = sampleProducts.map((product, index) => ({
      'Product Title': product.productTitle,
      'Repair Cost': (100 + index * 50).toFixed(2)
    }));

    if (sampleData.length === 0) {
      sampleData = [
        { 'Product Title': 'iPhone 14 Pro Max', 'Repair Cost': '250.00' },
        { 'Product Title': 'Samsung Galaxy S23', 'Repair Cost': '150.00' },
        { 'Product Title': 'MacBook Air M2', 'Repair Cost': '350.00' },
        { 'Product Title': 'Sony WH-1000XM4', 'Repair Cost': '120.00' },
        { 'Product Title': 'Dell XPS 13', 'Repair Cost': '280.00' }
      ];
    }
    let csvContent = csvHeaders.join(',') + '\n';

    sampleData.forEach(row => {
      const rowData = csvHeaders.map(header => {
        const value = row[header] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      csvContent += rowData.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Repair_Cost_Import_Template.csv'
    );

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



const validateRepairCostData = (repairCostData) => {
  const errors = [];

  if (!repairCostData.productTitle || repairCostData.productTitle.trim() === '') {
    errors.push('Product Name is required');
  }

  if (!repairCostData.repairCost || repairCostData.repairCost.trim() === '') {
    errors.push('Repair Cost is required');
  } else {
    const repairCostValue = parseFloat(repairCostData.repairCost);
    if (isNaN(repairCostValue)) {
      errors.push('Repair Cost must be a valid number');
    } else if (repairCostValue < 0) {
      errors.push('Repair Cost cannot be negative');
    }
  }

  return errors;
};

export const bulkImportRepairCosts = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const file = req.file;
    let repairCostsData = [];
    let errors = [];
    let successCount = 0;
    let failedCount = 0;
    
    const processedProductTitles = new Set();

    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      try {
        await new Promise((resolve, reject) => {
          const stream = Readable.from(file.buffer.toString());
          stream
            .pipe(csvParser())
            .on('data', (row) => {
              // const mappedRow = {
              //   productTitle: row.productTitle,
              //   repairCost: row.repairCost
              // };

              const mappedRow = {
                productTitle: row['Product Title'],
                repairCost: row['Repair Cost']
              };
              
              repairCostsData.push(mappedRow);
            })
            .on('end', resolve)
            .on('error', reject);
        });
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Error reading CSV file. Please ensure it's a valid CSV file.",
          error: error.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Please upload CSV (.csv) file only.",
      });
    }

    const firstRow = repairCostsData[0];
    
    if (!firstRow) {
      return res.status(400).json({
        success: false,
        message: "The file appears to be empty or has no valid data rows.",
      });
    }
    const requiredFields = ['productTitle', 'repairCost'];
    const missingFields = requiredFields.filter(field => !firstRow[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields in CSV: ${missingFields.join(', ')}`,
        requiredFormat: "Product Title, Repair Cost",
        note: "Please use the downloaded CSV template. Header names must match exactly."
      });
    }

    const productCache = new Map();
    
    const findProductByTitle = async (productTitle) => {
      const trimmedTitle = productTitle.trim();
      
      if (productCache.has(trimmedTitle.toLowerCase())) {
        return productCache.get(trimmedTitle.toLowerCase());
      }
      
      try {
        let product = await Product.findOne({ 
          productTitle: { $regex: new RegExp(`^${trimmedTitle}$`, 'i') }
        });
        
        if (!product) {
          product = await Product.findOne({ 
            productTitle: { $regex: trimmedTitle, $options: 'i' }
          });
        }
        
        productCache.set(trimmedTitle.toLowerCase(), product);
        return product;
      } catch (error) {
        console.error(`Error finding product "${productTitle}":`, error);
        return null;
      }
    };

    const existingProductTitles = new Set();
    
    if (repairCostsData.length > 1000) {
      console.log(`Fetching existing products for large import...`);
      
      const uniqueProductTitles = [...new Set(
        repairCostsData
          .map(row => row.productTitle?.toString().trim())
          .filter(title => title && title !== '')
      )];
      
      const products = await Product.find({
        productTitle: { 
          $in: uniqueProductTitles.map(title => new RegExp(`^${title}$`, 'i'))
        }
      });
      
      products.forEach(product => {
        productCache.set(product.productTitle.toLowerCase(), product);
        existingProductTitles.add(product.productTitle.toLowerCase());
      });
      
      console.log(`Pre-cached ${products.length} products from database`);
    }

    const existingRepairCostsMap = new Map();
    
    if (repairCostsData.length > 1000 && productCache.size > 0) {
      console.log(`Fetching existing repair costs for large import...`);
      const existingRepairCosts = await RepairCost.find({
        product: { $in: Array.from(productCache.values()).map(p => p._id) }
      });
      
      existingRepairCosts.forEach(rc => {
        existingRepairCostsMap.set(rc.product.toString(), rc);
      });
      
      console.log(`Found ${existingRepairCosts.length} existing repair costs`);
    }

    for (let i = 0; i < repairCostsData.length; i++) {
      const row = repairCostsData[i];
      const rowNumber = i + 2;

      try {
        const processedRow = {};
        Object.keys(row).forEach(key => {
          if (typeof row[key] === 'string') {
            processedRow[key] = row[key].trim();
          } else if (row[key] !== null && row[key] !== undefined) {
            processedRow[key] = row[key];
          }
        });

        const productTitle = processedRow.productTitle;
        const repairCostValue = parseFloat(processedRow.repairCost);

        const validationErrors = validateRepairCostData(processedRow);
        if (validationErrors.length > 0) {
          errors.push({
            row: rowNumber,
            productTitle: productTitle || 'N/A',
            error: validationErrors.join(', ')
          });
          failedCount++;
          continue;
        }

        if (processedProductTitles.has(productTitle.toLowerCase())) {
          errors.push({
            row: rowNumber,
            productTitle,
            error: `Duplicate product '${productTitle}' in the same import file. Only the first occurrence will be processed.`
          });
          failedCount++;
          continue;
        }
        
        processedProductTitles.add(productTitle.toLowerCase());

        let product;
        
        if (repairCostsData.length > 1000) {
          product = productCache.get(productTitle.toLowerCase());
        } else {

          product = await findProductByTitle(productTitle);
        }

        if (!product) {
          errors.push({
            row: rowNumber,
            productTitle,
            error: `Product not found: "${productTitle}". Please check the product name.`
          });
          failedCount++;
          continue;
        }

        let existingRepairCost;
        
        if (repairCostsData.length > 1000) {
          existingRepairCost = existingRepairCostsMap.get(product._id.toString());
        } else {
          existingRepairCost = await RepairCost.findOne({ product: product._id });
        }

        if (existingRepairCost) {
          await RepairCost.findByIdAndUpdate(
            existingRepairCost._id,
            {
              repairCost: repairCostValue,
              updatedBy: userId,
              updatedAt: new Date()
            },
            { new: true, runValidators: true }
          );
        } else {
          const newRepairCost = new RepairCost({
            product: product._id,
            repairCost: repairCostValue,
            createdBy: userId,
            updatedBy: userId
          });

          await newRepairCost.save();
        }

        successCount++;

      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        
        let errorMessage = error.message;
        if (error.name === "ValidationError") {
          errorMessage = Object.values(error.errors)
            .map(err => err.message)
            .join(', ');
        }

        errors.push({
          row: rowNumber,
          productTitle: row.productTitle || 'N/A',
          error: errorMessage
        });
        failedCount++;
      }
      
      if (repairCostsData.length > 10000 && i % 1000 === 0) {
        console.log(`Processed ${i} of ${repairCostsData.length} rows...`);
      }
    }

    const response = {
      success: true,
      message: `Import completed. Successfully processed ${successCount} repair costs, ${failedCount} failed.`,
      summary: {
        totalProcessed: repairCostsData.length,
        successCount,
        failedCount,
        successPercentage: repairCostsData.length > 0 ? 
          Math.round((successCount / repairCostsData.length) * 100) : 0
      }
    };
    if (errors.length > 0) {
      response.errors = errors;
      response.totalErrors = errors.length;
      
      const errorTypes = {};
      errors.forEach(error => {
        const errorKey = error.error.split(':')[0] || error.error;
        errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1;
      });
      
      response.errorStatistics = errorTypes;
      
      if (errors.length > 1000) {
        response.note = `Large import completed with ${errors.length} errors. Consider downloading the error report.`;
      }
    }

    response.notes = [
      "Product names are matched against existing products in the database.",
      "If a product already has a repair cost, it will be updated.",
      "If a product doesn't have a repair cost, a new one will be created.",
      "Duplicate product names in the same file are skipped (only first occurrence is processed).",
      `Processed ${repairCostsData.length} records in total.`
    ];

    res.status(200).json(response);

  } catch (error) {
    console.error('Error importing repair costs:', error);
    res.status(500).json({
      success: false,
      message: "Error importing repair costs",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
};