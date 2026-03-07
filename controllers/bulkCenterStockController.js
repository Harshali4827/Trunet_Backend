import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";

export const bulkUploadCenterStock = async (req, res) => {
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

    console.log("Processing center stock CSV from buffer, size:", req.file.size, "bytes");
    
    const results = [];
    const errors = [];
    const successfulUploads = [];
    const warnings = [];

    const csvString = req.file.buffer.toString();

    const expectedHeaders = [
      'centerIdentifier',
      'productIdentifier',
      'availableQuantity',
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
    const allProducts = await Product.find({}).select('productTitle productCode _id trackSerialNumber').lean();

    console.log(`Found ${allCenters.length} centers and ${allProducts.length} products`);

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
    const productSerialTrackingMap = new Map();
    allProducts.forEach(product => {
      productMap.set(product.productTitle.toLowerCase(), product._id);
      productSerialTrackingMap.set(product._id.toString(), product.trackSerialNumber === "Yes");
      if (product.productCode) {
        productCodeMap.set(product.productCode.toLowerCase(), product._id);
      }
    });

    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      const rowNumber = index + 2;

      try {
        console.log(`\nProcessing row ${rowNumber}:`, JSON.stringify(row, null, 2));

        const centerIdentifier = row.centerIdentifier;
        
        if (!centerIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Center identifier (name or code) is required'
          });
          continue;
        }

        const productIdentifier = row.productIdentifier;
        
        if (!productIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Product identifier (name or code) is required'
          });
          continue;
        }

        const centerIdentifierLower = centerIdentifier.toLowerCase();
        let centerInfo = centerMap.get(centerIdentifierLower) || centerCodeMap.get(centerIdentifierLower);

        if (!centerInfo) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Center not found: ${centerIdentifier}`
          });
          continue;
        }

        console.log(`Found center: ${centerInfo.id} (${centerInfo.type})`);

        if (centerInfo.type !== "Center") {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Center must be of type "Center" (not Outlet): ${centerIdentifier}`
          });
          continue;
        }
        const productIdentifierLower = productIdentifier.toLowerCase();
        let productId = productMap.get(productIdentifierLower) || productCodeMap.get(productIdentifierLower);

        if (!productId) {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Product not found: ${productIdentifier}`
          });
          continue;
        }

        console.log(`Found product: ${productId}`);

        const tracksSerialNumbers = productSerialTrackingMap.get(productId.toString()) || false;
        console.log(`Product tracks serial numbers: ${tracksSerialNumbers}`);
        const availableQuantity = parseInt(row.availableQuantity) || 0;

        if (availableQuantity <= 0) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Available quantity must be greater than 0'
          });
          continue;
        }

        console.log(`Available Quantity: ${availableQuantity}`);

        let serialNumbers = [];
        const serialNumbersStr = row.serialNumbers;
        
        if (serialNumbersStr && serialNumbersStr.trim() !== '') {
          const serialList = serialNumbersStr.split(',').map(s => s.trim()).filter(s => s !== '');
          
          console.log(`Found serial numbers:`, serialList);

          if (tracksSerialNumbers && serialList.length > 0 && serialList.length !== availableQuantity) {
            warnings.push({
              row: rowNumber,
              data: row,
              warning: `Number of serial numbers (${serialList.length}) does not match available quantity (${availableQuantity})`
            });
          }

          serialNumbers = serialList.map(serial => ({
            serialNumber: serial,
            purchaseId: new mongoose.Types.ObjectId(),
            originalOutlet: centerInfo.id,
            status: "available",
            currentLocation: centerInfo.id,
            transferHistory: [{
              fromCenter: null,
              toCenter: centerInfo.id,
              transferDate: new Date(),
              transferType: "inbound_transfer",
              remark: "Initial stock from CSV upload"
            }]
          }));
          
          console.log(`Created ${serialNumbers.length} serial number objects`);
          
        } else if (tracksSerialNumbers && availableQuantity > 0) {

          console.log(`No serial numbers found for product that requires serials`);
          errors.push({
            row: rowNumber,
            data: row,
            error: `Product requires serial numbers but none provided. Available quantity: ${availableQuantity}`
          });
          continue;
        }

        let stockEntry = await CenterStock.findOne({
          center: centerInfo.id,
          product: productId
        });

        if (stockEntry) {

          console.log(`Updating existing stock entry`);
          
          const oldValues = {
            total: stockEntry.totalQuantity,
            available: stockEntry.availableQuantity,
            inTransit: stockEntry.inTransitQuantity,
            consumed: stockEntry.consumedQuantity,
            serials: stockEntry.serialNumbers.length
          };

          // stockEntry.totalQuantity = availableQuantity;
          // stockEntry.availableQuantity = availableQuantity;
             stockEntry.totalQuantity += availableQuantity;
             stockEntry.availableQuantity += availableQuantity;
          stockEntry.inTransitQuantity = 0;
          stockEntry.consumedQuantity = 0;

          if (tracksSerialNumbers && serialNumbers.length > 0) {
            stockEntry.serialNumbers = serialNumbers;
          } else if (!tracksSerialNumbers) {
            stockEntry.serialNumbers = [];
          }
          
          stockEntry.lastUpdated = new Date();
          await stockEntry.save();

          await stockEntry.populate('center', 'centerName centerCode');
          await stockEntry.populate('product', 'productTitle productCode trackSerialNumber');

          successfulUploads.push({
            row: rowNumber,
            stock: stockEntry,
            action: 'updated',
            oldValues
          });
        } else {

          console.log(`Creating new stock entry`);
          
          const newStock = new CenterStock({
            center: centerInfo.id,
            product: productId,
            totalQuantity: availableQuantity,
            availableQuantity: availableQuantity,
            inTransitQuantity: 0,
            consumedQuantity: 0,
            serialNumbers: serialNumbers,
            lastUpdated: new Date()
          });

          await newStock.save();

          await newStock.populate('center', 'centerName centerCode');
          await newStock.populate('product', 'productTitle productCode trackSerialNumber');

          successfulUploads.push({
            row: rowNumber,
            stock: newStock,
            action: 'created'
          });
        }

      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push({
          row: rowNumber,
          data: row,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk upload completed. ${successfulUploads.length} stock entries processed, ${errors.length} errors, ${warnings.length} warnings.`,
      data: {
        totalProcessed: results.length,
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

export const downloadCenterStockSampleCSV = async (req, res) => {
  try {
    const sampleCenters = await Center.find({ centerType: "Center" }).limit(2).select('centerName centerCode');
    const sampleProducts = await Product.find({}).limit(2).select('productTitle productCode trackSerialNumber');

    const headers = [
      'centerIdentifier',
      'productIdentifier',
      'availableQuantity',
      'serialNumbers'
    ].join(',');

    const sampleRows = [];

    if (sampleCenters.length > 0 && sampleProducts.length > 0) {

      sampleRows.push([
        sampleCenters[0].centerName,
        sampleProducts[0].productTitle,
        '75',
        'SN001234,SN001235,SN001236,SN001237'
      ].join(','));

      sampleRows.push([
        sampleCenters[0].centerCode,
        sampleProducts[1].productTitle,
        '30',
        ''
      ].join(','));

      if (sampleCenters.length > 1) {
        sampleRows.push([
          sampleCenters[1].centerName,
          sampleProducts[1].productTitle,
          '150',
          ''
        ].join(','));
      }
    } else {

      sampleRows.push('Main Center,Internet Package,75,SN001,SN002,SN003');
      sampleRows.push('City Center,Router Device,30,');
    }

    const csv = `${headers}\n${sampleRows.join('\n')}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="center_stock_sample.csv"');
    
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