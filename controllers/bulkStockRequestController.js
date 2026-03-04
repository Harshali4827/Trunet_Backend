// import fs from 'fs';
// import csv from 'csv-parser';
// import { Readable } from 'stream';
// import StockRequest from "../models/StockRequest.js";
// import Center from "../models/Center.js";
// import Product from "../models/Product.js";
// import User from "../models/User.js";
// import mongoose from "mongoose";


// export const bulkUploadStockRequests = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: 'Please upload a CSV file'
//       });
//     }

//     if (!req.file.buffer) {
//       return res.status(500).json({
//         success: false,
//         message: 'No file buffer found'
//       });
//     }

//     console.log("Processing stock requests CSV from buffer, size:", req.file.size, "bytes");
    
//     const results = [];
//     const errors = [];
//     const successfulUploads = [];
//     const warnings = [];
//     const orderGroups = {};

//     const csvString = req.file.buffer.toString();
    
//     const expectedHeaders = [
//       'warehouseIdentifier',
//       'centerIdentifier',
//       'date',
//       'orderNumber',
//       'challanNo',
//       'challanDate',
//       'remark',
//       'productIdentifier',
//       'quantity',
//       'approvedQuantity',
//       'approvedRemark',
//       'approvedSerials',
//       'receivedQuantity',
//       'receivedRemark',
//       'productInStock',
//       'productRemark',
//       'serialNumbers',
//       'transferredSerials',
//       'status'
//     ];

//     await new Promise((resolve, reject) => {
//       const readable = Readable.from([csvString]);
//       let rowIndex = 0;
      
//       readable
//         .pipe(csv({
//           quote: '"',
//           escape: '"',
//           separator: ',',
//           relax_column_count: true,
//           skip_lines_with_error: true
//         }))
//         .on('data', (data) => {
//           rowIndex++;
          
//           console.log(`Raw row ${rowIndex} data:`, data);
//           const normalizedData = {};
//           const values = Object.values(data).filter(v => v !== undefined);
          
//           expectedHeaders.forEach((header, index) => {
//             let value = values[index] || data[header] || '';

//             if (value && typeof value === 'string') {
//               value = value.trim();
//               if (value.startsWith('"') && value.endsWith('"')) {
//                 value = value.slice(1, -1);
//               }
//             }
            
//             normalizedData[header] = value || '';
//           });
          
//           results.push(normalizedData);
//         })
//         .on('end', () => {
//           console.log(`CSV parsing complete. Found ${results.length} rows`);
//           if (results.length > 0) {
//             console.log("First row normalized:", JSON.stringify(results[0], null, 2));
//           }
//           resolve();
//         })
//         .on('error', (error) => {
//           console.error('CSV parsing error:', error);
//           reject(error);
//         });
//     });

//     if (results.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'No data found in CSV file'
//       });
//     }

//     console.log("Fetching centers and products from database...");
//     const allCenters = await Center.find({}).select('centerName centerCode _id centerType').lean();
//     const allProducts = await Product.find({}).select('productTitle productCode _id').lean();

//     console.log(`Found ${allCenters.length} centers and ${allProducts.length} products`);

//     const centerMap = new Map();
//     const centerCodeMap = new Map();
//     allCenters.forEach(center => {
//       centerMap.set(center.centerName.toLowerCase(), { id: center._id, type: center.centerType });
//       if (center.centerCode) {
//         centerCodeMap.set(center.centerCode.toLowerCase(), { id: center._id, type: center.centerType });
//       }
//     });

//     const productMap = new Map();
//     const productCodeMap = new Map();
//     allProducts.forEach(product => {
//       productMap.set(product.productTitle.toLowerCase(), product._id);
//       if (product.productCode) {
//         productCodeMap.set(product.productCode.toLowerCase(), product._id);
//       }
//     });

//     results.forEach((row, index) => {
//       if (!row.orderNumber) {
//         errors.push({
//           row: index + 2,
//           data: row,
//           error: 'Order number is required'
//         });
//         return;
//       }

//       const orderNumber = row.orderNumber;
//       if (!orderGroups[orderNumber]) {
//         orderGroups[orderNumber] = {
//           rows: [],
//           mainData: { ...row },
//           products: []
//         };
//       }
//       orderGroups[orderNumber].rows.push(row);
//     });

