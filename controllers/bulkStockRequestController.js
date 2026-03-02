import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";

/**
 * Bulk upload stock requests from CSV
 * CSV format should have headers: 
 * warehouseIdentifier,centerIdentifier,date,orderNumber,challanNo,challanDate,remark,
 * productIdentifier,quantity,approvedQuantity,approvedRemark,approvedSerials,
 * receivedQuantity,receivedRemark,productInStock,productRemark,serialNumbers,
 * transferredSerials,status
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
    const orderGroups = {};

    // Convert buffer to string and create readable stream
    const csvString = req.file.buffer.toString();
    
    // Define expected headers in order (without the extra commas)
    const expectedHeaders = [
      'warehouseIdentifier',
      'centerIdentifier',
      'date',
      'orderNumber',
      'challanNo',
      'challanDate',
      'remark',
      'productIdentifier',
      'quantity',
      'approvedQuantity',
      'approvedRemark',
      'approvedSerials',
      'receivedQuantity',
      'receivedRemark',
      'productInStock',
      'productRemark',
      'serialNumbers',
      'transferredSerials',
      'status'
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
          
          // Log raw data for debugging
          console.log(`Raw row ${rowIndex} data:`, data);
          
          // Create normalized data based on expected headers
          const normalizedData = {};
          
          // Get values by position first (more reliable)
          const values = Object.values(data).filter(v => v !== undefined);
          
          expectedHeaders.forEach((header, index) => {
            // Try to get value by position first, then by header name
            let value = values[index] || data[header] || '';
            
            // Clean up the value
            if (value && typeof value === 'string') {
              value = value.trim();
              // Remove any extra quotes
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
      centerMap.set(center.centerName.toLowerCase(), { id: center._id, type: center.centerType });
      if (center.centerCode) {
        centerCodeMap.set(center.centerCode.toLowerCase(), { id: center._id, type: center.centerType });
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

    // Group rows by orderNumber
    results.forEach((row, index) => {
      if (!row.orderNumber) {
        errors.push({
          row: index + 2,
          data: row,
          error: 'Order number is required'
        });
        return;
      }

      const orderNumber = row.orderNumber;
      if (!orderGroups[orderNumber]) {
        orderGroups[orderNumber] = {
          rows: [],
          mainData: { ...row },
          products: []
        };
      }
      orderGroups[orderNumber].rows.push(row);
    });

    console.log(`Grouped into ${Object.keys(orderGroups).length} orders`);

    // Process each order group
    for (const [orderNumber, group] of Object.entries(orderGroups)) {
      try {
        const firstRow = group.rows[0];
        const rowNumber = results.findIndex(r => r.orderNumber === orderNumber) + 2;

        console.log(`\nProcessing order: ${orderNumber}`);

        // Validate required fields
        if (!firstRow.warehouseIdentifier) {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: 'Warehouse identifier (name or code) is required'
          });
          continue;
        }

        if (!firstRow.centerIdentifier) {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: 'Center identifier (name or code) is required'
          });
          continue;
        }

        // Find warehouse (must be Outlet)
        const warehouseIdentifier = firstRow.warehouseIdentifier.toString().toLowerCase().trim();
        let warehouseInfo = centerMap.get(warehouseIdentifier) || centerCodeMap.get(warehouseIdentifier);

        if (!warehouseInfo) {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: `Warehouse not found: ${firstRow.warehouseIdentifier}`
          });
          continue;
        }

        // Check if warehouse is of type "Outlet"
        if (warehouseInfo.type !== "Outlet") {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: `Warehouse must be of type "Outlet" (not Center): ${firstRow.warehouseIdentifier}`
          });
          continue;
        }

        // Find center (can be any type)
        const centerIdentifier = firstRow.centerIdentifier.toString().toLowerCase().trim();
        let centerInfo = centerMap.get(centerIdentifier) || centerCodeMap.get(centerIdentifier);

        if (!centerInfo) {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: `Center not found: ${firstRow.centerIdentifier}`
          });
          continue;
        }

        console.log(`Warehouse found: ${warehouseInfo.id} (${warehouseInfo.type})`);
        console.log(`Center found: ${centerInfo.id} (${centerInfo.type})`);

        // Parse date
        let requestDate = new Date();
        if (firstRow.date) {
          requestDate = new Date(firstRow.date);
          if (isNaN(requestDate.getTime())) {
            errors.push({
              row: rowNumber,
              data: firstRow,
              error: `Invalid date format: ${firstRow.date}`
            });
            continue;
          }
        }

        // Parse challan date if provided
        let challanDate = null;
        if (firstRow.challanDate) {
          challanDate = new Date(firstRow.challanDate);
          if (isNaN(challanDate.getTime())) {
            errors.push({
              row: rowNumber,
              data: firstRow,
              error: `Invalid challan date format: ${firstRow.challanDate}`
            });
            continue;
          }
        }

        // Process products for this order
        const products = [];
        let hasValidProduct = false;

        for (const row of group.rows) {
          if (!row.productIdentifier) {
            warnings.push({
              row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
              data: row,
              warning: 'Skipping row without product identifier'
            });
            continue;
          }

          // Find product
          const productIdentifier = row.productIdentifier.toString().toLowerCase().trim();
          let productId = productMap.get(productIdentifier) || productCodeMap.get(productIdentifier);

          if (!productId) {
            warnings.push({
              row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
              data: row,
              warning: `Product not found: ${row.productIdentifier} - skipping`
            });
            continue;
          }

          console.log(`Product found: ${productId} for ${row.productIdentifier}`);

          // Parse quantities
          const quantity = parseInt(row.quantity) || 0;
          const approvedQuantity = row.approvedQuantity ? parseInt(row.approvedQuantity) : null;
          const receivedQuantity = row.receivedQuantity ? parseInt(row.receivedQuantity) : null;
          const productInStock = row.productInStock ? parseInt(row.productInStock) : 0;

          if (quantity <= 0) {
            warnings.push({
              row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
              data: row,
              warning: `Quantity must be greater than 0 for product ${row.productIdentifier} - skipping`
            });
            continue;
          }

          // Parse serial numbers
          let approvedSerials = [];
          if (row.approvedSerials) {
            approvedSerials = row.approvedSerials.split(',').map(s => s.trim()).filter(s => s);
          }

          let serialNumbers = [];
          if (row.serialNumbers) {
            serialNumbers = row.serialNumbers.split(',').map(s => s.trim()).filter(s => s);
          }

          let transferredSerials = [];
          if (row.transferredSerials) {
            transferredSerials = row.transferredSerials.split(',').map(s => s.trim()).filter(s => s);
          }

          // Validate approved serials count if provided
          if (approvedSerials.length > 0 && approvedQuantity && approvedSerials.length !== approvedQuantity) {
            warnings.push({
              row: results.findIndex(r => r.orderNumber === orderNumber && r.productIdentifier === row.productIdentifier) + 2,
              data: row,
              warning: `Number of approved serials (${approvedSerials.length}) does not match approved quantity (${approvedQuantity})`
            });
          }

          const productItem = {
            product: productId,
            quantity: quantity,
            productInStock: productInStock,
            productRemark: row.productRemark || '',
            serialNumbers: serialNumbers,
            transferredSerials: transferredSerials
          };

          // Add optional fields if provided
          if (approvedQuantity !== null) {
            productItem.approvedQuantity = approvedQuantity;
          }
          if (row.approvedRemark) {
            productItem.approvedRemark = row.approvedRemark;
          }
          if (approvedSerials.length > 0) {
            productItem.approvedSerials = approvedSerials;
          }
          if (receivedQuantity !== null) {
            productItem.receivedQuantity = receivedQuantity;
          }
          if (row.receivedRemark) {
            productItem.receivedRemark = row.receivedRemark;
          }

          products.push(productItem);
          hasValidProduct = true;
        }

        if (!hasValidProduct) {
          errors.push({
            row: rowNumber,
            data: firstRow,
            error: 'No valid products found for this order'
          });
          continue;
        }

        console.log(`Processed ${products.length} products for order ${orderNumber}`);

        // Determine status
        let status = firstRow.status || "Submitted";
        const validStatuses = ["Draft", "Submitted", "Confirmed", "Shipped", "Incompleted", "Completed", "Rejected"];
        if (!validStatuses.includes(status)) {
          warnings.push({
            row: rowNumber,
            data: firstRow,
            warning: `Invalid status "${status}", defaulting to "Submitted"`
          });
          status = "Submitted";
        }

        // Check if order already exists
        const existingRequest = await StockRequest.findOne({ orderNumber: orderNumber });

        if (existingRequest) {
          // Update existing request
          console.log(`Updating existing stock request: ${orderNumber}`);

          existingRequest.warehouse = warehouseInfo.id;
          existingRequest.center = centerInfo.id;
          existingRequest.date = requestDate;
          if (firstRow.challanNo) existingRequest.challanNo = firstRow.challanNo;
          if (challanDate) existingRequest.challanDate = challanDate;
          if (firstRow.remark) existingRequest.remark = firstRow.remark;
          existingRequest.status = status;
          existingRequest.products = products;
          existingRequest.updatedBy = req.user.id;

          await existingRequest.save();

          await existingRequest.populate('warehouse', 'centerName centerCode');
          await existingRequest.populate('center', 'centerName centerCode');
          await existingRequest.populate('products.product', 'productTitle productCode');

          successfulUploads.push({
            row: rowNumber,
            stockRequest: existingRequest,
            action: 'updated',
            orderNumber: orderNumber
          });
        } else {
          // Create new request
          console.log(`Creating new stock request: ${orderNumber}`);

          const newRequest = new StockRequest({
            warehouse: warehouseInfo.id,
            center: centerInfo.id,
            date: requestDate,
            orderNumber: orderNumber,
            challanNo: firstRow.challanNo || null,
            challanDate: challanDate || null,
            remark: firstRow.remark || '',
            products: products,
            status: status,
            createdBy: req.user.id,
            updatedBy: req.user.id
          });

          await newRequest.save();

          await newRequest.populate('warehouse', 'centerName centerCode');
          await newRequest.populate('center', 'centerName centerCode');
          await newRequest.populate('products.product', 'productTitle productCode');

          successfulUploads.push({
            row: rowNumber,
            stockRequest: newRequest,
            action: 'created',
            orderNumber: orderNumber
          });
        }

        console.log(`Successfully processed order: ${orderNumber}`);

      } catch (error) {
        console.error(`Error processing order ${orderNumber}:`, error);
        const rowNumber = results.findIndex(r => r.orderNumber === orderNumber) + 2;
        errors.push({
          row: rowNumber,
          data: { orderNumber },
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk upload completed. ${successfulUploads.length} stock requests processed, ${errors.length} errors, ${warnings.length} warnings.`,
      data: {
        totalProcessed: Object.keys(orderGroups).length,
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
 * Download sample CSV template for stock requests
 */
