import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";

/**
 * Bulk upload center stock from CSV
 * CSV format should have headers: centerName/centerCode, productName/productCode, totalQuantity, availableQuantity, inTransitQuantity, consumedQuantity, serialNumbers
 */
export const bulkUploadCenterStock = async (req, res) => {
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

    console.log("Processing center stock CSV from buffer, size:", req.file.size, "bytes");
    
    const results = [];
    const errors = [];
    const successfulUploads = [];
    const warnings = [];

    // Convert buffer to string and create readable stream
    const csvString = req.file.buffer.toString();
    
    // Parse CSV file
    await new Promise((resolve, reject) => {
      const readable = Readable.from([csvString]);
      readable
        .pipe(csv())
        .on('data', (data) => {
          // Log raw data for debugging
          console.log("Raw row data:", data);
          
          // Normalize field names
          const normalizedData = {};
          Object.keys(data).forEach(key => {
            const cleanKey = key.replace(/^\uFEFF/, '').trim();
            const lowerKey = cleanKey.toLowerCase();
            
            // Map common variations to expected field names
            let mappedKey = lowerKey;
            
            // Center identifier
            if (lowerKey.includes('center') || lowerKey.includes('nashik') || lowerKey.includes('outlet')) {
              mappedKey = 'centerIdentifier';
            } 
            // Product identifier
            else if (lowerKey.includes('product')) {
              mappedKey = 'productIdentifier';
            } 
            // Total quantity
            else if (lowerKey.includes('totalqty') || lowerKey.includes('total quantity') || lowerKey === 'totalquantity') {
              mappedKey = 'totalQuantity';
            } 
            // Available quantity
            else if (lowerKey.includes('availableqty') || lowerKey.includes('available quantity') || lowerKey === 'availablequantity') {
              mappedKey = 'availableQuantity';
            } 
            // In transit quantity
            else if (lowerKey.includes('intransit') || lowerKey.includes('in transit') || lowerKey === 'intransitquantity' || lowerKey === 'inTransitQuantity') {
              mappedKey = 'inTransitQuantity';
            } 
            // Consumed quantity
            else if (lowerKey.includes('consumedqty') || lowerKey.includes('consumed quantity') || lowerKey === 'consumedquantity') {
              mappedKey = 'consumedQuantity';
            } 
            // Serial numbers
            else if (lowerKey.includes('serial') || lowerKey.includes('serial numbers') || lowerKey === 'serialnumbers') {
              mappedKey = 'serialNumbers';
            }
            
            // Store with consistent keys
            if (mappedKey === 'serialNumbers') {
              normalizedData['serialNumbers'] = data[key] ? data[key].trim() : '';
            } else {
              normalizedData[mappedKey] = data[key] ? data[key].trim() : '';
            }
          });
          
          // Ensure we have all required fields with consistent naming
          if (!normalizedData['serialNumbers'] && data['serialNumbers']) {
            normalizedData['serialNumbers'] = data['serialNumbers'].trim();
          }
          
          results.push(normalizedData);
        })
        .on('end', () => {
          console.log(`CSV parsing complete. Found ${results.length} rows`);
          console.log("First row normalized:", JSON.stringify(results[0], null, 2));
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
    const allProducts = await Product.find({}).select('productTitle productCode _id trackSerialNumber').lean();

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
    const productSerialTrackingMap = new Map();
    allProducts.forEach(product => {
      productMap.set(product.productTitle.toLowerCase(), product._id);
      productSerialTrackingMap.set(product._id.toString(), product.trackSerialNumber === "Yes");
      if (product.productCode) {
        productCodeMap.set(product.productCode.toLowerCase(), product._id);
      }
    });

    // Process each row
    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      const rowNumber = index + 2;

      try {
        console.log(`\nProcessing row ${rowNumber}:`, JSON.stringify(row, null, 2));
        
        // Get center identifier - check both camelCase and lowercase
        const centerIdentifier = row.centerIdentifier || row.centeridentifier;
        
        if (!centerIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Center identifier (name or code) is required'
          });
          continue;
        }

        // Get product identifier - check both camelCase and lowercase
        const productIdentifier = row.productIdentifier || row.productidentifier;
        
        if (!productIdentifier) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Product identifier (name or code) is required'
          });
          continue;
        }

        // Find center
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

        // Check if center is of type "Center" (not Outlet)
        if (centerInfo.type !== "Center") {
          errors.push({
            row: rowNumber,
            data: row,
            error: `Center must be of type "Center" (not Outlet): ${centerIdentifier}`
          });
          continue;
        }

        // Find product
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

        // Check if product tracks serial numbers
        const tracksSerialNumbers = productSerialTrackingMap.get(productId.toString()) || false;
        console.log(`Product tracks serial numbers: ${tracksSerialNumbers}`);

        // Parse quantities - check both camelCase and lowercase
        const totalQuantity = parseInt(row.totalQuantity || row.totalquantity) || 0;
        const availableQuantity = parseInt(row.availableQuantity || row.availablequantity) || 0;
        const inTransitQuantity = parseInt(row.inTransitQuantity || row.intransitquantity) || 0;
        const consumedQuantity = parseInt(row.consumedQuantity || row.consumedquantity) || 0;

        console.log(`Quantities - Total: ${totalQuantity}, Available: ${availableQuantity}, InTransit: ${inTransitQuantity}, Consumed: ${consumedQuantity}`);

        // Validate quantity consistency
        if (totalQuantity < 0 || availableQuantity < 0 || inTransitQuantity < 0 || consumedQuantity < 0) {
          errors.push({
            row: rowNumber,
            data: row,
            error: 'Quantities cannot be negative'
          });
          continue;
        }

        // Validate quantity sum
        if (availableQuantity + consumedQuantity + inTransitQuantity > totalQuantity) {
          warnings.push({
            row: rowNumber,
            data: row,
            warning: 'Sum of available, consumed, and in-transit quantities exceeds total quantity'
          });
        }

        // Parse serial numbers if provided - check both camelCase and lowercase
        let serialNumbers = [];
        const serialNumbersStr = row.serialNumbers || row.serialnumbers;
        
        if (serialNumbersStr && serialNumbersStr.trim() !== '') {
          const serialList = serialNumbersStr.split(',').map(s => s.trim()).filter(s => s !== '');
          
          console.log(`Found serial numbers:`, serialList);
          
          // Check if serial count matches available quantity (for serialized products)
          if (tracksSerialNumbers && serialList.length > 0 && serialList.length !== availableQuantity) {
            warnings.push({
              row: rowNumber,
              data: row,
              warning: `Number of serial numbers (${serialList.length}) does not match available quantity (${availableQuantity})`
            });
          }

          // Create serial number objects with proper structure for your models
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
          // Product tracks serials but no serials provided
          console.log(`No serial numbers found for product that requires serials`);
          errors.push({
            row: rowNumber,
            data: row,
            error: `Product requires serial numbers but none provided. Available quantity: ${availableQuantity}`
          });
          continue;
        }

        // Check if stock entry already exists
        let stockEntry = await CenterStock.findOne({
          center: centerInfo.id,
          product: productId
        });

        if (stockEntry) {
          // Update existing stock
          console.log(`Updating existing stock entry`);
          
          const oldValues = {
            total: stockEntry.totalQuantity,
            available: stockEntry.availableQuantity,
            inTransit: stockEntry.inTransitQuantity,
            consumed: stockEntry.consumedQuantity,
            serials: stockEntry.serialNumbers.length
          };

          stockEntry.totalQuantity = totalQuantity;
          stockEntry.availableQuantity = availableQuantity;
          stockEntry.inTransitQuantity = inTransitQuantity;
          stockEntry.consumedQuantity = consumedQuantity;
          
          // Handle serial numbers - careful with this in production
          if (tracksSerialNumbers && serialNumbers.length > 0) {
            // Merge with existing serials or replace based on your business logic
            // This is a simplified approach - you might want more sophisticated logic
            
            // Get existing serial numbers
            const existingSerials = new Set(stockEntry.serialNumbers.map(s => s.serialNumber));
            
            // Add new serials that don't exist
            serialNumbers.forEach(newSerial => {
              if (!existingSerials.has(newSerial.serialNumber)) {
                stockEntry.serialNumbers.push(newSerial);
              }
            });
            
            // Remove serials that are no longer in the list? This depends on your business logic
            // For safety, we'll keep existing serials and only add new ones
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
          // Create new stock entry
          console.log(`Creating new stock entry`);
          
          const newStock = new CenterStock({
            center: centerInfo.id,
            product: productId,
            totalQuantity: totalQuantity,
            availableQuantity: availableQuantity,
            inTransitQuantity: inTransitQuantity,
            consumedQuantity: consumedQuantity,
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

/**
 * Download sample CSV template for center stock
 */
export const downloadCenterStockSampleCSV = async (req, res) => {
  try {
    // Get some sample centers and products
    const sampleCenters = await Center.find({ centerType: "Center" }).limit(2).select('centerName centerCode');
    const sampleProducts = await Product.find({}).limit(2).select('productTitle productCode trackSerialNumber');

    const headers = [
      'centerIdentifier',
      'productIdentifier',
      'totalQuantity',
      'availableQuantity',
      'inTransitQuantity',
      'consumedQuantity',
      'serialNumbers'
    ].join(',');

    const sampleRows = [];

    // Generate sample rows
    if (sampleCenters.length > 0 && sampleProducts.length > 0) {
      // Serialized product example
      sampleRows.push([
        sampleCenters[0].centerName,
        sampleProducts[0].productTitle,
        '100',
        '75',
        '15',
        '10',
        'SN001234,SN001235,SN001236,SN001237'
      ].join(','));

      // Non-serialized product example
      sampleRows.push([
        sampleCenters[0].centerCode,
        sampleProducts[1].productTitle,
        '50',
        '30',
        '10',
        '10',
        ''
      ].join(','));

      if (sampleCenters.length > 1) {
        sampleRows.push([
          sampleCenters[1].centerName,
          sampleProducts[1].productTitle,
          '200',
          '150',
          '30',
          '20',
          ''
        ].join(','));
      }
    } else {
      // Fallback sample data
      sampleRows.push('Main Center,Internet Package,100,75,15,10,SN001,SN002,SN003');
      sampleRows.push('City Center,Router Device,50,30,10,10,');
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

/**
 * Download all center stock data as CSV
 */
export const downloadCenterStockCSV = async (req, res) => {
  try {
    const {
      center,
      product,
      status,
      startDate,
      endDate
    } = req.query;

    // Build filter
    const filter = {};
    if (center) filter.center = center;
    if (product) filter.product = product;

    // Date filter
    if (startDate || endDate) {
      filter.lastUpdated = {};
      if (startDate) filter.lastUpdated.$gte = new Date(startDate);
      if (endDate) filter.lastUpdated.$lte = new Date(endDate);
    }

    // Get all center stock with populated data
    const stockEntries = await CenterStock.find(filter)
      .populate('center', 'centerName centerCode centerType')
      .populate('product', 'productTitle productCode trackSerialNumber')
      .lean();

    if (stockEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No stock entries found to export"
      });
    }

    // Prepare CSV data
    const csvData = [];

    stockEntries.forEach(entry => {
      // Create one row per stock entry
      const baseRow = {
        'Center Name': entry.center?.centerName || '',
        'Center Code': entry.center?.centerCode || '',
        'Center Type': entry.center?.centerType || '',
        'Product Name': entry.product?.productTitle || '',
        'Product Code': entry.product?.productCode || '',
        'Product Tracks Serial': entry.product?.trackSerialNumber || 'No',
        'Total Quantity': entry.totalQuantity || 0,
        'Available Quantity': entry.availableQuantity || 0,
        'In Transit Quantity': entry.inTransitQuantity || 0,
        'Consumed Quantity': entry.consumedQuantity || 0,
        'Total Serial Count': entry.serialNumbers?.length || 0,
        'Last Updated': entry.lastUpdated ? new Date(entry.lastUpdated).toLocaleString() : '',
        'Created At': entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''
      };

      // If there are serial numbers and status filter is not applied, create one row per serial number
      if (entry.serialNumbers && entry.serialNumbers.length > 0) {
        // Filter serials by status if needed
        let serialsToInclude = entry.serialNumbers;
        if (status && status !== 'all') {
          serialsToInclude = entry.serialNumbers.filter(sn => sn.status === status);
        }

        serialsToInclude.forEach((serial, index) => {
          csvData.push({
            ...baseRow,
            'Serial Number': serial.serialNumber || '',
            'Serial Status': serial.status || '',
            'Original Outlet': serial.originalOutlet || '',
            'Current Location': serial.currentLocation || '',
            'Purchase ID': serial.purchaseId?.toString() || '',
            'Consumed Date': serial.consumedDate ? new Date(serial.consumedDate).toLocaleString() : '',
            'Consumed By': serial.consumedBy || '',
            'Transfer History Count': serial.transferHistory?.length || 0,
            'Serial Created': serial.createdAt ? new Date(serial.createdAt).toLocaleString() : ''
          });
        });
      } else {
        // If no serial numbers, still include the stock entry
        csvData.push({
          ...baseRow,
          'Serial Number': '',
          'Serial Status': '',
          'Original Outlet': '',
          'Current Location': '',
          'Purchase ID': '',
          'Consumed Date': '',
          'Consumed By': '',
          'Transfer History Count': 0,
          'Serial Created': ''
        });
      }
    });

    // Define CSV fields
    const fields = [
      'Center Name',
      'Center Code',
      'Center Type',
      'Product Name',
      'Product Code',
      'Product Tracks Serial',
      'Total Quantity',
      'Available Quantity',
      'In Transit Quantity',
      'Consumed Quantity',
      'Total Serial Count',
      'Serial Number',
      'Serial Status',
      'Original Outlet',
      'Current Location',
      'Purchase ID',
      'Consumed Date',
      'Consumed By',
      'Transfer History Count',
      'Serial Created',
      'Last Updated',
      'Created At'
    ];

    // Convert to CSV
    const { Parser } = await import('json2csv');
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(csvData);

    // Set headers for file download
    const filename = `center_stock_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.status(200).send(csv);

  } catch (error) {
    console.error('Download center stock CSV error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting center stock data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};