//     console.log(`Grouped into ${Object.keys(orderGroups).length} orders`);

//     for (const [orderNumber, group] of Object.entries(orderGroups)) {
//       try {
//         const firstRow = group.rows[0];
//         const rowNumber = results.findIndex(r => r.orderNumber === orderNumber) + 2;

//         console.log(`\nProcessing order: ${orderNumber}`);

//         if (!firstRow.warehouseIdentifier) {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: 'Warehouse identifier (name or code) is required'
//           });
//           continue;
//         }

//         if (!firstRow.centerIdentifier) {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: 'Center identifier (name or code) is required'
//           });
//           continue;
//         }

//         const warehouseIdentifier = firstRow.warehouseIdentifier.toString().toLowerCase().trim();
//         let warehouseInfo = centerMap.get(warehouseIdentifier) || centerCodeMap.get(warehouseIdentifier);

//         if (!warehouseInfo) {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: `Warehouse not found: ${firstRow.warehouseIdentifier}`
//           });
//           continue;
//         }

//         if (warehouseInfo.type !== "Outlet") {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: `Warehouse must be of type "Outlet" (not Center): ${firstRow.warehouseIdentifier}`
//           });
//           continue;
//         }

//         const centerIdentifier = firstRow.centerIdentifier.toString().toLowerCase().trim();
//         let centerInfo = centerMap.get(centerIdentifier) || centerCodeMap.get(centerIdentifier);

//         if (!centerInfo) {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: `Center not found: ${firstRow.centerIdentifier}`
//           });
//           continue;
//         }

//         console.log(`Warehouse found: ${warehouseInfo.id} (${warehouseInfo.type})`);
//         console.log(`Center found: ${centerInfo.id} (${centerInfo.type})`);

//         let requestDate = new Date();
//         if (firstRow.date) {
//           requestDate = new Date(firstRow.date);
//           if (isNaN(requestDate.getTime())) {
//             errors.push({
//               row: rowNumber,
//               data: firstRow,
//               error: `Invalid date format: ${firstRow.date}`
//             });
//             continue;
//           }
//         }

//         let challanDate = null;
//         if (firstRow.challanDate) {
//           challanDate = new Date(firstRow.challanDate);
//           if (isNaN(challanDate.getTime())) {
//             errors.push({
//               row: rowNumber,
//               data: firstRow,
//               error: `Invalid challan date format: ${firstRow.challanDate}`
//             });
//             continue;
//           }
//         }

//         const products = [];
//         let hasValidProduct = false;

//         for (const row of group.rows) {
//           if (!row.productIdentifier) {
//             warnings.push({
//               row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
//               data: row,
//               warning: 'Skipping row without product identifier'
//             });
//             continue;
//           }

//           const productIdentifier = row.productIdentifier.toString().toLowerCase().trim();
//           let productId = productMap.get(productIdentifier) || productCodeMap.get(productIdentifier);

//           if (!productId) {
//             warnings.push({
//               row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
//               data: row,
//               warning: `Product not found: ${row.productIdentifier} - skipping`
//             });
//             continue;
//           }

//           console.log(`Product found: ${productId} for ${row.productIdentifier}`);

//           const quantity = parseInt(row.quantity) || 0;
//           const approvedQuantity = row.approvedQuantity ? parseInt(row.approvedQuantity) : null;
//           const receivedQuantity = row.receivedQuantity ? parseInt(row.receivedQuantity) : null;
//           const productInStock = row.productInStock ? parseInt(row.productInStock) : 0;

//           if (quantity <= 0) {
//             warnings.push({
//               row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
//               data: row,
//               warning: `Quantity must be greater than 0 for product ${row.productIdentifier} - skipping`
//             });
//             continue;
//           }
//           let approvedSerials = [];
//           if (row.approvedSerials) {
//             approvedSerials = row.approvedSerials.split(',').map(s => s.trim()).filter(s => s);
//           }

//           let serialNumbers = [];
//           if (row.serialNumbers) {
//             serialNumbers = row.serialNumbers.split(',').map(s => s.trim()).filter(s => s);
//           }

