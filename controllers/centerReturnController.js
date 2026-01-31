// import mongoose from "mongoose";
// import Center from "../models/Center.js";
// import CenterStock from "../models/CenterStock.js";
// import ResellerStock from "../models/ResellerStock.js";
// import Product from "../models/Product.js";
// import User from "../models/User.js";

// export const createCenterReturn = async (req, res) => {
//     try {
//       const userId = req.user?.id;
//       if (!userId) {
//         return res.status(400).json({
//           success: false,
//           message: "User authentication required",
//         });
//       }
  
//       const { date, remark, products } = req.body;
  
//       // Get user and their center
//       const user = await User.findById(userId).populate("center");
//       if (!user || !user.center) {
//         return res.status(400).json({
//           success: false,
//           message: "User center information not found",
//         });
//       }
  
//       const centerId = user.center._id;
//       const center = await Center.findById(centerId).populate("reseller");
      
//       if (!center) {
//         return res.status(404).json({
//           success: false,
//           message: "Center not found",
//         });
//       }
  
//       if (!center.reseller) {
//         return res.status(400).json({
//           success: false,
//           message: "Center does not have an associated reseller",
//         });
//       }
  
//       const resellerId = center.reseller._id || center.reseller;
  
//       // Validate required fields
//       if (!products || !Array.isArray(products) || products.length === 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Products array is required and cannot be empty",
//         });
//       }
  
//       // Validate products
//       for (const productItem of products) {
//         if (!productItem.product) {
//           return res.status(400).json({
//             success: false,
//             message: "Product ID is required for each product",
//           });
//         }
  
//         if (!productItem.quantity || productItem.quantity <= 0) {
//           return res.status(400).json({
//             success: false,
//             message: "Valid quantity (greater than 0) is required for each product",
//           });
//         }
  
//         // Check if product exists
//         const product = await Product.findById(productItem.product);
//         if (!product) {
//           return res.status(404).json({
//             success: false,
//             message: `Product ${productItem.product} not found`,
//           });
//         }
  
//         // For serialized products, validate serial numbers
//         if (product.trackSerialNumber === "Yes") {
//           if (!productItem.serialNumbers || !Array.isArray(productItem.serialNumbers) || 
//               productItem.serialNumbers.length === 0) {
//             return res.status(400).json({
//               success: false,
//               message: `Serial numbers are required for product ${product.productTitle} as it tracks serial numbers`,
//             });
//           }
  
//           if (productItem.serialNumbers.length !== productItem.quantity) {
//             return res.status(400).json({
//               success: false,
//               message: `Number of serial numbers (${productItem.serialNumbers.length}) must match quantity (${productItem.quantity}) for product ${product.productTitle}`,
//             });
//           }
  
//           // Check for duplicate serial numbers
//           const uniqueSerials = new Set(productItem.serialNumbers);
//           if (uniqueSerials.size !== productItem.serialNumbers.length) {
//             return res.status(400).json({
//               success: false,
//               message: `Duplicate serial numbers found for product ${product.productTitle}`,
//             });
//           }
//         } else {
//           // For non-serialized products, serialNumbers should not be provided
//           if (productItem.serialNumbers && productItem.serialNumbers.length > 0) {
//             return res.status(400).json({
//               success: false,
//               message: `Serial numbers should not be provided for product ${product.productTitle} as it does not track serial numbers`,
//             });
//           }
//         }
//       }
  
//       try {
//         const returnDate = date ? new Date(date) : new Date();
        
//         // Process each product
//         const processedProducts = [];
        
//         for (const productItem of products) {
//           const productId = productItem.product;
//           const quantity = productItem.quantity;
//           const serialNumbers = productItem.serialNumbers || [];
          
//           // Get center stock
//           const centerStock = await CenterStock.findOne({
//             center: centerId,
//             product: productId
//           });

//           if (!centerStock) {
//             throw new Error(`No stock found in center for product ${productId}`);
//           }