export const downloadStockRequestSampleCSV = async (req, res) => {
  try {
    // Get some sample warehouses (outlets), centers, and products
    const sampleWarehouses = await Center.find({ centerType: "Outlet" }).limit(1).select('centerName centerCode');
    const sampleCenters = await Center.find({}).limit(1).select('centerName centerCode');
    const sampleProducts = await Product.find({}).limit(3).select('productTitle productCode');

    const headers = [
      'warehouseIdentifier',
      'centerIdentifier',
      'date',
      'orderNumber',
      'challanNo',
      'challanDate',
      'remark',
      'productIdentifier',
      'quantity',
      'approvedQuantity',
      'approvedRemark',
      'approvedSerials',
      'receivedQuantity',
      'receivedRemark',
      'productInStock',
      'productRemark',
      'serialNumbers',
      'transferredSerials',
      'status'
    ].join(',');

    const sampleRows = [];

    if (sampleWarehouses.length > 0 && sampleCenters.length > 0 && sampleProducts.length > 0) {
      // Order 1 with multiple products
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        '2026-03-01',
        'SR/CENTER/0326/001',
        '',
        '',
        'Monthly stock request',
        sampleProducts[0].productTitle,
        '50',
        '50',
        'Fully approved',
        'SN001,SN002,SN003,SN004,SN005',
        '50',
        'Received in good condition',
        '0',
        '',
        '',
        '',
        'Completed'
      ].join(','));

      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        '2026-03-01',
        'SR/CENTER/0326/001',
        '',
        '',
        '',
        sampleProducts[1].productTitle,
        '30',
        '25',
        'Partially approved',
        'SN101,SN102,SN103,SN104,SN105',
        '25',
        'Received 25 units',
        '0',
        '',
        '',
        '',
        'Completed'
      ].join(','));

      // Order 2 - Single product
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        '2026-03-02',
        'SR/CENTER/0326/002',
        '',
        '',
        'Urgent request',
        sampleProducts[2].productTitle,
        '20',
        '',
        '',
        '',
        '',
        '',
        '0',
        '',
        '',
        '',
        'Draft'
      ].join(','));
    } else {
      // Fallback sample data
      sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,Monthly stock request,"1.25G SFP 1000Base-T, Copper SFP-T, RJ-45 SFP",20,20,Fully approved,"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20",20,,,,,,Completed');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,,1.5mm wire (G/B/R) (PolyCab),100,100,,,100,,,,,,Completed');
      sampleRows.push('TELECOM WAREHOUSE,AIROLI,2026-02-28,SR/AIROLI/0226/1,,,Urgent request,15 U Rack,100,100,,,100,,,,,,Completed');
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