//           let transferredSerials = [];
//           if (row.transferredSerials) {
//             transferredSerials = row.transferredSerials.split(',').map(s => s.trim()).filter(s => s);
//           }
//           if (approvedSerials.length > 0 && approvedQuantity && approvedSerials.length !== approvedQuantity) {
//             warnings.push({
//               row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
//               data: row,
//               warning: `Number of approved serials (${approvedSerials.length}) does not match approved quantity (${approvedQuantity})`
//             });
//           }

//           const productItem = {
//             product: productId,
//             quantity: quantity,
//             productInStock: productInStock,
//             productRemark: row.productRemark || '',
//             serialNumbers: serialNumbers,
//             transferredSerials: transferredSerials
//           };

//           if (approvedQuantity !== null) {
//             productItem.approvedQuantity = approvedQuantity;
//           }
//           if (row.approvedRemark) {
//             productItem.approvedRemark = row.approvedRemark;
//           }
//           if (approvedSerials.length > 0) {
//             productItem.approvedSerials = approvedSerials;
//           }
//           if (receivedQuantity !== null) {
//             productItem.receivedQuantity = receivedQuantity;
//           }
//           if (row.receivedRemark) {
//             productItem.receivedRemark = row.receivedRemark;
//           }

//           products.push(productItem);
//           hasValidProduct = true;
//         }

//         if (!hasValidProduct) {
//           errors.push({
//             row: rowNumber,
//             data: firstRow,
//             error: 'No valid products found for this order'
//           });
//           continue;
//         }

//         console.log(`Processed ${products.length} products for order ${orderNumber}`);

//         let status = firstRow.status || "Submitted";
//         const validStatuses = ["Draft", "Submitted", "Confirmed", "Shipped", "Incompleted", "Completed", "Rejected"];
//         if (!validStatuses.includes(status)) {
//           warnings.push({
//             row: rowNumber,
//             data: firstRow,
//             warning: `Invalid status "${status}", defaulting to "Submitted"`
//           });
//           status = "Submitted";
//         }
//         const existingRequest = await StockRequest.findOne({ orderNumber: orderNumber });

//         if (existingRequest) {

//           console.log(`Updating existing stock request: ${orderNumber}`);

//           existingRequest.warehouse = warehouseInfo.id;
//           existingRequest.center = centerInfo.id;
//           existingRequest.date = requestDate;
//           if (firstRow.challanNo) existingRequest.challanNo = firstRow.challanNo;
//           if (challanDate) existingRequest.challanDate = challanDate;
//           if (firstRow.remark) existingRequest.remark = firstRow.remark;
//           existingRequest.status = status;
//           existingRequest.products = products;
//           existingRequest.updatedBy = req.user.id;

//           await existingRequest.save();

//           await existingRequest.populate('warehouse', 'centerName centerCode');
//           await existingRequest.populate('center', 'centerName centerCode');
//           await existingRequest.populate('products.product', 'productTitle productCode');

//           successfulUploads.push({
//             row: rowNumber,
//             stockRequest: existingRequest,
//             action: 'updated',
//             orderNumber: orderNumber
//           });
//         } else {

//           console.log(`Creating new stock request: ${orderNumber}`);

//           const newRequest = new StockRequest({
//             warehouse: warehouseInfo.id,
//             center: centerInfo.id,
//             date: requestDate,
//             orderNumber: orderNumber,
//             challanNo: firstRow.challanNo || null,
//             challanDate: challanDate || null,
//             remark: firstRow.remark || '',
//             products: products,
//             status: status,
//             createdBy: req.user.id,
//             updatedBy: req.user.id
//           });

//           await newRequest.save();

//           await newRequest.populate('warehouse', 'centerName centerCode');
//           await newRequest.populate('center', 'centerName centerCode');
//           await newRequest.populate('products.product', 'productTitle productCode');

//           successfulUploads.push({
//             row: rowNumber,
//             stockRequest: newRequest,
//             action: 'created',
//             orderNumber: orderNumber
//           });
//         }

//         console.log(`Successfully processed order: ${orderNumber}`);

//       } catch (error) {
//         console.error(`Error processing order ${orderNumber}:`, error);
//         const rowNumber = results.findIndex(r => r.orderNumber === orderNumber) + 2;
//         errors.push({
//           row: rowNumber,
//           data: { orderNumber },
//           error: error.message
//         });
//       }
//     }