//           // Validate stock availability - check available quantity
//           if (centerStock.availableQuantity < quantity) {
//             throw new Error(`Insufficient stock available for product ${productId}. Available: ${centerStock.availableQuantity}, Requested: ${quantity}`);
//           }

//           const product = await Product.findById(productId);
//           const processedItem = {
//             product: productId,
//             quantity: quantity,
//             serialNumbers: [],
//             centerStockBefore: {
//               totalQuantity: centerStock.totalQuantity,
//               availableQuantity: centerStock.availableQuantity,
//               consumedQuantity: centerStock.consumedQuantity
//             }
//           };

//           if (product.trackSerialNumber === "Yes") {
//             // Process serialized products
//             processedItem.serialNumbers = [...serialNumbers];
            
//             for (const serialNumber of serialNumbers) {
//               // Find the serial in center stock with AVAILABLE status
//               const serialIndex = centerStock.serialNumbers.findIndex(
//                 sn => sn.serialNumber === serialNumber && 
//                 sn.status === "available" && 
//                 sn.currentLocation?.toString() === centerId.toString()
//               );

//               if (serialIndex === -1) {
//                 throw new Error(`Serial number ${serialNumber} not found in center stock or not in available status`);
//               }

//               // UPDATE: Change status to "transferred" when returning to reseller
//               centerStock.serialNumbers[serialIndex].status = "transferred";
//               centerStock.serialNumbers[serialIndex].currentLocation = resellerId; // Set to reseller
//               centerStock.serialNumbers[serialIndex].transferredDate = new Date();
//               centerStock.serialNumbers[serialIndex].transferredBy = userId;
              
//               // Add transfer history
//               centerStock.serialNumbers[serialIndex].transferHistory.push({
//                 fromCenter: centerId,
//                 toReseller: resellerId, // New: toReseller instead of toCenter
//                 transferDate: new Date(),
//                 transferType: "center_to_reseller_return",
//                 remark: `Returned to reseller: ${remark || "No remark"}`,
//                 transferredBy: userId
//               });
//             }

//             // Update center stock quantities
//             centerStock.availableQuantity -= quantity;
//             centerStock.totalQuantity -= quantity; // Also reduce total since it's transferred out
            
//           } else {
//             // Process non-serialized products
//             // Reduce both available and total quantity since it's leaving center
//             centerStock.availableQuantity -= quantity;
//             centerStock.totalQuantity -= quantity;
//           }

//           // Save updated center stock
//           centerStock.lastUpdated = new Date();
//           await centerStock.save();

//           processedItem.centerStockAfter = {
//             totalQuantity: centerStock.totalQuantity,
//             availableQuantity: centerStock.availableQuantity,
//             consumedQuantity: centerStock.consumedQuantity
//           };

//           // Add to reseller stock
//           await addToResellerStock(
//             resellerId, 
//             productId, 
//             quantity, 
//             serialNumbers, 
//             centerId, 
//             userId, 
//             "center_to_reseller_return", // Updated transfer type
//             remark
//           );

//           processedProducts.push(processedItem);
//         }
        
//         // Create return record
//         const returnRecord = {
//           date: returnDate,
//           remark: remark || "",
//           center: centerId,
//           reseller: resellerId,
//           products: processedProducts.map(item => ({
//             product: item.product,
//             quantity: item.quantity,
//             serialNumbers: item.serialNumbers
//           })),
//           processedBy: userId,
//           processedAt: new Date(),
//           type: "center_to_reseller_return"
//         };

//         res.status(200).json({
//           success: true,
//           message: "Stock returned to reseller successfully",
//           data: {
//             returnRecord,
//             center: {
//               _id: center._id,
//               centerName: center.centerName,
//               centerCode: center.centerCode
//             },
//             reseller: {
//               _id: center.reseller._id,
//               businessName: center.reseller.businessName
//             },
//             processedProducts,
//             processedBy: {
//               _id: user._id,
//               fullName: user.fullName,
//               email: user.email
//             }
//           }
//         });

