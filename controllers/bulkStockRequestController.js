

import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";

const generateOrderNumber = async (centerName, date) => {

  const cleanCenterName = centerName
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  
  const month = date.getMonth() + 1;
  const year = date.getFullYear().toString().slice(-2);
  const monthYear = `${month.toString().padStart(2, '0')}${year}`;
  
  const prefix = `SR/${cleanCenterName}/${monthYear}/`;
  
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

export const bulkUploadStockRequests = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

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
    const centerGroups = new Map();

    const csvString = req.file.buffer.toString();

    const expectedHeaders = [
      'warehouseIdentifier',
      'centerIdentifier',
      'productIdentifier',
      'quantity',
      'serialNumbers'
    ];

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
          const normalizedData = {};
          
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

    console.log("Fetching centers and products from database...");
    const allCenters = await Center.find({}).select('centerName centerCode _id centerType').lean();
    const allProducts = await Product.find({}).select('productTitle productCode _id').lean();

    console.log(`Found ${allCenters.length} centers and ${allProducts.length} products`);

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

    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      const rowNumber = index + 2;

      try {
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
        if (warehouseInfo.type !== "Outlet") {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Warehouse must be of type "Outlet" (not Center): ${row.warehouseIdentifier}`
          });
          continue;
        }
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
        const quantity = parseInt(row.quantity) || 0;
        if (quantity <= 0) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Quantity must be greater than 0`
          });
          continue;
        }

        let approvedSerials = [];
        if (row.serialNumbers && row.serialNumbers.trim() !== '') {
          approvedSerials = row.serialNumbers.split(',').map(s => s.trim()).filter(s => s);
        }
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
        const group = centerGroups.get(centerKey);

        if (group.warehouseId.toString() !== warehouseInfo.id.toString()) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `All rows for the same center must have the same warehouse`
          });
          continue;
        }
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

    for (const [centerKey, group] of centerGroups.entries()) {
      try {
        const firstRowNumber = group.rows[0];
        console.log(`\nProcessing stock request for center: ${group.centerName} with ${group.products.length} products`);
        const now = new Date();
        const requestDate = now;

        const orderNumber = await generateOrderNumber(group.centerName, now);
        console.log(`Generated order number: ${orderNumber}`);

        const challanNo = await StockRequest.generateChallanNumber();
        console.log(`Generated challan number: ${challanNo}`);

        const newRequest = new StockRequest({
          warehouse: group.warehouseId,
          center: group.centerId,
          date: requestDate,
          orderNumber: orderNumber,
          challanNo: challanNo,
          challanDate: now,
          remark: '', 
          products: group.products, 
          status: "Completed",
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

export const downloadStockRequestSampleCSV = async (req, res) => {
  try {

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
