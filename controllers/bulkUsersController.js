import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream'
import Center from '../models/Center.js';
import Roles from '../models/Roles.js';
import { fileURLToPath } from 'url';
import path from 'path';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const bulkUploadUsersEnhanced = async (req, res) => {
    try {
      console.log("========== DEBUG ==========");
      console.log("req.file:", req.file);
      console.log("req.file keys:", req.file ? Object.keys(req.file) : 'No file');
      console.log("===========================");
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a CSV file'
        });
      }
  
      // Since you're using memory storage, process from buffer
      if (!req.file.buffer) {
        return res.status(500).json({
          success: false,
          message: 'No file buffer found',
          debug: {
            fileKeys: Object.keys(req.file)
          }
        });
      }
  
      console.log("Processing CSV from buffer, size:", req.file.size, "bytes");
      
      const results = [];
      const errors = [];
      const successfulUsers = [];
  
      // Convert buffer to string and create readable stream
      const csvString = req.file.buffer.toString();
      
      // Parse CSV file
      await new Promise((resolve, reject) => {
        const readable = Readable.from([csvString]);
        readable
          .pipe(csv())
          .on('data', (data) => {
            // Clean up the data - remove any BOM or special characters
            const cleanedData = {};
            Object.keys(data).forEach(key => {
              const cleanKey = key.replace(/^\uFEFF/, '').trim();
              cleanedData[cleanKey] = data[key] ? data[key].trim() : '';
            });
            results.push(cleanedData);
          })
          .on('end', () => {
            console.log(`CSV parsing complete. Found ${results.length} rows`);
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
  
      // Log first row for debugging
      console.log("First row of CSV:", results[0]);
  
      // Get all centers for faster lookup
      console.log("Fetching centers and roles from database...");
      const allCenters = await Center.find({}).select('centerName centerCode _id').lean();
      const allRoles = await Roles.find({}).select('roleTitle _id').lean();
  
      console.log(`Found ${allCenters.length} centers and ${allRoles.length} roles`);
  
      // Create lookup maps
      const centerMap = new Map();
      const centerCodeMap = new Map();
      allCenters.forEach(center => {
        centerMap.set(center.centerName.toLowerCase(), center._id);
        if (center.centerCode) {
          centerCodeMap.set(center.centerCode.toLowerCase(), center._id);
        }
      });
  
      const roleMap = new Map();
      allRoles.forEach(role => {
        roleMap.set(role.roleTitle.toLowerCase(), role._id);
      });
  
      // Process each row
      for (let index = 0; index < results.length; index++) {
        const row = results[index];
        const rowNumber = index + 2;
  
        try {
          // Validate required fields
          if (!row.fullName || !row.username || !row.email || !row.password) {
            errors.push({
              row: rowNumber,
              data: row,
              error: 'Missing required fields: fullName, username, email, password are required'
            });
            continue;
          }
  
          // Process centers
          let centers = [];
          if (row.centers) {
            const centerIdentifiers = row.centers.split(',').map(c => c.trim().toLowerCase()).filter(c => c);
            
            if (centerIdentifiers.length === 0) {
              errors.push({
                row: rowNumber,
                data: row,
                error: 'No centers provided'
              });
              continue;
            }
  
            for (const identifier of centerIdentifiers) {
              // Try to find by name first
              let centerId = centerMap.get(identifier);
              
              // If not found by name, try by code
              if (!centerId) {
                centerId = centerCodeMap.get(identifier);
              }
  
              if (centerId) {
                centers.push(centerId);
              } else {
                errors.push({
                  row: rowNumber,
                  data: row,
                  error: `Center not found: ${identifier}`
                });
              }
            }
  
            if (centers.length === 0) {
              continue;
            }
          } else {
            errors.push({
              row: rowNumber,
              data: row,
              error: 'Centers field is required'
            });
            continue;
          }
  
          // Process role
          let roleId = null;
          if (row.role) {
            const roleTitle = row.role.trim().toLowerCase();
            roleId = roleMap.get(roleTitle);
            
            if (!roleId) {
              errors.push({
                row: rowNumber,
                data: row,
                error: `Role not found: ${row.role}`
              });
              continue;
            }
          }
  
          // Check if user already exists
          const existingUser = await User.findOne({
            $or: [
              { email: row.email.toLowerCase() },
              { username: row.username.toLowerCase() }
            ]
          });
  
          if (existingUser) {
            errors.push({
              row: rowNumber,
              data: row,
              error: 'User with this email or username already exists'
            });
            continue;
          }
  
          // Validate email format
          const emailRegex = /^\S+@\S+\.\S+$/;
          if (!emailRegex.test(row.email)) {
            errors.push({
              row: rowNumber,
              data: row,
              error: 'Invalid email format'
            });
            continue;
          }
  
          // Validate mobile if provided
          if (row.mobile && !/^[0-9]{10}$/.test(row.mobile)) {
            errors.push({
              row: rowNumber,
              data: row,
              error: 'Mobile number must be 10 digits'
            });
            continue;
          }
  
          // Create user
          const userData = {
            fullName: row.fullName.trim(),
            username: row.username.toLowerCase().trim(),
            email: row.email.toLowerCase().trim(),
            mobile: row.mobile ? row.mobile.trim() : '',
            password: row.password,
            confirmPassword: row.password,
            accessibleCenters: centers,
          };
  
          if (roleId) {
            userData.role = roleId;
          }
  
          if (centers.length === 1) {
            userData.center = centers[0];
          }
  
          const user = new User(userData);
          await user.save();
  
          // Get populated data for response
          await user.populate('role', 'roleTitle');
          await user.populate({
            path: 'accessibleCenters',
            select: 'centerName centerCode'
          });
  
          const userResponse = user.toObject();
          delete userResponse.password;
          delete userResponse.confirmPassword;
  
          successfulUsers.push({
            row: rowNumber,
            user: userResponse
          });
  
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
        message: `Bulk upload completed. ${successfulUsers.length} users created, ${errors.length} errors.`,
        data: {
          totalProcessed: results.length,
          successful: successfulUsers.length,
          failed: errors.length,
          successfulUsers: successfulUsers,
          errors: errors
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

export const downloadSampleCSV = async (req, res) => {
  try {
    // Get some sample centers and roles for the template
    const sampleCenters = await Center.find({}).limit(2).select('centerName');
    const sampleRoles = await Roles.find({}).limit(2).select('roleTitle');

    const centerNames = sampleCenters.map(c => c.centerName).join(',');
    const roleTitle = sampleRoles.length > 0 ? sampleRoles[0].roleTitle : 'admin';

    const headers = [
      'fullName',
      'username',
      'email',
      'mobile',
      'password',
      'role',
      'centers'
    ].join(',');

    const sampleRow = [
      'John Doe',
      'johndoe',
      'john@example.com',
      '1234567890',
      'Password123',
      roleTitle,
      centerNames
    ].join(',');

    const csv = `${headers}\n${sampleRow}\n` +
      'Jane Smith,janesmith,jane@example.com,0987654321,Password123,admin,Main Center\n' +
      'Bob Wilson,bobwilson,bob@example.com,1122334455,Password123,manager,"North Center,East Center"';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sample-users.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error('Download sample CSV error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating sample CSV'
    });
  }
};