//       } catch (error) {
//         throw error;
//       }
  
//     } catch (error) {
//       console.error("Error creating center return:", error);
      
//       if (error.message.includes("Insufficient stock") ||
//           error.message.includes("not found in center stock") ||
//           error.message.includes("not in available status") ||
//           error.message.includes("Serial numbers are required") ||
//           error.message.includes("must match quantity") ||
//           error.message.includes("Duplicate serial numbers") ||
//           error.message.includes("Serial numbers should not be provided")) {
//         return res.status(400).json({
//           success: false,
//           message: error.message,
//         });
//       }
  
//       res.status(500).json({
//         success: false,
//         message: "Error processing center return",
//         error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//       });
//     }
//   };

// //   async function addToResellerStock(
// //     resellerId, 
// //     productId, 
// //     quantity, 
// //     serialNumbers = [], 
// //     sourceCenter, 
// //     userId, 
// //     sourceType = "center_to_reseller_return", 
// //     remark = ""
// //   ) {
// //     try {
// //       let resellerStock = await ResellerStock.findOne({
// //         reseller: resellerId,
// //         product: productId
// //       });

// //       if (!resellerStock) {
// //         // Create new reseller stock entry
// //         resellerStock = new ResellerStock({
// //           reseller: resellerId,
// //           product: productId,
// //           availableQuantity: 0,
// //           totalQuantity: 0,
// //           consumedQuantity: 0,
// //           damagedQuantity: 0,
// //           repairQuantity: 0,
// //           serialNumbers: []
// //         });
// //       }

// //       // Get product details for tracking serial numbers
// //       const product = await Product.findById(productId);

// //       if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
// //         // Add serialized products
// //         for (const serialNumber of serialNumbers) {
// //           // Check if serial already exists in reseller stock
// //           const existingSerialIndex = resellerStock.serialNumbers.findIndex(
// //             sn => sn.serialNumber === serialNumber
// //           );

// //           if (existingSerialIndex !== -1) {
// //             // Update existing serial - if it was consumed/damaged, make it available
// //             const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
            
// //             if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
// //               existingSerial.status = "available";
// //               existingSerial.currentLocation = resellerId; // Set to reseller
// //             }
            
// //             // Add transfer history
// //             existingSerial.transferHistory.push({
// //               fromCenter: sourceCenter,
// //               toReseller: resellerId,
// //               transferDate: new Date(),
// //               transferType: "center_to_reseller_return",
// //               referenceId: null,
// //               remark: `Returned from center: ${remark || "No remark"}`,
// //               transferredBy: userId
// //             });
            
// //           } else {
// //             // Add new serial with status "available" (returned stock is available at reseller)
// //             resellerStock.serialNumbers.push({
// //               serialNumber: serialNumber,
// //               status: "available",
// //               currentLocation: resellerId,
// //               transferHistory: [{
// //                 fromCenter: sourceCenter,
// //                 toReseller: resellerId,
// //                 transferDate: new Date(),
// //                 transferType: "center_to_reseller_return",
// //                 referenceId: null,
// //                 remark: `Returned from center - ${sourceType}: ${remark || "No remark"}`,
// //                 transferredBy: userId
// //               }]
// //             });
// //           }
// //         }

// //         // Update reseller stock quantities
// //         resellerStock.availableQuantity += quantity;
// //         resellerStock.totalQuantity += quantity;
        
// //       } else {
// //         // Add non-serialized products
// //         resellerStock.availableQuantity += quantity;
// //         resellerStock.totalQuantity += quantity;
// //       }

// //       resellerStock.lastUpdated = new Date();
// //       await resellerStock.save();

// //       return resellerStock;
// //     } catch (error) {
// //       console.error("Error adding to reseller stock:", error);
// //       throw error;
// //     }
// //   }


