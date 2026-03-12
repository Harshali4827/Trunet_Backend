
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

///*******************************************************8 */

// import mongoose from "mongoose";
// import Center from "../models/Center.js";
// import CenterStock from "../models/CenterStock.js";
// import CenterReturn from "../models/CenterReturn.js";
// import ResellerStock from "../models/ResellerStock.js";
// import Product from "../models/Product.js";
// import User from "../models/User.js";

// export const createCenterReturn = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const { date, remark, products } = req.body;

//     const user = await User.findById(userId).populate("center");
//     if (!user || !user.center) {
//       return res.status(400).json({
//         success: false,
//         message: "User center information not found",
//       });
//     }

//     const centerId = user.center._id;
//     const center = await Center.findById(centerId).populate("reseller");
    
//     if (!center) {
//       return res.status(404).json({
//         success: false,
//         message: "Center not found",
//       });
//     }

//     if (!center.reseller) {
//       return res.status(400).json({
//         success: false,
//         message: "Center does not have an associated reseller",
//       });
//     }

//     const resellerId = center.reseller._id || center.reseller;

//     if (!products || !Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Products array is required and cannot be empty",
//       });
//     }

//     const processedProducts = [];
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       for (const productItem of products) {
//         if (!productItem.product) {
//           throw new Error("Product ID is required for each product");
//         }

//         if (!productItem.quantity || productItem.quantity <= 0) {
//           throw new Error("Valid quantity (greater than 0) is required for each product");
//         }

//         const product = await Product.findById(productItem.product).session(session);
//         if (!product) {
//           throw new Error(`Product ${productItem.product} not found`);
//         }

//         if (product.trackSerialNumber === "Yes") {
//           if (!productItem.serialNumbers || !Array.isArray(productItem.serialNumbers) || 
//               productItem.serialNumbers.length === 0) {
//             throw new Error(`Serial numbers are required for product ${product.productTitle} as it tracks serial numbers`);
//           }

//           if (productItem.serialNumbers.length !== productItem.quantity) {
//             throw new Error(`Number of serial numbers (${productItem.serialNumbers.length}) must match quantity (${productItem.quantity}) for product ${product.productTitle}`);
//           }

//           const uniqueSerials = new Set(productItem.serialNumbers);
//           if (uniqueSerials.size !== productItem.serialNumbers.length) {
//             throw new Error(`Duplicate serial numbers found for product ${product.productTitle}`);
//           }
//         }

//         const centerStock = await CenterStock.findOne({
//           center: centerId,
//           product: productItem.product
//         }).session(session);

//         if (!centerStock) {
//           throw new Error(`No stock found in center for product ${productItem.product}`);
//         }

//         if (centerStock.availableQuantity < productItem.quantity) {
//           throw new Error(`Insufficient stock available for product ${productItem.product}. Available: ${centerStock.availableQuantity}, Requested: ${productItem.quantity}`);
//         }

//         if (product.trackSerialNumber === "Yes") {
//           for (const serialNumber of productItem.serialNumbers) {
//             const serial = centerStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber && 
//               sn.status === "available" && 
//               sn.currentLocation?.toString() === centerId.toString()
//             );

//             if (!serial) {
//               throw new Error(`Serial number ${serialNumber} not available in center stock`);
//             }
//           }
//         }

//         processedProducts.push({
//           product: productItem.product,
//           quantity: productItem.quantity,
//           serialNumbers: productItem.serialNumbers || [],
//           accepted: false
//         });
//       }

//       const returnRequest = new CenterReturn({
//         center: centerId,
//         reseller: resellerId,
//         products: processedProducts,
//         remark: remark || "",
//         returnDate: date ? new Date(date) : new Date(),
//         requestedBy: userId,
//         status: "pending"
//       });

//       await returnRequest.save({ session });

//       for (const productItem of products) {
//         const product = await Product.findById(productItem.product).session(session);
//         const centerStock = await CenterStock.findOne({
//           center: centerId,
//           product: productItem.product
//         }).session(session);

//         if (product.trackSerialNumber === "Yes") {

//           for (const serialNumber of productItem.serialNumbers) {
//             const serial = centerStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );
            
//             if (serial) {
//               serial.status = "pending_return";
//               serial.transferHistory.push({
//                 fromCenter: centerId,
//                 toReseller: resellerId,
//                 transferDate: new Date(),
//                 transferType: "center_to_reseller_return",
//                 remark: `Return requested: ${remark || "No remark"}`,
//                 transferredBy: userId
//               });
//             }
//           }

//           centerStock.availableQuantity -= productItem.quantity;
//         } else {
//           centerStock.availableQuantity -= productItem.quantity;
//         }

//         centerStock.lastUpdated = new Date();
//         await centerStock.save({ session });

//         await addToResellerPendingReturns(
//           resellerId,
//           productItem.product,
//           productItem.quantity,
//           productItem.serialNumbers || [],
//           centerId,
//           returnRequest._id,
//           returnRequest.returnNumber,
//           remark,
//           session
//         );
//       }

//       await session.commitTransaction();
//       session.endSession();

//       res.status(200).json({
//         success: true,
//         message: "Return request created successfully. Waiting for reseller acceptance.",
//         data: {
//           returnRequest,
//           center: {
//             _id: center._id,
//             centerName: center.centerName,
//             centerCode: center.centerCode
//           },
//           reseller: {
//             _id: center.reseller._id,
//             businessName: center.reseller.businessName
//           }
//         }
//       });

//     } catch (error) {
//       await session.abortTransaction();
//       session.endSession();
//       throw error;
//     }

//   } catch (error) {
//     console.error("Error creating center return:", error);
    
//     if (error.message.includes("Insufficient stock") ||
//         error.message.includes("not available in center stock") ||
//         error.message.includes("Serial numbers are required")) {
//       return res.status(400).json({
//         success: false,
//         message: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error processing center return",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//     });
//   }
// };

// async function addToResellerPendingReturns(
//   resellerId,
//   productId,
//   quantity,
//   serialNumbers,
//   centerId,
//   returnId,
//   returnNumber,
//   remark,
//   session
// ) {
//   let resellerStock = await ResellerStock.findOne({
//     reseller: resellerId,
//     product: productId
//   }).session(session);

//   if (!resellerStock) {
//     resellerStock = new ResellerStock({
//       reseller: resellerId,
//       product: productId,
//       availableQuantity: 0,
//       totalQuantity: 0,
//       pendingReturnQuantity: 0,
//       pendingReturns: [],
//       serialNumbers: []
//     });
//   }

//   resellerStock.pendingReturns.push({
//     returnId: returnId,
//     returnNumber: returnNumber,
//     center: centerId,
//     product: productId,
//     quantity: quantity,
//     serialNumbers: serialNumbers,
//     returnDate: new Date(),
//     remark: remark
//   });

//   resellerStock.pendingReturnQuantity = (resellerStock.pendingReturnQuantity || 0) + quantity;

//   await resellerStock.save({ session });
// }


// export const acceptCenterReturn = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const { returnId } = req.params;

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(400).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Find the return request
//     const returnRequest = await CenterReturn.findById(returnId)
//       .populate('products.product')
//       .populate('center')
//       .populate('reseller');

//     if (!returnRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Return request not found",
//       });
//     }

//     // Check if already accepted
//     if (returnRequest.status === "accepted") {
//       return res.status(400).json({
//         success: false,
//         message: "Return request has already been accepted",
//       });
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // Process each product in the return
//       for (const productItem of returnRequest.products) {
//         const productId = productItem.product._id;
//         const quantity = productItem.quantity;
//         const serialNumbers = productItem.serialNumbers || [];
        
//         const product = await Product.findById(productId).session(session);
        
//         // Update center stock - permanently remove items
//         const centerStock = await CenterStock.findOne({
//           center: returnRequest.center._id,
//           product: productId
//         }).session(session);

//         if (!centerStock) {
//           throw new Error(`Center stock not found for product ${productId}`);
//         }

//         if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
//           // Remove serials from center stock
//           for (const serialNumber of serialNumbers) {
//             const serialIndex = centerStock.serialNumbers.findIndex(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (serialIndex !== -1) {
//               // Add to transfer history before removing
//               centerStock.serialNumbers[serialIndex].transferHistory.push({
//                 fromCenter: returnRequest.center._id,
//                 toReseller: returnRequest.reseller._id,
//                 transferDate: new Date(),
//                 transferType: "center_to_reseller_return",
//                 remark: `Return accepted: ${returnRequest.remark || "No remark"}`,
//                 transferredBy: userId
//               });
              
//               // Remove from center stock array
//               centerStock.serialNumbers.splice(serialIndex, 1);
//             }
//           }
          
//           // Update total quantity (available already reduced when return was created)
//           centerStock.totalQuantity -= serialNumbers.length;
          
//         } else {
//           // For non-serialized products
//           centerStock.totalQuantity -= quantity;
//         }

//         centerStock.lastUpdated = new Date();
//         await centerStock.save({ session });

//         // Add to reseller stock permanently
//         await addToResellerStock(
//           returnRequest.reseller._id,
//           productId,
//           quantity,
//           serialNumbers,
//           returnRequest.center._id,
//           userId,
//           "center_to_reseller_return",
//           `Accepted return #${returnRequest.returnNumber}`,
//           session
//         );

//         // Mark product as accepted
//         productItem.accepted = true;
//         productItem.acceptedAt = new Date();
//       }

//       // Update return request status
//       returnRequest.status = "accepted";
//       returnRequest.acceptedAt = new Date();
//       returnRequest.acceptedBy = userId;
//       await returnRequest.save({ session });

//       // Update reseller's pending returns
//       await updateResellerPendingReturns(returnRequest, session);

//       await session.commitTransaction();
//       session.endSession();

//       res.status(200).json({
//         success: true,
//         message: "Return request accepted successfully",
//         data: returnRequest
//       });

//     } catch (error) {
//       await session.abortTransaction();
//       session.endSession();
//       throw error;
//     }

//   } catch (error) {
//     console.error("Error accepting center return:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error processing return acceptance",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//     });
//   }
// };

// // Helper function to add to reseller stock permanently
// async function addToResellerStock(
//   resellerId,
//   productId,
//   quantity,
//   serialNumbers,
//   sourceCenter,
//   userId,
//   sourceType,
//   remark,
//   session
// ) {
//   let resellerStock = await ResellerStock.findOne({
//     reseller: resellerId,
//     product: productId
//   }).session(session);

//   if (!resellerStock) {
//     resellerStock = new ResellerStock({
//       reseller: resellerId,
//       product: productId,
//       availableQuantity: 0,
//       totalQuantity: 0,
//       sourceBreakdown: {
//         damageRepairQuantity: 0,
//         centerReturnQuantity: 0,
//         directPurchaseQuantity: 0
//       },
//       serialNumbers: []
//     });
//   }

//   const product = await Product.findById(productId).session(session);

//   // Update center returns tracking
//   const existingCenterReturn = resellerStock.centerReturns.find(
//     cr => cr.center.toString() === sourceCenter.toString()
//   );

//   if (existingCenterReturn) {
//     existingCenterReturn.quantity += quantity;
//     existingCenterReturn.date = new Date();
//     existingCenterReturn.remark = remark;
//   } else {
//     resellerStock.centerReturns.push({
//       center: sourceCenter,
//       quantity: quantity,
//       date: new Date(),
//       sourceType: "center_return",
//       remark: remark,
//       addedBy: userId
//     });
//   }

//   // Handle serialized products
//   if (product.trackSerialNumber === "Yes" && serialNumbers.length > 0) {
//     for (const serialNumber of serialNumbers) {
//       // Check if serial already exists
//       const existingSerialIndex = resellerStock.serialNumbers.findIndex(
//         sn => sn.serialNumber === serialNumber
//       );

//       if (existingSerialIndex !== -1) {
//         // Update existing serial
//         const existingSerial = resellerStock.serialNumbers[existingSerialIndex];
//         existingSerial.status = "available";
//         existingSerial.currentLocation = resellerId;
//         existingSerial.transferHistory.push({
//           fromCenter: sourceCenter,
//           toReseller: resellerId,
//           transferDate: new Date(),
//           transferType: "center_to_reseller_return",
//           sourceType: "center_return",
//           remark: remark,
//           transferredBy: userId
//         });
//       } else {
        
//         resellerStock.serialNumbers.push({
//           serialNumber: serialNumber,
//           status: "available",
//           sourceType: "center_return",
//           currentLocation: resellerId,
//           transferHistory: [{
//             fromCenter: sourceCenter,
//             toReseller: resellerId,
//             transferDate: new Date(),
//             transferType: "center_to_reseller_return",
//             sourceType: "center_return",
//             remark: remark,
//             transferredBy: userId
//           }]
//         });
//       }
//     }

//     resellerStock.availableQuantity += serialNumbers.length;
//     resellerStock.totalQuantity += serialNumbers.length;
//     resellerStock.sourceBreakdown.centerReturnQuantity += serialNumbers.length;
//   } else {

//     resellerStock.availableQuantity += quantity;
//     resellerStock.totalQuantity += quantity;
//     resellerStock.sourceBreakdown.centerReturnQuantity += quantity;
//   }

//   resellerStock.pendingReturnQuantity = Math.max(0, 
//     (resellerStock.pendingReturnQuantity || 0) - quantity
//   );

//   await resellerStock.save({ session });
// }

// async function updateResellerPendingReturns(returnRequest, session) {

//   await ResellerStock.updateMany(
//     { 
//       reseller: returnRequest.reseller._id,
//       "pendingReturns.returnId": returnRequest._id 
//     },
//     { 
//       $pull: { pendingReturns: { returnId: returnRequest._id } }
//     },
//     { session }
//   );

//   const resellerStocks = await ResellerStock.find({
//     reseller: returnRequest.reseller._id
//   }).session(session);

//   for (const stock of resellerStocks) {
//     let totalPending = 0;
//     for (const pendingReturn of stock.pendingReturns) {
//       totalPending += pendingReturn.quantity;
//     }
//     stock.pendingReturnQuantity = totalPending;
//     await stock.save({ session });
//   }
// }