//     res.status(200).json({
//       success: true,
//       message: `Bulk upload completed. ${successfulUploads.length} stock requests processed, ${errors.length} errors, ${warnings.length} warnings.`,
//       data: {
//         totalProcessed: Object.keys(orderGroups).length,
//         successful: successfulUploads.length,
//         failed: errors.length,
//         warnings: warnings.length,
//         successfulUploads: successfulUploads,
//         errors: errors,
//         warnings: warnings
//       }
//     });

//   } catch (error) {
//     console.error('Bulk upload error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error processing bulk upload',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

// export const downloadStockRequestSampleCSV = async (req, res) => {
//   try {
//     // Get some sample warehouses (outlets), centers, and products
//     const sampleWarehouses = await Center.find({ centerType: "Outlet" }).limit(1).select('centerName centerCode');
//     const sampleCenters = await Center.find({}).limit(1).select('centerName centerCode');
//     const sampleProducts = await Product.find({}).limit(3).select('productTitle productCode');

//     const headers = [
//       'warehouseIdentifier',
//       'centerIdentifier',
//       'date',
//       'orderNumber',
//       'challanNo',
//       'challanDate',
//       'remark',
//       'productIdentifier',
//       'quantity',
//       'approvedQuantity',
//       'approvedRemark',
//       'approvedSerials',
//       'receivedQuantity',
//       'receivedRemark',
//       'productInStock',
//       'productRemark',
//       'serialNumbers',
//       'transferredSerials',
//       'status'
//     ].join(',');

//     const sampleRows = [];

//     if (sampleWarehouses.length > 0 && sampleCenters.length > 0 && sampleProducts.length > 0) {
//       // Order 1 with multiple products
//       sampleRows.push([
//         sampleWarehouses[0].centerName,
//         sampleCenters[0].centerName,
//         '2026-03-01',
//         'SR/CENTER/0326/001',
//         '',
//         '',
//         'Monthly stock request',
//         sampleProducts[0].productTitle,
//         '50',
//         '50',
//         'Fully approved',
//         'SN001,SN002,SN003,SN004,SN005',
//         '50',
//         'Received in good condition',
//         '0',
//         '',
//         '',
//         '',
//         'Completed'
//       ].join(','));

//       sampleRows.push([
//         sampleWarehouses[0].centerName,
//         sampleCenters[0].centerName,
//         '2026-03-01',
//         'SR/CENTER/0326/001',
//         '',
//         '',
//         '',
//         sampleProducts[1].productTitle,
//         '30',
//         '25',
//         'Partially approved',
//         'SN101,SN102,SN103,SN104,SN105',
//         '25',
//         'Received 25 units',
//         '0',
//         '',
//         '',
//         '',
//         'Completed'
//       ].join(','));

//       // Order 2 - Single product
//       sampleRows.push([
//         sampleWarehouses[0].centerName,
//         sampleCenters[0].centerName,
//         '2026-03-02',
//         'SR/CENTER/0326/002',
//         '',
//         '',
//         'Urgent request',
//         sampleProducts[2].productTitle,
//         '20',
//         '',
//         '',
//         '',
//         '',
//         '',
//         '0',
//         '',
//         '',
//         '',
//         'Draft'
//       ].join(','));
//     } else {
//       // Fallback sample data
//       sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,Monthly stock request,"1.25G SFP 1000Base-T, Copper SFP-T, RJ-45 SFP",20,20,Fully approved,"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20",20,,,,,,Completed');
//       sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,,1.5mm wire (G/B/R) (PolyCab),100,100,,,100,,,,,,Completed');
//       sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,Urgent request,15 U Rack,100,100,,,100,,,,,,Completed');
//     }

//     const csv = `${headers}\n${sampleRows.join('\n')}`;

//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', 'attachment; filename="stock_requests_sample.csv"');
    
//     res.status(200).send(csv);

//   } catch (error) {
//     console.error('Download sample CSV error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error generating sample CSV',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };


/*****************************************************************************/

import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";

/**
 * Generate order number automatically using center name
 * Format: SR/CENTERNAME/MMYY/SEQUENCE
 */