// async function addToResellerStock(
//     resellerId, 
//     productId, 
//     quantity, 
//     serialNumbers = [], 
//     sourceCenter, 
//     userId, 
//     sourceType = "center_to_reseller_return", 
//     remark = ""
//   ) {
//     try {
//       let resellerStock = await ResellerStock.findOne({
//         reseller: resellerId,
//         product: productId
//       });
  
//       if (!resellerStock) {
//         resellerStock = new ResellerStock({
//           reseller: resellerId,
//           product: productId,
//           availableQuantity: 0,
//           totalQuantity: 0,
//           consumedQuantity: 0,
//           damagedQuantity: 0,
//           repairQuantity: 0,
//           sourceBreakdown: {
//             damageRepairQuantity: 0,
//             centerReturnQuantity: 0,
//             directPurchaseQuantity: 0
//           },
//           serialNumbers: []
//         });
//       }
  
//       const product = await Product.findById(productId);
  
//       if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
//         for (const serialNumber of serialNumbers) {
//           const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//             sn => sn.serialNumber === serialNumber
//           );
  
//           if (existingSerialIndex !== -1) {
//             const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
            
//             if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
//               existingSerial.status = "available";
//               existingSerial.sourceType = "center_return"; // NEW: Mark as center return
//               existingSerial.currentLocation = resellerId;
//             }
            
//             existingSerial.transferHistory.push({
//               fromCenter: sourceCenter,
//               toReseller: resellerId,
//               transferDate: new Date(),
//               transferType: "center_to_reseller_return",
//               sourceType: "center_return", // NEW: Track source
//               referenceId: null,
//               remark: `Returned from center: ${remark || "No remark"}`,
//               transferredBy: userId
//             });
            
//           } else {
//             resellerStock.serialNumbers.push({
//               serialNumber: serialNumber,
//               status: "available",
//               sourceType: "center_return", // NEW: Mark as center return
//               currentLocation: resellerId,
//               transferHistory: [{
//                 fromCenter: sourceCenter,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "center_to_reseller_return",
//                 sourceType: "center_return", // NEW: Track source
//                 referenceId: null,
//                 remark: `Returned from center - ${sourceType}: ${remark || "No remark"}`,
//                 transferredBy: userId
//               }]
//             });
//           }
//         }
  
//         resellerStock.availableQuantity += quantity;
//         resellerStock.totalQuantity += quantity;
//         resellerStock.sourceBreakdown.centerReturnQuantity += quantity; // NEW: Track center return quantity
        
//       } else {
//         resellerStock.availableQuantity += quantity;
//         resellerStock.totalQuantity += quantity;
//         resellerStock.sourceBreakdown.centerReturnQuantity += quantity; // NEW: Track center return quantity
//       }
  
//       await resellerStock.save();
//       return resellerStock;
//     } catch (error) {
//       console.error("Error adding to reseller stock:", error);
//       throw error;
//     }
//   }




import mongoose from "mongoose";
import Center from "../models/Center.js";
import CenterStock from "../models/CenterStock.js";
import ResellerStock from "../models/ResellerStock.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