const generateOrderNumber = async (centerName, date) => {
  // Clean center name - remove special characters and spaces, convert to uppercase
  const cleanCenterName = centerName
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
    .toUpperCase(); // Convert to uppercase
  
  const month = date.getMonth() + 1;
  const year = date.getFullYear().toString().slice(-2);
  const monthYear = `${month.toString().padStart(2, '0')}${year}`;
  
  const prefix = `SR/${cleanCenterName}/${monthYear}/`;
  
  // Find the last order with this prefix
  const lastOrder = await StockRequest.findOne({
    orderNumber: new RegExp(`^${prefix}`)
  }).sort({ orderNumber: -1 });
  
  let sequence = 1;
  if (lastOrder && lastOrder.orderNumber) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('/').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  return `${prefix}${sequence}`;
};

/**
 * Bulk upload stock requests from CSV
 * SIMPLIFIED CSV format:
 * warehouseIdentifier,centerIdentifier,productIdentifier,quantity,serialNumbers
 * 
 * All rows with the same centerIdentifier will be grouped into ONE stock request
 * with multiple products in the products array
 */
export const bulkUploadStockRequests = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

    // Handle file from memory storage
    if (!req.file.buffer) {
      return res.status(500).json({
        success: false,
        message: 'No file buffer found'
      });
    }

    console.log("Processing stock requests CSV from buffer, size:", req.file.size, "bytes");
    
    const results = [];
    const errors = [];
    const successfulUploads = [];
    const warnings = [];
    const centerGroups = new Map(); // Group by centerIdentifier

    // Convert buffer to string and create readable stream
    const csvString = req.file.buffer.toString();
    
    // Define expected headers (SIMPLIFIED)
    const expectedHeaders = [
      'warehouseIdentifier',
      'centerIdentifier',
      'productIdentifier',
      'quantity',
      'serialNumbers'
    ];

    // Parse CSV file
    await new Promise((resolve, reject) => {
      const readable = Readable.from([csvString]);
      let rowIndex = 0;
      
      readable
        .pipe(csv({
          quote: '"',
          escape: '"',
          separator: ',',
          relax_column_count: true,
          skip_lines_with_error: true
        }))
        .on('data', (data) => {
          rowIndex++;
          
          // Create normalized data based on expected headers
          const normalizedData = {};
          
          // Get values by position first (more reliable)
          const values = Object.values(data).filter(v => v !== undefined);
          
          expectedHeaders.forEach((header, index) => {
            let value = values[index] || data[header] || '';
            
            if (value && typeof value === 'string') {
              value = value.trim();
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
            }
            
            normalizedData[header] = value || '';
          });
          
          results.push(normalizedData);
        })
        .on('end', () => {
          console.log(`CSV parsing complete. Found ${results.length} rows`);
          if (results.length > 0) {
            console.log("First row normalized:", JSON.stringify(results[0], null, 2));
          }
          resolve();
        })
        .on('error', (error) => {
          console.error('CSV parsing error:', error);
          reject(error);
        });
    });

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in CSV file'
      });
    }

    // Get all centers and products for faster lookup
    console.log("Fetching centers and products from database...");
    const allCenters = await Center.find({}).select('centerName centerCode _id centerType').lean();
    const allProducts = await Product.find({}).select('productTitle productCode _id').lean();

    console.log(`Found ${allCenters.length} centers and ${allProducts.length} products`);

    // Create lookup maps
    const centerMap = new Map();
    const centerCodeMap = new Map();
    allCenters.forEach(center => {
      centerMap.set(center.centerName.toLowerCase(), { 
        id: center._id, 
        name: center.centerName,
        code: center.centerCode, 
        type: center.centerType 
      });
      if (center.centerCode) {
        centerCodeMap.set(center.centerCode.toLowerCase(), { 
          id: center._id, 
          name: center.centerName,
          code: center.centerCode, 
          type: center.centerType 
        });
      }
    });

    const productMap = new Map();
    const productCodeMap = new Map();
    allProducts.forEach(product => {
      productMap.set(product.productTitle.toLowerCase(), product._id);
      if (product.productCode) {
        productCodeMap.set(product.productCode.toLowerCase(), product._id);
      }
    });

    // First pass: Validate all rows and group by center
    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      const rowNumber = index + 2;

      try {
        // Validate required fields
        if (!row.warehouseIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Warehouse identifier (name or code) is required'
          });
          continue;
        }

        if (!row.centerIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Center identifier (name or code) is required'
          });
          continue;
        }

        if (!row.productIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Product identifier (name or code) is required'
          });
          continue;
        }

        // Find warehouse (must be Outlet)
        const warehouseIdentifier = row.warehouseIdentifier.toString().toLowerCase().trim();
        let warehouseInfo = centerMap.get(warehouseIdentifier) || centerCodeMap.get(warehouseIdentifier);

        if (!warehouseInfo) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Warehouse not found: ${row.warehouseIdentifier}`
          });
          continue;
        }

        // Check if warehouse is of type "Outlet"
        if (warehouseInfo.type !== "Outlet") {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Warehouse must be of type "Outlet" (not Center): ${row.warehouseIdentifier}`
          });
          continue;
        }

        // Find center (can be any type)
        const centerIdentifier = row.centerIdentifier.toString().toLowerCase().trim();
        let centerInfo = centerMap.get(centerIdentifier) || centerCodeMap.get(centerIdentifier);

        if (!centerInfo) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Center not found: ${row.centerIdentifier}`
          });
          continue;
        }

        // Find product
        const productIdentifier = row.productIdentifier.toString().toLowerCase().trim();
        let productId = productMap.get(productIdentifier) || productCodeMap.get(productIdentifier);

        if (!productId) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Product not found: ${row.productIdentifier}`
          });
          continue;
        }

        // Parse quantity
        const quantity = parseInt(row.quantity) || 0;
        if (quantity <= 0) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Quantity must be greater than 0`
          });
          continue;
        }

        // Parse serial numbers
        let approvedSerials = [];
        if (row.serialNumbers && row.serialNumbers.trim() !== '') {
          approvedSerials = row.serialNumbers.split(',').map(s => s.trim()).filter(s => s);
        }

        // Create a key for grouping by center (use center ID to ensure uniqueness)
        const centerKey = centerInfo.id.toString();
        
        if (!centerGroups.has(centerKey)) {
          centerGroups.set(centerKey, {
            warehouseInfo,
            centerInfo,
            products: [],
            rows: [],
            warehouseId: warehouseInfo.id,
            centerId: centerInfo.id,
            centerName: centerInfo.name
          });
        }

        // Add product to the group
        const group = centerGroups.get(centerKey);
        
        // Check if warehouse matches (should be same for all rows in group)
        if (group.warehouseId.toString() !== warehouseInfo.id.toString()) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `All rows for the same center must have the same warehouse`
          });
          continue;
        }

        // Add product to the group's products array
        group.products.push({
          product: productId,
          quantity: quantity,
          approvedQuantity: quantity,
          approvedSerials: approvedSerials,
          receivedQuantity: quantity,
          transferredSerials: approvedSerials,
          approvedRemark: '',
          receivedRemark: '',
          productInStock: 0,
          productRemark: '',
          serialNumbers: [],
          sourceBreakdown: {
            fromReseller: { quantity: 0, serials: [] },
            fromOutlet: { quantity: 0, serials: [] },
            totalApproved: quantity
          }
        });

        group.rows.push(rowNumber);

      } catch (error) {
        console.error(`Error validating row ${rowNumber}:`, error);
        errors.push({
          row: rowNumber,
          data: row,
          error: error.message
        });
      }
    }

    console.log(`Grouped into ${centerGroups.size} stock requests (one per center)`);

    // Process each center group (create one stock request per center)
    for (const [centerKey, group] of centerGroups.entries()) {
      try {
        const firstRowNumber = group.rows[0];
        console.log(`\nProcessing stock request for center: ${group.centerName} with ${group.products.length} products`);

        // Use current date
        const now = new Date();
        const requestDate = now;
        
        // Generate order number using center name
        const orderNumber = await generateOrderNumber(group.centerName, now);
        console.log(`Generated order number: ${orderNumber}`);

        // Generate challan number
        const challanNo = await StockRequest.generateChallanNumber();
        console.log(`Generated challan number: ${challanNo}`);

        // Create new stock request with all products in the array
        const newRequest = new StockRequest({
          warehouse: group.warehouseId,
          center: group.centerId,
          date: requestDate,
          orderNumber: orderNumber,
          challanNo: challanNo,
          challanDate: now,
          remark: '', // No remark by default
          products: group.products, // All products for this center in one array
          status: "Completed", // Default to Completed
          warehouseChallanApproval: "approved",
          centerChallanApproval: "approved",
          approvalInfo: {
            approvedAt: now,
            approvedBy: req.user.id,
            warehouseChallanApprovedAt: now,
            warehouseChallanApprovedBy: req.user.id,
            centerChallanApprovedAt: now,
            centerChallanApprovedBy: req.user.id
          },
          receivingInfo: {
            receivedAt: now,
            receivedBy: req.user.id
          },
          completionInfo: {
            completedOn: now,
            completedBy: req.user.id
          },
          invoiceInfo: {
            invoiceRaised: true,
            invoiceRaisedAt: now,
            invoiceRaisedBy: req.user.id
          },
          createdBy: req.user.id,
          updatedBy: req.user.id
        });

        await newRequest.save();

        await newRequest.populate('warehouse', 'centerName centerCode');
        await newRequest.populate('center', 'centerName centerCode');
        await newRequest.populate('products.product', 'productTitle productCode');

        successfulUploads.push({
          rows: group.rows,
          stockRequest: newRequest,
          action: 'created',
          orderNumber: orderNumber,
          centerName: group.centerName,
          productCount: group.products.length
        });

        console.log(`Successfully created stock request for ${group.centerName} with ${group.products.length} products`);

      } catch (error) {
        console.error(`Error processing stock request for center ${group.centerName}:`, error);
        errors.push({
          rows: group.rows,
          centerName: group.centerName,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk upload completed. ${successfulUploads.length} stock requests created (one per center), ${errors.length} errors, ${warnings.length} warnings.`,
      data: {
        totalProcessed: results.length,
        totalCenters: centerGroups.size,
        successful: successfulUploads.length,
        failed: errors.length,
        warnings: warnings.length,
        successfulUploads: successfulUploads,
        errors: errors,
        warnings: warnings
      }
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk upload',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Download sample CSV template for stock requests (SIMPLIFIED)
 */
export const downloadStockRequestSampleCSV = async (req, res) => {
  try {
    // Get some sample warehouses (outlets), centers, and products
    const sampleWarehouses = await Center.find({ centerType: "Outlet" }).limit(1).select('centerName centerCode');
    const sampleCenters = await Center.find({}).limit(2).select('centerName centerCode');
    const sampleProducts = await Product.find({}).limit(5).select('productTitle productCode');

    const headers = [
      'warehouseIdentifier',
      'centerIdentifier',
      'productIdentifier',
      'quantity',
      'serialNumbers'
    ].join(',');

    const sampleRows = [];

    if (sampleWarehouses.length > 0 && sampleCenters.length > 0 && sampleProducts.length > 0) {
      // Center 1 - Multiple products (will be grouped into one stock request)
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[0].productTitle,
        '50',
        'SN001,SN002,SN003,SN004,SN005'
      ].join(','));

      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[1].productTitle,
        '25',
        'SN101,SN102,SN103,SN104,SN105'
      ].join(','));

      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[2].productTitle,
        '30',
        ''
      ].join(','));

      // Center 2 - Multiple products (will be grouped into another stock request)
      if (sampleCenters.length > 1) {
        sampleRows.push([
          sampleWarehouses[0].centerName,
          sampleCenters[1].centerName,
          sampleProducts[3].productTitle,
          '20',
          'SN201,SN202,SN203,SN204,SN205'
        ].join(','));

        sampleRows.push([
          sampleWarehouses[0].centerName,
          sampleCenters[1].centerName,
          sampleProducts[4].productTitle,
          '15',
          ''
        ].join(','));
      }
    } else {
      // Fallback sample data - Multiple rows for same center
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 1,40Amp Change-Over Switch,50,SN001,SN002,SN003,SN004,SN005');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 1,"1.25G SFP 1000Base-T, Copper SFP-T, RJ-45 SFP",25,SN101,SN102,SN103,SN104,SN105');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 1,15 U Rack,30,');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 2,40Amp Change-Over Switch,20,SN201,SN202,SN203,SN204,SN205');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 2,test2,15,');
    }

    const csv = `${headers}\n${sampleRows.join('\n')}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock_requests_sample.csv"');
    
    res.status(200).send(csv);

  } catch (error) {
    console.error('Download sample CSV error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating sample CSV',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