export const createCenterReturn = async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User authentication required",
        });
      }
  
      const { date, remark, products } = req.body;
  
      const user = await User.findById(userId).populate("center");
      if (!user || !user.center) {
        return res.status(400).json({
          success: false,
          message: "User center information not found",
        });
      }
  
      const centerId = user.center._id;
      const center = await Center.findById(centerId).populate("reseller");
      
      if (!center) {
        return res.status(404).json({
          success: false,
          message: "Center not found",
        });
      }
  
      if (!center.reseller) {
        return res.status(400).json({
          success: false,
          message: "Center does not have an associated reseller",
        });
      }
  
      const resellerId = center.reseller._id || center.reseller;
  
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Products array is required and cannot be empty",
        });
      }
  
      for (const productItem of products) {
        if (!productItem.product) {
          return res.status(400).json({
            success: false,
            message: "Product ID is required for each product",
          });
        }
  
        if (!productItem.quantity || productItem.quantity <= 0) {
          return res.status(400).json({
            success: false,
            message: "Valid quantity (greater than 0) is required for each product",
          });
        }
  
        const product = await Product.findById(productItem.product);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product ${productItem.product} not found`,
          });
        }
  
        if (product.trackSerialNumber === "Yes") {
          if (!productItem.serialNumbers || !Array.isArray(productItem.serialNumbers) || 
              productItem.serialNumbers.length === 0) {
            return res.status(400).json({
              success: false,
              message: `Serial numbers are required for product ${product.productTitle} as it tracks serial numbers`,
            });
          }
  
          if (productItem.serialNumbers.length !== productItem.quantity) {
            return res.status(400).json({
              success: false,
              message: `Number of serial numbers (${productItem.serialNumbers.length}) must match quantity (${productItem.quantity}) for product ${product.productTitle}`,
            });
          }
          const uniqueSerials = new Set(productItem.serialNumbers);
          if (uniqueSerials.size !== productItem.serialNumbers.length) {
            return res.status(400).json({
              success: false,
              message: `Duplicate serial numbers found for product ${product.productTitle}`,
            });
          }
        } else {

          if (productItem.serialNumbers && productItem.serialNumbers.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Serial numbers should not be provided for product ${product.productTitle} as it does not track serial numbers`,
            });
          }
        }
      }
  
      try {
        const returnDate = date ? new Date(date) : new Date();

        const processedProducts = [];
        
        for (const productItem of products) {
          const productId = productItem.product;
          const quantity = productItem.quantity;
          const serialNumbers = productItem.serialNumbers || [];

          const centerStock = await CenterStock.findOne({
            center: centerId,
            product: productId
          });

          if (!centerStock) {
            throw new Error(`No stock found in center for product ${productId}`);
          }

          if (centerStock.availableQuantity < quantity) {
            throw new Error(`Insufficient stock available for product ${productId}. Available: ${centerStock.availableQuantity}, Requested: ${quantity}`);
          }

          const product = await Product.findById(productId);
          const processedItem = {
            product: productId,
            quantity: quantity,
            serialNumbers: [],
            centerStockBefore: {
              totalQuantity: centerStock.totalQuantity,
              availableQuantity: centerStock.availableQuantity,
              consumedQuantity: centerStock.consumedQuantity
            }
          };

          if (product.trackSerialNumber === "Yes") {
            processedItem.serialNumbers = [...serialNumbers];
            
            for (const serialNumber of serialNumbers) {
              const serialIndex = centerStock.serialNumbers.findIndex(
                sn => sn.serialNumber === serialNumber && 
                sn.status === "available" && 
                sn.currentLocation?.toString() === centerId.toString()
              );

              if (serialIndex === -1) {
                throw new Error(`Serial number ${serialNumber} not found in center stock or not in available status`);
              }

              centerStock.serialNumbers[serialIndex].status = "transferred";
              centerStock.serialNumbers[serialIndex].currentLocation = resellerId; 
              centerStock.serialNumbers[serialIndex].transferredDate = new Date();
              centerStock.serialNumbers[serialIndex].transferredBy = userId;
              
              centerStock.serialNumbers[serialIndex].transferHistory.push({
                fromCenter: centerId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "center_to_reseller_return",
                remark: `Returned to reseller: ${remark || "No remark"}`,
                transferredBy: userId
              });
            }
            centerStock.availableQuantity -= quantity;
            centerStock.totalQuantity -= quantity; 
          } else {
            centerStock.availableQuantity -= quantity;
            centerStock.totalQuantity -= quantity;
          }

          centerStock.lastUpdated = new Date();
          await centerStock.save();

          processedItem.centerStockAfter = {
            totalQuantity: centerStock.totalQuantity,
            availableQuantity: centerStock.availableQuantity,
            consumedQuantity: centerStock.consumedQuantity
          };

          await addToResellerStock(
            resellerId, 
            productId, 
            quantity, 
            serialNumbers, 
            centerId, 
            userId, 
            "center_to_reseller_return",
            remark
          );

          processedProducts.push(processedItem);
        }
        
        const returnRecord = {
          date: returnDate,
          remark: remark || "",
          center: centerId,
          reseller: resellerId,
          products: processedProducts.map(item => ({
            product: item.product,
            quantity: item.quantity,
            serialNumbers: item.serialNumbers
          })),
          processedBy: userId,
          processedAt: new Date(),
          type: "center_to_reseller_return"
        };

        res.status(200).json({
          success: true,
          message: "Stock returned to reseller successfully",
          data: {
            returnRecord,
            center: {
              _id: center._id,
              centerName: center.centerName,
              centerCode: center.centerCode
            },
            reseller: {
              _id: center.reseller._id,
              businessName: center.reseller.businessName
            },
            processedProducts,
            processedBy: {
              _id: user._id,
              fullName: user.fullName,
              email: user.email
            }
          }
        });

      } catch (error) {
        throw error;
      }
  
    } catch (error) {
      console.error("Error creating center return:", error);
      
      if (error.message.includes("Insufficient stock") ||
          error.message.includes("not found in center stock") ||
          error.message.includes("not in available status") ||
          error.message.includes("Serial numbers are required") ||
          error.message.includes("must match quantity") ||
          error.message.includes("Duplicate serial numbers") ||
          error.message.includes("Serial numbers should not be provided")) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
  
      res.status(500).json({
        success: false,
        message: "Error processing center return",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  };

// async function addToResellerStock(
//     resellerId, 
//     productId, 
//     quantity, 
//     serialNumbers = [], 
//     sourceCenter, 
//     userId, 
//     sourceType = "center_to_reseller_return", 
//     remark = ""
//   ) {
//     try {
//       let resellerStock = await ResellerStock.findOne({
//         reseller: resellerId,
//         product: productId
//       });
  
//       if (!resellerStock) {
//         resellerStock = new ResellerStock({
//           reseller: resellerId,
//           product: productId,
//           availableQuantity: 0,
//           totalQuantity: 0,
//           consumedQuantity: 0,
//           damagedQuantity: 0,
//           repairQuantity: 0,
//           sourceBreakdown: {
//             damageRepairQuantity: 0,
//             centerReturnQuantity: 0,
//             directPurchaseQuantity: 0
//           },
//           serialNumbers: []
//         });
//       }
  
//       const product = await Product.findById(productId);
  
//       if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
//         for (const serialNumber of serialNumbers) {
//           const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//             sn => sn.serialNumber === serialNumber
//           );
  
//           if (existingSerialIndex !== -1) {
//             const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
            
//             if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
//               existingSerial.status = "available";
//               existingSerial.sourceType = "center_return";
//               existingSerial.currentLocation = resellerId;
//             }
            
//             existingSerial.transferHistory.push({
//               fromCenter: sourceCenter,
//               toReseller: resellerId,
//               transferDate: new Date(),
//               transferType: "center_to_reseller_return",
//               sourceType: "center_return",
//               referenceId: null,
//               remark: `Returned from center: ${remark || "No remark"}`,
//               transferredBy: userId
//             });
            
//           } else {
//             resellerStock.serialNumbers.push({
//               serialNumber: serialNumber,
//               status: "available",
//               sourceType: "center_return",
//               currentLocation: resellerId,
//               transferHistory: [{
//                 fromCenter: sourceCenter,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "center_to_reseller_return",
//                 sourceType: "center_return",
//                 referenceId: null,
//                 remark: `Returned from center - ${sourceType}: ${remark || "No remark"}`,
//                 transferredBy: userId
//               }]
//             });
//           }
//         }
  
//         resellerStock.availableQuantity += quantity;
//         resellerStock.totalQuantity += quantity;
//         resellerStock.sourceBreakdown.centerReturnQuantity += quantity;
        
//       } else {
//         resellerStock.availableQuantity += quantity;
//         resellerStock.totalQuantity += quantity;
//         resellerStock.sourceBreakdown.centerReturnQuantity += quantity; 
//       }
  
//       await resellerStock.save();
//       return resellerStock;
//     } catch (error) {
//       console.error("Error adding to reseller stock:", error);
//       throw error;
//     }
//   }


async function addToResellerStock(
  resellerId, 
  productId, 
  quantity, 
  serialNumbers = [], 
  sourceCenter, 
  userId, 
  sourceType = "center_to_reseller_return", 
  remark = ""
) {
  try {
    let resellerStock = await ResellerStock.findOne({
      reseller: resellerId,
      product: productId
    });

    if (!resellerStock) {
      resellerStock = new ResellerStock({
        reseller: resellerId,
        product: productId,
        availableQuantity: 0,
        totalQuantity: 0,
        consumedQuantity: 0,
        damagedQuantity: 0,
        repairQuantity: 0,
        centerReturns: [],
        sourceBreakdown: {
          damageRepairQuantity: 0,
          centerReturnQuantity: 0,
          directPurchaseQuantity: 0
        },
        serialNumbers: []
      });
    }

    const product = await Product.findById(productId);

    const existingCenterReturn = resellerStock.centerReturns.find(
      cr => cr.center.toString() === sourceCenter.toString()
    );

    if (existingCenterReturn) {
      existingCenterReturn.quantity += quantity;
      existingCenterReturn.date = new Date();
      existingCenterReturn.remark = remark || existingCenterReturn.remark;
    } else {
      resellerStock.centerReturns.push({
        center: sourceCenter,
        quantity: quantity,
        date: new Date(),
        sourceType: "center_return",
        remark: remark || "",
        addedBy: userId
      });
    }

    if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
      for (const serialNumber of serialNumbers) {
        const existingSerialIndex = resellerStock.serialNumbers.findIndex(
          sn => sn.serialNumber === serialNumber
        );

        if (existingSerialIndex !== -1) {
          const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
          
          if (existingSerial.status === "consumed" || existingSerial.status === "damaged") {
            existingSerial.status = "available";
            existingSerial.sourceType = "center_return";
            existingSerial.currentLocation = resellerId;
          }
          
          existingSerial.transferHistory.push({
            fromCenter: sourceCenter,
            toReseller: resellerId,
            transferDate: new Date(),
            transferType: "center_to_reseller_return",
            sourceType: "center_return",
            referenceId: null,
            remark: `Returned from center: ${remark || "No remark"}`,
            transferredBy: userId
          });
          
        } else {
          resellerStock.serialNumbers.push({
            serialNumber: serialNumber,
            status: "available",
            sourceType: "center_return",
            currentLocation: resellerId,
            transferHistory: [{
              fromCenter: sourceCenter,
              toReseller: resellerId,
              transferDate: new Date(),
              transferType: "center_to_reseller_return",
              sourceType: "center_return",
              referenceId: null,
              remark: `Returned from center - ${sourceType}: ${remark || "No remark"}`,
              transferredBy: userId
            }]
          });
        }
      }

      resellerStock.availableQuantity += quantity;
      resellerStock.totalQuantity += quantity;
      resellerStock.sourceBreakdown.centerReturnQuantity += quantity;
      
    } else {
      resellerStock.availableQuantity += quantity;
      resellerStock.totalQuantity += quantity;
      resellerStock.sourceBreakdown.centerReturnQuantity += quantity;
    }

    await resellerStock.save();
    return resellerStock;
  } catch (error) {
    console.error("Error adding to reseller stock:", error);
    throw error;
  }
}

  

  